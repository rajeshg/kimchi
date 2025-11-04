import type { Molecule, Atom, Bond } from "types";
import { BondType } from "types";
import { DEFAULT_VALENCES, AROMATIC_VALENCES } from "src/constants";

/**
 * Recompute implicit hydrogen counts for a molecule based on bond orders and valences.
 * Returns a new Molecule with updated atom.hydrogens values.
 */
export function computeImplicitHydrogens(m: Molecule): Molecule {
  const atoms = m.atoms.map((a) => ({ ...a }) as Atom);
  const bonds = m.bonds;

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    if (!atom) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((atom as any).isBracket) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((atom as any).hydrogens < 0) (atom as any).hydrogens = 0;
      continue;
    }

    // Sum bond orders for this atom
    let bondOrderSum = 0;
    for (const b of bonds) {
      if (b.atom1 !== atom.id && b.atom2 !== atom.id) continue;
      switch (b.type) {
        case BondType.SINGLE:
        case BondType.AROMATIC:
          bondOrderSum += 1;
          break;
        case BondType.DOUBLE:
          bondOrderSum += 2;
          break;
        case BondType.TRIPLE:
          bondOrderSum += 3;
          break;
        case BondType.QUADRUPLE:
          bondOrderSum += 4;
          break;
        default:
          break;
      }
    }

    if (atom.symbol === "*" || atom.symbol === "H" || atom.atomicNumber === 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (atom as any).hydrogens = 0;
      continue;
    }

    const defaultValences = atom.aromatic
      ? AROMATIC_VALENCES[atom.symbol] ||
        DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber]
      : DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber];

    // For carbons, allow multi-step enolization by not prematurely setting hydrogens to zero
    const maxValence = Math.max(...defaultValences);
    let hydrogens = 0;
    if (bondOrderSum >= maxValence) {
      hydrogens = 0;
    } else {
      const sorted = [...defaultValences].sort((a, b) => a - b);
      let targetValence = maxValence;
      for (const v of sorted) {
        if (v >= bondOrderSum) {
          targetValence = v;
          break;
        }
      }
      hydrogens = Math.max(
        0,
        targetValence + (atom.charge || 0) - bondOrderSum,
      );
    }

    // Special case: for non-aromatic carbons adjacent to C=O or C-OH, allow hydrogens if valence permits
    if (atom.symbol === "C" && !atom.aromatic) {
      // Count number of O neighbors
      const oNeighbors = bonds
        .filter((b) => b.atom1 === atom.id || b.atom2 === atom.id)
        .map((b) => {
          const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
          const otherAtom = atoms.find((a) => a.id === otherId);
          return otherAtom && otherAtom.symbol === "O" ? otherAtom : null;
        })
        .filter(Boolean);
      if (
        oNeighbors.length > 0 &&
        hydrogens === 0 &&
        bondOrderSum < maxValence
      ) {
        // If valence allows, restore one hydrogen for possible further tautomerization
        hydrogens = 1;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (atom as any).hydrogens = hydrogens;
  }

  return {
    atoms: atoms as readonly Atom[],
    bonds: bonds as readonly Bond[],
    rings: m.rings,
    ringInfo: m.ringInfo,
  } as Molecule;
}
