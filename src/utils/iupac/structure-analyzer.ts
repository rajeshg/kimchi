import type { Molecule } from 'types';
import type {
  Chain,
  MolecularStructure,
  FunctionalGroup,
  Ring,
} from './iupac-types';
import { analyzeRings } from '../ring-analysis';
import { matchSMARTS } from 'src/matchers/smarts-matcher';

/**
 * Analyzes molecular structure for IUPAC nomenclature
 * Identifies chains, rings, functional groups, and their relationships
 */
export class StructureAnalyzer {
  /**
   * Analyze complete molecular structure
   */
  analyze(molecule: Molecule): MolecularStructure {
    const chains = this.identifyChains(molecule);
    const ringInfo = analyzeRings(molecule);
    const rings = this.extractRings(ringInfo);
    const functionalGroups = this.identifyFunctionalGroups(molecule);
    const principalFunctionalGroup = this.findPrincipalFunctionalGroup(functionalGroups);

    return {
      chains,
      principalChain: chains.length > 0 ? chains[0]! : null,
      functionalGroups,
      principalFunctionalGroup,
      rings,
    };
  }

  /**
   * Identify all carbon chains in the molecule
   */
  private identifyChains(molecule: Molecule): Chain[] {
    const chains: Chain[] = [];
    const visited = new Set<number>();

    // Find all carbon atoms
    const carbonIndices = molecule.atoms
      .map((atom, idx) => (atom.symbol === 'C' ? idx : -1))
      .filter(idx => idx >= 0);

    if (carbonIndices.length === 0) return chains;

    // Find main chain (longest carbon chain)
    const mainChainIndices = this.findLongestCarbonChain(molecule, carbonIndices);
    if (mainChainIndices.length > 0) {
      chains.push(this.createChain(mainChainIndices, molecule));
      mainChainIndices.forEach(idx => visited.add(idx));
    }

    // Find branch chains from unvisited carbons
    for (const carbonIdx of carbonIndices) {
      if (visited.has(carbonIdx)) continue;

      const branchIndices = this.findChainFromAtom(molecule, carbonIdx, visited);
      if (branchIndices.length > 0) {
        chains.push(this.createChain(branchIndices, molecule));
        branchIndices.forEach(idx => visited.add(idx));
      }
    }

    // Sort by length descending
    chains.sort((a, b) => b.length - a.length);
    return chains;
  }

  /**
   * Find longest carbon chain starting from a given atom
   */
  private findLongestCarbonChain(
    molecule: Molecule,
    carbonIndices: number[]
  ): number[] {
    let longestChain: number[] = [];

    for (const startIdx of carbonIndices) {
      const chain = this.dfsLongestChain(molecule, startIdx, new Set(), []);
      if (chain.length > longestChain.length) {
        longestChain = chain;
      }
    }

    return longestChain;
  }

  /**
   * DFS to find longest chain of carbons from starting atom
   */
  private dfsLongestChain(
    molecule: Molecule,
    atomIdx: number,
    visited: Set<number>,
    chain: number[]
  ): number[] {
    const currentChain = [...chain, atomIdx];
    visited.add(atomIdx);

    let longestPath = currentChain;

    // Find all carbon neighbors
    const bonds = molecule.bonds.filter(b => b.atom1 === atomIdx || b.atom2 === atomIdx);
    for (const bond of bonds) {
      const neighborIdx = bond.atom1 === atomIdx ? bond.atom2 : bond.atom1;
      const neighbor = molecule.atoms[neighborIdx];

      if (!visited.has(neighborIdx) && neighbor?.symbol === 'C') {
        const result = this.dfsLongestChain(molecule, neighborIdx, new Set(visited), currentChain);
        if (result.length > longestPath.length) {
          longestPath = result;
        }
      }
    }

    return longestPath;
  }

  /**
   * Find a chain starting from an atom
   */
  private findChainFromAtom(
    molecule: Molecule,
    startIdx: number,
    visited: Set<number>
  ): number[] {
    const chain: number[] = [startIdx];
    let current = startIdx;
    const localVisited = new Set<number>([startIdx]);

    while (true) {
      const bonds = molecule.bonds.filter(
        b => (b.atom1 === current || b.atom2 === current) && !localVisited.has(b.atom1) && !localVisited.has(b.atom2)
      );

      let found = false;
      for (const bond of bonds) {
        const neighborIdx = bond.atom1 === current ? bond.atom2 : bond.atom1;
        if (!visited.has(neighborIdx)) {
          const neighbor = molecule.atoms[neighborIdx];
          if (neighbor?.symbol === 'C') {
            chain.push(neighborIdx);
            localVisited.add(neighborIdx);
            current = neighborIdx;
            found = true;
            break;
          }
        }
      }

      if (!found) break;
    }

    return chain;
  }

