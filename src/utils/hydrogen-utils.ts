import type { Molecule, Atom, Bond } from "types";
import { BondType, StereoType } from "types";

export function addExplicitHydrogensWithMapping(mol: Molecule): {
  molecule: Molecule;
  originalAtomCount: number;
  augmentedToOriginal: number[];
} {
  const originalAtoms = Array.from(mol.atoms);
  const originalBonds = Array.from(mol.bonds);
  const originalCount = originalAtoms.length;

  let maxId = originalAtoms.reduce((m, a) => Math.max(m, a.id), 0);

  const newAtoms: Atom[] = originalAtoms.map((a) => ({ ...a }) as Atom);
  const newBonds: Bond[] = originalBonds.map((b) => ({ ...b }) as Bond);

  const augmentedToOriginal: number[] = [];
  for (let i = 0; i < originalCount; i++) augmentedToOriginal.push(i);

  for (let i = 0; i < originalAtoms.length; i++) {
    const a = originalAtoms[i]!;
    const implicitH = a.hydrogens ?? 0;
    if (implicitH > 0) {
      newAtoms[i] = { ...newAtoms[i]!, hydrogens: 0 };
    }
    for (let h = 0; h < implicitH; h++) {
      maxId += 1;
      const hAtom: Atom = {
        id: maxId,
        symbol: "H",
        atomicNumber: 1,
        charge: 0,
        hydrogens: 0,
        isotope: null,
        aromatic: false,
        chiral: null,
        isBracket: false,
        atomClass: 0,
        degree: 1,
      } as Atom;
      newAtoms.push(hAtom);
      augmentedToOriginal.push(i);
      const bond: Bond = {
        atom1: a.id,
        atom2: hAtom.id,
        type: BondType.SINGLE,
        stereo: StereoType.NONE,
      } as Bond;
      newBonds.push(bond);
    }
  }

  const newMolecule: Molecule = {
    atoms: newAtoms,
    bonds: newBonds,
    rings: mol.rings,
    ringInfo: mol.ringInfo,
  };

  return {
    molecule: newMolecule,
    originalAtomCount: originalCount,
    augmentedToOriginal,
  };
}
