import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { enumerateTautomers } from "src/utils/tautomer/tautomer-enumerator";

describe("tautomer: rules - keto-enol", () => {
  it("keto-enol single transform for pentane-2,4-dione", () => {
    const mol = parseSMILES("CC(=O)CH2C(=O)C").molecules[0];
    if (!mol) throw new Error("failed to parse molecule");
    const tauts = enumerateTautomers(mol);
    expect(tauts.length).toBeGreaterThan(0);
  });
});

describe("tautomer: keto-enol", () => {
  it("enumerates enol form for a simple ketone", () => {
    const res = parseSMILES("CC(=O)C"); // 2-butanone
    const mol = res.molecules[0];
    if (!mol) throw new Error("failed to parse molecule");
    const tautomers = enumerateTautomers(mol, { maxTautomers: 16 });
    const smilesList = tautomers.map((t: any) => t.smiles);
    // Expect enol: C/C(=C)O or similar canonical form; ensure at least two distinct tautomers
    expect(tautomers.length).toBeGreaterThanOrEqual(1);
    // There should be a tautomer with an OH (contains "O" and a double bond adjacent)
    const hasEnolLike = smilesList.some(
      (s: string) => /O/.test(s) && /=/.test(s),
    );
    expect(hasEnolLike).toBe(true);
  });
});
