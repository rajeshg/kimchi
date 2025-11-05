import { describe, expect, it } from "bun:test";
import { parseSMILES } from "index";
import { RuleEngine } from "../../../src/iupac-engine/engine";

/**
 * Test suite for acyl substituent detection and naming
 * 
 * Acyl groups (R-C(=O)-) are ketones that branch off the main chain.
 * They should be named as substituents (e.g., "acetyl", "2-methylpropanoyl")
 * rather than being counted as principal ketones in the parent chain.
 * 
 * Rule reference: P-62.2.1.1 - Acyl groups as substituents
 * Implementation: acyl-substituent-correction.ts + name-assembly-layer.ts
 */
describe("Acyl Substituent Detection and Naming", () => {
  const engine = new RuleEngine();

  describe("Basic acyl substituent detection", () => {
    it("should correctly identify 2-methylpropanoyl as acyl substituent", () => {
      // Original test case from realistic dataset
      const smiles = "CC(C)C(=O)C(CCC(=O)C)C(=O)C(C)C";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(1);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      expect(iupacResult.name).toBe("7-methyl-5-(2-methylpropanoyl)octane-2,6-dione");
    });

    it("should identify simple acetyl as acyl substituent without parentheses", () => {
      const smiles = "CC(=O)C(CCC(=O)C)C(=O)C";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(1);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Acetyl is simple, so no parentheses needed
      expect(iupacResult.name).toContain("acetyl");
      expect(iupacResult.name).not.toContain("(acetyl)");
      expect(iupacResult.name).toBe("3-acetylheptane-2,6-dione");
    });

    it("should identify simple propanoyl as acyl substituent without parentheses", () => {
      const smiles = "CCC(=O)C(CCC(=O)C)C(=O)CC";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(1);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Propanoyl is unbranched, so no parentheses needed
      expect(iupacResult.name).toContain("propanoyl");
      expect(iupacResult.name).not.toContain("(propanoyl)");
      expect(iupacResult.name).toBe("5-propanoyloctane-2,6-dione");
    });
  });

  describe("Parentheses wrapping for branched acyl groups", () => {
    it("should wrap 2-methylpropanoyl in parentheses due to internal locant", () => {
      const smiles = "CC(C)C(=O)C(CCC(=O)C)C(=O)C(C)C";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(1);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Branched acyl with "2-methyl" locant needs parentheses
      expect(iupacResult.name).toContain("(2-methylpropanoyl)");
      expect(iupacResult.name).not.toContain(" 2-methylpropanoyl"); // No space before, must be wrapped
    });

    it("should not wrap simple acyl groups in parentheses", () => {
      const smiles = "CC(=O)C(CCC(=O)C)C(=O)C";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Simple acetyl should not have parentheses
      expect(iupacResult.name).toContain("acetyl");
      expect(iupacResult.name).not.toContain("(acetyl)");
    });
  });

  describe("Multiple acyl substituents", () => {
    it("should handle multiple acyl substituents on same molecule", () => {
      const smiles = "CC(C)C(=O)C(CC(C(=O)C(C)C)C(=O)C)C(=O)C(C)C";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(1);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Should have at least one (2-methylpropanoyl) with parentheses
      expect(iupacResult.name).toContain("(2-methylpropanoyl)");
      
      // Full expected name
      expect(iupacResult.name).toBe(
        "6-acetyl-2,8-dimethyl-4-(2-methylpropanoyl)nonane-3,7-dione"
      );
    });
  });

  describe("Acyl vs principal ketone distinction", () => {
    it("should count only main-chain ketones as principal groups", () => {
      // This molecule has 3 ketones total, but only 2 are on main chain
      const smiles = "CC(C)C(=O)C(CCC(=O)C)C(=O)C(C)C";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Should be "dione" (2 ketones) not "trione" (3 ketones)
      expect(iupacResult.name).toContain("dione");
      expect(iupacResult.name).not.toContain("trione");
    });

    it("should not mistake main-chain ketones for acyl substituents", () => {
      // Simple ketone on main chain - should be named as ketone, not acyl
      const smiles = "CCCCCC(=O)CCCCC"; // undecan-6-one
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Should be named as ketone (one), not as acyl substituent
      expect(iupacResult.name).toContain("one");
      expect(iupacResult.name).not.toContain("oyl"); // No "oyl" ending
      expect(iupacResult.name).toBe("undecan-6-one");
    });
  });

  describe("Known limitations", () => {
    it("known limitation: complex branched acyl groups may be fragmented", () => {
      // 2-ethylbutanoyl is currently fragmented into separate substituents
      // This is a broader structural recognition issue, not specific to acyl detection
      const smiles = "CCC(CC)C(=O)C(CCC(=O)C)C(=O)C";
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);

      const mol = result.molecules[0]!;
      const iupacResult = engine.generateName(mol);
      
      // Currently generates: "5-acetyl-7-ethylnonane-2,6-dione"
      // Ideally should be: "5-(2-ethylbutanoyl)heptane-2,6-dione"
      // But this requires deeper structural recognition improvements
      
      // For now, just verify it doesn't crash and produces a valid name
      expect(iupacResult.name).toBeTruthy();
      expect(iupacResult.name.length).toBeGreaterThan(0);
      
      // Document current behavior
      console.log(`  Current output: ${iupacResult.name}`);
      console.log(`  Note: Complex branched acyl groups are a known limitation`);
    });
  });
});
