import type { Molecule, Atom, Bond } from "types";
import { BondType } from "types";
import { MoleculeGraph } from "./molecular-graph";

type MutableBond = { -readonly [K in keyof Bond]: Bond[K] };

function bondKey(atom1: number, atom2: number): string {
  return `${Math.min(atom1, atom2)}-${Math.max(atom1, atom2)}`;
}

function canFormDoubleBond(
  atom: Atom,
  ringAtoms: Set<number>,
  bonds: Bond[],
): boolean {
  const atomBonds = bonds.filter(
    (b) => b.atom1 === atom.id || b.atom2 === atom.id,
  );

  const exocyclicBonds = atomBonds.filter((b) => {
    const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
    return !ringAtoms.has(otherId);
  });

  const hasExocyclicDouble = exocyclicBonds.some(
    (b) => b.type === BondType.DOUBLE,
  );
  if (hasExocyclicDouble) return false;

  if (atom.symbol === "N" && atom.hydrogens > 0) return false;

  if (atom.symbol === "C" || atom.symbol === "N") return true;

  return false;
}

function kekulizeSingleRing(
  ring: number[],
  bonds: MutableBond[],
  atoms: Atom[],
  allBonds: MutableBond[],
): boolean {
  const ringSet = new Set(ring);
  const atomDegrees: Record<number, number> = {};

  for (const atomId of ring) {
    const atom = atoms.find((a) => a.id === atomId);
    if (!atom) return false;

    if (!canFormDoubleBond(atom, ringSet, allBonds)) {
      atomDegrees[atomId] = 0;
      continue;
    }

    const atomBonds = allBonds.filter(
      (b) => b.atom1 === atomId || b.atom2 === atomId,
    );
    const existingDoubleBonds = atomBonds.filter(
      (b) => b.type === BondType.DOUBLE,
    ).length;

    atomDegrees[atomId] = Math.max(0, 1 - existingDoubleBonds);
  }

  const assignments: Record<string, BondType> = {};

  const fusionAtoms = new Set<number>();
  for (let i = 0; i < ring.length; i++) {
    const a1 = ring[i]!;
    const a2 = ring[(i + 1) % ring.length]!;
    const k = bondKey(a1, a2);
    const existingBond = allBonds.find((b) => bondKey(b.atom1, b.atom2) === k);
    if (
      existingBond &&
      existingBond.type !== BondType.AROMATIC &&
      existingBond.isInRing
    ) {
      fusionAtoms.add(a1);
      fusionAtoms.add(a2);
    }
  }

  function backtrack(bondIndex: number): boolean {
    if (bondIndex >= ring.length) {
      for (const atomId of ring) {
        const degree = atomDegrees[atomId];
        if (degree !== undefined && degree !== 0 && !fusionAtoms.has(atomId)) {
          return false;
        }
      }
      return true;
    }

    const atom1 = ring[bondIndex]!;
    const atom2 = ring[(bondIndex + 1) % ring.length]!;
    const k = bondKey(atom1, atom2);

    const existingBond = allBonds.find((b) => bondKey(b.atom1, b.atom2) === k);
    if (existingBond && existingBond.type !== BondType.AROMATIC) {
      assignments[k] = existingBond.type;
      const degree1 = atomDegrees[atom1];
      const degree2 = atomDegrees[atom2];
      if (
        degree1 !== undefined &&
        degree2 !== undefined &&
        existingBond.type === BondType.DOUBLE
      ) {
        atomDegrees[atom1] = degree1 - 1;
        atomDegrees[atom2] = degree2 - 1;
        const result = backtrack(bondIndex + 1);
        atomDegrees[atom1] = degree1;
        atomDegrees[atom2] = degree2;
        return result;
      }
      return backtrack(bondIndex + 1);
    }

    const degree1 = atomDegrees[atom1];
    const degree2 = atomDegrees[atom2];

    if (degree1 === undefined || degree2 === undefined) {
      return false;
    }

    if (degree1 > 0 && degree2 > 0) {
      assignments[k] = BondType.DOUBLE;
      atomDegrees[atom1] = degree1 - 1;
      atomDegrees[atom2] = degree2 - 1;

      if (backtrack(bondIndex + 1)) {
        return true;
      }

      atomDegrees[atom1] = degree1;
      atomDegrees[atom2] = degree2;
    }

    assignments[k] = BondType.SINGLE;
    if (backtrack(bondIndex + 1)) {
      return true;
    }

    return false;
  }

  const success = backtrack(0);

  if (success) {
    for (const bond of bonds) {
      const k = bondKey(bond.atom1, bond.atom2);
      const assignedType = assignments[k];
      if (assignedType !== undefined) {
        bond.type = assignedType;
      }
    }
  }

  return success;
}

export function kekulize(molecule: Molecule): Molecule {
  const mutableBonds: MutableBond[] = molecule.bonds.map((b) => ({ ...b }));

  const aromaticBonds = mutableBonds.filter(
    (b) => b.type === BondType.AROMATIC,
  );
  if (aromaticBonds.length === 0) {
    return molecule;
  }

  const mg = new MoleculeGraph(molecule);
  const rings = mg.cycles.filter((r) => r.length >= 5 && r.length <= 7);

  const aromaticRings = rings.filter((ring) => {
    return ring.every((atomId) => {
      const atom = molecule.atoms.find((a) => a.id === atomId);
      return atom?.aromatic === true;
    });
  });

  const fusionBonds = new Set<string>();
  const bondRingCount = new Map<string, number>();

  for (const ring of aromaticRings) {
    for (let i = 0; i < ring.length; i++) {
      const a1 = ring[i]!;
      const a2 = ring[(i + 1) % ring.length]!;
      const k = bondKey(a1, a2);
      bondRingCount.set(k, (bondRingCount.get(k) || 0) + 1);
    }
  }

  for (const [k, count] of bondRingCount.entries()) {
    if (count > 1) {
      fusionBonds.add(k);
    }
  }

  for (const k of fusionBonds) {
    const [a1, a2] = k.split("-").map(Number);
    for (const bond of mutableBonds) {
      if (bondKey(bond.atom1, bond.atom2) === k) {
        bond.type = BondType.SINGLE;
        break;
      }
    }
  }

  const sortedRings = aromaticRings.slice().sort((a, b) => {
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    const minA = Math.min(...a);
    const minB = Math.min(...b);
    return minA - minB;
  });

  const normalizedRings = sortedRings.map((ring) => {
    const minAtom = Math.min(...ring);
    const minIndex = ring.indexOf(minAtom);
    return [...ring.slice(minIndex), ...ring.slice(0, minIndex)];
  });

  for (const ring of normalizedRings) {
    const ringBondIndices = new Set<number>();
    for (let i = 0; i < ring.length; i++) {
      const a1 = ring[i]!;
      const a2 = ring[(i + 1) % ring.length]!;
      const k = bondKey(a1, a2);

      for (let j = 0; j < mutableBonds.length; j++) {
        const bond = mutableBonds[j]!;
        const bk = bondKey(bond.atom1, bond.atom2);
        if (bk === k) {
          ringBondIndices.add(j);
          break;
        }
      }
    }

    const ringBonds = Array.from(ringBondIndices).map((i) => mutableBonds[i]!);
    kekulizeSingleRing(ring, ringBonds, molecule.atoms as Atom[], mutableBonds);
  }

  return { ...molecule, bonds: mutableBonds };
}
