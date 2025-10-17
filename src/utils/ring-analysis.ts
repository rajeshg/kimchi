import type { Atom, Bond } from 'types';
import { intersection, sortBy, range } from 'es-toolkit';
import { bondKey } from './bond-utils';

export function findRings(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const rings: number[][] = [];
  const visited = new Set<number>();
  const ringSet = new Set<string>();

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

  for (const atom of atoms) {
    if (!visited.has(atom.id)) {
      dfs(atom.id, atom.id, [], new Set());
    }
  }

  return rings.sort((a, b) => a.length - b.length);
}

export function findAtomRings(atoms: readonly Atom[], bonds: readonly Bond[]): Map<number, number[][]> {
  const rings = findRings(atoms, bonds);
  const atomRings = new Map<number, number[][]>();

  for (const atom of atoms) {
    const atomRingsList = rings.filter(ring => ring.includes(atom.id));
    atomRings.set(atom.id, atomRingsList);
  }

  return atomRings;
}

export function ringsShareAtoms(ring1: number[], ring2: number[]): boolean {
  return intersection(ring1, ring2).length > 0;
}

export function findSSSR(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
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

export function findMCB(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
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

function countConnectedComponents(atoms: readonly Atom[], bonds: readonly Bond[]): number {
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
  return range(ring.length).map(i => {
    const atom1 = ring[i]!;
    const atom2 = ring[(i + 1) % ring.length]!;
    return `${Math.min(atom1, atom2)}-${Math.max(atom1, atom2)}`;
  });
}

export function classifyRingSystems(atoms: readonly Atom[], bonds: readonly Bond[]): {
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

export interface RingInfo {
  rings: number[][];
  ringAtomSet: Set<number>;
  ringBondSet: Set<string>;
  isAtomInRing: (atomId: number) => boolean;
  isBondInRing: (atom1: number, atom2: number) => boolean;
  getRingsContainingAtom: (atomId: number) => number[][];
  areBothAtomsInSameRing: (atom1: number, atom2: number) => boolean;
}

export function analyzeRings(atoms: readonly Atom[], bonds: readonly Bond[]): RingInfo {
  const rings = findMCB(atoms, bonds);
  const ringAtomSet = new Set<number>();
  const ringBondSet = new Set<string>();
  
  for (const ring of rings) {
    for (const atomId of ring) {
      ringAtomSet.add(atomId);
    }
  }
  
  for (const bond of bonds) {
    for (const ring of rings) {
      const atom1InThisRing = ring.includes(bond.atom1);
      const atom2InThisRing = ring.includes(bond.atom2);
      
      if (atom1InThisRing && atom2InThisRing) {
        ringBondSet.add(bondKey(bond.atom1, bond.atom2));
        break;
      }
    }
  }
  
  return {
    rings,
    ringAtomSet,
    ringBondSet,
    isAtomInRing: (atomId: number) => ringAtomSet.has(atomId),
    isBondInRing: (atom1: number, atom2: number) => ringBondSet.has(bondKey(atom1, atom2)),
    getRingsContainingAtom: (atomId: number) => rings.filter(r => r.includes(atomId)),
    areBothAtomsInSameRing: (atom1: number, atom2: number) => {
      return rings.some(ring => ring.includes(atom1) && ring.includes(atom2));
    },
  };
}

export function isAtomInRing(atomId: number, rings: number[][]): boolean {
  return rings.some(ring => ring.includes(atomId));
}

export function isBondInRing(atom1: number, atom2: number, rings: number[][]): boolean {
  return rings.some(ring => ring.includes(atom1) && ring.includes(atom2));
}

export function getRingsContainingAtom(atomId: number, rings: number[][]): number[][] {
  return rings.filter(ring => ring.includes(atomId));
}

export function getAromaticRings(rings: number[][], atoms: readonly Atom[]): number[][] {
  return rings.filter(ring => {
    return ring.every(atomId => {
      const atom = atoms.find(a => a.id === atomId);
      return atom?.aromatic === true;
    });
  });
}

export function getRingAtoms(ring: readonly number[], atoms: readonly Atom[]): Atom[] {
  return [...ring].map((id: number) => atoms.find(a => a.id === id)!);
}

export function getRingBonds(ring: readonly number[], bonds: readonly Bond[]): Bond[] {
  return bonds.filter(b => ring.includes(b.atom1) && ring.includes(b.atom2));
}

export function isCompositeRing(ring: number[], smallerRings: number[][]): boolean {
  for (let i = 0; i < smallerRings.length; i++) {
    for (let j = i + 1; j < smallerRings.length; j++) {
      const ring1 = smallerRings[i]!;
      const ring2 = smallerRings[j]!;
      const combined = new Set([...ring1, ...ring2]);
      if (combined.size === ring.length && ring.every(id => combined.has(id))) {
        return true;
      }
    }
  }
  return false;
}

export function filterElementaryRings(allRings: number[][]): number[][] {
  return allRings.filter((ring: number[]) => {
    const smallerRings = allRings.filter((r: number[]) => r.length < ring.length);
    return !isCompositeRing(ring, smallerRings);
  });
}

export function isPartOfFusedSystem(ring: number[], allRings: number[][]): boolean {
  for (const otherRing of allRings) {
    if (otherRing === ring) continue;
    const sharedAtoms = ring.filter(id => otherRing.includes(id));
    if (sharedAtoms.length >= 2) {
      return true;
    }
  }
  return false;
}
