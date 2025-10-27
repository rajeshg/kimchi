import type { Molecule } from 'types';
import { BondType } from 'types';

/**
 * Chain numbering logic for IUPAC naming.
 *
 * Numbering rules (in order of precedence):
 * 1. Position the principal functional group at the lowest possible locant (1)
 * 2. Give substituents the lowest set of locants as a whole
 * 3. If tied, alphabetical order of substituent names
 */

export interface ChainNumbering {
  /** Mapping from original atom index to position in the chain (1-based) */
  numbering: Map<number, number>;
  /** Ordered list of atom indices in the chain (following the numbering) */
  orderedChain: number[];
  /** Reason for this numbering */
  reason: string;
}

/**
 * Determine the numbering direction for a chain.
 * Returns the ordering of atoms in the chain that gives the best IUPAC numbering.
 */
export function numberChain(chain: number[], molecule: Molecule): ChainNumbering {
  if (chain.length < 2) {
    const numbering = new Map<number, number>();
    chain.forEach((atomIdx, idx) => numbering.set(atomIdx, idx + 1));
    return {
      numbering,
      orderedChain: chain,
      reason: 'Single or no atoms',
    };
  }

  // Try both directions
  const forward: ChainNumbering = {
    numbering: createNumbering(chain),
    orderedChain: chain,
    reason: 'Forward direction',
  };

  const reversed = [...chain].reverse();
  const backward: ChainNumbering = {
    numbering: createNumbering(reversed),
    orderedChain: reversed,
    reason: 'Backward direction',
  };

  // Compare using IUPAC rules
  const better = isBetterNumbering(forward, backward, molecule);
  return better === 'forward' ? forward : backward;
}

/**
 * Create a numbering map from an ordered chain.
 */
function createNumbering(orderedChain: number[]): Map<number, number> {
  const numbering = new Map<number, number>();
  orderedChain.forEach((atomIdx, idx) => {
    numbering.set(atomIdx, idx + 1);
  });
  return numbering;
}

/**
 * Compare two numbering schemes and return which is better ('forward' or 'backward').
 */
function isBetterNumbering(
  forward: ChainNumbering,
  backward: ChainNumbering,
  molecule: Molecule
): 'forward' | 'backward' {
  // Rule 1: Lowest position for principal functional group
  const fgPosF = getHighestPriorityFGPosition(forward.orderedChain, molecule);
  const fgPosB = getHighestPriorityFGPosition(backward.orderedChain, molecule);

  if (fgPosF !== fgPosB) {
    return fgPosF < fgPosB ? 'forward' : 'backward';
  }

  // Rule 2: Lowest set of locants for all substituents
  const locF = getSubstituentLocants(forward.orderedChain, molecule);
  const locB = getSubstituentLocants(backward.orderedChain, molecule);

  if (!arraysEqual(locF, locB)) {
    return isLowerLocants(locF, locB) ? 'forward' : 'backward';
  }

  // Default: forward direction
  return 'forward';
}

/**
 * Get the position (1-based) of the highest-priority functional group in the chain.
 * Returns Infinity if no FG found.
 */
function getHighestPriorityFGPosition(chain: number[], molecule: Molecule): number {
  let bestPos = Infinity;
  let bestPriority = 0;

  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const atom = molecule.atoms[atomIdx];
    if (!atom) continue;

    // Simple functional group detection (can be enhanced)
    if (atom.symbol === 'C') {
      const bonds = molecule.bonds.filter(b => b.atom1 === atomIdx || b.atom2 === atomIdx);
      let priority = 0;

      // Check for carboxylic acid
      const hasDoubleO = bonds.some(
        b => (molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1]?.symbol === 'O') && b.type === BondType.DOUBLE
      );
      const hasSingleOH = bonds.some(b => {
        const neigh = molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1];
        return neigh?.symbol === 'O' && b.type === BondType.SINGLE && neigh.hydrogens! > 0;
      });
      if (hasDoubleO && hasSingleOH) priority = 6;

      // Check for aldehyde/ketone
      else if (hasDoubleO) priority = 5;

      // Check for alcohol
      const hasOH = bonds.some(b => {
        const neigh = molecule.atoms[b.atom1 === atomIdx ? b.atom2 : b.atom1];
        return neigh?.symbol === 'O' && neigh.hydrogens! > 0;
      });
      if (hasOH && priority === 0) priority = 3;

      if (priority > bestPriority) {
        bestPriority = priority;
        bestPos = i + 1;
      }
    }
  }

  return bestPos;
}

/**
 * Get locants for all substituents on the chain.
 */
function getSubstituentLocants(chain: number[], molecule: Molecule): number[] {
  const locants: number[] = [];
  const chainSet = new Set(chain);

  for (let i = 0; i < chain.length; i++) {
    const atomIdx = chain[i]!;
    const neighbors = getNeighbors(atomIdx, molecule);

    for (const neighbor of neighbors) {
      if (!chainSet.has(neighbor)) {
        // This is a substituent position
        locants.push(i + 1);
        break;
      }
    }
  }

  return locants.sort((a, b) => a - b);
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

/**
 * Check if two arrays are equal.
 */
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

/**
 * Check if locants1 is lower (better) than locants2.
 */
function isLowerLocants(locants1: number[], locants2: number[]): boolean {
  const len = Math.min(locants1.length, locants2.length);
  for (let i = 0; i < len; i++) {
    if (locants1[i]! < locants2[i]!) return true;
    if (locants1[i]! > locants2[i]!) return false;
  }
  return locants1.length < locants2.length;
}

export default numberChain;
