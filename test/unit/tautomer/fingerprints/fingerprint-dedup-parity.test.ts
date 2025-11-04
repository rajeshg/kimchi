import { parseSMILES } from "index";
import { enumerateTautomers } from "src/utils/tautomer/tautomer-enumerator";
import { describe, it, expect } from "bun:test";

describe("tautomer: fingerprint dedup parity", () => {
  it("produces identical unique SMILES sets when dedup enabled vs disabled", () => {
    const cases = [
      "CC(=O)N", // acetamide
      "C=NH", // imine
      "CC(=O)C", // 2-butanone
      "CC(=O)CH2C(=O)C", // pentane-2,4-dione (exercise larger example)
    ];

    for (const smi of cases) {
      const parsed = parseSMILES(smi);
      if (!parsed || !parsed.molecules || parsed.molecules.length === 0)
        throw new Error("parse failed: " + smi);
      const mol = parsed.molecules[0]!;

      const tNoFp = enumerateTautomers(mol, {
        maxTautomers: 512,
        phases: [1, 2, 3],
        useFingerprintDedup: false,
      });
      const tWithFp = enumerateTautomers(mol, {
        maxTautomers: 512,
        phases: [1, 2, 3],
        useFingerprintDedup: true,
      });

      const setNoFp = new Set(tNoFp.map((x) => x.smiles));
      const setWithFp = new Set(tWithFp.map((x) => x.smiles));

      expect(setNoFp.size).toBe(setWithFp.size);
      for (const s of setNoFp) expect(setWithFp.has(s)).toBeTruthy();
    }
  });
});
