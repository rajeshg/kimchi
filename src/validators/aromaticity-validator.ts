import type { Atom, Bond, ParseError } from '../../types';
import { BondType } from '../../types';
import { findRings } from '../utils/ring-finder';
import { calculateValence } from '../utils/valence-calculator';

/**
 * Count π electrons contributed by an atom in an aromatic system
 */
function countPiElectrons(atom: Atom, bonds: Bond[]): number {
  const atomBonds = bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
  const bondCount = atomBonds.length;

  switch (atom.symbol) {
    case 'C':
      // sp2 carbon contributes 1 π electron
      return 1;
    case 'N':
      // Nitrogen can contribute 1 or 2 π electrons
      // If N has explicit H, it's pyrrole-like (lone pair in π system) → 2 π electrons
      // If N has no explicit H and 2 ring bonds, it's pyridine-like (lone pair not in π system) → 1 π electron
      if (atom.hydrogens > 0) {
        return 2; // pyrrole-like: N with H contributes 2 π electrons
      } else {
        return 1; // pyridine-like: N without H contributes 1 π electron
      }
    case 'O':
    case 'S':
      // Heteroatoms with lone pairs contribute 2 π electrons
      return 2;
    case 'B':
      // Boron: B⁻ (borole anion) contributes 2 π electrons (lone pair in p orbital)
      // Neutral B in aromatic context: assume stabilized form contributes 2 π electrons
      // (e.g., through π-donation from substituents or anionic character not explicitly shown)
      if (atom.charge === -1 || atom.aromatic) {
        return 2;
      }
      return 0;
    case 'P':
      // Phosphorus similar to nitrogen
      if (atom.hydrogens > 0) {
        return 2;
      } else {
        return 1;
      }
    case 'As':
    case 'Se':
      // Similar to their lighter analogs
      if (atom.symbol === 'As') {
        return atom.hydrogens > 0 ? 2 : 1;
      } else {
        return 2; // Se like S
      }
    default:
      // Other elements - assume 0 unless they have specific aromatic behavior
      return 0;
  }
}

/**
 * Check if a ring satisfies Hückel's 4n+2 rule
 */
function isHuckelAromatic(ringAtoms: Atom[], ringBonds: Bond[]): boolean {
  // Count total π electrons in the ring
  let totalPiElectrons = 0;

  for (const atom of ringAtoms) {
    totalPiElectrons += countPiElectrons(atom, ringBonds);
  }

  // Check Hückel's rule: 4n+2 where n ≥ 0
  // Valid counts: 2, 6, 10, 14, 18, 22, etc.
  return totalPiElectrons >= 2 && (totalPiElectrons - 2) % 4 === 0;
}

/**
 * Validate aromaticity rules in a molecule using Hückel's 4n+2 rule
 */
export function validateAromaticity(atoms: Atom[], bonds: Bond[], errors: ParseError[]): void {
  const aromaticAtoms = atoms.filter(a => a.aromatic);
  if (aromaticAtoms.length === 0) return;

  // Find all rings in the molecule
  const rings = findRings(atoms, bonds);

  // First pass: Check that aromatic atoms are in rings
  for (const atom of aromaticAtoms) {
    const atomInRing = rings.some(ring =>
      ring.some(ringAtomId => ringAtomId === atom.id)
    );

    if (!atomInRing) {
      errors.push({
        message: `Aromatic atom ${atom.symbol} (id: ${atom.id}) is not in a ring`,
        position: -1
      });
      atom.aromatic = false;
    }
  }

   // Second pass: Validate aromatic rings using Hückel's rule
   for (const ring of rings) {
     const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
     const allAromatic = ringAtoms.every(a => a.aromatic);

     if (allAromatic) { // Check all aromatic rings
       const ringBonds = bonds.filter(b =>
         ring.includes(b.atom1) && ring.includes(b.atom2)
       );

       // Check Hückel's 4n+2 rule
       if (!isHuckelAromatic(ringAtoms, ringBonds)) {
         errors.push({
           message: `Ring ${ring.join(',')} violates Hückel's 4n+2 rule for aromaticity`,
           position: -1
         });
         // Mark atoms as non-aromatic
         ringAtoms.forEach(atom => atom.aromatic = false);
       }
     }
   }

   // Third pass: Check bond patterns in validated aromatic rings
   for (const ring of rings) {
     const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
     const allAromatic = ringAtoms.every(a => a.aromatic);

     if (allAromatic) {
       const ringBonds = bonds.filter(b =>
         ring.includes(b.atom1) && ring.includes(b.atom2)
       );

       // Check that bonds in the ring are consistent
       const aromaticBondCount = ringBonds.filter(b => b.type === BondType.AROMATIC).length;
       const singleBondCount = ringBonds.filter(b => b.type === BondType.SINGLE).length;
       const doubleBondCount = ringBonds.filter(b => b.type === BondType.DOUBLE).length;

       // Allow either all aromatic bonds or alternating single/double
       if (aromaticBondCount !== ring.length && singleBondCount + doubleBondCount !== ring.length) {
         errors.push({
           message: `Aromatic ring ${ring.join(',')} has inconsistent bond types`,
           position: -1
         });
       }


     }
   }
}