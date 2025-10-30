import type { Molecule } from 'types';

/**
 * Get neighboring atom indices for a given atom in a molecule.
 */
export function getNeighbors(atomIdx: number, molecule: Molecule): number[] {
  const neighbors: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.atom1 === atomIdx) neighbors.push(bond.atom2);
    else if (bond.atom2 === atomIdx) neighbors.push(bond.atom1);
  }
  return neighbors;
}

/**
 * Depth-first search to count branch length (number of connected carbons not in main chain).
 */
export function dfsCountBranch(
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
 * Count the length of a carbon branch for naming (e.g., methyl = 1, ethyl = 2).
 */
export function countBranchLength(atomIdx: number, molecule: Molecule, chainSet: Set<number>): number {
  const visited = new Set<number>();
  return dfsCountBranch(atomIdx, molecule, chainSet, visited);
}
