import type { Molecule } from 'types';
import { BondType } from 'types';
import { findAromaticSubstituents, formatAromaticSubstituentName } from './aromatic-substituent-detector';
import { getGreekNumeral } from './iupac-helpers';

/**
 * Aliphatic chain naming module.
 *
 * Handles IUPAC naming of straight-chain hydrocarbons with functional groups.
 * Examples: propane, propanone, propanal, propanoic acid, propan-1-ol, etc.
 */

export interface AliphaticNameParts {
  prefix: string; // e.g., "3-hydroxy", "2-methyl"
  baseName: string; // e.g., "propan", "pentan"
  suffix: string; // e.g., "oic acid", "one", "ol", "amine"
  fullName: string; // e.g., "3-hydroxypropanoic acid"
}

/**
 * Generate the IUPAC name for an aliphatic chain.
 * 
 * @param chain - Ordered atom indices in the chain
 * @param numbering - Map from atom index to position (1-based)
 * @param molecule - The molecule
 * @returns The full IUPAC name for the aliphatic compound
 */
export function generateAliphaticName(
  chain: number[],
  numbering: Map<number, number>,
  molecule: Molecule
): AliphaticNameParts {
  // Determine the functional group and its position
  const { functionalGroup, position } = identifyFunctionalGroup(chain, numbering, molecule);

  // Count carbons
  const baseLength = chain.length;

  // Get base name (e.g., "propan", "butan")
  const baseName = getAlkaneBaseName(baseLength);

   // Get suffix and any position modifications
   const { suffix, hasSuffix } = getSuffixForFunctionalGroup(functionalGroup);

  // Build substituents prefix
  const chainSet = new Set(chain);
  const aromaticSubstituents = findAromaticSubstituents(chainSet, molecule);
   const substituentsPrefix = getSubstituentsPrefixForChain(
     chain,
     numbering,
     molecule,
     {
       skipHydroxy: functionalGroup === 'alcohol' || functionalGroup === 'carboxylic-acid',
       aromaticSubstituents,
     }
   );

  // Apply vowel elision rules
  let combinedBase = baseName;
  if (hasSuffix && /[aeiou]/.test(suffix[0] ?? '')) {
    // Remove final 'a' or 'e' from base if suffix starts with vowel
    if (baseName.endsWith('a')) {
      combinedBase = baseName.slice(0, -1);
    } else if (baseName.endsWith('e')) {
      combinedBase = baseName.slice(0, -1);
    }
  }

    // Combine parts with position locants
    let fullName = '';
    if (substituentsPrefix) {
      // No hyphen between substituents prefix and base name (IUPAC rule)
      fullName = substituentsPrefix + combinedBase + suffix;
    } else if (position > 1) {
      // For aldehydes and carboxylic acids, position 1 is implicit (terminal), so don't show it
      // For other functional groups like ketones and alcohols, show position if > 1
      fullName = position + '-' + combinedBase + suffix;
    } else {
      fullName = combinedBase + suffix;
    }

  return {
    prefix: substituentsPrefix,
    baseName: combinedBase,
    suffix,
    fullName,
  };
}

/**
 * Identify the principal functional group on the chain.
 */
