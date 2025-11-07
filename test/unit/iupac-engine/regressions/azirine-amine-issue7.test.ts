import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { generateIUPACName } from "src/iupac-engine";

describe("Regression: azirine with amine substituent exclusion (issue #7)", () => {
  it("should exclude amine attached to principal group from ring substituents", () => {
    const smiles = "CC(C)SC1(C(=N1)N(C)C)C";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0];

    expect(mol).toBeDefined();

    const iupacName = generateIUPACName(mol!);

    // Correct behavior:
    // - "propan-2-ylsulfanyl" should be present (thioether substituent on ring)
    // - "N,N-dimethyl" should be present (substituents on amine nitrogen)
    // - "3-methyl" should be present (methyl on ring carbon)
    // - "1-methylmethyl" should NOT be present (amine should be excluded from ring substituents)
    expect(iupacName).toBe("N,N,3-trimethyl-3-propan-2-ylsulfanylazirin-2-amine");
    expect(iupacName).not.toContain("1-methylmethyl");
    expect(iupacName).toContain("propan-2-ylsulfanyl");
  });

  it("should handle simple azirine with dimethylamine correctly", () => {
    // Simpler test: just azirine with N,N-dimethylamine
    const smiles = "C1C(=N1)N(C)C";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0];

    expect(mol).toBeDefined();

    const iupacName = generateIUPACName(mol!);

    // Should have N,N-dimethyl prefix, not treat the amine nitrogen as ring substituent
    expect(iupacName).toContain("N,N-dimethyl");
    expect(iupacName).toContain("azirin");
    expect(iupacName).toContain("amine");
    expect(iupacName).not.toContain("1-methyl"); // No "1-methylmethyl" artifact
  });
});
