import { describe, it, expect } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("Phenyl substituent position calculation", () => {
  describe("methoxy-substituted phenyl groups", () => {
    it("should correctly identify para-methoxyphenyl (position 4)", () => {
      const smiles = "COc1ccc(cc1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(4-methoxyphenyl)quinoline");
    });

    it("should correctly identify meta-methoxyphenyl (position 3)", () => {
      const smiles = "COc1cccc(c1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(3-methoxyphenyl)quinoline");
    });

    it("should correctly identify ortho-methoxyphenyl (position 2)", () => {
      const smiles = "COc1ccccc1c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(2-methoxyphenyl)quinoline");
    });
  });

  describe("chloro-substituted phenyl groups", () => {
    it("should correctly identify para-chlorophenyl (position 4)", () => {
      const smiles = "Clc1ccc(cc1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(4-chlorophenyl)quinoline");
    });

    it("should correctly identify meta-chlorophenyl (position 3)", () => {
      const smiles = "Clc1cccc(c1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(3-chlorophenyl)quinoline");
    });

    it("should correctly identify ortho-chlorophenyl (position 2)", () => {
      const smiles = "Clc1ccccc1c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(2-chlorophenyl)quinoline");
    });
  });

  describe("methyl-substituted phenyl groups", () => {
    it("should correctly identify para-methylphenyl (position 4)", () => {
      const smiles = "Cc1ccc(cc1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(4-methylphenyl)quinoline");
    });

    it("should correctly identify meta-methylphenyl (position 3)", () => {
      const smiles = "Cc1cccc(c1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(3-methylphenyl)quinoline");
    });

    it("should correctly identify ortho-methylphenyl (position 2)", () => {
      const smiles = "Cc1ccccc1c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(2-methylphenyl)quinoline");
    });
  });

  describe("nitro-substituted phenyl groups", () => {
    it("should correctly identify para-nitrophenyl (position 4)", () => {
      const smiles = "[N+](=O)([O-])c1ccc(cc1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(4-nitrophenyl)quinoline");
    });

    it("should correctly identify meta-nitrophenyl (position 3)", () => {
      const smiles = "[N+](=O)([O-])c1cccc(c1)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(3-nitrophenyl)quinoline");
    });

    it("should correctly identify ortho-nitrophenyl (position 2)", () => {
      const smiles = "[N+](=O)([O-])c1ccccc1c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(2-nitrophenyl)quinoline");
    });
  });

  describe("edge cases", () => {
    it("should handle multiple substituents on phenyl ring", () => {
      const smiles = "COc1ccc(cc1OC)c2ccc3ccccc3n2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("2-(1,2-dimethoxyphenyl)quinoline");
    });

    it("should handle different attachment positions on quinoline", () => {
      const smiles = "COc1ccc(cc1)c2cnc3ccccc3c2";
      const mol = parseSMILES(smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe("3-(4-methoxyphenyl)quinoline");
    });
  });
});
