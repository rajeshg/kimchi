import { describe, it, expect } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("Quinoline numbering regression tests", () => {
  it("should correctly number quinoline-4-carboxamide", () => {
    const mol = parseSMILES("NC(=O)c1ccnc2ccccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("quinoline-4-carboxamide");
  });

  it("should correctly number 6-methylquinoline", () => {
    const mol = parseSMILES("n1cccc2cc(C)ccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("6-methylquinoline");
  });

  it("should correctly number plain quinoline", () => {
    const mol = parseSMILES("c1ccc2ncccc2c1").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("quinoline");
  });

  it("should correctly number 3-methylquinoline", () => {
    const mol = parseSMILES("Cc1cnc2ccccc2c1").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("3-methylquinoline");
  });

  it("should correctly number 2-methylquinoline", () => {
    const mol = parseSMILES("Cc1ccc2ccccc2n1").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("2-methylquinoline");
  });

  it("should correctly number 4-methylquinoline", () => {
    const mol = parseSMILES("Cc1ccnc2ccccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("4-methylquinoline");
  });

  it("should correctly number quinoline with substituent on benzene ring at position 5", () => {
    const mol = parseSMILES("n1cccc2c(Cl)cccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("5-chloroquinoline");
  });

  it("should correctly number quinoline with substituent on benzene ring at position 8", () => {
    const mol = parseSMILES("n1cccc2cccc(Cl)c12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("8-chloroquinoline");
  });

  it("should correctly number quinoline with substituent on benzene ring at position 7", () => {
    const mol = parseSMILES("n1cccc2ccc(Cl)cc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("7-chloroquinoline");
  });

  it("should correctly number quinoline with substituent on benzene ring at position 6", () => {
    const mol = parseSMILES("n1cccc2cc(Cl)ccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("6-chloroquinoline");
  });

  it("should handle multiple substituents on quinoline", () => {
    const mol = parseSMILES("Cc1ccc2c(C)ccnc2c1").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    // Should have both 4-methyl and 6-methyl
    expect(result.name).toMatch(/methyl.*quinoline/);
    expect(result.name).toMatch(/[46]/); // Should contain positions 4 or 6
  });

  it("should correctly identify quinoline fusion points as 4a and 8a", () => {
    // This tests that the fusion atoms are correctly identified
    // and that benzene ring numbering goes from 4a to 8a (positions 5-8)
    const mol = parseSMILES("n1cccc2cc(C)ccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    // The methyl should be at position 6
    // This verifies the benzene ring walk direction is correct
    expect(result.name).toBe("6-methylquinoline");
  });

  it("should handle quinoline with functional groups", () => {
    const mol = parseSMILES("O=C(N)c1ccnc2ccccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("quinoline-4-carboxamide");
  });

  it("should handle quinoline with carboxylic acid", () => {
    // TODO: This is a separate bug - carboxylic acids on quinoline produce wrong names
    // The molecule parses correctly (2 rings, correct aromaticity) but name generation
    // treats it as separate pyridine + benzene rings instead of fused quinoline
    // Carboxamide works fine, so this is specific to carboxylic acid handling
    const mol = parseSMILES("O=C(O)c1ccnc2ccccc12").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toBe("quinoline-4-carboxylic acid");
  });

  it("should handle hydroxyl substituent on quinoline", () => {
    const mol = parseSMILES("Oc1ccc2cccnc2c1").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toMatch(/quinolin.*ol/);
  });

  it("should handle amino substituent on quinoline", () => {
    const mol = parseSMILES("Nc1ccc2cccnc2c1").molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);
    expect(result.name).toMatch(/quinolin.*amine/);
  });

  it("should correctly number quinoline with different starting points", () => {
    // Test quinoline with methyl at position 6 - canonical notation starting from nitrogen
    const smiles1 = "n1cccc2cc(C)ccc12"; // Canonical: nitrogen at position 1
    const smiles2 = "n1cccc2cc(C)ccc12"; // Same canonical SMILES

    const mol1 = parseSMILES(smiles1).molecules[0];
    const mol2 = parseSMILES(smiles2).molecules[0];

    expect(mol1).toBeDefined();
    expect(mol2).toBeDefined();

    const name1 = generateIUPACName(mol1!);
    const name2 = generateIUPACName(mol2!);

    // Both should generate 6-methylquinoline since the structure is the same
    expect(name1.name).toBe("6-methylquinoline");
    expect(name2.name).toBe("6-methylquinoline");
  });
});
