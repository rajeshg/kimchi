import type { Molecule } from 'types';
import { BondType } from 'types';
import type { Chain, NumberingResult } from './iupac-types';

/**
 * Numbering direction: 1 for left-to-right, -1 for right-to-left
 */
export type NumberingDirection = 1 | -1;

/**
 * Analyzes and determines optimal numbering for molecular chains
 * Implements IUPAC rules for principal chain numbering
 *
 * Numbering rules (in order of priority):
 * 1. Functional groups should get lowest locants
 * 2. Multiple bonds should get lowest locants
 * 3. Substituents should get lowest locants
 * 4. Number from direction giving lowest set of locants
 */
export class NumberingAnalyzer {
  /**
   * Determine optimal numbering for a principal chain
   * Returns locants and the direction used (1 = forward, -1 = backward)
   */
  determineNumbering(chain: Chain, molecule: Molecule): NumberingResult {
    if (chain.atomIndices.length === 0) {
      return {
        numbering: new Map<number, number>(),
        direction: 1,
        score: 0,
      };
    }

    // Get functional group positions in chain
    const fgPositions = this.getFunctionalGroupPositions(chain, molecule, []); // Will be updated below

    // Get multiple bond positions in chain
    const multiplePositions = this.getMultipleBondPositions(chain, molecule);

    // Get substituent positions in chain
    const substituentPositions = this.getSubstituentPositions(chain, molecule);

    // Calculate scores for both directions
    if (process.env.VERBOSE) {
      console.log(`[determineNumbering] FG positions: [${fgPositions.join(',')}]`);
      console.log(`[determineNumbering] Multiple bond positions: [${multiplePositions.join(',')}]`);
      console.log(`[determineNumbering] Substituent positions: [${substituentPositions.join(',')}]`);
    }

    const forwardScore = this.calculateNumberingScore(
      fgPositions,
      multiplePositions,
      substituentPositions,
      1,
      chain.atomIndices.length
    );

    const backwardScore = this.calculateNumberingScore(
      fgPositions,
      multiplePositions,
      substituentPositions,
      -1,
      chain.atomIndices.length
    );

    // Choose direction with lower (better) score
    const direction = forwardScore <= backwardScore ? (1 as NumberingDirection) : (-1 as NumberingDirection);
    
    if (process.env.VERBOSE) {
      console.log(`[determineNumbering] Forward score: ${forwardScore}, Backward score: ${backwardScore}`);
      console.log(`[determineNumbering] Choosing direction: ${direction === 1 ? 'forward' : 'backward'}`);
    }

    // Create numbering map
    const numbering = this.createNumberingMap(chain, direction);

    // Return result with the better score
    const score = Math.min(forwardScore, backwardScore);

    return {
      numbering,
      direction,
      score,
    };
  }

  /**
   * Get positions of functional groups within chain atoms
   * This method should be called with functional group information from structure analysis
   */
  getFunctionalGroupPositions(chain: Chain, molecule: Molecule, functionalGroups: any[] = []): number[] {
    const positions: number[] = [];

    // If functional groups are provided, use them directly
    if (functionalGroups.length > 0) {
      for (const fg of functionalGroups) {
        // Find the position of the functional group's key atom in the chain
        for (const atomIdx of fg.atomIndices) {
          const chainPosition = chain.atomIndices.indexOf(atomIdx);
          if (chainPosition >= 0) {
            positions.push(chainPosition);
            break; // Only add one position per functional group
          }
        }
      }
      return positions;
    }

    // Fallback: Use heuristic detection (for backward compatibility)
    for (let i = 0; i < chain.atomIndices.length; i++) {
      const atomIdx = chain.atomIndices[i];
      if (atomIdx === undefined) continue;

      const atom = molecule.atoms[atomIdx];
      if (!atom) continue;

      // Check if this atom itself is a functional group atom (for most cases)
      if (
        atom.symbol === 'O' ||
        atom.symbol === 'N' ||
        atom.symbol === 'S' ||
        atom.symbol === 'F' ||
        atom.symbol === 'Cl' ||
        atom.symbol === 'Br' ||
        atom.symbol === 'I'
      ) {
        // Special case: for alcohol, check if this O has hydrogens (is OH group)
        if (atom.symbol === 'O' && atom.hydrogens > 0) {
          // This is an OH group - check if it's attached to a carbon (alcohol)
          const bonds = molecule.bonds.filter(b => b.atom1 === atomIdx || b.atom2 === atomIdx);
          const carbonNeighbor = bonds.find(b => {
            const neighbor = b.atom1 === atomIdx ? b.atom2 : b.atom1;
            return molecule.atoms[neighbor]?.symbol === 'C';
          });
          if (carbonNeighbor) {
            positions.push(i);
          }
        } else if (atom.symbol !== 'O') {
          // For non-oxygen atoms, include them directly
          positions.push(i);
        }
      }
      
      // Also check for carbon atoms with attached functional groups
      if (atom.symbol === 'C') {
        const bonds = molecule.bonds.filter(b => b.atom1 === atomIdx || b.atom2 === atomIdx);
        
        // Check for alcohol: C-OH
        const hasOH = bonds.some(b => {
          const neighbor = molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1];
          return neighbor?.symbol === 'O' && b.type === 'single' && neighbor.hydrogens > 0;
        });
        
        if (hasOH) {
          if (process.env.VERBOSE) {
            console.log(`[getFunctionalGroupPositions] Found alcohol-bearing carbon at chain position ${i + 1}, atom ${atomIdx}`);
          }
          positions.push(i);
        }
      }
    }

