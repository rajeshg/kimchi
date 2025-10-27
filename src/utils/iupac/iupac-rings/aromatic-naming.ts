import type { Molecule } from 'types';
import { findHeteroatomsInRing } from './utils';

export function isRingAromatic(ring: number[], molecule: Molecule): boolean {
  const ringAtoms = ring.map(idx => molecule.atoms[idx]).filter((a): a is typeof molecule.atoms[0] => a !== undefined);
  return ringAtoms.every(atom => atom.aromatic);
}

export function generateAromaticRingName(ring: number[], molecule: Molecule): string {
  const ringSize = ring.length;
  const ringAtoms = ring.map(idx => molecule.atoms[idx]).filter((a): a is typeof molecule.atoms[0] => a !== undefined);
  if (ringSize === 6 && ringAtoms.every(atom => atom.symbol === 'C')) return 'benzene';
  if (ringSize === 6) {
    const heteroAtoms = findHeteroatomsInRing(ring, molecule);
    if (heteroAtoms.length === 1) {
      const sym = heteroAtoms[0]!.symbol;
      if (sym === 'N') return 'pyridine';
      if (sym === 'O') return 'pyran';
      if (sym === 'S') return 'thiopyran';
    }
    if (heteroAtoms.length === 2) {
      const nitrogenCount = heteroAtoms.filter(a => a.symbol === 'N').length;
      const oxygenCount = heteroAtoms.filter(a => a.symbol === 'O').length;
      if (nitrogenCount === 2) return 'pyrazine';
      if (nitrogenCount === 1 && oxygenCount === 1) return 'oxazine';
      if (nitrogenCount === 1 && heteroAtoms.filter(a => a.symbol === 'S').length === 1) return 'thiazine';
    }
    if (heteroAtoms.length === 3) {
      const nitrogenCount = heteroAtoms.filter(a => a.symbol === 'N').length;
      if (nitrogenCount === 3) return 'triazine';
      if (nitrogenCount === 2 && heteroAtoms.filter(a => a.symbol === 'O').length === 1) return 'triazinone';
    }
    if (heteroAtoms.length === 4 && heteroAtoms.filter(a => a.symbol === 'N').length === 4) return 'tetrazine';
  }
  if (ringSize === 5) {
    const heteroAtoms = findHeteroatomsInRing(ring, molecule);
    const carbonCount = ringAtoms.filter(a => a.symbol === 'C').length;
    if (heteroAtoms.length === 1) {
      const sym = heteroAtoms[0]!.symbol;
      if (sym === 'N') {
        if (heteroAtoms[0]!.count > 0) return 'pyrrole';
        return 'pyrrolidine';
      }
      if (sym === 'O') return 'furan';
      if (sym === 'S') return 'thiophene';
    }
    if (heteroAtoms.length === 2) {
      const nitrogenCount = heteroAtoms.filter(a => a.symbol === 'N').length;
      const oxygenCount = heteroAtoms.filter(a => a.symbol === 'O').length;
      if (nitrogenCount === 2 && carbonCount === 3) return 'imidazole';
      if (nitrogenCount === 1 && oxygenCount === 1 && carbonCount === 3) return 'oxazole';
      if (nitrogenCount === 2 && oxygenCount === 1) return 'isoxazole';
    }
    if (heteroAtoms.length === 3 && heteroAtoms.filter(a => a.symbol === 'N').length === 3) return 'triazole';
    if (heteroAtoms.length === 4 && heteroAtoms.filter(a => a.symbol === 'N').length === 4) return 'tetrazole';
  }
  return `aromatic_C${ringSize}`;
}