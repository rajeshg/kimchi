import type { Atom, Bond, ParseError } from '../../types';
import { BondType } from '../../types';
import { findRings } from '../utils/ring-finder';

/**
 * Validate aromaticity rules in a molecule
 */
export function validateAromaticity(atoms: Atom[], bonds: Bond[], errors: ParseError[]): void {
  // Basic aromaticity validation
  // For now, just check that aromatic atoms are in rings and have appropriate connectivity

  const aromaticAtoms = atoms.filter(a => a.aromatic);
  if (aromaticAtoms.length === 0) return;

  // Find rings containing aromatic atoms
  const rings = findRings(atoms, bonds);

  for (const atom of aromaticAtoms) {
    // Check if this aromatic atom is in at least one ring
    const atomInRing = rings.some(ring =>
      ring.some(ringAtomId => ringAtomId === atom.id)
    );

    if (!atomInRing) {
      errors.push({ message: `Aromatic atom ${atom.symbol} (id: ${atom.id}) is not in a ring`, position: -1 });
      // Mark as non-aromatic
      atom.aromatic = false;
    }

    // Check valence - aromatic atoms should typically have 2-3 bonds
    const atomBonds = bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
    if (atomBonds.length < 2 || atomBonds.length > 3) {
      errors.push({ message: `Aromatic atom ${atom.symbol} (id: ${atom.id}) has ${atomBonds.length} bonds, expected 2-3`, position: -1 });
      atom.aromatic = false;
    }
  }

  // Check that aromatic rings have alternating aromatic bonds or appropriate Kekule form
  for (const ring of rings) {
    const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
    const allAromatic = ringAtoms.every(a => a.aromatic);

    if (allAromatic) {
      // Check that bonds in the ring are aromatic
      const ringBonds = bonds.filter(b =>
        ring.includes(b.atom1) && ring.includes(b.atom2)
      );

      // For a proper aromatic ring, we expect alternating single/double or all aromatic
      const aromaticBondCount = ringBonds.filter(b => b.type === BondType.AROMATIC).length;
      const singleBondCount = ringBonds.filter(b => b.type === BondType.SINGLE).length;
      const doubleBondCount = ringBonds.filter(b => b.type === BondType.DOUBLE).length;

      // Allow either all aromatic bonds or alternating single/double
      if (aromaticBondCount !== ring.length && singleBondCount + doubleBondCount !== ring.length) {
        errors.push({ message: `Aromatic ring ${ring.join(',')} has inconsistent bond types`, position: -1 });
      }
    }
  }
}