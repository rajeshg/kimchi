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

export function findSSSR(atoms: Atom[], bonds: Bond[]): number[][] {
  const allRings = findRings(atoms, bonds);
  
  const nodeCount = atoms.length;
  const edgeCount = bonds.length;
  const connectedComponents = countConnectedComponents(atoms, bonds);
  const expectedSSSRSize = edgeCount - nodeCount + connectedComponents;
  
  if (allRings.length <= expectedSSSRSize) {
    return allRings;
  }
  
  const sortedRings = sortBy(allRings, [(r: number[]) => r.length]);
  
  const sssr: number[][] = [];
  const usedEdges = new Set<string>();
  
  for (const ring of sortedRings) {
    if (sssr.length >= expectedSSSRSize) {
      break;
    }
    
    const ringEdges = getRingEdges(ring);
    const hasNewEdge = ringEdges.some(edge => !usedEdges.has(edge));
    
    if (hasNewEdge || sssr.length < expectedSSSRSize) {
      sssr.push(ring);
      for (const edge of ringEdges) {
        usedEdges.add(edge);
      }
    }
  }
  
  return sssr;
}

export function findMCB(atoms: Atom[], bonds: Bond[]): number[][] {
  const allRings = findRings(atoms, bonds);
  
  if (allRings.length === 0) {
    return [];
  }
  
  const nodeCount = atoms.length;
  const edgeCount = bonds.length;
  const connectedComponents = countConnectedComponents(atoms, bonds);
  const expectedSSSRSize = edgeCount - nodeCount + connectedComponents;
  
  const sortedRings = sortBy(allRings, [(r: number[]) => r.length]);
  
  const minSize = sortedRings[0]!.length;
  const smallestRings = sortedRings.filter(r => r.length === minSize);
  
  if (smallestRings.length <= expectedSSSRSize) {
    return sortedRings.slice(0, expectedSSSRSize);
  }
  
  return smallestRings;
}

function countConnectedComponents(atoms: Atom[], bonds: Bond[]): number {
  const visited = new Set<number>();
  let components = 0;
  
  function dfsVisit(atomId: number): void {
    visited.add(atomId);
    const neighbors = bonds
      .filter(b => b.atom1 === atomId || b.atom2 === atomId)
      .map(b => b.atom1 === atomId ? b.atom2 : b.atom1);
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfsVisit(neighbor);
      }
    }
  }
  
  for (const atom of atoms) {
    if (!visited.has(atom.id)) {
      components++;
      dfsVisit(atom.id);
    }
  }
  
  return components;
}

function getRingEdges(ring: number[]): string[] {
  const edges: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const atom1 = ring[i]!;
    const atom2 = ring[(i + 1) % ring.length]!;
    const edge = `${Math.min(atom1, atom2)}-${Math.max(atom1, atom2)}`;
    edges.push(edge);
  }
  return edges;
}

export function classifyRingSystems(atoms: Atom[], bonds: Bond[]): {
  isolated: number[][];
  fused: number[][];
  spiro: number[][];
  bridged: number[][];
} {
  const rings = findSSSR(atoms, bonds);
  const isolated: number[][] = [];
  const fused: number[][] = [];
  const spiro: number[][] = [];
  const bridged: number[][] = [];

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