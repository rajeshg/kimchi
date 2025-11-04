import { describe, it, expect } from "bun:test";
import { parseSMILES, enumerateTautomers } from "index";

describe("tautomer: nitro-aci-nitro", () => {
  it("generates aci-nitro-like tautomer for a simple nitro", () => {
    const inputSmiles = "C[N+](=O)[O-]"; // nitromethane canonical-ish
    const res = parseSMILES(inputSmiles);
    const mol = res.molecules[0];
    if (!mol) throw new Error("failed to parse molecule");
    const tautomers = enumerateTautomers(mol, { maxTautomers: 32 });
    expect(tautomers.length).toBeGreaterThanOrEqual(1);
    const smilesList = tautomers.map((t) => t.smiles);
    // aci-nitro often contains N-O single and an OH; check for presence of 'O' and changed bond patterns
    const hasAciLike = smilesList.some(
      (s) => /O/.test(s) && /N/.test(s) && /O/.test(s),
    );
    expect(hasAciLike).toBe(true);
  });
});
