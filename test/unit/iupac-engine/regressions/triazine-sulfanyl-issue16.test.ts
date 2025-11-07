import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { generateIUPACName } from "src/iupac-engine";

describe("Regression: triazine with methylsulfanyl substituents (issue #16)", () => {
  it("should name thioether substituents as methylsulfanyl, not methyl", () => {
    const smiles = "CC1=C(N=C(N=N1)SC)SC";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0];

    expect(mol).toBeDefined();

    const iupacName = generateIUPACName(mol);

    // Correct name: methylsulfanyl groups (-S-CH3) should be named properly
    // NOT "trimethyl" (which would mean three -CH3 groups directly on ring)
    expect(iupacName).toBe("6-methyl-3,5-bis(methylsulfanyl)-1,2,4-triazine");
  });

  it("should correctly distinguish methyl from methylsulfanyl on aromatic rings", () => {
    // Similar pattern: pyridine with both methyl and methylsulfanyl
    const smiles = "CSc1ccncc1C";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0];

    expect(mol).toBeDefined();

    const iupacName = generateIUPACName(mol);

    // Should have both "methyl" (direct C attachment) and "methylsulfanyl" (-S-C attachment)
    expect(iupacName).toContain("methyl");
    expect(iupacName).toContain("sulfanyl");
  });
});
