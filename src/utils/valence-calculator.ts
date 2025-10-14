import type { Atom, Bond } from 'types';
import { BondType } from 'types';

/**
 * Calculate the valence of an atom based on its bonds and charge
 */
export function calculateValence(atom: Atom, bonds: Bond[]): number {
  let valence = 0;

  // Add bond contributions
  for (const bond of bonds) {
    if (bond.atom1 === atom.id || bond.atom2 === atom.id) {
      switch (bond.type) {
        case BondType.SINGLE:
          valence += 1;
          break;
        case BondType.DOUBLE:
          valence += 2;
          break;
        case BondType.TRIPLE:
          valence += 3;
          break;
        case BondType.QUADRUPLE:
          valence += 4;
          break;
        case BondType.AROMATIC:
          // Treat aromatic bonds as single for valence calculations to avoid fractional valences
          valence += 1;
          break;
      }
    }
  }

  // Add hydrogen contributions
  valence += atom.hydrogens || 0;

  return valence;
}