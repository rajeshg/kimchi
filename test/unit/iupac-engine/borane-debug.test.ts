import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { RuleEngine } from "../../../src/iupac-engine/engine";

describe("Borane Debug Test", () => {
  it("should generate correct borane name", () => {
    const smiles = "B(CC)(CC)C(=C(CC)COC)CC";
    const expected = "diethyl-[4-(methoxymethyl)hex-3-en-3-yl]borane";

    const result = parseSMILES(smiles);
    expect(result.errors).toHaveLength(0);
    expect(result.molecules).toHaveLength(1);

    const mol = result.molecules[0]!;

    if (process.env.VERBOSE) {
      console.log("\n=== BORANE DEBUG TEST ===");
      console.log("SMILES:", smiles);
      console.log("Molecule atoms:", mol.atoms.length);
      console.log("Molecule bonds:", mol.bonds.length);
    }

    const engine = new RuleEngine();
    const iupacResult = engine.generateName(mol);

    if (process.env.VERBOSE) {
      console.log("\n=== IUPAC RESULT ===");
      console.log("Generated name:", iupacResult.name);
      console.log("Expected name:", expected);
    }

    const genName = iupacResult.name?.trim().toLowerCase();
    const refName = expected.trim().toLowerCase();

    console.log(`Generated: ${genName}`);
    console.log(`Expected:  ${refName}`);

    expect(genName).toBe(refName);
  });
});
