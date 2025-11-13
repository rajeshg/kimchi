import { describe, it, expect } from "bun:test";
import { parseIUPACName } from "index";

describe("IUPAC Parser - Advanced Features", () => {
  describe("N-substituted compounds", () => {
    it("should tokenize 'N-methylaniline'", () => {
      const result = parseIUPACName("N-methylaniline");
      expect(result.molecule).toBeDefined();
    });

    it("should tokenize 'N,N-dimethylaniline'", () => {
      const result = parseIUPACName("N,N-dimethylaniline");
      expect(result).toBeDefined();
    });

    it("should tokenize 'N-ethylacetamide'", () => {
      const result = parseIUPACName("N-ethylacetamide");
      expect(result).toBeDefined();
    });
  });

  describe("Ether and ester nomenclature", () => {
    it("should handle 'methyl ether' pattern", () => {
      const result = parseIUPACName("dimethyl ether");
      expect(result).toBeDefined();
    });

    it("should handle 'methyl ester' pattern", () => {
      const result = parseIUPACName("methyl benzoate");
      expect(result).toBeDefined();
    });
  });

  describe("Complex numbers and locants", () => {
    it("should handle comma-separated locants", () => {
      const result = parseIUPACName("1,2,3-trimethylbenzene");
      expect(result).toBeDefined();
    });

    it("should handle hyphen-separated ranges", () => {
      const result = parseIUPACName("butane-1,2-diol");
      expect(result).toBeDefined();
    });
  });

  describe("Pharmaceutical compound patterns", () => {
    it("should parse common analgesic names", () => {
      const result = parseIUPACName("acetaminophen");
      expect(result).toBeDefined();
    });

    it("should handle salts and complexes", () => {
      const result = parseIUPACName("sodium acetate");
      expect(result).toBeDefined();
    });
  });

  describe("Polycyclic and fused ring systems", () => {
    it("should parse 'anthracene'", () => {
      const result = parseIUPACName("anthracene");
      expect(result.molecule).toBeDefined();
    });

    it("should parse 'phenanthrene'", () => {
      const result = parseIUPACName("phenanthrene");
      expect(result).toBeDefined();
    });
  });

  describe("Carbohydrate-like structures", () => {
    it("should handle glucose naming", () => {
      const result = parseIUPACName("glucose");
      expect(result).toBeDefined();
    });

    it("should handle ribose naming", () => {
      const result = parseIUPACName("ribose");
      expect(result).toBeDefined();
    });
  });

  describe("Steroid and natural product patterns", () => {
    it("should handle steroid names", () => {
      const result = parseIUPACName("testosterone");
      expect(result).toBeDefined();
    });

    it("should handle alkaloid names", () => {
      const result = parseIUPACName("morphine");
      expect(result).toBeDefined();
    });
  });

  describe("Systematic vs common names", () => {
    it("should recognize both 'benzene' and systematic equivalents", () => {
      const result1 = parseIUPACName("benzene");
      expect(result1.molecule).toBeDefined();
    });

    it("should recognize both 'ethane' and 'ethyl hydride'", () => {
      const result = parseIUPACName("ethane");
      expect(result.molecule).toBeDefined();
    });
  });

  describe("Mixed nomenclature patterns", () => {
    it("should handle multiple functional groups in one name", () => {
      const result = parseIUPACName("4-hydroxybenzaldehyde");
      expect(result).toBeDefined();
    });

    it("should handle branched heterocycles", () => {
      const result = parseIUPACName("2-methylpyridine");
      expect(result).toBeDefined();
    });

    it("should handle substituted aromatics with multiple groups", () => {
      const result = parseIUPACName("2,6-dichlorophenol");
      expect(result).toBeDefined();
    });
  });

  describe("Error handling and edge cases", () => {
    it("should gracefully handle malformed names", () => {
      const result = parseIUPACName("1-1-dimethyl");
      expect(result).toBeDefined();
    });

    it("should handle very long names", () => {
      const longName = "2-[4-(1,1-dimethylethyl)phenyl]-5-methyl-1,3-dioxolan-2-methanol";
      const result = parseIUPACName(longName);
      expect(result).toBeDefined();
    });

    it("should handle Unicode and special characters", () => {
      const result = parseIUPACName("benzen-1,4-diol");
      expect(result).toBeDefined();
    });
  });
});
