import { describe, expect, it } from "bun:test";
import { generateIUPACName, parseSMILES } from "index";

describe("Lactam Numbering Issues", () => {
  describe("5-membered rings with single nitrogen (pyrrolidines)", () => {
    it("should number 3-methylpyrrolidin-2-one correctly", () => {
      // PubChem canonical SMILES for 3-methylpyrrolidin-2-one
      const result = parseSMILES("CC1CCNC1=O");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("3-methylpyrrolidin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("3-methylpyrrolidin-2-one");
    });

    it("should number 4-methylpyrrolidin-2-one correctly", () => {
      // PubChem canonical SMILES for 4-methylpyrrolidin-2-one
      const result = parseSMILES("CC1CC(=O)NC1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("4-methylpyrrolidin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("4-methylpyrrolidin-2-one");
    });

    it("should number 5-methylpyrrolidin-2-one correctly", () => {
      // PubChem canonical SMILES for 5-methylpyrrolidin-2-one
      const result = parseSMILES("CC1CCC(=O)N1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("5-methylpyrrolidin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("5-methylpyrrolidin-2-one");
    });
  });

  describe("6-membered rings with single nitrogen (piperidines)", () => {
    it("should number 6-methylpiperidin-2-one correctly", () => {
      const result = parseSMILES("CC1CCCC(=O)N1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("6-methylpiperidin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("6-methylpiperidin-2-one");
    });

    it("should number 3-methylpiperidin-2-one correctly", () => {
      // PubChem canonical SMILES for 3-methylpiperidin-2-one
      const result = parseSMILES("CC1CCCNC1=O");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("3-methylpiperidin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("3-methylpiperidin-2-one");
    });
  });

  describe("6-membered rings with two nitrogens (piperazines)", () => {
    it("should recognize piperazin-2-one", () => {
      const result = parseSMILES("O=C1NCCCN1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("piperazin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("piperazin-2-one");
    });

    it("should number 3-methylpiperazin-2-one correctly", () => {
      // PubChem canonical SMILES for 3-methylpiperazin-2-one (CID 79010)
      const result = parseSMILES("CC1C(=O)NCCN1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("3-methylpiperazin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("3-methylpiperazin-2-one");
    });

    it("should number 6-methylpiperazin-2-one correctly", () => {
      // The other isomer - methyl on the nitrogen-adjacent carbon opposite to carbonyl
      const result = parseSMILES("CC1CNCC(=O)N1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0];
      if (!mol) throw new Error("No molecule parsed");

      const iupacResult = generateIUPACName(mol);
      console.log("6-methylpiperazin-2-one actual name:", iupacResult.name);
      expect(iupacResult.name).toBe("6-methylpiperazin-2-one");
    });
  });
});
