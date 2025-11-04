import type { Atom, Bond, ParseError } from "types";
import { getBondsForAtom } from "src/utils/bond-utils";

function getSubstituentCount(
  atomId: number,
  atoms: Atom[],
  bonds: Bond[],
): number {
  const atom = atoms.find((a) => a.id === atomId)!;
  const bondCount = getBondsForAtom(bonds, atomId).length;
  return bondCount + (atom.hydrogens || 0);
}

/**
 * Validate stereochemistry specifications
 */
export function validateStereochemistry(
  atoms: Atom[],
  bonds: Bond[],
  errors: ParseError[],
): void {
  for (const atom of atoms) {
    if (atom.chiral) {
      const substituentCount = getSubstituentCount(atom.id, atoms, bonds);

      // Validate based on chirality type
      // Note: We only validate if the structure appears complete enough
      // Incomplete structures (e.g., for substructure search) may have fewer substituents
      if (atom.chiral === "@" || atom.chiral === "@@") {
        // Tetrahedral chirality requires exactly 4 substituents
        // Skip validation if structure appears incomplete (< 3 substituents suggests it's a fragment)
        if (substituentCount >= 3 && substituentCount !== 4) {
          errors.push({
            message: `Tetrahedral chiral center ${atom.symbol} (id: ${atom.id}) has ${substituentCount} substituents, expected 4`,
            position: -1,
          });
        }
      } else if (atom.chiral.startsWith("@AL")) {
        // Allenic chirality - requires at least 3 substituents
        if (substituentCount < 3) {
          errors.push({
            message: `Allenic chiral center ${atom.symbol} (id: ${atom.id}) has ${substituentCount} substituents, expected at least 3`,
            position: -1,
          });
        }
      } else if (atom.chiral.startsWith("@SP")) {
        // Square planar requires 4 substituents
        if (substituentCount >= 3 && substituentCount !== 4) {
          errors.push({
            message: `Square planar chiral center ${atom.symbol} (id: ${atom.id}) has ${substituentCount} substituents, expected 4`,
            position: -1,
          });
        }
      } else if (atom.chiral.startsWith("@TB")) {
        // Trigonal bipyramidal requires 5 substituents
        if (substituentCount >= 4 && substituentCount !== 5) {
          errors.push({
            message: `Trigonal bipyramidal chiral center ${atom.symbol} (id: ${atom.id}) has ${substituentCount} substituents, expected 5`,
            position: -1,
          });
        }
      } else if (atom.chiral.startsWith("@OH")) {
        // Octahedral requires 6 substituents
        if (substituentCount >= 5 && substituentCount !== 6) {
          errors.push({
            message: `Octahedral chiral center ${atom.symbol} (id: ${atom.id}) has ${substituentCount} substituents, expected 6`,
            position: -1,
          });
        }
      } else if (atom.chiral.startsWith("@TH")) {
        // Tetrahedral (extended) requires 4 substituents
        if (substituentCount >= 3 && substituentCount !== 4) {
          errors.push({
            message: `Extended tetrahedral chiral center ${atom.symbol} (id: ${atom.id}) has ${substituentCount} substituents, expected 4`,
            position: -1,
          });
        }
      }
    }
  }

  // Validate double bond stereochemistry
  for (const bond of bonds) {
    if (
      bond.type === "double" &&
      (bond.stereo === "up" || bond.stereo === "down")
    ) {
      // Check that the double bond has appropriate substituents for stereo
      const atom1Subs = getSubstituentCount(bond.atom1, atoms, bonds);
      const atom2Subs = getSubstituentCount(bond.atom2, atoms, bonds);

      // Each atom in a stereo double bond should have at least 2 substituents
      // (the double bond counts as 2, so total substituents >= 3 for tetrahedral-like)
      if (atom1Subs < 3) {
        const atom1 = atoms.find((a) => a.id === bond.atom1)!;
        errors.push({
          message: `Double bond stereo marker on ${atom1.symbol} (id: ${bond.atom1}) requires at least 2 additional substituents`,
          position: -1,
        });
      }
      if (atom2Subs < 3) {
        const atom2 = atoms.find((a) => a.id === bond.atom2)!;
        errors.push({
          message: `Double bond stereo marker on ${atom2.symbol} (id: ${bond.atom2}) requires at least 2 additional substituents`,
          position: -1,
        });
      }
    }
  }
}
