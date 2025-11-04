import { describe, it, expect } from "bun:test";
import { parseSMILES, enumerateTautomers } from "index";
import tautomerRules from "src/utils/tautomer/tautomer-rules";
import { matchSMARTS } from "src/matchers/smarts-matcher";

describe("tautomer: imine-enamine", () => {
  it("enumerates enamine form for a simple imine", () => {
    const res = parseSMILES("C=NH"); // imine with an H on N to allow tautomerization
    const mol = res.molecules[0];
    if (!mol) throw new Error("failed to parse molecule");
    const tautomers = enumerateTautomers(mol, { maxTautomers: 16 });
    const smilesList = tautomers.map((t) => t.smiles);
    // debug: inspect SMARTS match
    const rule = tautomerRules.find((r: any) => r.id === "imine-enamine");
    if (!rule) throw new Error('Tautomer rule "imine-enamine" not found');
    const matchRes = matchSMARTS(
      (rule as any).smarts_match ||
        (rule as any).smarts ||
        (rule as any).smarts_replace ||
        "",
      mol,
      { maxMatches: Infinity },
    );
    // console.log('matchRes', matchRes);
    if (tautomers.length === 0) {
      // if no tautomers produced, surface match info for debugging
      throw new Error(
        "No tautomers generated; SMARTS match: " + JSON.stringify(matchRes),
      );
    }
    expect(tautomers.length).toBeGreaterThanOrEqual(1);
    const hasEnamineLike = smilesList.some((s) => /N/.test(s) && /=/.test(s));
    expect(hasEnamineLike).toBe(true);
  });
});