function identifyFunctionalGroup(
  chain: number[],
  numbering: Map<number, number>,
  molecule: Molecule
): { functionalGroup: string; position: number } {
  // IUPAC precedence: carboxylic acid > aldehyde > ketone > alcohol > amine
  
  for (const atomIdx of chain) {
    const atom = molecule.atoms[atomIdx];
    if (!atom || atom.symbol !== 'C') continue;

    const bonds = molecule.bonds.filter(b => b.atom1 === atomIdx || b.atom2 === atomIdx);
    
    // Check for carboxylic acid: C(=O)OH
    const doubleO = bonds.find(
      b => molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.symbol === 'O' && 
           b.type === BondType.DOUBLE
    );
    const singleOH = bonds.find(b => {
      const neighbor = molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1];
      return neighbor?.symbol === 'O' && 
             b.type === BondType.SINGLE && 
             neighbor.hydrogens! > 0;
    });
    
    if (doubleO && singleOH) {
      const pos = numbering.get(atomIdx) ?? 0;
      return { functionalGroup: 'carboxylic-acid', position: pos };
    }

    // Check for aldehyde: CHO (C at terminal position with C=O)
    if (doubleO && bonds.filter(b => b.type === BondType.SINGLE).length === 1) {
      const pos = numbering.get(atomIdx) ?? 0;
      return { functionalGroup: 'aldehyde', position: pos };
    }

    // Check for ketone: C(=O)C
    if (doubleO) {
      const pos = numbering.get(atomIdx) ?? 0;
      return { functionalGroup: 'ketone', position: pos };
    }
  }

  // Check for alcohol
  for (const atomIdx of chain) {
    const atom = molecule.atoms[atomIdx];
    if (!atom) continue;

    const bonds = molecule.bonds.filter(b => b.atom1 === atomIdx || b.atom2 === atomIdx);
    const oh = bonds.find(b => {
      const neighbor = molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1];
      return neighbor?.symbol === 'O' && 
             b.type === BondType.SINGLE && 
             neighbor.hydrogens! > 0;
    });

    if (oh) {
      const pos = numbering.get(atomIdx) ?? 0;
      return { functionalGroup: 'alcohol', position: pos };
    }
  }

  return { functionalGroup: 'hydrocarbon', position: 0 };
}

/**
 * Get the base name for an alkane (without functional group suffix).
 */
function getAlkaneBaseName(carbonCount: number): string {
  const names: Record<number, string> = {
    1: 'methan',
    2: 'ethan',
    3: 'propan',
    4: 'butan',
    5: 'pentan',
    6: 'hexan',
    7: 'heptan',
    8: 'octan',
    9: 'nonan',
    10: 'decan',
    11: 'undecan',
    12: 'dodecan',
    13: 'tridecan',
    14: 'tetradecan',
    15: 'pentadecan',
    16: 'hexadecan',
    17: 'heptadecan',
    18: 'octadecan',
    19: 'nonadecan',
    20: 'eicosan',
  };

  return names[carbonCount] ?? `C${carbonCount}an`;
}

/**
 * Get the suffix for a functional group.
 */
function getSuffixForFunctionalGroup(
  functionalGroup: string
): { suffix: string; hasSuffix: boolean } {
  switch (functionalGroup) {
    case 'carboxylic-acid':
      return { suffix: 'oic acid', hasSuffix: true };
    case 'aldehyde':
      return { suffix: 'al', hasSuffix: true };
    case 'ketone':
      return { suffix: 'one', hasSuffix: true };
    case 'alcohol':
      return { suffix: 'ol', hasSuffix: true };
    case 'amine':
      return { suffix: 'amine', hasSuffix: true };
    case 'hydrocarbon':
      return { suffix: 'e', hasSuffix: true };
    default:
      return { suffix: '', hasSuffix: false };
  }
}

/**
 * Get the prefix for substituents on the main chain.
 */
function getSubstituentsPrefixForChain(
  chain: number[],
  numbering: Map<number, number>,
  molecule: Molecule,
  options: { skipHydroxy?: boolean; aromaticSubstituents?: any[] } = {}
): string {
  const substituents: Array<{ position: number; name: string }> = [];
  const chainSet = new Set(chain);
  const processedAromaticRings = new Set<string>();

  // For each atom in the chain
  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const position = numbering.get(atomIdx) ?? i + 1;

    const neighbors = getNeighbors(atomIdx, molecule);

    // Check for substituents (neighbors not in the main chain)
    for (const neighbor of neighbors) {
      if (chainSet.has(neighbor)) continue;

      const neighborAtom = molecule.atoms[neighbor];
      if (!neighborAtom) continue;

      // Skip OH groups if we're also naming them as alcohol suffix
      if (options.skipHydroxy && neighborAtom.symbol === 'O' && neighborAtom.hydrogens! > 0) {
        continue;
      }

      // Classify the substituent
      const substName = getSubstituentName(neighbor, molecule, chainSet);
      if (substName && substName !== 'aromatic') {
        substituents.push({ position, name: substName });
      } else if (substName === 'aromatic' && neighborAtom.aromatic) {
        // Handle aromatic rings separately - they should be named with full substitution info
        // For now, skip to avoid duplication
        continue;
      }
    }
  }

  // Add aromatic substituents if provided
  if (options.aromaticSubstituents && options.aromaticSubstituents.length > 0) {
    for (const aromaticSub of options.aromaticSubstituents) {
      const pos = numbering.get(aromaticSub.attachmentAtom) ?? 1;
      const name = formatAromaticSubstituentName(aromaticSub);
      substituents.push({ position: pos, name });
    }
  }

  if (substituents.length === 0) return '';

  // Sort by position, then by name (for alphabetical order when same position)
  substituents.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.name.localeCompare(b.name);
  });

  // Format: "3-hydroxy-2-methyl" or "2,4-dimethyl"
  // Group by name for counting
  const grouped: Record<string, number[]> = {};
  for (const sub of substituents) {
    if (!grouped[sub.name]) grouped[sub.name] = [];
    grouped[sub.name]!.push(sub.position);
  }

  const parts: string[] = [];
  for (const [name, positions] of Object.entries(grouped)) {
    if (positions.length === 1) {
      parts.push(`${positions[0]}-${name}`);
    } else {
      const multiplier = getGreekNumeral(positions.length);
      const posString = positions.join(',');
      parts.push(`${posString}-${multiplier}${name}`);
    }
  }

  return parts.join('-');
}

