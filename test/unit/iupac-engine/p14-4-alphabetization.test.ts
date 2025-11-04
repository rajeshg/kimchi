/**
 * Tests for P-14.4 Alphabetization Rules
 *
 * IUPAC Blue Book P-14.4: Alphanumerical Order
 * When substituents are cited in alphabetical order:
 * - Ignore multiplicative prefixes (di-, tri-, etc.)
 * - Ignore locants (numbers and hyphens)
 * - Ignore opening delimiters (brackets/parentheses)
 * - For complex substituents: alphabetize by first letter after stripping above
 */

import { describe, test, expect } from "bun:test";
import { parseSMILES } from "index";
import { IUPACNamer } from "../../../src/iupac-engine/index";

describe("P-14.4 Alphabetization Rules", () => {
  const namer = new IUPACNamer();

  describe("Simple Alphabetization", () => {
    test("bromo comes before chloro (b < c)", () => {
      const mol = parseSMILES("BrCCCCCl").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("1-bromo-4-chlorobutane");
    });

    test("chloro comes before methyl (c < m)", () => {
      const mol = parseSMILES("ClCCCC(C)C").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("1-chloro-4-methylpentane");
    });

    test("bromo, chloro, and methyl alphabetized correctly", () => {
      const mol = parseSMILES("BrCCC(C)CCCl").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("1-bromo-5-chloro-3-methylpentane");
      // Verify alphabetical order: bromo (b) < chloro (c) < methyl (m)
      expect(result.name.indexOf("bromo")).toBeLessThan(
        result.name.indexOf("chloro"),
      );
      expect(result.name.indexOf("chloro")).toBeLessThan(
        result.name.indexOf("methyl"),
      );
    });
  });

  describe("Multiplicative Prefixes", () => {
    test("ignore di- prefix in dimethyl", () => {
      const mol = parseSMILES("CC(C)CCCC(C)C").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("2,6-dimethylheptane");
    });

    test("geminal dimethyl groups", () => {
      const mol = parseSMILES("CC(C)(C)CC").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("2,2-dimethylbutane");
    });
  });

  describe("Complex Substituents with Brackets", () => {
    test("complex ether substituent: methyl before [methylbutoxy]ethoxy", () => {
      // CCC(C)COC(C)OCC(C)CC
      // This molecule has two substituents:
      // 1. "methyl" at position 2
      // 2. "[1-(2-methylbutoxy)ethoxy]" at position 1
      //
      // For alphabetization:
      // - Extract principal name from [1-(2-methylbutoxy)ethoxy]:
      //   - Strip outer brackets: 1-(2-methylbutoxy)ethoxy
      //   - Remove locant: (2-methylbutoxy)ethoxy
      //   - Extract first parenthetical: 2-methylbutoxy
      //   - Remove locant: methylbutoxy
      //   - Principal name: "methylbutoxy" (starts with 'm')
      //
      // Comparison: "methyl" vs "methylbutoxy"
      // - Both start with 'm'
      // - "methyl" (6 chars) < "methylbutoxy" (12 chars)
      // - Result: "methyl" comes first
      const mol = parseSMILES("CCC(C)COC(C)OCC(C)CC").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("2-methyl-1-[1-(2-methylbutoxy)ethoxy]butane");
    });

    test("benzene with alkyl substituent", () => {
      // CC(C)Cc1ccccc1 - (2-methylpropyl)benzene (isobutylbenzene, benzene is senior parent)
      const mol = parseSMILES("CC(C)Cc1ccccc1").molecules[0]!;
      const result = namer.generateName(mol);
      // When benzene is parent, expect (2-methylpropyl)benzene
      expect(result.name).toBe("(2-methylpropyl)benzene");
    });
  });

  describe("Locant Removal", () => {
    test("ignore locants when alphabetizing", () => {
      // Locants should not affect alphabetical order
      const mol = parseSMILES("CC(C)C(C)C").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("2,3-dimethylbutane");
    });
  });

  describe("Edge Cases", () => {
    test("same substituent at different positions", () => {
      const mol = parseSMILES("CC(C)CC(C)C").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toBe("2,4-dimethylpentane");
    });

    test("complex substituent with nested parentheses", () => {
      // Test extraction of principal name from deeply nested structures
      const mol = parseSMILES("CCOC(C)OCC").molecules[0]!;
      const result = namer.generateName(mol);
      expect(result.name).toContain("ethoxy");
    });
  });

  describe("Alphabetization Algorithm Verification", () => {
    test("verify extractPrincipalName logic for simple substituents", () => {
      // This is tested implicitly through the name generation
      // Simple substituents should use their base name directly
      const testCases = [
        {
          smiles: "BrCCC(C)CCCl",
          expected: "1-bromo-5-chloro-3-methylpentane",
        },
      ];

      testCases.forEach(({ smiles, expected }) => {
        const mol = parseSMILES(smiles).molecules[0]!;
        const result = namer.generateName(mol);
        expect(result.name).toBe(expected);

        // Verify bromo comes before chloro
        expect(result.name.indexOf("bromo")).toBeLessThan(
          result.name.indexOf("chloro"),
        );
        // Verify chloro comes before methyl
        expect(result.name.indexOf("chloro")).toBeLessThan(
          result.name.indexOf("methyl"),
        );
      });
    });

    test("verify complex substituent principal name extraction", () => {
      // [1-(2-methylbutoxy)ethoxy] should extract "methylbutoxy"
      // This is the core fix from the session
      const mol = parseSMILES("CCC(C)COC(C)OCC(C)CC").molecules[0]!;
      const result = namer.generateName(mol);

      // The name should have "methyl" before the complex ether
      expect(result.name).toBe("2-methyl-1-[1-(2-methylbutoxy)ethoxy]butane");

      // Verify the structure:
      // - "2-methyl" is the first substituent in the name
      // - "1-[1-(2-methylbutoxy)ethoxy]" is the second substituent
      const methylIndex = result.name.indexOf("2-methyl");
      const ethoxyIndex = result.name.indexOf("[1-(2-methylbutoxy)ethoxy]");

      expect(methylIndex).toBeLessThan(ethoxyIndex);
    });
  });
});