    return positions;
  }

  /**
   * Get positions of multiple bonds within chain atoms
   */
  private getMultipleBondPositions(chain: Chain, molecule: Molecule): number[] {
    const positions: number[] = [];
    const chainSet = new Set(chain.atomIndices);

    for (const bond of molecule.bonds) {
      const atom1InChain = chainSet.has(bond.atom1);
      const atom2InChain = chainSet.has(bond.atom2);

      // Bond must connect two chain atoms
      if (!atom1InChain || !atom2InChain) continue;

      // Only count double and triple bonds
      if (bond.type === BondType.DOUBLE || bond.type === BondType.TRIPLE) {
        // Find position in chain for atom1
        const pos1 = chain.atomIndices.indexOf(bond.atom1);
        if (pos1 >= 0) {
          positions.push(pos1);
        }
      }
    }

    return [...new Set(positions)]; // Remove duplicates
  }

  /**
   * Get positions of substituents on chain atoms
   * Substituents are atoms not part of the main chain connected to chain atoms
   */
  private getSubstituentPositions(chain: Chain, molecule: Molecule): number[] {
    const positions: number[] = [];
    const chainSet = new Set(chain.atomIndices);

    for (let i = 0; i < chain.atomIndices.length; i++) {
      const chainAtomIdx = chain.atomIndices[i];
      if (chainAtomIdx === undefined) continue;

      // Check for bonds to non-chain atoms (substituents)
      for (const bond of molecule.bonds) {
        let connectedAtom: number | null = null;
        if (bond.atom1 === chainAtomIdx) {
          connectedAtom = bond.atom2;
        } else if (bond.atom2 === chainAtomIdx) {
          connectedAtom = bond.atom1;
        }

        if (connectedAtom !== null && !chainSet.has(connectedAtom)) {
          // This chain atom has a substituent
          positions.push(i);
          break; // Only count once per position
        }
      }
    }

    return positions;
  }

  /**
   * Calculate score for a numbering direction
   * Lower score is better (locants closer to start)
   * Score calculation: sum of (position * priority_weight)
   *
   * Priorities (weights):
   * - Functional groups: 1000
   * - Multiple bonds: 100
   * - Substituents: 10
   */
  private calculateNumberingScore(
    fgPositions: number[],
    multiplePositions: number[],
    substituentPositions: number[],
    direction: NumberingDirection,
    chainLength: number
  ): number {
    let score = 0;

    // Score functional groups (highest priority)
    for (const pos of fgPositions) {
      const locant = direction === 1 ? pos + 1 : (chainLength - pos);
      score += locant * 1000;
      if (process.env.VERBOSE) {
        console.log(`[calculateNumberingScore] FG at pos ${pos}, locant ${locant}, contribution ${locant * 1000}`);
      }
    }

    // Score multiple bonds
    for (const pos of multiplePositions) {
      const locant = direction === 1 ? pos + 1 : (chainLength - pos);
      score += locant * 100;
      if (process.env.VERBOSE) {
        console.log(`[calculateNumberingScore] Bond at pos ${pos}, locant ${locant}, contribution ${locant * 100}`);
      }
    }

    // Score substituents
    for (const pos of substituentPositions) {
      const locant = direction === 1 ? pos + 1 : (chainLength - pos);
      score += locant * 10;
      if (process.env.VERBOSE) {
        console.log(`[calculateNumberingScore] Substituent at pos ${pos}, locant ${locant}, contribution ${locant * 10}`);
      }
    }

    if (process.env.VERBOSE) {
      console.log(`[calculateNumberingScore] Direction ${direction === 1 ? 'forward' : 'backward'} score: ${score}`);
    }

    return score;
  }

  /**
   * Create mapping from atom index to locant (position in chain)
   */
  private createNumberingMap(chain: Chain, direction: NumberingDirection): Map<number, number> {
    const numbering = new Map<number, number>();
    const length = chain.atomIndices.length;

    for (let i = 0; i < length; i++) {
      const atomIdx = chain.atomIndices[i];
      if (atomIdx === undefined) continue;

      const locant = direction === 1 ? i + 1 : length - i;
      numbering.set(atomIdx, locant);
    }

    return numbering;
  }
}

/**
 * Create a default numbering analyzer instance
 */
export function createNumberingAnalyzer(): NumberingAnalyzer {
  return new NumberingAnalyzer();
}
