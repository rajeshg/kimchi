import type { Molecule } from 'types';
import type { Chain, MultipleBond, Bond, Atom } from 'types';

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

/**
 * Find the parent chain in a molecule according to IUPAC rules:
 * - Longest continuous carbon chain
 * - If tied, most double/triple bonds
 * - If still tied, most principal functional groups
 * - If still tied, most heteroatoms
 * Returns array of atom indices for the parent chain.
 */
export function findParentChain(molecule: Molecule): number[] {
  // Helper: get all carbon atom indices
  const carbonIndices = molecule.atoms
    .map((atom, idx) => atom?.symbol === 'C' ? idx : -1)
    .filter(idx => idx !== -1);

  // Helper: DFS to find all chains starting from a given atom
  function dfsChain(atomIdx: number, visited: Set<number>, chain: number[]): number[][] {
    visited.add(atomIdx);
    chain.push(atomIdx);
    const neighbors = getNeighbors(atomIdx, molecule).filter(n => molecule.atoms[n]?.symbol === 'C');
    let chains: number[][] = [];
    let extended = false;
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        extended = true;
        chains = chains.concat(dfsChain(neighbor, new Set(visited), [...chain]));
      }
    }
    if (!extended) chains.push([...chain]);
    return chains;
  }

  // Collect all possible chains
  let allChains: number[][] = [];
  for (const startIdx of carbonIndices) {
    allChains = allChains.concat(dfsChain(startIdx, new Set(), []));
  }

  // Deduplicate chains (by atom set)
  const uniqueChains: number[][] = [];
  const seen = new Set<string>();
  for (const chain of allChains) {
    const key = chain.slice().sort((a, b) => a - b).join(',');
    if (!seen.has(key)) {
      uniqueChains.push(chain);
      seen.add(key);
    }
  }

  // Scoring function for chain selection
  function scoreChain(chain: number[]): [number, number, number, number] {
    // 1. Length
    const length = chain.length;
    // 2. Unsaturations (double/triple bonds)
    let unsaturations = 0;
    for (let i = 0; i < chain.length - 1; i++) {
      const atomA = chain[i];
      const atomB = chain[i + 1];
      const bond = molecule.bonds.find(b =>
        (b.atom1 === atomA && b.atom2 === atomB) || (b.atom2 === atomA && b.atom1 === atomB)
      );
      if (bond && (bond.type === 'double' || bond.type === 'triple')) unsaturations++;
    }
    // 3. Principal functional groups (placeholder: count O/N/S attached to chain)
    let principalGroups = 0;
    for (const atomIdx of chain) {
      const atom = molecule.atoms[atomIdx];
      if (atom && ["O", "N", "S"].includes(atom.symbol)) principalGroups++;
    }
    // 4. Heteroatoms
    let heteroatoms = 0;
    for (const atomIdx of chain) {
      const atom = molecule.atoms[atomIdx];
      if (atom && atom.symbol !== 'C' && atom.symbol !== 'H') heteroatoms++;
    }
    return [length, unsaturations, principalGroups, heteroatoms];
  }

  // Select best chain by IUPAC rules
    uniqueChains.sort((a, b) => {
      const sa = scoreChain(a) ?? [0, 0, 0, 0];
      const sb = scoreChain(b) ?? [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) {
        if ((sb[i] ?? 0) !== (sa[i] ?? 0)) return (sb[i] ?? 0) - (sa[i] ?? 0);
      }
      return 0;
    });

  if (uniqueChains.length === 0) return [];
  return Array.isArray(uniqueChains[0]) ? uniqueChains[0] : [];
}

/**
 * Detect basic chains in an acyclic molecule (simple chain detection based on valence).
 */
export function detectBasicChains(molecule: Molecule): Chain[] {
  const chains: Chain[] = [];
  // For now, just create a simple chain from all atoms if it's acyclic
  if (!molecule.atoms.some(atom => atom.isInRing ?? false) && molecule.atoms.length >= 2) {
    const atoms = molecule.atoms.slice().sort((a, b) => a.id - b.id);
    const bonds: Bond[] = [];
    const multipleBonds: MultipleBond[] = [];
    // Simple bond extraction
    for (let i = 0; i < atoms.length - 1; i++) {
      const atom1 = atoms[i];
      const atom2 = atoms[i + 1];
      if (!atom1 || !atom2) continue;
      const bond = molecule.bonds.find(b => 
        (b.atom1 === atom1.id && b.atom2 === atom2.id) ||
        (b.atom2 === atom1.id && b.atom1 === atom2.id)
      );
      if (bond) {
        bonds.push(bond);
        if (bond.type !== 'single') {
          multipleBonds.push({
            atoms: [atom1, atom2],
            bond: bond,
            type: bond.type === 'double' ? 'double' : 'triple',
            locant: i + 1
          });
        }
      }
    }
    chains.push({
      atoms,
      bonds,
      length: atoms.length,
      multipleBonds,
      substituents: [],
      locants: Array.from({ length: atoms.length }, (_, i) => i + 1)
    });
  }
  return chains;
}
