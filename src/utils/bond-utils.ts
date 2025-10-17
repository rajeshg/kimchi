import type { Atom, Bond } from 'types';
import { partition } from 'es-toolkit';

export function getBondsForAtom(bonds: readonly Bond[], atomId: number): Bond[] {
  return bonds.filter(b => b.atom1 === atomId || b.atom2 === atomId);
}

export function getOtherAtomId(bond: Bond, atomId: number): number {
  return bond.atom1 === atomId ? bond.atom2 : bond.atom1;
}

export function getOtherAtom(bond: Bond, atomId: number, atoms: readonly Atom[]): Atom | undefined {
  const otherId = getOtherAtomId(bond, atomId);
  return atoms.find(a => a.id === otherId);
}

export function isHeavyAtom(atom: Atom | undefined): boolean {
  if (!atom) return false;
  return atom.symbol !== 'H' || !!atom.isotope;
}

export function getHeavyNeighborCount(bonds: readonly Bond[], atomId: number, atoms: readonly Atom[]): number {
  return getBondsForAtom(bonds, atomId).filter(b => {
    const other = getOtherAtom(b, atomId, atoms);
    return isHeavyAtom(other);
  }).length;
}

export interface BondsByType {
  single: Bond[];
  double: Bond[];
  triple: Bond[];
  aromatic: Bond[];
}

export function partitionBondsByType(bonds: readonly Bond[]): BondsByType {
  const [single, rest1] = partition([...bonds], b => b.type === 'single');
  const [double, rest2] = partition(rest1, b => b.type === 'double');
  const [triple, aromatic] = partition(rest2, b => b.type === 'triple');
  
  return { single, double, triple, aromatic };
}

export function hasDoubleBond(bonds: readonly Bond[], atomId: number): boolean {
  return getBondsForAtom(bonds, atomId).some(b => b.type === 'double');
}

export function hasTripleBond(bonds: readonly Bond[], atomId: number): boolean {
  return getBondsForAtom(bonds, atomId).some(b => b.type === 'triple');
}

export function hasMultipleBond(bonds: readonly Bond[], atomId: number): boolean {
  return getBondsForAtom(bonds, atomId).some(b => b.type === 'double' || b.type === 'triple');
}

export function hasCarbonylBond(bonds: readonly Bond[], atomId: number, atoms: readonly Atom[]): boolean {
  const atom = atoms.find(a => a.id === atomId);
  if (!atom || atom.aromatic || atom.symbol !== 'C') return false;
  
  return getBondsForAtom(bonds, atomId).some(b => {
    if (b.type !== 'double') return false;
    const other = getOtherAtom(b, atomId, atoms);
    return other?.symbol === 'O';
  });
}

export function bondKey(atom1: number, atom2: number): string {
  return `${Math.min(atom1, atom2)}-${Math.max(atom1, atom2)}`;
}
