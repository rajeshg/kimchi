import type { Molecule } from 'types';
import { BondType } from 'types';
import { findHeteroatomsInRing } from './utils';

export function isRingAromatic(ring: number[], molecule: Molecule): boolean {
  const ringAtoms = ring.map(idx => molecule.atoms[idx]).filter((a): a is typeof molecule.atoms[0] => a !== undefined);
  if (ringAtoms.length === 0) return false;

  // Robust aromaticity predicate:
  // - count aromatic-like bonds (BondType.AROMATIC or BondType.DOUBLE)
  // - count aromatic-marked atoms
  // - use a conservative threshold: require a majority of aromatic-like bonds
  //   AND a high fraction of atoms flagged aromatic OR a strong double-bond signal
  let aromaticLikeBondCount = 0;
  let aromaticBondCount = 0;
  let doubleBondCount = 0;
  let singleBondCount = 0;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const bond = molecule.bonds.find(bb => (bb.atom1 === a && bb.atom2 === b) || (bb.atom1 === b && bb.atom2 === a));
    if (!bond) continue;
    if (bond.type === BondType.AROMATIC) {
      aromaticBondCount++;
      aromaticLikeBondCount++;
    } else if (bond.type === BondType.DOUBLE) {
      doubleBondCount++;
      aromaticLikeBondCount++;
    } else if (bond.type === BondType.SINGLE) {
      singleBondCount++;
    } else {
      // other bond types treated as non-aromatic-like
      singleBondCount++;
    }
  }

  const aromaticAtomCount = ringAtoms.filter(atom => atom.aromatic === true).length;
  const atomAromaticFraction = aromaticAtomCount / ring.length;

  if (process.env.VERBOSE) {
    try {
      console.log('[VERBOSE] isRingAromatic:', {
        ringLength: ring.length,
        aromaticBondCount,
        doubleBondCount,
        aromaticLikeBondCount,
        singleBondCount,
        aromaticAtomCount,
        atomAromaticFraction
      });
    } catch (e) {}
  }

  // Conservative rules:
  // - Require at least ceil(n/2) aromatic-like bonds (double or aromatic) AND
  //   atom aromatic fraction >= 0.6
  // - OR if many bonds are explicitly aromatic (BondType.AROMATIC) require atom fraction >= 0.5
  // - Otherwise mark non-aromatic.
  const minAromaticLike = Math.ceil(ring.length / 2);
  if (aromaticLikeBondCount >= minAromaticLike && atomAromaticFraction >= 0.6) return true;
  if (aromaticBondCount >= minAromaticLike && atomAromaticFraction >= 0.5) return true;

  return false;
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