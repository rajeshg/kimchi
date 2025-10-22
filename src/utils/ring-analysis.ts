import type { Atom, Bond, Molecule } from 'types';
import { bondKey } from './bond-utils';
import { MoleculeGraph } from './molecular-graph';

export function findRings(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const rings: number[][] = [];
  const visited = new Set<number>();
  const ringSet = new Set<string>();

  function dfs(startId: number, currentId: number, path: number[], visitedEdges: Set<string>, pathSet: Set<number>): void {
    path.push(currentId);
    pathSet.add(currentId);
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
      } else if (!pathSet.has(neighborId)) {
        const newPathSet = new Set(pathSet);
        newPathSet.add(neighborId);
        dfs(startId, neighborId, [...path], new Set(visitedEdges), newPathSet);
      }

      visitedEdges.delete(edgeKey);
    }

    path.pop();
    pathSet.delete(currentId);
    visited.delete(currentId);
  }

  for (const atom of atoms) {
    if (!visited.has(atom.id)) {
      dfs(atom.id, atom.id, [], new Set(), new Set());
    }
  }

  return rings.sort((a, b) => a.length - b.length);
}

export function findAtomRings(atoms: readonly Atom[], bonds: readonly Bond[]): Map<number, number[][]> {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  const atomRings = new Map<number, number[][]>();

  for (const atom of atoms) {
    const ringIndices = mg.getNodeRings(atom.id);
    const rings = ringIndices.map(idx => mg.sssr[idx]!);
    atomRings.set(atom.id, rings);
  }

  return atomRings;
}

export function ringsShareAtoms(ring1: number[], ring2: number[]): boolean {
  const set2 = new Set(ring2);
  return ring1.some(atom => set2.has(atom));
}

export function findSSSR(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  return mg.sssr;
}

export function findMCB(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  return mg.sssr;
}

function countConnectedComponents(atoms: readonly Atom[], bonds: readonly Bond[]): number {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  return mg.components.length;
}

function getRingEdges(ring: number[]): string[] {
  const edges: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const atom1 = ring[i]!;
    const atom2 = ring[(i + 1) % ring.length]!;
    edges.push(`${Math.min(atom1, atom2)}-${Math.max(atom1, atom2)}`);
  }
  return edges;
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
    const ring1Set = new Set(ring1);

    for (let j = i + 1; j < rings.length; j++) {
      const ring2 = rings[j];
      if (!ring2) continue;
      const shared = ring2.filter(atom => ring1Set.has(atom));

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
    for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
      const ring = rings[ringIdx]!;
      const ringSet = new Set(ring);
      const atom1InThisRing = ringSet.has(bond.atom1);
      const atom2InThisRing = ringSet.has(bond.atom2);

      if (atom1InThisRing && atom2InThisRing) {
        ringBondSet.add(bondKey(bond.atom1, bond.atom2));
        break;
      }
    }
  }

  const ringSetArray = rings.map(r => new Set(r));

  return {
    rings,
    ringAtomSet,
    ringBondSet,
    isAtomInRing: (atomId: number) => ringAtomSet.has(atomId),
    isBondInRing: (atom1: number, atom2: number) => ringBondSet.has(bondKey(atom1, atom2)),
    getRingsContainingAtom: (atomId: number) => rings.filter((_, idx) => ringSetArray[idx]!.has(atomId)),
    areBothAtomsInSameRing: (atom1: number, atom2: number) => {
      return ringSetArray.some(ringSet => ringSet.has(atom1) && ringSet.has(atom2));
    },
  };
}

export function isAtomInRing(atomId: number, rings: number[][]): boolean {
  const ringSets = rings.map(r => new Set(r));
  return ringSets.some(ringSet => ringSet.has(atomId));
}

export function isBondInRing(atom1: number, atom2: number, rings: number[][]): boolean {
  const ringSets = rings.map(r => new Set(r));
  return ringSets.some(ringSet => ringSet.has(atom1) && ringSet.has(atom2));
}

export function getRingsContainingAtom(atomId: number, rings: number[][]): number[][] {
  return rings.filter(ring => {
    const ringSet = new Set(ring);
    return ringSet.has(atomId);
  });
}

export function getAromaticRings(rings: number[][], atoms: readonly Atom[]): number[][] {
  const atomMap = new Map(atoms.map(a => [a.id, a]));
  return rings.filter(ring => {
    return ring.every(atomId => {
      const atom = atomMap.get(atomId);
      return atom?.aromatic === true;
    });
  });
}

export function getRingAtoms(ring: readonly number[], atoms: readonly Atom[]): Atom[] {
  const atomMap = new Map(atoms.map(a => [a.id, a]));
  return [...ring].map((id: number) => atomMap.get(id)!);
}

export function getRingBonds(ring: readonly number[], bonds: readonly Bond[]): Bond[] {
  const ringSet = new Set(ring);
  return bonds.filter(b => ringSet.has(b.atom1) && ringSet.has(b.atom2));
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
  const ringSet = new Set(ring);
  for (const otherRing of allRings) {
    if (otherRing === ring) continue;
    const sharedCount = otherRing.filter(id => ringSet.has(id)).length;
    if (sharedCount >= 2) {
      return true;
    }
  }
  return false;
}
