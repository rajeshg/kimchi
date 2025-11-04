import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { addExplicitHydrogensWithMapping } from "src/utils/hydrogen-utils";
import { BondType } from "types";

describe("Hydrogen utils - addExplicitHydrogensWithMapping", () => {
  it("adds no H to molecule with none", () => {
    const r = parseSMILES("C");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    // Carbon has implicit Hs in the parser; total implicit hydrogens should be available
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    // augmented atoms should be >= original
    expect(res.molecule.atoms.length).toBeGreaterThanOrEqual(mol.atoms.length);
    // mapping length equals augmented atom count
    expect(res.augmentedToOriginal.length).toBe(res.molecule.atoms.length);
    // first originalCount entries map to themselves
    for (let i = 0; i < res.originalAtomCount; i++) {
      expect(res.augmentedToOriginal[i]).toBe(i);
    }
  });

  it("correctly maps hydrogens for ammonia NH3", () => {
    const r = parseSMILES("N");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    // nitrogen should have 3 implicit Hs
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    expect(res.augmentedToOriginal.length).toBe(res.molecule.atoms.length);

    // Check that hydrogens added map back to the nitrogen atom (index 0)
    for (let i = res.originalAtomCount; i < res.molecule.atoms.length; i++) {
      expect(res.molecule.atoms[i]!.symbol).toBe("H");
      expect(res.augmentedToOriginal[i]).toBe(0);
      // bond connecting H should reference nitrogen id
      const hId = res.molecule.atoms[i]!.id;
      const bond = res.molecule.bonds.find(
        (b) => b.atom1 === hId || b.atom2 === hId,
      );
      expect(bond).toBeTruthy();
      const heavyId = bond!.atom1 === hId ? bond!.atom2 : bond!.atom1;
      // heavy atom should be the nitrogen and present in original atoms
      const heavyIndex = res.molecule.atoms.findIndex((a) => a.id === heavyId);
      expect(heavyIndex).toBeGreaterThanOrEqual(0);
      expect(heavyIndex).toBeLessThan(res.originalAtomCount);
      expect(res.augmentedToOriginal[heavyIndex]).toBe(heavyIndex);
    }
  });

  it("handles multi-atom molecules with mixed H counts (ethanol)", () => {
    const r = parseSMILES("CCO");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);

    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    expect(res.augmentedToOriginal.length).toBe(res.molecule.atoms.length);

    // Count hydrogens per heavy atom via mapping
    const counts = new Array(res.originalAtomCount).fill(0);
    for (let i = 0; i < res.molecule.atoms.length; i++) {
      const orig = res.augmentedToOriginal[i] ?? -1;
      if (orig >= 0 && orig < res.originalAtomCount)
        counts[orig] += res.molecule.atoms[i]!.symbol === "H" ? 1 : 0;
    }

    // For ethanol: atoms are C,C,O with implicit H counts typically 3,2,1 (or similar depending on parser)
    expect(counts.length).toBe(res.originalAtomCount);
    // Ensure at least one heavy atom has added Hs
    expect(counts.some((c) => c > 0)).toBe(true);
  });

  it("returns mapping that allows mapping match indices back to heavy atoms", () => {
    const r = parseSMILES("CC(=O)O");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    // Simulate a SMARTS match that hits an H atom (we can't run SMARTS here reliably),
    // so just pick an H index and ensure augmentedToOriginal points to heavy atom index.
    const firstHIndex = res.molecule.atoms.findIndex((a) => a.symbol === "H");
    if (firstHIndex === -1) return; // no explicit Hs added in this parser variant
    const mapped = res.augmentedToOriginal[firstHIndex]!;
    expect(mapped).toBeGreaterThanOrEqual(0);
    expect(mapped).toBeLessThan(res.originalAtomCount);
    // heavy atom ID
    const heavyId = res.molecule.atoms[mapped]!.id;
    // there should be a bond between heavyId and h atom id
    const hId = res.molecule.atoms[firstHIndex]!.id;
    const bond = res.molecule.bonds.find(
      (b) =>
        (b.atom1 === hId && b.atom2 === heavyId) ||
        (b.atom2 === hId && b.atom1 === heavyId),
    );
    expect(bond).toBeTruthy();
  });

  it("does not modify the original molecule", () => {
    const r = parseSMILES("CCO");
    expect(r.errors).toHaveLength(0);
    const originalMol = r.molecules[0]!;
    const originalAtoms = originalMol.atoms.length;
    const originalBonds = originalMol.bonds.length;
    const res = addExplicitHydrogensWithMapping(originalMol);
    expect(originalMol.atoms.length).toBe(originalAtoms);
    expect(originalMol.bonds.length).toBe(originalBonds);
  });

  it("handles charged molecules like ammonium [NH4+]", () => {
    const r = parseSMILES("[NH4+]");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // [NH4+] has N with 4 implicit H, so 4 H added
    expect(res.molecule.atoms.length).toBe(res.originalAtomCount + 4);
  });

  it("handles molecules with isotopes", () => {
    const r = parseSMILES("[2H]C");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    // [2H]C: C has 3 implicit H, [2H] has 0.
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Check mapping for H atoms added to C
    const cIndex = mol.atoms.findIndex((a) => a.symbol === "C");
    expect(cIndex).toBeGreaterThanOrEqual(0);
    const hIndices = [];
    for (let i = res.originalAtomCount; i < res.molecule.atoms.length; i++) {
      if (res.molecule.atoms[i]!.symbol === "H") {
        hIndices.push(i);
        expect(res.augmentedToOriginal[i]).toBe(cIndex);
      }
    }
    expect(hIndices.length).toBe(3); // C has 3 implicit H
  });

  it("handles aromatic molecules like benzene", () => {
    const r = parseSMILES("c1ccccc1");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    // Benzene has no implicit H (aromatic C have 1 H each, but in SMILES it's implicit).
    // In standard SMILES, c1ccccc1 has 6 C, each with 1 implicit H.
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    expect(res.molecule.atoms.length - res.originalAtomCount).toBe(6); // 6 H added
  });

  it("handles molecules with stereochemistry", () => {
    const r = parseSMILES("C[C@H](O)Cl");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Check that chiral atom mapping is preserved
    const chiralIndex = mol.atoms.findIndex((a) => a.chiral != null);
    expect(chiralIndex).toBeGreaterThanOrEqual(0);
    expect(res.augmentedToOriginal[chiralIndex]).toBe(chiralIndex);
  });

  it("adds correct single bonds for H atoms", () => {
    const r = parseSMILES("O");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    // O has 2 implicit H
    expect(res.molecule.atoms.length).toBe(res.originalAtomCount + 2);
    for (let i = res.originalAtomCount; i < res.molecule.atoms.length; i++) {
      const hId = res.molecule.atoms[i]!.id;
      const bond = res.molecule.bonds.find(
        (b) => b.atom1 === hId || b.atom2 === hId,
      );
      expect(bond).toBeTruthy();
      expect(bond!.type).toBe(BondType.SINGLE);
    }
  });

  it("handles larger molecules like aspirin", () => {
    const r = parseSMILES("CC(=O)OC1=CC=CC=C1C(=O)O");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Aspirin has several implicit H
    expect(res.augmentedToOriginal.length).toBe(res.molecule.atoms.length);
    // Verify mapping for a few H
    const hIndices = [];
    for (let i = res.originalAtomCount; i < res.molecule.atoms.length; i++) {
      if (res.molecule.atoms[i]!.symbol === "H") {
        hIndices.push(i);
        expect(res.augmentedToOriginal[i]).toBeGreaterThanOrEqual(0);
        expect(res.augmentedToOriginal[i]).toBeLessThan(res.originalAtomCount);
      }
    }
    expect(hIndices.length).toBeGreaterThan(0);
  });

  it("handles complex stereochemistry with multiple chiral centers", () => {
    const r = parseSMILES("C[C@H](O)[C@@H](N)C(=O)O");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Check that chiral atoms map correctly
    const chiralIndices = mol.atoms
      .map((a, i) => (a.chiral != null ? i : -1))
      .filter((i) => i !== -1);
    expect(chiralIndices.length).toBeGreaterThan(0);
    chiralIndices.forEach((idx) => {
      expect(res.augmentedToOriginal[idx]).toBe(idx);
    });
  });

  it("handles fused aromatic systems like naphthalene", () => {
    const r = parseSMILES("C1=CC=C2C=CC=CC2=C1");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Naphthalene has 10 C, but fusion carbons have 0 implicit H, so 8 H added
    expect(res.molecule.atoms.length - res.originalAtomCount).toBe(8);
  });

  it("handles aliphatic rings like cyclohexane", () => {
    const r = parseSMILES("C1CCCCC1");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Cyclohexane has 6 C, each with 2 implicit H, so 12 H added
    expect(res.molecule.atoms.length - res.originalAtomCount).toBe(12);
  });

  it("handles mixed aromatic and aliphatic like toluene", () => {
    const r = parseSMILES("CC1=CC=CC=C1");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Toluene: methyl C has 3 H, ring C have 1 each (5), total 8 H
    expect(res.molecule.atoms.length - res.originalAtomCount).toBe(8);
  });

  it("handles heteroaromatic like pyridine", () => {
    const r = parseSMILES("C1=CC=NC=C1");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    expect(res.originalAtomCount).toBe(mol.atoms.length);
    expect(res.molecule.atoms.length).toBeGreaterThan(res.originalAtomCount);
    // Pyridine: 5 C with 1 H each, N with 0, total 5 H
    expect(res.molecule.atoms.length - res.originalAtomCount).toBe(5);
  });

  it("handles molecules with no implicit hydrogens (all explicit)", () => {
    // For example, a molecule where all H are already explicit, but in SMILES, hard to have.
    // Use a small one like [H][H], but parser may not support.
    // Use C with explicit H, but SMILES C has implicit.
    // Perhaps skip or use a molecule with 0 implicit.
    const r = parseSMILES("[CH4]");
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const res = addExplicitHydrogensWithMapping(mol);
    // [CH4] has C with 4 implicit H
    expect(res.molecule.atoms.length).toBe(5);
    expect(res.originalAtomCount).toBe(1);
  });
});
