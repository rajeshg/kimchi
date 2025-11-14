import { describe, it, expect } from "bun:test";
import { parseIUPACName } from "index";
import { generateSMILES } from "index";
import { parseSMILES } from "index";
import dataset from "./smiles-to-iupac-realistic-dataset.json";

const realisticDataset: Array<{
  smiles: string;
  iupac: string;
  comment?: string;
}> = dataset as any;

// No skip list - test all cases to get true benchmark of current capabilities
const SKIP_IUPAC_TO_SMILES = new Set<string>();

describe("IUPAC Name to SMILES Realistic Test", () => {
  it("should parse IUPAC name and generate SMILES for realistic dataset", () => {
    const mismatches: Array<{
      iupac: string;
      generatedSmiles: string;
      referenceSmiles: string;
      error?: string;
    }> = [];
    const parsingErrors: Array<{
      iupac: string;
      error: string;
    }> = [];
    const generationErrors: Array<{
      iupac: string;
      generatedSmiles: string;
      referenceSmiles: string;
    }> = [];

    let matchCount = 0;
    let skippedCount = 0;
    let parsingErrorCount = 0;
    let generationErrorCount = 0;
    let structuralMismatchCount = 0;

    realisticDataset.forEach((entry) => {
      if (SKIP_IUPAC_TO_SMILES.has(entry.iupac)) {
        skippedCount++;
        return;
      }

      const parseResult = parseIUPACName(entry.iupac);
      if (parseResult.errors && parseResult.errors.length > 0) {
        parsingErrors.push({
          iupac: entry.iupac,
          error: parseResult.errors.join("; "),
        });
        parsingErrorCount++;
        return;
      }

      expect(parseResult.molecule).toBeDefined();
      const mol = parseResult.molecule!;

      let generatedSmiles: string;
      try {
        generatedSmiles = generateSMILES(mol, true); // canonical=true
      } catch (error) {
        generationErrors.push({
          iupac: entry.iupac,
          generatedSmiles: "",
          referenceSmiles: entry.smiles,
        });
        generationErrorCount++;
        return;
      }

      // Canonicalize the expected SMILES for fair comparison
      const referenceSmiles = entry.smiles;
      let canonicalReferenceSmiles = referenceSmiles;
      try {
        const refResult = parseSMILES(referenceSmiles);
        if (
          refResult.molecules.length > 0 &&
          refResult.molecules[0] &&
          !refResult.errors?.length
        ) {
          canonicalReferenceSmiles = generateSMILES(
            refResult.molecules[0],
            true,
          );
        }
      } catch (error) {
        // If we can't parse/canonicalize the reference, use it as-is
      }

      if (generatedSmiles === canonicalReferenceSmiles) {
        matchCount++;
      } else if (generatedSmiles === "") {
        generationErrors.push({
          iupac: entry.iupac,
          generatedSmiles: generatedSmiles,
          referenceSmiles: referenceSmiles,
        });
        generationErrorCount++;
      } else {
        mismatches.push({
          iupac: entry.iupac,
          generatedSmiles: generatedSmiles,
          referenceSmiles: canonicalReferenceSmiles,
        });
        structuralMismatchCount++;
      }
    });

    const total = realisticDataset.length;
    const testedCount = total - skippedCount;

    console.log(`\nIUPAC to SMILES Realistic Test Summary:`);
    console.log(`  Total cases: ${total}`);
    console.log(`  Tested: ${testedCount}`);
    console.log(`  Skipped (known limitations): ${skippedCount}`);
    console.log(`  Matches: ${matchCount}`);
    console.log(`  Parsing errors: ${parsingErrorCount}`);
    console.log(`  Generation errors: ${generationErrorCount}`);
    console.log(`  Structural mismatches: ${structuralMismatchCount}`);
    console.log(
      `  Total failures: ${parsingErrorCount + generationErrorCount + structuralMismatchCount}`,
    );
    console.log(
      `  Match rate: ${((matchCount / testedCount) * 100).toFixed(1)}%`,
    );

    // Show detailed error breakdown
    if (parsingErrors.length > 0) {
      console.log(`\nParsing Errors (${parsingErrors.length}):`);
      parsingErrors.slice(0, 5).forEach((m, i) => {
        console.log(`#${i + 1}: ${m.iupac}`);
        console.log(`   Error: ${m.error.substring(0, 100)}...`);
      });
      if (parsingErrors.length > 5) {
        console.log(
          `   ... and ${parsingErrors.length - 5} more parsing errors`,
        );
      }
    }

    if (generationErrors.length > 0) {
      console.log(`\nGeneration Errors (${generationErrors.length}):`);
      generationErrors.slice(0, 5).forEach((m, i) => {
        console.log(`#${i + 1}: ${m.iupac}`);
        console.log(
          `   Expected: ${m.referenceSmiles}, Generated: "${m.generatedSmiles}"`,
        );
      });
      if (generationErrors.length > 5) {
        console.log(
          `   ... and ${generationErrors.length - 5} more generation errors`,
        );
      }
    }

    if (structuralMismatchCount > 0) {
      console.log(`\nStructural Mismatches (${structuralMismatchCount}):`);
      mismatches.slice(0, 5).forEach((m, i) => {
        console.log(`#${i + 1}: ${m.iupac}`);
        console.log(`   Expected: ${m.referenceSmiles}`);
        console.log(`   Generated: ${m.generatedSmiles}`);
      });
      if (structuralMismatchCount > 5) {
        console.log(
          `   ... and ${structuralMismatchCount - 5} more structural mismatches`,
        );
      }
    }

    // Write detailed report to file
    const fs = require("fs");
    const path = require("path");
    const reportPath = path.join(
      __dirname,
      "iupac-to-smiles-detailed-report.csv",
    );
    const header = "iupac,expected_smiles,generated_smiles,status,error\n";
    const rows: string[] = [];

    // Add parsing errors
    parsingErrors.forEach((m) => {
      rows.push(
        `"${m.iupac}","","","PARSING_ERROR","${m.error.replace(/"/g, '""')}"`,
      );
    });

    // Add generation errors
    generationErrors.forEach((m) => {
      rows.push(
        `"${m.iupac}","${m.referenceSmiles}","${m.generatedSmiles}","GENERATION_ERROR",""`,
      );
    });

    // Add structural mismatches
    mismatches.forEach((m) => {
      rows.push(
        `"${m.iupac}","${m.referenceSmiles}","${m.generatedSmiles}","STRUCTURAL_MISMATCH",""`,
      );
    });

    // Add matches
    realisticDataset.forEach((entry) => {
      if (!SKIP_IUPAC_TO_SMILES.has(entry.iupac)) {
        const parseResult = parseIUPACName(entry.iupac);
        if (!parseResult.errors || parseResult.errors.length === 0) {
          const mol = parseResult.molecule!;
          const generatedSmiles = generateSMILES(mol, true);

          // Canonicalize reference for comparison
          let canonicalReferenceSmiles = entry.smiles;
          try {
            const refResult = parseSMILES(entry.smiles);
            if (
              refResult.molecules.length > 0 &&
              refResult.molecules[0] &&
              !refResult.errors?.length
            ) {
              canonicalReferenceSmiles = generateSMILES(
                refResult.molecules[0],
                true,
              );
            }
          } catch (error) {
            // Use as-is if canonicalization fails
          }

          if (generatedSmiles === canonicalReferenceSmiles) {
            rows.push(
              `"${entry.iupac}","${entry.smiles}","${generatedSmiles}","MATCH",""`,
            );
          }
        }
      }
    });

    fs.writeFileSync(reportPath, header + rows.join("\n"), "utf8");
    console.log(`\nDetailed report written to: ${reportPath}`);

    // For now, we expect some failures due to IUPAC parser limitations
    // But we should have at least some successful matches
    expect(matchCount).toBeGreaterThan(0);

    // The main goal is to track progress - this test serves as a benchmark
    console.log(
      `\nThis test serves as a benchmark for IUPAC parser development progress.`,
    );
    console.log(
      `Current focus should be on reducing parsing errors by implementing missing tokens.`,
    );
  });
});
