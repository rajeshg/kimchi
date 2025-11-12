import type { Molecule } from "types";
import type { OPSINService } from "../../../opsin-service";

export function nameAlkylSubstituent(
  molecule: Molecule,
  substituentAtomId: number,
  nitrogenAtomId: number,
  parentAtomIds: Set<number>,
  _opsinService: OPSINService,
): string {
  const substituentAtom = molecule.atoms.find(
    (a) => a.id === substituentAtomId,
  );
  if (!substituentAtom || substituentAtom.symbol !== "C") {
    return "methyl";
  }

  // Check if this is a formyl group (C=O bonded to N)
  const hasDoubleBondedO = molecule.bonds.some((bond) => {
    if (
      (bond.atom1 === substituentAtomId || bond.atom2 === substituentAtomId) &&
      bond.type === "double"
    ) {
      const otherAtomId =
        bond.atom1 === substituentAtomId ? bond.atom2 : bond.atom1;
      const otherAtom = molecule.atoms.find((a) => a.id === otherAtomId);
      return otherAtom?.symbol === "O";
    }
    return false;
  });

  if (hasDoubleBondedO) {
    return "formyl";
  }

  // Check what else is bonded to this carbon (besides the nitrogen)
  const bonds = molecule.bonds.filter(
    (bond) =>
      bond.atom1 === substituentAtomId || bond.atom2 === substituentAtomId,
  );

  let hasOH = false;
  let carbonCount = 1;

  for (const bond of bonds) {
    const otherAtomId =
      bond.atom1 === substituentAtomId ? bond.atom2 : bond.atom1;
    if (otherAtomId === nitrogenAtomId || parentAtomIds.has(otherAtomId))
      continue;

    const otherAtom = molecule.atoms.find((a) => a.id === otherAtomId);
    if (!otherAtom) continue;

    if (otherAtom.symbol === "O" && bond.type === "single") {
      // Check if this O has an H (hydroxyl)
      const oBonds = molecule.bonds.filter(
        (b) => b.atom1 === otherAtomId || b.atom2 === otherAtomId,
      ).length;

      if (oBonds === 1) {
        hasOH = true;
      }
    } else if (otherAtom.symbol === "C") {
      carbonCount++;
    }
  }

  if (hasOH && carbonCount === 1) {
    return "hydroxymethyl";
  }

  if (carbonCount === 1) {
    return "methyl";
  }

  if (carbonCount === 2) {
    return "ethyl";
  }

  return "alkyl";
}
