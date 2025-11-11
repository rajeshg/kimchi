import { describe, expect, it } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("Secondary Bridge Locant Comparison (P-23.2.6.2.4)", () => {
  it("should select configuration with lowest secondary bridge locants when bridge scores are equal", () => {
    // This test verifies that when two configurations have the same bridge score,
    // we choose the one with the lowest secondary bridge locants (P-23.2.6.2.4)

    // Molecule 4: Complex pentacyclic system with secondary bridges
    const smiles = "C1CC2C3(CCC4C25CC(OC4OC5)C6=COC=C6)COC(=O)C3=C1";
    const parseResult = parseSMILES(smiles);
    expect(parseResult.molecules.length).toBe(1);

    const mol = parseResult.molecules[0]!;
    const result = generateIUPACName(mol);

    // Verify that the name includes secondary bridge locants
    // These should be in ascending order as per P-23.2.6.2.4
    expect(result.name).toContain("pentacyclo");
    expect(result.name).toContain("01,13");
    expect(result.name).toContain("02,10");
    expect(result.name).toContain("06,10");
  });

  it("should calculate secondary bridge locants correctly", () => {
    // Simple bicyclo[2.2.1]heptane (norbornane)
    const smiles = "C1CC2CCC1C2";
    const parseResult = parseSMILES(smiles);
    expect(parseResult.molecules.length).toBe(1);

    const mol = parseResult.molecules[0]!;
    const result = generateIUPACName(mol);

    // Norbornane should be named bicyclo[2.2.1]heptane
    expect(result.name).toContain("bicyclo");
    expect(result.name).toContain("heptane");
  });
});
