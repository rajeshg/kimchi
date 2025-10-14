import type { Atom, Bond, ParseError } from 'types';
import { BondType } from 'types';
import { findRings } from 'src/utils/ring-finder';
import { calculateValence } from 'src/utils/valence-calculator';

/**
 * Count π electrons contributed by an atom in an aromatic system
 */
function countPiElectrons(atom: Atom, bonds: Bond[]): number {
  const atomBonds = bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
  const bondCount = atomBonds.length;
  const hasDouble = atomBonds.some(b => b.type === BondType.DOUBLE);

  switch (atom.symbol) {
    case 'C':
      // sp2 carbon contributes 1 π electron
      return 1;
    case 'N':
      // Nitrogen can contribute 1 or 2 π electrons.
      // Rules:
      // - Positively charged N in aromatic ring (e.g., pyridinium, thiazolium): contributes 1
      // - If N has a double bond in the ring, treat as pyridine-like (1)
      // - If N has an explicit H and no double bond, treat as pyrrole-like (2)
      // - Otherwise pyridine-like (1)
      if (atom.charge > 0) return 1; // N+ still contributes 1 π electron in aromatic systems
      if (hasDouble) return 1;
      if (atom.hydrogens > 0) return 2;
      return 1;
    case 'O':
    case 'S':
      // Heteroatoms: contribute 2 π electrons only when they can place a lone pair into the π system.
      // Heuristic:
      // - If the atom has a double bond in the ring (e.g., =O), it contributes 0.
      // - If it is bonded to exactly two ring atoms (typical for furan/thiophene), and has no double bond, contribute 2.
      // - Otherwise contribute 0.
      if (atom.charge !== 0) return 0;
      if (hasDouble) return 0;
      if (bondCount === 2) return 2;
      return 0;
    case 'B':
      if (atom.charge === -1 || atom.aromatic) {
        return 2;
      }
      return 0;
    case 'P':
      // Phosphorus similar to nitrogen but less common; follow same conservative rules
      if (atom.charge > 0) return 0;
      if (hasDouble) return 1;
      if (atom.hydrogens > 0) return 2;
      return 1;
    case 'As':
      return atom.hydrogens > 0 ? 2 : 1;
    case 'Se':
      if (atom.charge !== 0) return 0;
      if (hasDouble) return 0;
      if (bondCount === 2) return 2;
      return 0;
    default:
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
 * Detect potential aromatic rings based on bond alternation patterns
 */
function detectAromaticRings(atoms: Atom[], bonds: Bond[], rings: number[][]): void {
  for (const ring of rings) {
    if (ring.length < 5 || ring.length > 7) continue; // aromatic rings are typically 5-7 atoms

    const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
    const ringBonds = bonds.filter(b =>
      ring.includes(b.atom1) && ring.includes(b.atom2)
    );

    // Check if this looks like a Kekule form (alternating double/single bonds)
    const hasAlternatingBonds = ringBonds.every(bond => {
      // Count bonds to each atom in the ring
      const atom1Bonds = ringBonds.filter(b => b.atom1 === bond.atom1 || b.atom2 === bond.atom1);
      const atom2Bonds = ringBonds.filter(b => b.atom1 === bond.atom2 || b.atom2 === bond.atom2);
      return atom1Bonds.length <= 2 && atom2Bonds.length <= 2; // no atom has more than 2 bonds in ring
    });

    const allAromatic = ringAtoms.every(atom => atom.aromatic);
    if (allAromatic && hasAlternatingBonds && ringBonds.some(b => b.type === BondType.DOUBLE)) {
      // Convert bonds to aromatic only if all atoms are already aromatic
      ringBonds.forEach(bond => bond.type = BondType.AROMATIC);
    }
  }
}

/**
 * Check if a ring is a composite of smaller rings (for fused systems)
 */
function isCompositeRing(ring: number[], smallerRings: number[][]): boolean {
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

/**
 * Check if a ring is part of a fused ring system (shares 2+ atoms with another ring)
 */
function isPartOfFusedSystem(ring: number[], allRings: number[][]): boolean {
  for (const otherRing of allRings) {
    if (otherRing === ring) continue;
    const sharedAtoms = ring.filter(id => otherRing.includes(id));
    if (sharedAtoms.length >= 2) {
      return true;
    }
  }
  return false;
}

/**
 * Validate aromaticity rules in a molecule using Hückel's 4n+2 rule
 */
export function validateAromaticity(atoms: Atom[], bonds: Bond[], errors: ParseError[]): void {
  // Find all rings in the molecule
  const allRings = findRings(atoms, bonds);

  // First, detect potential aromatic rings from Kekule forms
  detectAromaticRings(atoms, bonds, allRings);

  const aromaticAtoms = atoms.filter(a => a.aromatic);
  if (aromaticAtoms.length === 0) return;

  // First pass: Check that aromatic atoms are in rings
  for (const atom of aromaticAtoms) {
    const atomInRing = allRings.some(ring =>
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

  // Filter to only elementary rings (SSSR), excluding composite fused rings
  const rings = allRings.filter(ring => {
    const smallerRings = allRings.filter(r => r.length < ring.length);
    return !isCompositeRing(ring, smallerRings);
  });

   // Second pass: Validate aromatic rings using Hückel's rule
   // Skip validation for rings that are part of fused systems (they share π electrons)
   for (const ring of rings) {
     const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
     const allAromatic = ringAtoms.every(a => a.aromatic);

     if (allAromatic) {
       // Skip Hückel validation for rings in fused systems
       if (isPartOfFusedSystem(ring, rings)) {
         continue;
       }

       const ringBonds = bonds.filter(b =>
         ring.includes(b.atom1) && ring.includes(b.atom2)
       );

        if (!isHuckelAromatic(ringAtoms, ringBonds)) {
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