/**
 * Get the name of a substituent (e.g., "methyl", "phenyl", "hydroxy").
 */
function getSubstituentName(atomIdx: number, molecule: Molecule, chainSet: Set<number>): string {
  const atom = molecule.atoms[atomIdx];
  if (!atom) return '';

  // Hydroxy group: OH
  if (atom.symbol === 'O' && atom.hydrogens! > 0) {
    return 'hydroxy';
  }

  // Halogen
  if (atom.symbol === 'F') return 'fluoro';
  if (atom.symbol === 'Cl') return 'chloro';
  if (atom.symbol === 'Br') return 'bromo';
  if (atom.symbol === 'I') return 'iodo';

  // Alkyl or aromatic groups
  if (atom.symbol === 'C') {
    // Check if it's an aromatic ring
    if (atom.aromatic) {
      return 'aromatic'; // Will be handled separately by aromatic substituent detector
    }
    // Count carbons in the branch for aliphatic groups
    const branchLength = countBranchLength(atomIdx, molecule, chainSet);
    return getAlkylName(branchLength);
  }

  // Amino group
  if (atom.symbol === 'N' && atom.hydrogens! > 0) {
    return 'amino';
  }

  return '';
}

/**
 * Count the length of a carbon branch for naming (e.g., methyl = 1, ethyl = 2).
 */
function countBranchLength(atomIdx: number, molecule: Molecule, chainSet: Set<number>): number {
  const visited = new Set<number>();
  return dfsCountBranch(atomIdx, molecule, chainSet, visited);
}

function dfsCountBranch(
  atomIdx: number,
  molecule: Molecule,
  chainSet: Set<number>,
  visited: Set<number>
): number {
  if (visited.has(atomIdx) || chainSet.has(atomIdx)) return 0;
  if (molecule.atoms[atomIdx]?.symbol !== 'C') return 0;

  visited.add(atomIdx);
  let maxLength = 1;

  const neighbors = getNeighbors(atomIdx, molecule);
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor) && !chainSet.has(neighbor)) {
      maxLength = Math.max(maxLength, 1 + dfsCountBranch(neighbor, molecule, chainSet, visited));
    }
  }

  return maxLength;
}

/**
 * Get the alkyl group name (methyl, ethyl, propyl, etc.).
 */
function getAlkylName(carbonCount: number): string {
  const names: Record<number, string> = {
    1: 'methyl',
    2: 'ethyl',
    3: 'propyl',
    4: 'butyl',
    5: 'pentyl',
    6: 'hexyl',
    7: 'heptyl',
    8: 'octyl',
    9: 'nonyl',
    10: 'decyl',
  };

   return names[carbonCount] ?? `C${carbonCount}alkyl`;
 }

/**
 * Get neighboring atoms.
 */
function getNeighbors(atomIdx: number, molecule: Molecule): number[] {
   const neighbors: number[] = [];

  for (const bond of molecule.bonds) {
    if (bond.atom1 === atomIdx) neighbors.push(bond.atom2);
    else if (bond.atom2 === atomIdx) neighbors.push(bond.atom1);
  }
  return neighbors;
}

export default generateAliphaticName;
