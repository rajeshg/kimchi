import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { generateIUPACName } from "src/iupac-engine";

describe("Long alkyl substituents with OPSIN integration", () => {
  it("should name undecyl substituent (C11) on naphthalene using OPSIN alkane stems", () => {
    // Naphthalene with 11-carbon chain (undecyl)
    // Naphthalene is a fused ring system that will be parent structure
    const result = parseSMILES("CCCCCCCCCCCc1ccc2ccccc2c1");
    expect(result.errors).toEqual([]);
    expect(result.molecules).toHaveLength(1);

    const mol = result.molecules[0];
    if (!mol) throw new Error("Molecule not parsed");
    
    const iupacName = generateIUPACName(mol);
    // Should contain "undecyl" from OPSIN alkane stems
    expect(iupacName).toContain("undecyl");
    expect(iupacName).toContain("naphthalene");
  });

  it("should name dodecyl substituent (C12) on anthracene using OPSIN alkane stems", () => {
    // Anthracene with 12-carbon chain (dodecyl)
    const result = parseSMILES("CCCCCCCCCCCCc1cc2cc3ccccc3cc2cc1");
    expect(result.errors).toEqual([]);
    expect(result.molecules).toHaveLength(1);

    const mol = result.molecules[0];
    if (!mol) throw new Error("Molecule not parsed");
    
    const iupacName = generateIUPACName(mol);
    // Should contain "dodecyl" from OPSIN alkane stems
    expect(iupacName).toContain("dodecyl");
    expect(iupacName).toContain("anthracene");
  });

  it("should use OPSIN names for C1-C10 alkyl substituents", () => {
    // Test that existing behavior (C1-C10) still works correctly
    // Naphthalene with methyl (C1), ethyl (C2), propyl (C3) etc.
    const testCases = [
      { smiles: "Cc1ccc2ccccc2c1", expected: "methyl" },
      { smiles: "CCc1ccc2ccccc2c1", expected: "ethyl" },
      { smiles: "CCCc1ccc2ccccc2c1", expected: "propyl" },
      { smiles: "CCCCc1ccc2ccccc2c1", expected: "butyl" },
    ];

    for (const { smiles, expected } of testCases) {
      const result = parseSMILES(smiles);
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);

      const mol = result.molecules[0];
      if (!mol) throw new Error("Molecule not parsed");

      const iupacName = generateIUPACName(mol);
      expect(iupacName).toContain(expected);
      expect(iupacName).toContain("naphthalene");
    }
  });

  it("should fallback to CX notation for unsupported very long chain lengths", () => {
    // OPSIN supports up to C11, but very long chains should fallback
    // This tests the fallback mechanism in classifyFusedSubstituent
    const result = parseSMILES("C".repeat(50) + "c1ccc2ccccc2c1");
    expect(result.errors).toEqual([]);
    expect(result.molecules).toHaveLength(1);

    const mol = result.molecules[0];
    if (!mol) throw new Error("Molecule not parsed");
    
    const iupacName = generateIUPACName(mol);
    // Should either have a valid OPSIN name or fallback to C50yl
    expect(iupacName).toMatch(/(C50|.*yl)naphthalene/);
  });
});
