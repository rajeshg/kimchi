import { describe, it, expect } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("Regression: ester with sulfanyl substituent", () => {
  it("treats sulfur as substituent, not part of main chain (mismatch #4)", () => {
    // CC#CSC(=O)OC: methyl ester with prop-1-ynylsulfanyl substituent
    // Bug: Previously, sulfur was included in main chain, giving "methyl butanoate"
    // Fix: Sulfur should be a substituent, giving "methyl prop-1-ynylsulfanylformate"

    const smiles = "CC#CSC(=O)OC";
    const parseResult = parseSMILES(smiles);
    const mol = parseResult.molecules[0];
    expect(mol).toBeDefined();

    const result = generateIUPACName(mol!);

    // The key requirement: sulfur must be treated as substituent (sulfanyl group)
    expect(result.name).toContain("sulfanyl");

    // Full expected name
    expect(result.name).toBe("methyl prop-1-ynylsulfanylformate");
  });

  it("correctly names simple esters without sulfur interference", () => {
    const testCases = [
      { smiles: "CC(=O)OC", expected: "methyl ethanoate" },
      { smiles: "CCCC(=O)OCC", expected: "ethyl butanoate" },
    ];

    for (const test of testCases) {
      const parseResult = parseSMILES(test.smiles);
      const mol = parseResult.molecules[0];
      expect(mol).toBeDefined();

      const result = generateIUPACName(mol!);
      expect(result.name).toBe(test.expected);
    }
  });

  it("correctly handles amines with nitrogen in main chain", () => {
    // Amines should still include nitrogen in the parent chain
    const testCases = [
      { smiles: "CCN", expected: "ethanamine" },
      { smiles: "CCCN", expected: "propan-1-amine" },
    ];

    for (const test of testCases) {
      const parseResult = parseSMILES(test.smiles);
      const mol = parseResult.molecules[0];
      expect(mol).toBeDefined();

      const result = generateIUPACName(mol!);
      expect(result.name).toBe(test.expected);
    }
  });
});
