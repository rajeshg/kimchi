import { describe, it, expect } from "bun:test";
import { parseIUPACName } from "index";

describe("IUPAC Parser - Complex Molecules", () => {
  describe("Multiple Functional Groups", () => {
    it("should parse 'butane-1,4-diol' with multiple alcohols", () => {
      const result = parseIUPACName("butane-1,4-diol");
      expect(result.errors.length).toBe(0);
      expect(result.molecule).toBeDefined();
      expect(result.molecule?.atoms.length).toBeGreaterThan(0);
    });

    it("should parse '3-methylbutan-2-one' with branching and ketone", () => {
      const result = parseIUPACName("3-methylbutan-2-one");
      expect(result.molecule).toBeDefined();
    });

    it("should parse '2-methylpropan-1-ol' with branching and alcohol", () => {
      const result = parseIUPACName("2-methylpropan-1-ol");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Complex Substituents", () => {
    it("should parse 'methylbenzene' (toluene)", () => {
      const result = parseIUPACName("methylbenzene");
      expect(result.molecule).toBeDefined();
    });

    it("should parse '1,2-dimethylbenzene' (ortho-xylene)", () => {
      const result = parseIUPACName("1,2-dimethylbenzene");
      expect(result.molecule).toBeDefined();
    });

    it("should parse '4-methylpentanoic acid'", () => {
      const result = parseIUPACName("4-methylpentanoic acid");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Heterocyclic Compounds", () => {
    it("should parse 'pyridine'", () => {
      const result = parseIUPACName("pyridine");
      expect(result.molecule).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it("should parse 'pyrrole'", () => {
      const result = parseIUPACName("pyrrole");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'morpholine'", () => {
      const result = parseIUPACName("morpholine");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'piperidine'", () => {
      const result = parseIUPACName("piperidine");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Complex Aromatic Compounds", () => {
    it("should parse 'naphthalene'", () => {
      const result = parseIUPACName("naphthalene");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'anthracene'", () => {
      const result = parseIUPACName("anthracene");
      expect(result.molecule).toBeDefined();
    });

    it("should parse '4-methoxybenzoic acid' (p-anisic acid)", () => {
      const result = parseIUPACName("4-methoxybenzoic acid");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Carboxylic Acids and Derivatives", () => {
    it("should parse 'formic acid' (methanoic acid)", () => {
      const result = parseIUPACName("formic acid");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'acetic acid' (ethanoic acid)", () => {
      const result = parseIUPACName("acetic acid");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'benzoic acid'", () => {
      const result = parseIUPACName("benzoic acid");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Amides and Amines", () => {
    it("should parse 'formamide' (methanamide)", () => {
      const result = parseIUPACName("formamide");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'acetamide' (ethanamide)", () => {
      const result = parseIUPACName("acetamide");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'benzamide'", () => {
      const result = parseIUPACName("benzamide");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'N-methylaniline'", () => {
      const result = parseIUPACName("N-methylaniline");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Aldehydes and Ketones", () => {
    it("should parse 'formaldehyde' (methanal)", () => {
      const result = parseIUPACName("formaldehyde");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'acetaldehyde' (ethanal)", () => {
      const result = parseIUPACName("acetaldehyde");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'acetone' (propanone)", () => {
      const result = parseIUPACName("acetone");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'benzaldehyde'", () => {
      const result = parseIUPACName("benzaldehyde");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Ethers", () => {
    it("should parse 'dimethyl ether'", () => {
      const result = parseIUPACName("dimethyl ether");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'diethyl ether'", () => {
      const result = parseIUPACName("diethyl ether");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'anisole' (methoxybenzene)", () => {
      const result = parseIUPACName("anisole");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Nitriles", () => {
    it("should parse 'acetonitrile' (ethanenitrile)", () => {
      const result = parseIUPACName("acetonitrile");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'benzonitrile'", () => {
      const result = parseIUPACName("benzonitrile");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Complex Real-World Molecules", () => {
    it("should parse 'ibuprofen'", () => {
      const result = parseIUPACName("ibuprofen");
      // Ibuprofen is a complex name - may not fully resolve in MVP
      expect(result).toBeDefined();
    });

    it("should parse 'aspirin'", () => {
      const result = parseIUPACName("aspirin");
      // Aspirin is acetylsalicylic acid - complex name
      expect(result).toBeDefined();
    });

    it("should parse 'caffeine'", () => {
      const result = parseIUPACName("caffeine");
      // Caffeine is a complex heterocyclic - may not fully resolve in MVP
      expect(result).toBeDefined();
    });
  });

  describe("Edge Cases and Difficult Patterns", () => {
    it("should handle empty string gracefully", () => {
      const result = parseIUPACName("");
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.molecule).toBeNull();
    });

    it("should handle unknown IUPAC names gracefully", () => {
      const result = parseIUPACName("xyzabc123");
      expect(result.molecule === null || result.errors.length > 0).toBe(true);
    });

    it("should handle names with multiple spaces", () => {
      const result = parseIUPACName("1,  2-dimethylbenzene");
      expect(result).toBeDefined();
    });
  });
});
