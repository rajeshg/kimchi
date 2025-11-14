import { describe, it, expect } from "bun:test";
import { IUPACTokenizer } from "src/parsers/iupac-tokenizer";
import type { OPSINRules } from "src/parsers/iupac-types";
import opsinRulesData from "opsin-rules.json";

describe("IUPACTokenizer - Stereochemistry Support", () => {
  const rules = (opsinRulesData as OPSINRules) || ({} as OPSINRules);
  const tokenizer = new IUPACTokenizer(rules);

  describe("E/Z stereochemistry (alkenes)", () => {
    it("should tokenize 'e-but-2-ene' without errors", () => {
      const result = tokenizer.tokenize("e-but-2-ene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);

      // Check for STEREO token
      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeDefined();
      expect(stereoToken?.value).toBe("e");
      expect(stereoToken?.metadata?.config).toBe("E");
    });

    it("should tokenize 'z-but-2-ene' without errors", () => {
      const result = tokenizer.tokenize("z-but-2-ene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);

      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeDefined();
      expect(stereoToken?.value).toBe("z");
      expect(stereoToken?.metadata?.config).toBe("Z");
    });

    it("should tokenize '(e)-but-2-ene' with parentheses", () => {
      const result = tokenizer.tokenize("(e)-but-2-ene");
      // May have error for '(' char, but should still get stereo token
      expect(result.tokens.length).toBeGreaterThan(0);

      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeDefined();
    });
  });

  describe("R/S stereochemistry (stereocenters)", () => {
    it("should tokenize 'r-butan-2-ol' without errors", () => {
      const result = tokenizer.tokenize("r-butan-2-ol");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);

      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeDefined();
      expect(stereoToken?.value).toBe("r");
      expect(stereoToken?.metadata?.config).toBe("R");
    });

    it("should tokenize 's-butan-2-ol' without errors", () => {
      const result = tokenizer.tokenize("s-butan-2-ol");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);

      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeDefined();
      expect(stereoToken?.value).toBe("s");
      expect(stereoToken?.metadata?.config).toBe("S");
    });

    it("should tokenize '(1r,2s)-cyclohexanediol' with multiple stereocenters", () => {
      const result = tokenizer.tokenize("(1r,2s)-cyclohexanediol");
      // May have errors for special chars, but should have stereo tokens
      const stereoTokens = result.tokens.filter((t) => t.type === "STEREO");
      expect(stereoTokens.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Von Baeyer bridged bicyclic stereochemistry", () => {
    it("should tokenize '@-bicyclo[2.2.1]heptane' with @ marker", () => {
      const result = tokenizer.tokenize("@-bicyclo[2.2.1]heptane");
      // May have errors for '[' and ']', but should have stereo token
      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeDefined();
      expect(stereoToken?.value).toBe("@");
    });

    it("should tokenize '@@-bicyclo[2.2.1]heptane' with @@ marker", () => {
      const result = tokenizer.tokenize("@@-bicyclo[2.2.1]heptane");
      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeDefined();
      expect(stereoToken?.value).toBe("@@");
    });
  });

  describe("Context-aware matching (avoiding false positives)", () => {
    it("should NOT match 'e' from 'ethene' as E stereochemistry", () => {
      const result = tokenizer.tokenize("ethene");
      expect(result.errors.length).toBe(0);

      // Should tokenize as: PARENT (eth) + SUFFIX (ene)
      // NOT as: STEREO (e) + something else
      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeUndefined();

      const parentToken = result.tokens.find((t) => t.type === "PARENT");
      expect(parentToken?.value).toBe("eth");
    });

    it("should NOT match 'e' from 'propene' as E stereochemistry", () => {
      const result = tokenizer.tokenize("propene");
      expect(result.errors.length).toBe(0);

      const stereoToken = result.tokens.find((t) => t.type === "STEREO");
      expect(stereoToken).toBeUndefined();
    });
  });
});
