import type { Molecule, Bond } from "types";
import { StereoType as StereoEnum } from "types";

export function assignStereoBondsFromChirality(molecule: Molecule): Molecule {
  const bondsWithStereo: Bond[] = [];

  for (let i = 0; i < molecule.bonds.length; i++) {
    const bond = molecule.bonds[i]!;
    let newBond = bond;

    if (bond.stereo === StereoEnum.NONE) {
      const atom1 = molecule.atoms.find((a) => a.id === bond.atom1);
      const atom2 = molecule.atoms.find((a) => a.id === bond.atom2);

      if (atom1?.chiral && (atom1.chiral === "@" || atom1.chiral === "@@")) {
        const atom1BondsFromChiral = molecule.bonds.filter(
          (b) => b.atom1 === atom1.id,
        );
        if (
          atom1BondsFromChiral.length > 0 &&
          atom1BondsFromChiral[0] === bond
        ) {
          newBond = {
            ...bond,
            stereo: atom1.chiral === "@@" ? StereoEnum.DOWN : StereoEnum.UP,
          };
        }
      } else if (
        atom2?.chiral &&
        (atom2.chiral === "@" || atom2.chiral === "@@")
      ) {
        const atom2BondsFromChiral = molecule.bonds.filter(
          (b) => b.atom1 === atom2.id,
        );
        if (
          atom2BondsFromChiral.length > 0 &&
          atom2BondsFromChiral[0] === bond
        ) {
          newBond = {
            ...bond,
            stereo: atom2.chiral === "@@" ? StereoEnum.DOWN : StereoEnum.UP,
          };
        }
      }
    }

    bondsWithStereo.push(newBond);
  }

  return {
    ...molecule,
    bonds: bondsWithStereo,
  };
}
