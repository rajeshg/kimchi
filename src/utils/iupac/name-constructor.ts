import type { Molecule } from 'types';
import type { Chain, FunctionalGroup, MolecularStructure, NumberingResult } from './iupac-types';
import { ruleEngine } from './iupac-rule-engine';

/**
 * Constructs complete IUPAC names from molecular structure and numbering
 *
 * IUPAC name format: [Locants]-[Prefix]-[Parent]-[Suffix]
 * Examples:
 * - Propane (C3: simple alkane)
 * - Prop-2-en-1-ol (C3 with double bond and OH)
 * - 2-Methylbutane (C5 with methyl substituent at position 2)
 */
export class NameConstructor {
  /**
   * Construct complete IUPAC name from analyzed structure
   */
  constructName(
    chain: Chain,
    structure: MolecularStructure,
    numbering: NumberingResult | null,
    molecule: Molecule
  ): string {
    try {
      // Get carbon count in principal chain
      const carbonCount = this.getCarbonCount(chain, molecule);
      if (carbonCount === 0) {
        return 'unknown';
      }

      // Get alkane parent name
      const alkanePrefix = ruleEngine.getAlkaneName(carbonCount);
      if (!alkanePrefix) {
        return 'unknown';
      }

      // Separate unsaturation (alkene/alkyne) from other functional groups
      const unsaturationGroups = structure.functionalGroups.filter(
        fg => fg.name === 'alkene' || fg.name === 'alkyne'
      );
      const otherFGs = structure.functionalGroups.filter(
        fg => fg.name !== 'alkene' && fg.name !== 'alkyne'
      );

      // Build functional group suffixes and prefixes (for non-unsaturation FGs)
      const { suffix: fgSuffix, prefix, numberingRequired } = this.buildFunctionalGroupParts(
        otherFGs,
        chain,
        molecule,
        numbering
      );

      // Build substituent prefixes
      const substituentPrefix = this.buildSubstituentPrefixes(
        chain,
        molecule,
        numbering
      );

      // Build parent name with unsaturation
      let parentName = alkanePrefix;
      let unsaturationSuffix = '';
      
      if (unsaturationGroups.length > 0 && numbering) {
        // Handle alkene/alkyne: replace "ane" with "ene"/"yne" and add locant(s)
        // Group by type (alkene vs alkyne)
        const alkenes = unsaturationGroups.filter(fg => fg.name === 'alkene');
        const alkynes = unsaturationGroups.filter(fg => fg.name === 'alkyne');
        
        // Remove 'ane' suffix from parent name
        if (parentName.endsWith('ane')) {
          parentName = parentName.slice(0, -3);
        }
        
        // Handle alkenes (use highest priority if multiple types)
        if (alkenes.length > 0) {
          const locants = alkenes.map(fg => this.getUnsaturationLocant(fg, numbering, molecule)).sort((a, b) => a - b);
          const multiplicity = alkenes.length;
          
          // Generate suffix based on multiplicity: ene, diene, triene, tetraene, etc.
          const multiplicityPrefix = multiplicity === 1 ? '' : 
                                     multiplicity === 2 ? 'di' :
                                     multiplicity === 3 ? 'tri' :
                                     multiplicity === 4 ? 'tetra' :
                                     multiplicity === 5 ? 'penta' :
                                     multiplicity === 6 ? 'hexa' : `${multiplicity}`;
          
          // Add locants if needed
          if (multiplicity === 1 && locants[0]! <= 1) {
            // ethene, propene - no locant needed
            unsaturationSuffix = `${multiplicityPrefix}ene`;
          } else {
            // but-2-ene, buta-1,3-diene, etc.
            // For multiple double bonds (diene, triene), keep the 'a' vowel
            const locantStr = locants.join(',');
            const needsVowel = multiplicity > 1;
            unsaturationSuffix = `-${locantStr}-${multiplicityPrefix}ene`;
            if (needsVowel) {
              // Add 'a' back to parent name for dienes, trienes, etc.
              parentName += 'a';
            }
          }
        } else if (alkynes.length > 0) {
          // Handle alkynes similarly
          const locants = alkynes.map(fg => this.getUnsaturationLocant(fg, numbering, molecule)).sort((a, b) => a - b);
          const multiplicity = alkynes.length;
          
          const multiplicityPrefix = multiplicity === 1 ? '' :
                                     multiplicity === 2 ? 'di' :
                                     multiplicity === 3 ? 'tri' :
                                     multiplicity === 4 ? 'tetra' : `${multiplicity}`;
          
          if (multiplicity === 1 && locants[0]! <= 1) {
            unsaturationSuffix = `${multiplicityPrefix}yne`;
          } else {
            const locantStr = locants.join(',');
            const needsVowel = multiplicity > 1;
            unsaturationSuffix = `-${locantStr}-${multiplicityPrefix}yne`;
            if (needsVowel) {
              // Add 'a' back for diynes, triynes, etc.
              parentName += 'a';
            }
          }
        }
      }

      // Combine parts: substituents + parent + unsaturation + functional group suffix
      let name = '';

      // Add substituent prefixes
      if (substituentPrefix) {
        name += substituentPrefix;
      }

      // Add prefix from functional groups if present
      if (prefix) {
        name += prefix;
      }

      // Add parent name
      name += parentName;

      // Add unsaturation suffix
      if (unsaturationSuffix) {
        name += unsaturationSuffix;
      }

      // Add functional group suffix
      if (fgSuffix) {
        name += fgSuffix;
      }

      return name || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get count of carbon atoms in chain
   */
  private getCarbonCount(chain: Chain, molecule: Molecule): number {
    let count = 0;
    for (const atomIdx of chain.atomIndices) {
      if (atomIdx === undefined) continue;
      const atom = molecule.atoms[atomIdx];
      if (atom?.symbol === 'C') {
        count++;
      }
    }
    return count;
  }

  /**
   * Build functional group suffix and any required prefix
   * Returns { suffix, prefix, numberingRequired }
   * Note: Do not add 'ane' suffix here - it's already in the alkane name
   */
  private buildFunctionalGroupParts(
    functionalGroups: FunctionalGroup[],
    _chain: Chain,
    _molecule: Molecule,
    numbering: NumberingResult | null
  ): {
    suffix: string;
    prefix: string;
    numberingRequired: boolean;
  } {
    if (functionalGroups.length === 0) {
      // No functional groups - no suffix needed (alkane name already has 'ane')
      return { suffix: '', prefix: '', numberingRequired: false };
    }

    // Use highest priority functional group as principal group
    const principalFG = functionalGroups[0];
    if (!principalFG) {
      return { suffix: '', prefix: '', numberingRequired: false };
    }

    let suffix = principalFG.suffix;
    let numberingRequired = false;

    // If functional group is not at terminal position (position 1 or end),
    // we need to specify its locant
    if (numbering && principalFG.atomIndices.length > 0) {
      const atomIdx = principalFG.atomIndices[0];
      if (atomIdx !== undefined) {
        const locant = numbering.numbering.get(atomIdx);
        if (locant && locant > 1) {
          suffix = locant.toString() + '-' + suffix;
          numberingRequired = true;
        }
      }
    }

    return { suffix, prefix: '', numberingRequired };
  }

  /**
   * Get the locant for unsaturation (double or triple bond)
   * Returns the lower-numbered carbon of the bond
   */
  private getUnsaturationLocant(
    unsatFG: FunctionalGroup,
    numbering: NumberingResult,
    molecule: Molecule
  ): number {
    // The unsaturation functional group contains two atom indices (the two carbons in the double/triple bond)
    const atomIndices = unsatFG.atomIndices;
    if (atomIndices.length < 2) {
      // Fallback: use first atom
      const idx = atomIndices[0];
      if (idx !== undefined) {
        return numbering.numbering.get(idx) ?? 1;
      }
      return 1;
    }

    // Get locants for both atoms
    const locant1 = numbering.numbering.get(atomIndices[0]!);
    const locant2 = numbering.numbering.get(atomIndices[1]!);
    
    if (locant1 !== undefined && locant2 !== undefined) {
      // Return the lower locant
      return Math.min(locant1, locant2);
    }
    
    return locant1 ?? locant2 ?? 1;
  }

  /**
   * Count double and triple bonds in chain
   */
  private countMultipleBonds(chain: Chain, molecule: Molecule): number {
    const chainSet = new Set(chain.atomIndices);
    let count = 0;

    for (const bond of molecule.bonds) {
      if (chainSet.has(bond.atom1) && chainSet.has(bond.atom2)) {
        if (bond.type === 'double' || bond.type === 'triple') {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Build locants string for functional groups and multiple bonds
   */
  private buildLocants(
    functionalGroups: FunctionalGroup[],
    _chain: Chain,
    numbering: NumberingResult
  ): string {
    const locants: Set<number> = new Set();

    // Add locants for all atoms in each functional group
    for (const fg of functionalGroups) {
      for (const atomIdx of fg.atomIndices) {
        if (atomIdx !== undefined) {
          const locant = numbering.numbering.get(atomIdx);
          if (locant) {
            locants.add(locant);
          }
        }
      }
    }

    const locantArr = Array.from(locants);
    if (locantArr.length === 0) {
      return '';
    }

    // Sort locants numerically and format: "1,2-" or "2-"
    locantArr.sort((a, b) => a - b);
    return locantArr.join(',') + '-';
  }

  /**
   * Build prefix for substituents attached to main chain
   */
  private buildSubstituentPrefixes(
    chain: Chain,
    molecule: Molecule,
    numbering: NumberingResult | null
  ): string {
    const chainSet = new Set(chain.atomIndices);
    const substituents: Map<string, Set<number>> = new Map();

    // Find all substituents
    for (const atomIdx of chain.atomIndices) {
      if (atomIdx === undefined) continue;

      // Find atoms bonded to this chain atom that are not in the chain
      for (const bond of molecule.bonds) {
        let substituent: number | null = null;

        if (bond.atom1 === atomIdx && !chainSet.has(bond.atom2)) {
          substituent = bond.atom2;
        } else if (bond.atom2 === atomIdx && !chainSet.has(bond.atom1)) {
          substituent = bond.atom1;
        }

        if (substituent !== null) {
          const substituentName = this.getSubstituentName(substituent, molecule);
          const locant = numbering?.numbering.get(atomIdx);
          if (locant === undefined) continue;

          if (!substituents.has(substituentName)) {
            substituents.set(substituentName, new Set());
          }

          substituents.get(substituentName)!.add(locant);
        }
      }
    }

    // Format substituents alphabetically
    const substituentParts: string[] = [];
    const sortedSubstituents = Array.from(substituents.keys()).sort();

    for (const name of sortedSubstituents) {
      const locantSet = substituents.get(name)!;
      const locants = Array.from(locantSet).sort((a, b) => a - b);

      const locantStr = locants.join(',');
      const multiplicity = locants.length > 1 ? this.getMultiplicityPrefix(locants.length) : '';
      substituentParts.push(`${locantStr}-${multiplicity}${name}`);
    }

    return substituentParts.join('-');
  }

  /**
   * Generate a fragment string (SMILES/SMARTS) for a substituent atom.
   * For now, just returns the atom symbol. In production, generate canonical fragment.
   */
  private generateSubstituentFragment(atomIdx: number, molecule: Molecule): string {
    const atom = molecule.atoms[atomIdx];
    if (!atom) return '';
    return atom.symbol;
  }

  /**
   * Get IUPAC name for a substituent
   */
  private getSubstituentName(atomIdx: number, molecule: Molecule): string {
    // Try to match using substituent rules (only once)
    const fragment = this.generateSubstituentFragment(atomIdx, molecule);
    if (fragment) {
      // Import the rule matcher
      // @ts-ignore
      const { findSubstituentAliases } = require('./substituents');
      const aliases = findSubstituentAliases(fragment);
      if (aliases && aliases.length > 0) {
        return aliases[0]; // Use the first alias for now
      }
    }
    // Fallback logic below...
    const atom = molecule.atoms[atomIdx];
    if (!atom) {
      return 'unknown';
    }
    // Expanded mapping for common and complex substituents
    if (atom.symbol === 'O') {
      // Check for silyl ethers (Si-O)
      const silylBond = molecule.bonds.find(b => (b.atom1 === atomIdx || b.atom2 === atomIdx) &&
        (molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.symbol === 'Si'));
      if (silylBond) return 'silyloxy';
      return 'hydroxy'; // -OH when on main chain
    }
    if (atom.symbol === 'N') return 'amino'; // -NH2 when on main chain
    if (atom.symbol === 'F') return 'fluoro'; // -F
    if (atom.symbol === 'Cl') return 'chloro'; // -Cl
    if (atom.symbol === 'Br') return 'bromo'; // -Br
    if (atom.symbol === 'I') return 'iodo'; // -I
    if (atom.symbol === 'Si') return 'silyl'; // -SiR3
    if (atom.symbol === 'S') {
      // Check for thiol (-SH)
      const hBond = molecule.bonds.find(b => (b.atom1 === atomIdx || b.atom2 === atomIdx) &&
        (molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.symbol === 'H'));
      if (hBond) return 'sulfanyl';
      // Check for thioether (-SR)
      return 'thio';
    }
    if (atom.symbol === 'B') return 'borono'; // -B(OH)2
    if (atom.symbol === 'P') return 'phosphino'; // -PR2
    if (atom.symbol === 'Ar') return 'aryl'; // generic aromatic
    // For carbon-based substituents, count chain length and check for aromatic/acyclic
    if (atom.symbol === 'C') {
      // Check for phenyl/benzyl/aromatic
      const aromatic = atom.aromatic || false;
      if (aromatic) {
        // Check for benzyl (aromatic + CH2)
        const ch2Bond = molecule.bonds.find(b => (b.atom1 === atomIdx || b.atom2 === atomIdx) &&
          (molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.symbol === 'C' &&
           !molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.aromatic));
        if (ch2Bond) return 'benzyl';
        return 'phenyl';
      }
      // Check for acyl (C=O)
      const doubleOBond = molecule.bonds.find(b => (b.atom1 === atomIdx || b.atom2 === atomIdx) &&
        b.type === 'double' && molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.symbol === 'O');
      if (doubleOBond) {
        // Acetyl, benzoyl, etc. by chain length
        const chainLength = this.countCarbonChain(atomIdx, molecule);
        if (chainLength === 1) return 'acetyl';
        if (chainLength === 7) return 'benzoyl';
        return this.getAlkylGroupName(chainLength) + 'oyl';
      }
      // Simple case: methyl, ethyl, etc.
      const chainLength = this.countCarbonChain(atomIdx, molecule);
      return this.getAlkylGroupName(chainLength);
    }
    // Check for nitro group (-NO2)
    if (atom.symbol === 'N') {
      const oBonds = molecule.bonds.filter(b => (b.atom1 === atomIdx || b.atom2 === atomIdx) &&
        molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.symbol === 'O');
      if (oBonds.length === 2) return 'nitro';
    }
    // Fallback: output atom symbol
    return atom.symbol ? atom.symbol.toLowerCase() : 'unknown';
  }

  /**
   * Count length of carbon chain from a starting atom
   */
  private countCarbonChain(startAtomIdx: number, molecule: Molecule): number {
    let maxLength = 0;
    const dfs = (atomIdx: number, visited: Set<number>): number => {
      const atom = molecule.atoms[atomIdx];
      if (!atom || atom.symbol !== 'C') {
        return 0;
      }
      visited.add(atomIdx);
      let length = 1;
      let maxBranch = 0;
      for (const bond of molecule.bonds) {
        let nextAtom: number | null = null;
        if (bond.atom1 === atomIdx && !visited.has(bond.atom2)) {
          nextAtom = bond.atom2;
        } else if (bond.atom2 === atomIdx && !visited.has(bond.atom1)) {
          nextAtom = bond.atom1;
        }
        if (nextAtom !== null) {
          const branchLength = dfs(nextAtom, new Set(visited));
          maxBranch = Math.max(maxBranch, branchLength);
        }
      }
      return length + maxBranch;
    };
    return dfs(startAtomIdx, new Set([startAtomIdx]));
  }

  /**
   * Get IUPAC name for alkyl substituent based on chain length
   */
  private getAlkylGroupName(carbonCount: number): string {
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
    return names[carbonCount] || `alkyl(${carbonCount})`;
  }

  /**
   * Get multiplicity prefix (di-, tri-, tetra-, etc.)
   */
  private getMultiplicityPrefix(count: number): string {
    const prefixes: Record<number, string> = {
      2: 'di',
      3: 'tri',
      4: 'tetra',
      5: 'penta',
      6: 'hexa',
      7: 'hepta',
      8: 'octa',
      9: 'nona',
      10: 'deca',
    };
    return prefixes[count] || '';
  }
}

/**
 * Create a default name constructor instance
 */
export function createNameConstructor(): NameConstructor {
  return new NameConstructor();
}
