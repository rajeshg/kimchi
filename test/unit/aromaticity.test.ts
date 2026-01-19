import { describe, it, expect } from "bun:test";
import { parseSMILES, aromatizeMolecule, generateSMILES } from "index";
import { BondType } from "types";

describe("aromatizeMolecule", () => {
  it("should aromatize benzene Kekulé form", () => {
    // Parse Kekulé benzene (alternating double/single)
    const result = parseSMILES("C1=CC=CC=C1");
    expect(result.molecules.length).toBeGreaterThan(0);
    const benzene = result.molecules[0]!;

    const aromatized = aromatizeMolecule(benzene);

    // Should have aromatic bonds
    const aromaticBonds = aromatized.bonds.filter((b) => b.type === BondType.AROMATIC);
    expect(aromaticBonds.length).toBe(6); // All bonds in ring

    // Atoms should be aromatic
    aromatized.atoms.forEach((atom) => {
      expect(atom.aromatic).toBe(true);
    });

    // SMILES should be aromatic
    const smiles = generateSMILES(aromatized);
    expect(smiles).toBe("c1ccccc1");
  });

  it("should not aromatize non-alternating rings", () => {
    // Cyclohexane - all single bonds
    const result = parseSMILES("C1CCCCC1");
    expect(result.molecules.length).toBeGreaterThan(0);
    const cyclohexane = result.molecules[0]!;

    const aromatized = aromatizeMolecule(cyclohexane);

    // Should remain unchanged
    const aromaticBonds = aromatized.bonds.filter((b) => b.type === BondType.AROMATIC);
    expect(aromaticBonds.length).toBe(0);
  });

  it("should aromatize naphthalene", () => {
    const result = parseSMILES("C1=CC=C2C=CC=CC2=C1");
    expect(result.molecules.length).toBeGreaterThan(0);
    const naphthalene = result.molecules[0]!;

    const aromatized = aromatizeMolecule(naphthalene);

    // Should have aromatic bonds in both rings
    const aromaticBonds = aromatized.bonds.filter((b) => b.type === BondType.AROMATIC);
    expect(aromaticBonds.length).toBeGreaterThan(6); // More than benzene
  });

  it("should handle molecules with both aromatic and aliphatic rings", () => {
    const result = parseSMILES("C1CCCCC1c2ccccc2");
    expect(result.molecules.length).toBeGreaterThan(0);
    const biphenyl = result.molecules[0]!;

    const aromatized = aromatizeMolecule(biphenyl);

    // Only benzene ring should be aromatized
    const aromaticBonds = aromatized.bonds.filter((b) => b.type === BondType.AROMATIC);
    expect(aromaticBonds.length).toBe(6); // Just the benzene ring
  });

  it("should handle molecules without rings", () => {
    const result = parseSMILES("CCO");
    expect(result.molecules.length).toBeGreaterThan(0);
    const ethanol = result.molecules[0]!;

    const aromatized = aromatizeMolecule(ethanol);

    // Should remain unchanged
    expect(aromatized.atoms).toEqual(ethanol.atoms);
    expect(aromatized.bonds).toEqual(ethanol.bonds);
  });
});
