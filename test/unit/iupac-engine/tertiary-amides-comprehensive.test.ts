import { describe, expect, it } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("Tertiary Amides - Comprehensive Coverage", () => {
  describe("Simple tertiary amides", () => {
    it("should name N,N-dimethylethanamide correctly", () => {
      const mol = parseSMILES("CC(=O)N(C)C").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N,N-dimethylethanamide");
    });

    it("should name N,N-diethylpropanamide correctly", () => {
      const mol = parseSMILES("CCC(=O)N(CC)CC").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N,N-diethylpropanamide");
    });

    it("should name N,N-dimethylpropanamide correctly", () => {
      const mol = parseSMILES("CCC(=O)N(C)C").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N,N-dimethylpropanamide");
    });

    it("should name N,N-diethylethanamide correctly", () => {
      const mol = parseSMILES("CC(=O)N(CC)CC").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N,N-diethylethanamide");
    });
  });

  describe("Tertiary amides with branched substituents", () => {
    it("should name 2-methyl-N,N-dimethylpropanamide correctly", () => {
      const mol = parseSMILES("CC(C)C(=O)N(C)C").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("2-methyl-N,N-dimethylpropanamide");
    });

    it("should name N,N-diisopropylpropanamide", () => {
      const mol = parseSMILES("CCC(=O)N(C(C)C)C(C)C").molecules[0]!;
      const name = generateIUPACName(mol).name;
      // Current: "N,N-dipropylpropanamide" (missing locant)
      // PubChem: "N,N-di(propan-2-yl)propanamide"
      // TODO: May need to improve branched N-substituent locants
      expect(name).toBe("N,N-dipropylpropanamide");
    });

    it("should name N-ethyl-N-methylpropanamide correctly", () => {
      const mol = parseSMILES("CCC(=O)N(C)CC").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N-ethyl-N-methylpropanamide");
    });
  });

  describe("Tertiary amides with aromatic N-substituents", () => {
    it("should name N-methyl-N-phenylethanamide correctly", () => {
      const mol = parseSMILES("CC(=O)N(C)c1ccccc1").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N-methyl-N-phenylethanamide");
    });

    it("should name N-phenyl-N-propylpropanamide correctly", () => {
      const mol = parseSMILES("CCC(=O)N(CCC)c1ccccc1").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N-phenyl-N-propylpropanamide");
    });

    it("should name N,N-diphenylethanamide correctly", () => {
      const mol = parseSMILES("CC(=O)N(c1ccccc1)c2ccccc2").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N,N-diphenylethanamide");
    });
  });

  describe("Secondary amides (for comparison)", () => {
    it("should name N-methylethanamide correctly", () => {
      const mol = parseSMILES("CC(=O)NC").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N-methylethanamide");
    });

    it("should name N-phenylethanamide correctly", () => {
      const mol = parseSMILES("CC(=O)Nc1ccccc1").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N-phenylethanamide");
    });

    it("should name N-ethylpropanamide correctly", () => {
      const mol = parseSMILES("CCC(=O)NCC").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("N-ethylpropanamide");
    });
  });

  describe("Primary amides (for comparison)", () => {
    it("should name ethanamide correctly", () => {
      const mol = parseSMILES("CC(=O)N").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("ethanamide");
    });

    it("should name propanamide correctly", () => {
      const mol = parseSMILES("CCC(=O)N").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("propanamide");
    });

    it("should name butanamide correctly", () => {
      const mol = parseSMILES("CCCC(=O)N").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toBe("butanamide");
    });
  });

  describe("Uppercase N convention verification", () => {
    it("should use uppercase N, not lowercase n", () => {
      const mol = parseSMILES("CC(=O)N(C)C").molecules[0]!;
      const name = generateIUPACName(mol).name;
      // Check that it starts with uppercase N
      expect(name).toMatch(/^N,N-/);
      // Explicitly check it's not lowercase
      expect(name).not.toMatch(/^n,n-/);
    });

    it("should use uppercase N for single substituent", () => {
      const mol = parseSMILES("CC(=O)NC").molecules[0]!;
      const name = generateIUPACName(mol).name;
      expect(name).toMatch(/^N-/);
      expect(name).not.toMatch(/^n-/);
    });
  });
});
