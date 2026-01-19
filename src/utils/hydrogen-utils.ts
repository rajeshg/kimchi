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

/**
 * Add explicit hydrogens to satisfy valence requirements.
 * Simplified version without mapping.
 *
 * @param molecule - Input molecule
 * @returns New molecule with explicit hydrogens added
 */
export function addExplicitHydrogens(molecule: Molecule): Molecule {
  return addExplicitHydrogensWithMapping(molecule).molecule;
}

/**
 * Remove explicit hydrogens from molecule.
 * Similar to RDKit's RemoveHs.
 *
 * @param molecule - Input molecule
 * @returns New molecule with explicit hydrogens removed
 */
export function removeExplicitHydrogens(molecule: Molecule): Molecule {
  // Find hydrogen atoms that are only bonded to one heavy atom
  const hydrogenIds = new Set<number>();
  const heavyToHydrogens = new Map<number, number[]>();

  for (const bond of molecule.bonds) {
    const atom1 = molecule.atoms.find((a) => a.id === bond.atom1);
    const atom2 = molecule.atoms.find((a) => a.id === bond.atom2);

    if (atom1?.symbol === "H" || atom2?.symbol === "H") {
      const hAtom = atom1?.symbol === "H" ? atom1 : atom2;
      const heavyAtom = atom1?.symbol === "H" ? atom2 : atom1;

      if (hAtom && heavyAtom && bond.type === BondType.SINGLE) {
        const hBonds = molecule.bonds.filter(
          (b) => (b.atom1 === hAtom.id || b.atom2 === hAtom.id) && b !== bond,
        );
        if (hBonds.length === 0) {
          // Only bonded to the heavy atom
          hydrogenIds.add(hAtom.id);
          if (!heavyToHydrogens.has(heavyAtom.id)) {
            heavyToHydrogens.set(heavyAtom.id, []);
          }
          heavyToHydrogens.get(heavyAtom.id)!.push(hAtom.id);
        }
      }
    }
  }

  // Remove hydrogen atoms and their bonds
  const newAtoms = molecule.atoms.filter((atom) => !hydrogenIds.has(atom.id));
  const newBonds = molecule.bonds.filter(
    (bond) => !hydrogenIds.has(bond.atom1) && !hydrogenIds.has(bond.atom2),
  );

  // Update hydrogen counts on heavy atoms
  const updatedAtoms = newAtoms.map((atom) => {
    const explicitHs = heavyToHydrogens.get(atom.id) || [];
    return {
      ...atom,
      hydrogens: atom.hydrogens + explicitHs.length,
    };
  });

  return {
    atoms: updatedAtoms,
    bonds: newBonds,
    rings: molecule.rings,
    ringInfo: molecule.ringInfo,
  };
}
