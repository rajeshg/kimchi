import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { generateSMILES } from "src/generators/smiles-generator";

describe("Aromaticity Perception - Performance Regression Tests", () => {
  describe("SSSR-based ring handling", () => {
    it("should efficiently parse adamantane using SSSR", () => {
      // Adamantane (C10H16) - bicyclic bridged system
      // Tests that SSSR is used for aromaticity instead of all cycles
      // Before fix would enumerate all cycles (exponential for bridged systems)
      // After fix uses SSSR (polynomial)
      const adamantaneSmiles = "C1C2CC3CC1CC(C2)C3";

      const start = performance.now();
      const result = parseSMILES(adamantaneSmiles);
      const end = performance.now();
      const elapsedMs = end - start;

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(10);
      expect(mol.bonds.length).toBeGreaterThan(0);

      // Should complete quickly (SSSR-based, not all cycles)
      expect(elapsedMs).toBeLessThan(100);
    });

    it("should correctly perceive aromaticity in adamantane", () => {
      const adamantaneSmiles = "C1C2CC3CC1CC(C2)C3";

      const result = parseSMILES(adamantaneSmiles);
      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const mol = result.molecules[0]!;

      // Adamantane has no aromatic atoms (saturated tricyclic)
      const aromaticAtoms = mol.atoms.filter((atom) => atom.aromatic);
      expect(aromaticAtoms).toHaveLength(0);

      // Verify we can generate SMILES consistently
      const canonical = generateSMILES(mol, true);
      expect(canonical).toBeTruthy();

      // Round-trip should work
      const roundTrip = parseSMILES(canonical);
      expect(roundTrip.molecules).toHaveLength(1);
      expect(roundTrip.errors).toHaveLength(0);
    });

    it("should handle bridged bicyclic systems efficiently", () => {
      // Bicyclo[2.2.1]heptane (norbornane)
      const norboraneSmiles = "C1CC2CCC1C2";

      const start = performance.now();
      const result = parseSMILES(norboraneSmiles);
      const end = performance.now();

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(end - start).toBeLessThan(50);
    });

    it("should handle spiro compounds efficiently", () => {
      // Spiro[5.5]undecane
      const spiroSmiles = "C1CCC2(C1)CCCCC2";

      const start = performance.now();
      const result = parseSMILES(spiroSmiles);
      const end = performance.now();

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(end - start).toBeLessThan(50);
    });

    it("should handle tricyclic saturated systems efficiently", () => {
      // A larger tricyclic system
      const tricyclicSmiles = "C1CC2CCC3CCCC(C3)C2C1";

      const start = performance.now();
      const result = parseSMILES(tricyclicSmiles);
      const end = performance.now();

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(end - start).toBeLessThan(50);
    });
  });

  describe("Fused aromatic ring systems", () => {
    it("should efficiently parse naphthalene", () => {
      // Naphthalene - 2 fused aromatic rings
      const naphthaleneSmiles = "c1ccc2ccccc2c1";

      const start = performance.now();
      const result = parseSMILES(naphthaleneSmiles);
      const end = performance.now();

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(end - start).toBeLessThan(50);

      const mol = result.molecules[0]!;
      const aromaticAtoms = mol.atoms.filter((a) => a.aromatic);
      expect(aromaticAtoms.length).toBeGreaterThan(8);
    });

    it("should efficiently parse anthracene", () => {
      // Anthracene - 3 fused aromatic rings
      const anthraceneSmiles = "c1cc2ccc3cccc4ccc(c1)c2c34";

      const start = performance.now();
      const result = parseSMILES(anthraceneSmiles);
      const end = performance.now();

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(end - start).toBeLessThan(50);

      const mol = result.molecules[0]!;
      const aromaticAtoms = mol.atoms.filter((a) => a.aromatic);
      expect(aromaticAtoms.length).toBeGreaterThan(10);
    });

    it("should efficiently parse phenanthrene", () => {
      // Phenanthrene - 3 fused aromatic rings (different arrangement)
      const phenanthreneSmiles = "c1ccc2c(c1)ccc3c2cccc3";

      const start = performance.now();
      const result = parseSMILES(phenanthreneSmiles);
      const end = performance.now();

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(end - start).toBeLessThan(50);

      const mol = result.molecules[0]!;
      const aromaticAtoms = mol.atoms.filter((a) => a.aromatic);
      expect(aromaticAtoms.length).toBeGreaterThan(10);
    });

    it("should efficiently parse pyrene", () => {
      // Pyrene - 4 fused aromatic rings
      const pyreneSmiles = "c1cc2ccc3cccc4ccc(c1)c2c34";

      const start = performance.now();
      const result = parseSMILES(pyreneSmiles);
      const end = performance.now();

      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(end - start).toBeLessThan(50);

      const mol = result.molecules[0]!;
      const aromaticAtoms = mol.atoms.filter((a) => a.aromatic);
      expect(aromaticAtoms.length).toBeGreaterThan(12);
    });
  });

  describe("Performance consistency across multiple molecules", () => {
    it("should maintain consistent performance on diverse ring systems", () => {
      const testCases = [
        { smiles: "C1C2CC3CC1CC(C2)C3", name: "adamantane" },
        { smiles: "C1CC2CCC1C2", name: "norbornane" },
        { smiles: "C1CCC2(C1)CCCCC2", name: "spiro" },
        { smiles: "c1ccc2ccccc2c1", name: "naphthalene" },
        { smiles: "c1cc2ccc3cccc4ccc(c1)c2c34", name: "anthracene" },
      ];

      const times: number[] = [];

      for (const testCase of testCases) {
        const start = performance.now();
        const result = parseSMILES(testCase.smiles);
        const end = performance.now();

        times.push(end - start);

        expect(result.molecules).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
      }

      // All should complete in reasonable time
      for (const time of times) {
        expect(time).toBeLessThan(100);
      }

      // Verify no excessively slow cases (indicates no regression to exponential behavior)
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      // Max time should not be excessively larger than average
      if (avgTime > 1) {
        expect(maxTime / avgTime).toBeLessThan(10);
      }
    });

    it("should handle repeated parses without performance degradation", () => {
      const testSmiles = "c1cc2ccc3cccc4ccc(c1)c2c34"; // anthracene

      const times: number[] = [];

      // Parse multiple times
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const result = parseSMILES(testSmiles);
        const end = performance.now();

        times.push(end - start);

        expect(result.molecules).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
      }

      // No significant degradation across iterations
      const firstTime = times[0]!;
      const lastTime = times[times.length - 1]!;

      if (firstTime > 1) {
        const degradation = lastTime / firstTime;
        expect(degradation).toBeLessThan(2);
      }
    });
  });

  describe("Correctness verification", () => {
    it("should correctly identify SSSR rings for aromaticity perception", () => {
      // Anthracene has exactly 3 SSSR rings
      const anthraceneSmiles = "c1cc2ccc3cccc4ccc(c1)c2c34";

      const result = parseSMILES(anthraceneSmiles);
      expect(result.molecules).toHaveLength(1);

      const mol = result.molecules[0]!;

      // All atoms in anthracene should be aromatic
      const aromaticAtoms = mol.atoms.filter((a) => a.aromatic);
      expect(aromaticAtoms.length).toBe(mol.atoms.length);

      // Verify round-trip consistency
      const canonical = generateSMILES(mol, true);
      const roundTrip = parseSMILES(canonical);

      expect(roundTrip.molecules).toHaveLength(1);
      expect(
        roundTrip.molecules[0]!.atoms.filter((a) => a.aromatic).length,
      ).toBe(aromaticAtoms.length);
    });

    it("should correctly handle partial aromaticity in fused systems", () => {
      // Indane - benzene fused to cyclopentane
      const indaneSmiles = "c1ccc2CCCc2c1";

      const result = parseSMILES(indaneSmiles);
      expect(result.molecules).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const mol = result.molecules[0]!;

      // Should have some aromatic atoms (the benzene portion)
      const aromaticAtoms = mol.atoms.filter((a) => a.aromatic);
      expect(aromaticAtoms.length).toBeGreaterThan(0);
      expect(aromaticAtoms.length).toBeLessThan(mol.atoms.length);

      // Verify consistency
      const canonical = generateSMILES(mol, true);
      expect(canonical).toBeTruthy();
    });
  });
});
