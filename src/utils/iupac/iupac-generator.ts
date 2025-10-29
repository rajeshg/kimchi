import type { Molecule } from 'types';
import { BondType } from 'types';
import { getElementCounts } from '../molecular-descriptors';
import { analyzeRings } from '../ring-analysis';
import { matchSMARTS } from 'src/matchers/smarts-matcher';

import { generateCyclicName } from './iupac-rings/index';
import {
  findMainChain,
  generateHeteroPrefixes,
  generateChainBaseName,
  findSubstituents,
  generateSubstitutedName,
} from './iupac-chains';
import {
  combineName,
  generateSimpleNameFromFormula,
  identifyPrincipalFunctionalGroup,
} from './iupac-helpers';
import { selectPrincipalChain } from './chain-selection';
import { numberChain } from './chain-numbering';
import { generateAliphaticName } from './iupac-aliphatic';
import { createDefaultPipeline } from './pipeline';

export interface IUPACGenerationResult {
  name: string;
  errors: string[];
  warnings: string[];
}

export interface IUPACGeneratorOptions {
  includeStereochemistry?: boolean;
  useSystematicNaming?: boolean;
  includeCommonNames?: boolean;
}

export function generateIUPACName(
  molecule: Molecule,
  options?: IUPACGeneratorOptions
): IUPACGenerationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    if (molecule.atoms.length === 0) {
      errors.push('Molecule has no atoms');
      return { name: '', errors, warnings };
    }

    const components = extractConnectedComponents(molecule);
    if (components.length === 0) {
      errors.push('Could not identify connected components');
      return { name: '', errors, warnings };
    }

    const componentNames: string[] = [];
    for (const component of components) {
      const name = generateNameForComponent(component, molecule, options);
      if (name) componentNames.push(name);
    }

    if (componentNames.length === 0) {
      errors.push('Could not generate names for any components');
      return { name: '', errors, warnings };
    }

    const finalName = components.length === 1 ? componentNames[0] ?? '' : componentNames.sort().join('.');
    return { name: finalName, errors, warnings };
  } catch (err) {
    errors.push(`IUPAC name generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return { name: '', errors, warnings };
  }
}

function extractConnectedComponents(molecule: Molecule): Molecule[] {
  const atomCount = molecule.atoms.length;
  if (atomCount === 0) return [];

  const visited = new Set<number>();
  const components: Molecule[] = [];

  for (let startAtom = 0; startAtom < atomCount; startAtom++) {
    if (visited.has(startAtom)) continue;

    const componentAtoms = new Set<number>();
    const queue: number[] = [startAtom];
    visited.add(startAtom);
    componentAtoms.add(startAtom);

    while (queue.length > 0) {
      const atomIdx = queue.shift()!;
      for (const bond of molecule.bonds) {
        let neighborIdx = -1;
        if (bond.atom1 === atomIdx) neighborIdx = bond.atom2;
        else if (bond.atom2 === atomIdx) neighborIdx = bond.atom1;
        if (neighborIdx >= 0 && !visited.has(neighborIdx)) {
          visited.add(neighborIdx);
          componentAtoms.add(neighborIdx);
          queue.push(neighborIdx);
        }
      }
    }

    const atomIndices = Array.from(componentAtoms).sort((a, b) => a - b);
    const atoms = atomIndices.map(i => molecule.atoms[i]).filter(Boolean) as typeof molecule.atoms;
    const indexMap = new Map<number, number>();
    atomIndices.forEach((oldIdx, newIdx) => indexMap.set(oldIdx, newIdx));
    const bonds = molecule.bonds.filter(b => componentAtoms.has(b.atom1) && componentAtoms.has(b.atom2));
    const remappedBonds = bonds.map(b => ({ ...b, atom1: indexMap.get(b.atom1)!, atom2: indexMap.get(b.atom2)! }));
    components.push({ atoms, bonds: remappedBonds });
  }

  return components;
}

function generateNameForComponent(
  molecule: Molecule,
  _originalMolecule: Molecule,
  options?: IUPACGeneratorOptions
): string {
  if (molecule.atoms.length === 1) {
    const atom = molecule.atoms[0]!;
    if (atom.symbol === 'H') return 'hydrogen';
    if (atom.symbol === 'O') return 'oxygen';
    if (atom.symbol === 'N') return 'nitrogen';
    if (atom.symbol === 'C') {
      const hydrogens = atom.hydrogens ?? 0;
      if (hydrogens > 0 || (molecule.bonds.length === 0 && !atom.charge)) return 'methane';
      return 'carbon';
    }
  }

  const elementCounts = getElementCounts(molecule, { includeImplicitH: true });
  if (Object.keys(elementCounts).length === 2 && elementCounts['H'] === 2 && elementCounts['O'] === 1) return 'water';

   // Check if the molecule has major functional groups
   // (carboxylic acid, aldehyde, ketone, alcohol)
   // If it does AND the functional group is ON a chain (not on a ring), prioritize aliphatic chain selection
    const ringInfo = analyzeRings(molecule);
    
    // Find functional group atoms
    const functionalGroupAtoms = new Set<number>();
    const hasCarboxyl = molecule.atoms.some((atom, idx) => {
      if (atom.symbol !== 'C') return false;
      const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
      
      // Check for C=O (carboxylic acid, aldehyde, ketone)
      const hasDoubleO = bonds.some(b => {
        const neighborIdx = b.atom1 === idx ? b.atom2 : b.atom1;
        const neighbor = molecule.atoms[neighborIdx];
        return neighbor?.symbol === 'O' && b.type === BondType.DOUBLE;
      });
      
      if (hasDoubleO) {
        functionalGroupAtoms.add(idx);
        return true;
      }
      return false;
    });

    const hasAlcohol = molecule.atoms.some((atom, idx) => {
      if (atom.symbol !== 'C') return false;
      const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
      
      // Check for alcohol (C-OH)
      const hasOH = bonds.some(b => {
        const neighborIdx = b.atom1 === idx ? b.atom2 : b.atom1;
        const neighbor = molecule.atoms[neighborIdx];
        return neighbor?.symbol === 'O' && b.type === BondType.SINGLE && neighbor.hydrogens! > 0;
      });
      
      if (hasOH) {
        functionalGroupAtoms.add(idx);
        return true;
      }
      return false;
    });

// Check for amines and halogens as well
     const hasAmine = molecule.atoms.some((atom, idx) => {
       if (atom.symbol !== 'N') return false;
       const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
       return bonds.some(b => {
         const neighborIdx = b.atom1 === idx ? b.atom2 : b.atom1;
         const neighbor = molecule.atoms[neighborIdx];
         return neighbor?.symbol === 'C';
       });
     });

     const hasHalogen = molecule.atoms.some((atom, idx) => {
       if (!['F', 'Cl', 'Br', 'I'].includes(atom.symbol)) return false;
       const bonds = molecule.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
       return bonds.some(b => {
         const neighborIdx = b.atom1 === idx ? b.atom2 : b.atom1;
         const neighbor = molecule.atoms[neighborIdx];
         return neighbor?.symbol === 'C';
       });
     });

     const hasMajorFunctionalGroup = hasCarboxyl || hasAlcohol || hasAmine || hasHalogen;

     // Diagnostic logging (gate behind VERBOSE)
     if (process.env.VERBOSE) {
       try {
         console.debug('[iupac-generator] ringInfo:', { ringCount: ringInfo.rings.length, rings: ringInfo.rings });
         console.debug('[iupac-generator] functionalGroupAtoms:', Array.from(functionalGroupAtoms), 'hasCarboxyl', hasCarboxyl, 'hasAlcohol', hasAlcohol, 'hasAmine', hasAmine, 'hasHalogen', hasHalogen, 'hasMajorFunctionalGroup', hasMajorFunctionalGroup);
       } catch (e) {}
     }

   // Check if any functional group atoms are NOT on rings (i.e., on chains)
  // Determine whether the detected functional group atoms are genuinely on an
  // aliphatic chain (i.e., not part of a ring and not merely a substituent
  // attached to a ring). For example, in benzoic acid the carboxyl carbon is
  // not part of the aromatic ring but is directly bonded to a ring carbon; in
  // that case we want to treat the FG as a ring substituent (prefer cyclic
  // naming) rather than as a chain-based FG.
  let functionalGroupOnChain = false;
  for (const atomIdx of functionalGroupAtoms) {
    const ringsContainingAtom = ringInfo.getRingsContainingAtom(atomIdx);
    if (ringsContainingAtom.length === 0) {
      // Check if this FG atom is directly attached to any ring atom; if so,
      // treat it as a ring substituent (not a chain FG).
      const neighbors: number[] = [];
      for (const b of molecule.bonds) {
        if (b.atom1 === atomIdx) neighbors.push(b.atom2);
        else if (b.atom2 === atomIdx) neighbors.push(b.atom1);
      }
      let attachedToRing = false;
      for (const nb of neighbors) {
        if (ringInfo.getRingsContainingAtom(nb).length > 0) {
          attachedToRing = true;
          break;
        }
      }
      if (!attachedToRing) {
        functionalGroupOnChain = true;
        break;
      }
    }
  }

     // If has major functional group on a chain (not on a ring), use aliphatic methods
     const hasAromaticAtoms = molecule.atoms.some(atom => atom.aromatic);
     if (process.env.VERBOSE) {
       console.log(`[iupac-generator] hasMajorFunctionalGroup: ${hasMajorFunctionalGroup}, hasAromaticAtoms: ${hasAromaticAtoms}, ringInfo.rings.length: ${ringInfo.rings.length}, functionalGroupOnChain: ${functionalGroupOnChain}`);
     }
     
     if (hasMajorFunctionalGroup && (ringInfo.rings.length === 0 || functionalGroupOnChain)) {
       if (process.env.VERBOSE) {
         console.log('[iupac-generator] Entering aliphatic naming path');
       }
       // For molecules with aromatic atoms and functional group on chain,
       // use aliphatic naming (the aromatic ring becomes a substituent)
       // For purely aliphatic molecules, use the new pipeline
       if (!hasAromaticAtoms) {
         if (process.env.VERBOSE) {
           console.log('[iupac-generator] Trying new pipeline');
         }
         try {
           const pipeline = createDefaultPipeline({ verbose: false });
           const result = pipeline.process(molecule);
           if (process.env.VERBOSE) {
             console.log(`[iupac-generator] Pipeline result: ${result.name}, hasErrors: ${result.hasErrors}`);
           }
           if (!result.hasErrors && result.name) {
             return result.name;
           }
         } catch {
           // Fall back to old aliphatic method if pipeline fails
           if (process.env.VERBOSE) {
             console.log('[iupac-generator] Pipeline failed, falling back to old method');
           }
         }
       }

      // Use aliphatic naming for molecules with aliphatic main chains
        const chainSelectionResult = selectPrincipalChain(molecule);
        if (process.env.VERBOSE) {
          console.log(`[iupac-generator] Chain selection: ${chainSelectionResult.chain.length} atoms selected`);
        }
        if (chainSelectionResult.chain.length > 0) {
          const numberingResult = numberChain(chainSelectionResult.chain, molecule);
          if (process.env.VERBOSE) {
            console.log(`[iupac-generator] Numbering result: ${numberingResult.reason}, orderedChain: [${numberingResult.orderedChain.join(',')}]`);
          }
          const aliphaticName = generateAliphaticName(
            numberingResult.orderedChain,
            numberingResult.numbering,
            molecule
          );
          if (process.env.VERBOSE) {
            console.log(`[iupac-generator] Aliphatic name: ${aliphaticName.fullName}`);
          }
          if (aliphaticName.fullName) {
            return aliphaticName.fullName;
          }
        }
     } else {
       if (process.env.VERBOSE) {
         console.log('[iupac-generator] Skipping aliphatic naming - conditions not met');
       }
     }

   // For cyclic molecules or fallback cases
   // (This was previously checking for rings again, now we already have ringInfo)
    // Quick SMARTS-based detection for common fused heterocycles (robust fallback)
    try {
      if (matchSMARTS('c1ccc2c(c1)[nH]c2', molecule).success) return 'indole';
      if (matchSMARTS('c1ccc2oc(c1)c2', molecule).success) return 'benzofuran';
      if (matchSMARTS('c1ccc2sc(c1)c2', molecule).success) return 'benzothiophene';
    } catch {
      // ignore SMARTS errors and continue
    }
   if (ringInfo.rings.length > 0) {
     const cyclicName = generateCyclicName(molecule, ringInfo, options);
    if (cyclicName) {
      const functionalGroup = identifyPrincipalFunctionalGroup(molecule, options);
      if (functionalGroup) {
        // Special-case: combine benzene base with carboxyl-type suffixes to form 'benzoic' stems
        // e.g., '1-hydroxy-2-methylbenzene' + 'oic acid' -> '1-hydroxy-2-methylbenzoic acid'
        try {
          if (/benzene/i.test(cyclicName) && /^o/i.test(functionalGroup)) {
            const base = cyclicName.replace(/benzene/ig, 'benzo');
            let tail = functionalGroup.trim();
            // remove leading 'o' from 'oic', 'oate' etc.
            tail = tail.replace(/^o/i, '');
            if (!tail.startsWith(' ') && !tail.startsWith('-')) tail = ' ' + tail;
            return `${base}${tail}`;
          }
        } catch (e) {
          // fall back to normal combineName
        }
        return combineName(cyclicName, functionalGroup);
      }
      return cyclicName;
    }
   }

  // Fallback for acyclic molecules without carboxyl group
  const mainChain = findMainChain(molecule);
  const chainLength = mainChain.length;
  if (chainLength > 0) {
    const heteroPrefixes = generateHeteroPrefixes(mainChain, molecule);
    const baseResult = generateChainBaseName(mainChain, molecule);
    if (!baseResult) return 'hydrocarbon';
    const { hydrocarbonBase, unsaturation } = baseResult;
    const substituents = findSubstituents(molecule, mainChain);
    const functionalGroup = identifyPrincipalFunctionalGroup(molecule, options);
    let finalName = generateSubstitutedName(hydrocarbonBase, substituents, heteroPrefixes, unsaturation);
    if (functionalGroup) finalName = combineName(finalName, functionalGroup);
    return finalName;
  }

  return generateSimpleNameFromFormula(elementCounts);
}