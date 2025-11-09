import { describe, it, expect } from "bun:test";
import { parseSMILES } from "../../../index";
import { generateIUPACName } from "../../../src/iupac-engine";

describe("Thiazoline Locant Renumbering", () => {
  it("should correctly renumber substituent locants when transforming thiazoline to 4H-1,3-thiazol", () => {
    const smiles = "C=C1CN=C(S1)NC2=CC(=C(C=C2)F)Cl";
    const result = parseSMILES(smiles);

    const mol = result.molecules[0];
    if (!mol) {
      throw new Error("No molecule parsed");
    }

    const iupacName = generateIUPACName(mol);
    const expected =
      "N-(3-chloro-4-fluorophenyl)-5-methylidene-4H-1,3-thiazol-2-amine";

    expect(iupacName).toBe(expected);
  });

  it("should handle simple thiazole correctly", () => {
    const smiles = "c1scnc1";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");

    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("thiazole");
  });

  it("should handle 5-methylthiazole correctly", () => {
    const smiles = "Cc1scnc1";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");

    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("5-methylthiazole");
  });
});
