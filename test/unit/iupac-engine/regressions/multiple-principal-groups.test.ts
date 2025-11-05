import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { RuleEngine } from "../../../../src/iupac-engine/engine";

describe("Regression: multiple principal groups on ring", () => {
  const cases: Array<{ smiles: string; expected: string }> = [
    {
      smiles: "CC1=CC(C(CC1O)C(C)(C)O)O",
      expected: "5-(2-hydroxypropan-2-yl)-2-methylcyclohex-2-ene-1,4-diol",
    },
    {
      smiles: "OC1CCC(O)CC1",
      expected: "cyclohexane-1,4-diol",
    },
  ];

  for (const c of cases) {
    it(`generates correct name for ${c.smiles}`, () => {
      const engine = new RuleEngine();
      const res = parseSMILES(c.smiles);
      expect(res.errors).toHaveLength(0);
      expect(res.molecules).toHaveLength(1);
      const mol = res.molecules[0]!;
      const r = engine.generateName(mol);
      const gen = (r.name || "").trim().toLowerCase();
      const ref = c.expected.trim().toLowerCase();
      if (gen !== ref) {
        console.log(`SMILES: ${c.smiles}`);
        console.log(`  expected: ${ref}`);
        console.log(`  actual:   ${gen}`);
      }
      expect(gen).toBe(ref);
    });
  }
});
