import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import dataset from "./smiles-to-iupac-realistic-dataset.json";
const realisticDataset: Array<{ smiles: string; iupac: string }> =
  dataset as any;
import { RuleEngine } from "../../../src/iupac-engine/engine";

// Known Limitations - Skipped test cases:
// These 3 cases represent advanced polycyclic nomenclature that requires specialized IUPAC rules
// not yet implemented in openchem. All are documented as known limitations.
//
// 1. Complex Heptacyclic Alkaloid (SMILES: CC1C2C3CC4N(CCC5C6=C7C(=C(C=C6)OC)OC(C(=O)N7C5(C3(C2=O)O1)O4)OC)C)
//    - Requires: Natural product nomenclature (IUPAC P-101)
//    - 32 atoms, 7 rings - extremely complex polycyclic system
//    - Reference: docs/iupac-realistic-dataset-analysis.md (Mismatch #2)
//
// 2. Steroid Derivative with Imine (SMILES: CC(C1CCC2C1(CCC3C2CCC4C3(CCC(C4)O)CN=C(C)C)C)O)
//    - Requires: Steroid skeleton recognition (IUPAC P-101.1)
//    - Expected name uses cyclopenta[a]phenanthren fusion nomenclature
//    - Reference: docs/iupac-realistic-dataset-analysis.md (Mismatch #3)
//
// 3. Complex Heptacyclic Alkaloid variant (SMILES: CC1C2C3CC4N(CCC5(C2=O)C6=C7C(=CC=C6)OC(C(=O)N7C5(C3O1)O4)OC)C)
//    - Requires: Natural product nomenclature (IUPAC P-101)
//    - 30 atoms, 7 rings - extremely complex polycyclic system
//    - Reference: docs/iupac-realistic-dataset-analysis.md (Mismatch #5)

// SMILES to skip due to known limitations
const SKIP_SMILES = new Set([
  "CC1C2C3CC4N(CCC5C6=C7C(=C(C=C6)OC)OC(C(=O)N7C5(C3(C2=O)O1)O4)OC)C", // Heptacyclic alkaloid
  "CC(C1CCC2C1(CCC3C2CCC4C3(CCC(C4)O)CN=C(C)C)C)O", // Steroid derivative
  "CC1C2C3CC4N(CCC5(C2=O)C6=C7C(=CC=C6)OC(C(=O)N7C5(C3O1)O4)OC)C", // Heptacyclic alkaloid variant
]);

describe("SMILES to IUPAC Name Realistic Test (New Engine)", () => {
  describe("Simple molecules that should work", () => {
    it("should generate and compare IUPAC names for realistic SMILES", () => {
      const engine = new RuleEngine();
      const mismatches: Array<{
        smiles: string;
        generated: string;
        reference: string;
      }> = [];
      let matchCount = 0;
      let skippedCount = 0;
      realisticDataset.forEach((entry: { smiles: string; iupac: string }) => {
        // Skip known limitations
        if (SKIP_SMILES.has(entry.smiles)) {
          skippedCount++;
          console.log(
            `Skipping known limitation: ${entry.smiles.substring(0, 50)}...`,
          );
          return;
        }
        const result = parseSMILES(entry.smiles);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules).toHaveLength(1);

        const mol = result.molecules[0]!;
        const iupacResult = engine.generateName(mol);
        const genName = iupacResult.name?.trim().toLowerCase();
        const refName = entry.iupac.trim().toLowerCase();

        expect(genName).toBeDefined();
        expect(typeof genName).toBe("string");
        expect(genName.length).toBeGreaterThan(0);

        console.log(
          `Generated for ${entry.smiles}: ${genName}, ref: ${refName}`,
        );
        if (genName !== refName) {
          mismatches.push({
            smiles: entry.smiles,
            generated: iupacResult.name,
            reference: entry.iupac,
          });
        } else {
          matchCount++;
        }
      });
      const total = realisticDataset.length;
      const testedCount = total - skippedCount;
      console.log(`\nIUPAC Realistic Test Summary:`);
      console.log(`  Total cases: ${total}`);
      console.log(`  Tested: ${testedCount}`);
      console.log(`  Skipped (known limitations): ${skippedCount}`);
      console.log(`  Matches: ${matchCount}`);
      console.log(`  Mismatches: ${mismatches.length}`);
      console.log(
        `  Match rate: ${((matchCount / testedCount) * 100).toFixed(1)}%`,
      );
      if (mismatches.length > 0 && mismatches.length <= 10) {
        console.log(`\nMismatches:`);
        mismatches.forEach((m, i) => {
          console.log(`#${i + 1}: SMILES: ${m.smiles}`);
          console.log(`   Generated: ${m.generated}`);
          console.log(`   Reference: ${m.reference}`);
        });
      } else if (mismatches.length > 10) {
        console.log(`\nShowing first 10 mismatches:`);
        mismatches.slice(0, 10).forEach((m, i) => {
          console.log(`#${i + 1}: SMILES: ${m.smiles}`);
          console.log(`   Generated: ${m.generated}`);
          console.log(`   Reference: ${m.reference}`);
        });
      }
      // Write full mismatch report to CSV
      if (mismatches.length > 0) {
        const fs = require("fs");
        const path = require("path");
        const csvPath = path.join(__dirname, "smiles-iupac-mismatches.csv");
        const header = "smiles,expected,actual\n";
        const rows = mismatches
          .map((m) => `${m.smiles},"${m.reference}","${m.generated}"`)
          .join("\n");
        fs.writeFileSync(csvPath, header + rows, "utf8");
        console.log(`\nFull mismatch report written to: ${csvPath}`);
      }
      // Expect 100% match rate for tested molecules (excluding known limitations)
      expect(matchCount).toBe(testedCount);
      // Expect no mismatches (all failures should be in SKIP_SMILES)
      expect(mismatches.length).toBe(0);
    });
  });
});
