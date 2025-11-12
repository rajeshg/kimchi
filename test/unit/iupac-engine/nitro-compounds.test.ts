import { describe, it, expect } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("IUPAC: Nitro Compounds", () => {
  describe("Aliphatic nitro compounds", () => {
    it("should name nitromethane", () => {
      const mol = parseSMILES("C[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("nitromethane");
    });

    it("should name nitroethane", () => {
      const mol = parseSMILES("CC[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("nitroethane");
    });

    it("should name 1-nitropropane", () => {
      const mol = parseSMILES("CCC[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("1-nitropropane");
    });

    it("should name 2-nitropropane", () => {
      const mol = parseSMILES("CC(C)[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("2-nitropropane");
    });

    it("should name 1-nitrobutane", () => {
      const mol = parseSMILES("CCCC[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("1-nitrobutane");
    });
  });

  describe("Aromatic nitro compounds", () => {
    it("should name nitrobenzene", () => {
      const mol = parseSMILES("c1ccccc1[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("nitrobenzene");
    });

    it("should name 1-methyl-4-nitrobenzene (common name: 4-nitrotoluene)", () => {
      const mol = parseSMILES("Cc1ccc([N+](=O)[O-])cc1").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("1-methyl-4-nitrobenzene");
    });

    it("should name 1-methyl-2-nitrobenzene (common name: 2-nitrotoluene)", () => {
      const mol = parseSMILES("Cc1ccccc1[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("1-methyl-2-nitrobenzene");
    });

    it("should name 1-nitronaphthalene", () => {
      const mol = parseSMILES("c1ccc2ccccc2c1[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("1-nitronaphthalene");
    });
  });

  describe("Multiple nitro groups", () => {
    it("should name 1,3-dinitropropane", () => {
      const mol = parseSMILES("[O-][N+](=O)CCC[N+](=O)[O-]").molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("1,3-dinitropropane");
    });

    it("should name 1,4-dinitrobenzene", () => {
      const mol = parseSMILES("[O-][N+](=O)c1ccc([N+](=O)[O-])cc1")
        .molecules[0];
      if (!mol) throw new Error("failed to parse");
      const result = generateIUPACName(mol);
      expect(result.name).toBe("1,4-dinitrobenzene");
    });
  });
});
