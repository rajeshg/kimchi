/**
 * Aromaticity utilities for converting between Kekulé and aromatic representations.
 */

import type { Molecule, Bond } from "types";
import { BondType } from "types";

/**
 * Check if a bond is a double bond.
 */
function isDoubleBond(bond: Bond): boolean {
  return bond.type === BondType.DOUBLE;
}

/**
 * Check if a bond is a single bond.
 */
function isSingleBond(bond: Bond): boolean {
  return bond.type === BondType.SINGLE;
}

/**
 * Get bonds in a ring.
 */
function getRingBonds(ring: readonly number[], bonds: readonly Bond[]): Bond[] {
  const ringBonds: Bond[] = [];
  for (const bond of bonds) {
    if (ring.includes(bond.atom1) && ring.includes(bond.atom2)) {
      ringBonds.push(bond);
    }
  }
  return ringBonds;
}

/**
 * Check if a ring has alternating double/single bonds (Kekulé form).
 */
function isAlternatingRing(ring: readonly number[], bonds: readonly Bond[]): boolean {
  const ringBonds = getRingBonds(ring, bonds);
  if (ringBonds.length !== ring.length) return false; // Not all bonds in ring

  // Count double and single bonds
  let doubleCount = 0;
  let singleCount = 0;
  for (const bond of ringBonds) {
    if (isDoubleBond(bond)) doubleCount++;
    else if (isSingleBond(bond)) singleCount++;
    else return false; // Invalid bond type
  }

  // For alternating pattern, roughly half should be double, half single
  const total = ringBonds.length;
  if (total % 2 === 0) {
    // Even ring: equal number
    return doubleCount === total / 2 && singleCount === total / 2;
  } else {
    // Odd ring: one more of one type
    return Math.abs(doubleCount - singleCount) <= 1;
  }
}

/**
 * Aromatize a molecule by converting alternating double/single bonds in rings to aromatic.
 * This is the reverse of kekulize.
 *
 * @param molecule - Input molecule (may have Kekulé form)
 * @returns New molecule with aromatic bonds and atoms where applicable
 */
export function aromatizeMolecule(molecule: Molecule): Molecule {
  const newBonds = [...molecule.bonds];
  const aromaticAtomIds = new Set<number>();

  // Find rings that can be aromatized
  for (const ring of molecule.rings || []) {
    if (isAlternatingRing(ring, molecule.bonds)) {
      // Mark atoms as aromatic
      ring.forEach((id) => aromaticAtomIds.add(id));

      // Convert alternating bonds to aromatic
      for (const bond of molecule.bonds) {
        if (ring.includes(bond.atom1) && ring.includes(bond.atom2) && isDoubleBond(bond)) {
          // Find the bond in newBonds and change to aromatic
          const bondIndex = newBonds.findIndex(
            (b) => b.atom1 === bond.atom1 && b.atom2 === bond.atom2,
          );
          if (bondIndex !== -1) {
            newBonds[bondIndex] = {
              atom1: bond.atom1,
              atom2: bond.atom2,
              type: BondType.AROMATIC,
              stereo: bond.stereo,
              isInRing: bond.isInRing,
              ringIds: bond.ringIds,
              isRotatable: bond.isRotatable,
            };
          }
        }
      }
    }
  }

  // Create new atoms with aromatic flags
  const newAtoms = molecule.atoms.map((atom) => ({
    ...atom,
    aromatic: atom.aromatic || aromaticAtomIds.has(atom.id),
  }));

  return {
    atoms: newAtoms,
    bonds: newBonds,
    rings: molecule.rings,
  };
}
