import { describe, test, expect } from "bun:test";
import {
  normalizeCitationName,
  canonicalizeCitationList,
  compareCitationArrays,
} from "../../../src/iupac-engine/citation-normalizer";

describe("Citation Normalizer", () => {
  test("normalize common citation variants", () => {
    const cases: Array<[string, string]> = [
      ["2,3-dimethyl", "methyl"],
      ["sec-butyl", "butyl"],
      ["tert-butyl", "butyl"],
      ["t-butyl", "butyl"],
      ["iso-propyl", "propyl"],
      ["n-propyl", "propyl"],
      ["neo-pentyl", "pentyl"],
      ["diethyl", "ethyl"],
      ["4-nitrophenyl", "nitrophenyl"],
    ];

    for (const [input, expected] of cases) {
      const got = normalizeCitationName(input);
      expect(got).toBe(expected);
    }
  });

  test("canonicalize list and preserve order", () => {
    const raw = ["2,3-dimethyl", "sec-butyl", "diethyl"];
    const canon = canonicalizeCitationList(raw);
    expect(canon).toEqual(["methyl", "butyl", "ethyl"]);
  });

  test("compareCitationArrays ordering", () => {
    const a = ["ethyl", "methyl"];
    const b = ["methyl", "ethyl"];
    expect(compareCitationArrays(a, b)).toBeLessThan(0);
    expect(compareCitationArrays(b, a)).toBeGreaterThan(0);
    expect(compareCitationArrays(["methyl"], ["methyl"])).toBe(0);
  });
});
