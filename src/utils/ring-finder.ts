import type { Atom, Bond } from 'types';
import { intersection, sortBy } from 'es-toolkit';

/**
 * Find all rings in a molecule using DFS with improved cycle detection
 * Returns an array of ring atom ID arrays, sorted by size
 */
export function findRings(atoms: Atom[], bonds: Bond[]): number[][] {
  const rings: number[][] = [];
  const visited = new Set<number>();
  const ringSet = new Set<string>(); // To avoid duplicate rings

  function dfs(startId: number, currentId: number, path: number[], visitedEdges: Set<string>): void {
    path.push(currentId);
    visited.add(currentId);

    const neighbors = bonds
      .filter(b => b.atom1 === currentId || b.atom2 === currentId)
      .map(b => b.atom1 === currentId ? b.atom2 : b.atom1)
      .filter(id => !visitedEdges.has(`${Math.min(currentId, id)}-${Math.max(currentId, id)}`));

    for (const neighborId of neighbors) {
      const edgeKey = `${Math.min(currentId, neighborId)}-${Math.max(currentId, neighborId)}`;
      visitedEdges.add(edgeKey);

      if (neighborId === startId && path.length >= 3) {
        // Found a ring - normalize it to start with smallest ID
        const ring = [...path].sort((a, b) => a - b);
        const ringKey = ring.join(',');
        if (!ringSet.has(ringKey)) {
          ringSet.add(ringKey);
          rings.push(ring);
        }
      } else if (!path.includes(neighborId)) {
        dfs(startId, neighborId, [...path], new Set(visitedEdges));
      }

      visitedEdges.delete(edgeKey);
    }

    path.pop();
    visited.delete(currentId);
  }

  // Find rings starting from each atom
  for (const atom of atoms) {
    if (!visited.has(atom.id)) {
      dfs(atom.id, atom.id, [], new Set());
    }
  }

  // Sort rings by size (smallest first)
  return rings.sort((a, b) => a.length - b.length);
}

/**
 * Find the smallest rings containing each atom
 */
export function findAtomRings(atoms: Atom[], bonds: Bond[]): Map<number, number[][]> {
  const rings = findRings(atoms, bonds);
  const atomRings = new Map<number, number[][]>();

  for (const atom of atoms) {
    const atomRingsList = rings.filter(ring => ring.includes(atom.id));
    atomRings.set(atom.id, atomRingsList);
  }

  return atomRings;
}

/**
 * Check if two rings share atoms (for fused/spiro systems)
 */
export function ringsShareAtoms(ring1: number[], ring2: number[]): boolean {
  return intersection(ring1, ring2).length > 0;
}

/**
 * Classify ring systems (isolated, fused, spiro, bridged)
 */
export function classifyRingSystems(atoms: Atom[], bonds: Bond[]): {
  isolated: number[][];
  fused: number[][];
  spiro: number[][];
  bridged: number[][];
} {
  const rings = findRings(atoms, bonds);
  const isolated: number[][] = [];
  const fused: number[][] = [];
  const spiro: number[][] = [];
  const bridged: number[][] = [];

  // Simple classification based on shared atoms
  for (let i = 0; i < rings.length; i++) {
    const ring1 = rings[i];
    if (!ring1) continue;
    let sharedCount = 0;
    let sharedAtoms: number[] = [];

    for (let j = i + 1; j < rings.length; j++) {
      const ring2 = rings[j];
      if (!ring2) continue;
      const shared = intersection(ring1, ring2);

      if (shared.length > 0) {
        sharedCount++;
        sharedAtoms.push(...shared);
      }
    }

    if (sharedCount === 0) {
      isolated.push(ring1);
    } else if (sharedCount === 1 && sharedAtoms.length === 1) {
      spiro.push(ring1);
    } else if (sharedCount >= 1 && sharedAtoms.length >= 2) {
      fused.push(ring1);
    } else {
      bridged.push(ring1);
    }
  }

  return { isolated, fused, spiro, bridged };
}