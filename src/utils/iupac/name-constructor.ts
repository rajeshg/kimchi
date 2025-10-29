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

      // Build functional group suffixes and prefixes
      const { suffix, prefix, numberingRequired } = this.buildFunctionalGroupParts(
        structure.functionalGroups,
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

      // Combine parts: prefix + substituents + parent + suffix
      let name = '';

      // Add any locants needed
      if (numberingRequired && numbering) {
        name += this.buildLocants(structure.functionalGroups, chain, numbering);
      }

      // Add functional group prefix if present
      if (prefix) {
        name += prefix;
      }

      // Add substituent prefixes
      if (substituentPrefix) {
        name += substituentPrefix;
      }

      // Add parent name (alkane root)
      name += alkanePrefix;

      // Add functional group suffix
      if (suffix) {
        name += suffix;
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
