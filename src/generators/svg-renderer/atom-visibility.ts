import type { Molecule } from "types";

export function determineVisibleAtoms(
  molecule: Molecule,
  showCarbonLabels: boolean,
): Set<number> {
  const atomsToShow = new Set<number>();

  for (let i = 0; i < molecule.atoms.length; ++i) {
    const atom = molecule.atoms[i];
    if (!atom) continue;

    const isHeteroatom = atom.symbol !== "C" && atom.symbol !== "H";
    if (isHeteroatom) {
      atomsToShow.add(i);
      continue;
    }

    if (showCarbonLabels) {
      atomsToShow.add(i);
      continue;
    }

    if (atom.symbol === "C") {
      const bonds = molecule.bonds.filter(
        (b) => b.atom1 === atom.id || b.atom2 === atom.id,
      );
      if (bonds.length === 1) {
        atomsToShow.add(i);
      }
    }
  }

  return atomsToShow;
}
