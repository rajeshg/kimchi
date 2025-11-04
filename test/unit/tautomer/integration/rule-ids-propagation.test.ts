import { describe, it, expect } from "bun:test";
import { parseSMILES, enumerateTautomers } from "index";
import tautomerRules from "src/utils/tautomer/tautomer-rules";
import { matchSMARTS } from "src/matchers/smarts-matcher";

describe("tautomer: ruleIds propagation", () => {
  it("propagates ruleIds across chained transforms", () => {
    // simple ketone (2-butanone) - known to tautomerize to enol
    const res = parseSMILES("CC(=O)C");
    const mol = res.molecules[0];
    if (!mol) throw new Error("failed to parse molecule");
    const tautomers = enumerateTautomers(mol, {
      maxTautomers: 64,
      phases: [1],
    });
    const rule = tautomerRules.find((r: any) => r.id === "keto-enol");
    if (!rule) throw new Error('Tautomer rule "keto-enol" not found');
    const matchRes = matchSMARTS(
      (rule as any).smarts_match ||
        (rule as any).smarts ||
        (rule as any).smarts_replace ||
        "",
      mol,
      { maxMatches: Infinity },
    );
    if (tautomers.length === 0) {
      throw new Error(
        "No tautomers generated; SMARTS match: " + JSON.stringify(matchRes),
      );
    }
    // Find at least one tautomer that records the applied rule id(s)
    const someWithRule = tautomers.find((t) => (t.ruleIds || []).length >= 1);
    expect(someWithRule).toBeDefined();
    if (someWithRule) {
      for (const id of someWithRule.ruleIds) expect(typeof id).toBe("string");
      // first applied rule should be keto-enol for this system (conservative expectation)
      expect(someWithRule.ruleIds[0]).toBe("keto-enol");
    }
  });
});