  /**
   * Create a Chain object from atom indices
   */
  private createChain(atomIndices: number[], molecule: Molecule): Chain {
    const ringInfo = analyzeRings(molecule);
    const isCyclic = atomIndices.some(idx =>
      ringInfo.getRingsContainingAtom(idx).length > 0
    );
    const isAromatic = atomIndices.some(idx => molecule.atoms[idx]?.aromatic);

    return {
      atomIndices,
      length: atomIndices.length,
      substituents: [],
      functionalGroups: [],
      isCyclic,
      isAromatic,
    };
  }

  /**
   * Extract ring information from ring analysis
   */
  private extractRings(ringInfo: ReturnType<typeof analyzeRings>): Ring[] {
    return ringInfo.rings.map(ring => {
      const ringSet = new Set(ring);
      return {
        atomIndices: ring,
        size: ring.length,
        isAromatic: false, // Will be determined during analysis
        isFused: false, // Will be determined based on shared atoms
      };
    });
  }

  /**
   * Identify all functional groups in the molecule
   */
  private identifyFunctionalGroups(molecule: Molecule): FunctionalGroup[] {
    const functionalGroups: FunctionalGroup[] = [];
    const commonPatterns: Array<{
      smarts: string;
      name: string;
      priority: number;
      suffix: string;
    }> = [
      { smarts: '[CX3](=O)[OX2H1]', name: 'carboxylic acid', priority: 1, suffix: '-oic acid' },
      { smarts: '[CX3](=O)[OX2H0]', name: 'ester', priority: 2, suffix: '-oate' },
      { smarts: '[CX3](=O)[NX3]', name: 'amide', priority: 3, suffix: '-amide' },
      { smarts: '[CX3](=O)[#1]', name: 'aldehyde', priority: 4, suffix: '-al' },
      { smarts: '[#6][CX3](=O)[#6]', name: 'ketone', priority: 5, suffix: '-one' },
      { smarts: '[OX2H]', name: 'hydroxyl', priority: 6, suffix: '-ol' },
      { smarts: '[NX3;H2,H1;!$(NC=O)]', name: 'amine', priority: 7, suffix: '-amine' },
      { smarts: '[SX2H]', name: 'thiol', priority: 8, suffix: '-thiol' },
      { smarts: '[#6]=[#6]', name: 'alkene', priority: 9, suffix: '-ene' },
      { smarts: '[#6]#[#6]', name: 'alkyne', priority: 10, suffix: '-yne' },
    ];

    for (const pattern of commonPatterns) {
      try {
        const match = matchSMARTS(pattern.smarts, molecule);
        if (match.success && match.matches.length > 0) {
          for (const matchGroup of match.matches) {
            const atomIndices = matchGroup.atoms.map(am => am.moleculeIndex);

            const fg: FunctionalGroup = {
              name: pattern.name,
              priority: pattern.priority,
              smarts: pattern.smarts,
              suffix: pattern.suffix,
              parenthesized: false,
              atomIndices,
              isPrincipal: false,
            };
            // Avoid duplicates
            if (!functionalGroups.some(g =>
              g.name === fg.name && g.atomIndices.every(idx => fg.atomIndices.includes(idx))
            )) {
              functionalGroups.push(fg);
            }
          }
        }
      } catch {
        // Skip patterns that fail to match
      }
    }

    return functionalGroups.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Find the principal (most important) functional group
   */
  private findPrincipalFunctionalGroup(
    functionalGroups: FunctionalGroup[]
  ): FunctionalGroup | null {
    if (functionalGroups.length === 0) return null;

    // Principal FG has lowest priority number (highest importance)
    const principal = functionalGroups[0]!;
    principal.isPrincipal = true;
    return principal;
  }
}

/**
 * Create default structure analyzer instance
 */
export function createStructureAnalyzer(): StructureAnalyzer {
  return new StructureAnalyzer();
}
