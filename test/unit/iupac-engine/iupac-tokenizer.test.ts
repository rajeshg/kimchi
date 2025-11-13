import { describe, it, expect } from "bun:test";
import { IUPACTokenizer } from "src/parsers/iupac-tokenizer";
import type { OPSINRules } from "src/parsers/iupac-types";
import opsinRulesData from "opsin-rules.json";

describe("IUPACTokenizer", () => {
  const rules = (opsinRulesData as OPSINRules) || ({} as OPSINRules);
  const tokenizer = new IUPACTokenizer(rules);

  describe("Alkanes - Basic", () => {
    it("should tokenize 'methane' without errors", () => {
      const result = tokenizer.tokenize("methane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'ethane' without errors", () => {
      const result = tokenizer.tokenize("ethane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'propane' without errors", () => {
      const result = tokenizer.tokenize("propane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'butane' without errors", () => {
      const result = tokenizer.tokenize("butane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'pentane' without errors", () => {
      const result = tokenizer.tokenize("pentane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'hexane' without errors", () => {
      const result = tokenizer.tokenize("hexane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Alkanes - Branched", () => {
    it("should tokenize '2-methylpropane' with key tokens", () => {
      const result = tokenizer.tokenize("2-methylpropane");
      // May have errors for complex names, but should have tokens
      expect(result.tokens.length).toBeGreaterThanOrEqual(3);
      const locantToken = result.tokens.find((t) => t.type === "LOCANT");
      const substituentToken = result.tokens.find((t) => t.type === "SUBSTITUENT");
      const parentToken = result.tokens.find((t) => t.type === "PARENT");
      expect(locantToken).toBeDefined();
      expect(substituentToken).toBeDefined();
      expect(parentToken).toBeDefined();
    });

    it("should tokenize '3-methylhexane' with key tokens", () => {
      const result = tokenizer.tokenize("3-methylhexane");
      expect(result.tokens.length).toBeGreaterThanOrEqual(3);
      const locantToken = result.tokens.find((t) => t.type === "LOCANT");
      const substituentToken = result.tokens.find((t) => t.type === "SUBSTITUENT");
      expect(locantToken).toBeDefined();
      expect(substituentToken).toBeDefined();
    });

    it("should tokenize '2,2-dimethylpropane' with key tokens", () => {
      const result = tokenizer.tokenize("2,2-dimethylpropane");
      expect(result.tokens.length).toBeGreaterThanOrEqual(3);
      const multiplierToken = result.tokens.find((t) => t.type === "MULTIPLIER");
      const substituentToken = result.tokens.find((t) => t.type === "SUBSTITUENT");
      expect(multiplierToken).toBeDefined();
      expect(substituentToken).toBeDefined();
    });
  });

  describe("Alkenes", () => {
    it("should tokenize 'ethene' without errors", () => {
      const result = tokenizer.tokenize("ethene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'propene' without errors", () => {
      const result = tokenizer.tokenize("propene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'but-2-ene' without errors", () => {
      const result = tokenizer.tokenize("but-2-ene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Alkynes", () => {
    it("should tokenize 'ethyne' without errors", () => {
      const result = tokenizer.tokenize("ethyne");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'propyne' without errors", () => {
      const result = tokenizer.tokenize("propyne");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'but-2-yne' without errors", () => {
      const result = tokenizer.tokenize("but-2-yne");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Aromatics", () => {
    it("should tokenize 'benzene' without errors", () => {
      const result = tokenizer.tokenize("benzene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'methylbenzene' without errors", () => {
      const result = tokenizer.tokenize("methylbenzene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'naphthalene' without errors", () => {
      const result = tokenizer.tokenize("naphthalene");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'pyridine' without errors", () => {
      const result = tokenizer.tokenize("pyridine");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Functional Groups - Alcohols", () => {
    it("should tokenize 'methanol' without errors", () => {
      const result = tokenizer.tokenize("methanol");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'ethanol' without errors", () => {
      const result = tokenizer.tokenize("ethanol");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'propan-1-ol' without errors", () => {
      const result = tokenizer.tokenize("propan-1-ol");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'butane-1,4-diol' without errors", () => {
      const result = tokenizer.tokenize("butane-1,4-diol");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Functional Groups - Ketones", () => {
    it("should tokenize 'propanone' without errors", () => {
      const result = tokenizer.tokenize("propanone");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'butan-2-one' without errors", () => {
      const result = tokenizer.tokenize("butan-2-one");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'pentan-2-one' without errors", () => {
      const result = tokenizer.tokenize("pentan-2-one");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Functional Groups - Amines", () => {
    it("should tokenize 'methanamine' without errors", () => {
      const result = tokenizer.tokenize("methanamine");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'ethanamine' without errors", () => {
      const result = tokenizer.tokenize("ethanamine");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'propan-1-amine' without errors", () => {
      const result = tokenizer.tokenize("propan-1-amine");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Functional Groups - Carboxylic Acids", () => {
    it("should tokenize 'methanoic acid' without errors", () => {
      const result = tokenizer.tokenize("methanoic acid");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'ethanoic acid' without errors", () => {
      const result = tokenizer.tokenize("ethanoic acid");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize 'propanoic acid' without errors", () => {
      const result = tokenizer.tokenize("propanoic acid");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Mixed Functional Groups", () => {
    it("should tokenize '3-methylbutan-2-one' without errors", () => {
      const result = tokenizer.tokenize("3-methylbutan-2-one");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize '2-methylpropan-1-ol' without errors", () => {
      const result = tokenizer.tokenize("2-methylpropan-1-ol");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should tokenize '4-methylpentanoic acid' without errors", () => {
      const result = tokenizer.tokenize("4-methylpentanoic acid");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Empty and Invalid Input", () => {
    it("should handle empty string", () => {
      const result = tokenizer.tokenize("");
      expect(result.tokens.length).toBe(0);
    });

    it("should handle whitespace only", () => {
      const result = tokenizer.tokenize("   ");
      expect(result.tokens.length).toBe(0);
    });
  });

  describe("Case Insensitivity", () => {
    it("should handle uppercase 'METHANE'", () => {
      const result = tokenizer.tokenize("METHANE");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should handle mixed case 'MeTHane'", () => {
      const result = tokenizer.tokenize("MeTHane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it("should handle mixed case '2-MethylPropane'", () => {
      const result = tokenizer.tokenize("2-MethylPropane");
      expect(result.errors.length).toBe(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Token Metadata", () => {
    it("should include SMILES in PARENT token metadata for methane", () => {
      const result = tokenizer.tokenize("methane");
      expect(result.errors.length).toBe(0);
      const parentToken = result.tokens.find((t) => t.type === "PARENT");
      expect(parentToken?.metadata?.smiles).toBeDefined();
    });

    it("should include SMILES in PARENT token for benzene", () => {
      const result = tokenizer.tokenize("benzene");
      expect(result.errors.length).toBe(0);
      const parentToken = result.tokens.find((t) => t.type === "PARENT");
      expect(parentToken?.metadata?.smiles).toBeDefined();
    });

    it("should include SMILES in SUBSTITUENT token metadata", () => {
      const result = tokenizer.tokenize("2-methylpropane");
      const substituentToken = result.tokens.find((t) => t.type === "SUBSTITUENT");
      expect(substituentToken?.metadata?.smiles).toBeDefined();
    });
  });

  describe("Token Types", () => {
    it("should find LOCANT token in '2-methylpropane'", () => {
      const result = tokenizer.tokenize("2-methylpropane");
      const locantToken = result.tokens.find((t) => t.type === "LOCANT");
      expect(locantToken).toBeDefined();
    });

    it("should find SUFFIX token in 'methanol'", () => {
      const result = tokenizer.tokenize("methanol");
      expect(result.errors.length).toBe(0);
      const suffixToken = result.tokens.find((t) => t.type === "SUFFIX");
      expect(suffixToken).toBeDefined();
    });

    it("should find PARENT token in 'methane'", () => {
      const result = tokenizer.tokenize("methane");
      expect(result.errors.length).toBe(0);
      const parentToken = result.tokens.find((t) => t.type === "PARENT");
      expect(parentToken).toBeDefined();
    });
  });
});
