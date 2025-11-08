import { describe, expect, it } from "bun:test";
import { parseSMILES } from "index";
import { RuleEngine } from "src/iupac-engine/engine";

describe("Amide substituent naming bug", () => {
  it("should name amide as substituent correctly when it has lower priority", () => {
    const engine = new RuleEngine();
    // Molecule with ester (priority 4) and amide (priority 6)
    // Ester has higher priority (lower number), so amide becomes a substituent
    const smiles = "CCCC(=O)OC(C)(C)C(=O)NC1=CC(=C(C=C1)[N+](=O)[O-])C(F)(F)F";
    const result = parseSMILES(smiles);

    if (result.errors.length > 0) {
      console.error("Parse errors:", result.errors);
    }

    expect(result.molecules).toHaveLength(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");

    const result_naming = engine.generateName(mol);
    const name = result_naming.name;
    console.log("Generated name:", name);

    // The bug: name contains "9,10,11-amideamide"
    // Expected: should use proper amide substituent naming (e.g., "carbamoyl" or "amoyl" pattern)
    expect(name).not.toContain("amideamide");
  });
});
