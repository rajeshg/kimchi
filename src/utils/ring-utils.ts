import type { Atom, Bond } from 'types';
import { findRings } from './ring-finder';
import { bondKey } from './bond-utils';

export interface RingInfo {
  rings: number[][];
  ringAtomSet: Set<number>;
  ringBondSet: Set<string>;
  isAtomInRing: (atomId: number) => boolean;
  isBondInRing: (atom1: number, atom2: number) => boolean;
  getRingsContainingAtom: (atomId: number) => number[][];
  areBothAtomsInSameRing: (atom1: number, atom2: number) => boolean;
}

export function analyzeRings(atoms: Atom[], bonds: Bond[]): RingInfo {
  const rings = findRings(atoms, bonds);
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

export function getAromaticRings(rings: number[][], atoms: Atom[]): number[][] {
  return rings.filter(ring => {
    return ring.every(atomId => {
      const atom = atoms.find(a => a.id === atomId);
      return atom?.aromatic === true;
    });
  });
}

export function getRingAtoms(ring: number[], atoms: Atom[]): Atom[] {
  return ring.map((id: number) => atoms.find(a => a.id === id)!);
}

export function getRingBonds(ring: number[], bonds: Bond[]): Bond[] {
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
