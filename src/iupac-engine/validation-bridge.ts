/**
 * Validation Bridge for IUPAC Engine
 *
 * This module provides comparison between the new rule-based engine
 * and the existing IUPAC implementation to ensure correctness.
 */

import type { Molecule } from "../../types";
import { IUPACNamer } from "./index";
// import { generateIUPACName } from '../../utils/iupac/chain-selector';

export interface ValidationResult {
  molecule: string;
  legacyName: string;
  newName: string;
  match: boolean;
  confidence: number;
  differences: string[];
}

export class ValidationBridge {
  private newNamer: IUPACNamer;

  constructor() {
    this.newNamer = new IUPACNamer();
  }

  /**
   * Compare new engine with legacy implementation
   */
  validateMolecule(molecule: Molecule, smiles: string): ValidationResult {
    try {
      // Get legacy name
      const legacyName = this.getLegacyName(molecule);

      // Get new engine name
      const newResult = this.newNamer.generateName(molecule);

      const match = this.compareNames(legacyName, newResult.name);
      const differences = this.findDifferences(legacyName, newResult.name);

      return {
        molecule: smiles,
        legacyName,
        newName: newResult.name,
        match,
        confidence: newResult.confidence,
        differences,
      };
    } catch (error) {
      return {
        molecule: smiles,
        legacyName: "Error in legacy",
        newName: "Error in new engine",
        match: false,
        confidence: 0,
        differences: [
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      };
    }
  }

  /**
   * Validate multiple molecules
   */
  validateMolecules(
    testCases: Array<{ smiles: string; expected?: string }>,
  ): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const testCase of testCases) {
      try {
        // Parse SMILES (this would need to be implemented)
        // const parsed = parseSMILES(testCase.smiles);
        // const molecule = parsed.molecules[0];
        // results.push(this.validateMolecule(molecule, testCase.smiles));

        // For now, just add placeholder results
        results.push({
          molecule: testCase.smiles,
          legacyName: "Legacy name not available yet",
          newName: "New name not available yet",
          match: false,
          confidence: 0,
          differences: ["Test case not yet implemented"],
        });
      } catch (error) {
        results.push({
          molecule: testCase.smiles,
          legacyName: "Parse error",
          newName: "Parse error",
          match: false,
          confidence: 0,
          differences: [
            `Parse error: ${error instanceof Error ? error.message : "Unknown error"}`,
          ],
        });
      }
    }

    return results;
  }

  /**
   * Run validation suite against test molecules
   */
  async runValidationSuite(): Promise<ValidationResult[]> {
    // Test cases from the Blue Book examples
    const testCases = [
      { smiles: "CC", expected: "ethane" }, // Simple alkane
      { smiles: "CCC", expected: "propane" }, // Longer alkane
      { smiles: "CCO", expected: "ethanol" }, // Alcohol
      { smiles: "CC(=O)O", expected: "acetic acid" }, // Carboxylic acid
      { smiles: "CC(=O)CC", expected: "butan-2-one" }, // Ketone
      { smiles: "CCN", expected: "ethanamine" }, // Amine
      { smiles: "C1CCCCC1", expected: "cyclohexane" }, // Ring
      { smiles: "c1ccccc1", expected: "benzene" }, // Aromatic
      { smiles: "CC(C)C(C(C(C)C)C)C", expected: "2,3,4-trimethylhexane" }, // Complex alkane
    ];

    return this.validateMolecules(testCases);
  }

  /**
   * Get legacy name using existing implementation
   */
  private getLegacyName(molecule: Molecule): string {
    try {
      // This would call the existing IUPAC implementation
      // For now, return a placeholder
      // return generateIUPACName(molecule);
      return "Legacy name not available yet";
    } catch (error) {
      return `Error generating legacy name: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  /**
   * Compare two names for similarity
   */
  private compareNames(name1: string, name2: string): boolean {
    // Simple comparison - in reality this would be more sophisticated
    // to handle synonyms, variations, etc.
    return name1.toLowerCase().trim() === name2.toLowerCase().trim();
  }

  /**
   * Find differences between two names
   */
  private findDifferences(name1: string, name2: string): string[] {
    const differences: string[] = [];

    if (name1 !== name2) {
      differences.push(`Legacy: "${name1}" vs New: "${name2}"`);

      // Could add more sophisticated diff analysis here
      // such as comparing prefixes, suffixes, locants, etc.
    }

    return differences;
  }

  /**
   * Generate validation report
   */
  generateReport(results: ValidationResult[]): string {
    const totalTests = results.length;
    const matches = results.filter((r) => r.match).length;
    const averageConfidence =
      results.reduce((sum, r) => sum + r.confidence, 0) / totalTests;

    let report = `IUPAC Engine Validation Report\n`;
    report += `================================\n\n`;
    report += `Total Tests: ${totalTests}\n`;
    report += `Matches: ${matches}\n`;
    report += `Accuracy: ${((matches / totalTests) * 100).toFixed(1)}%\n`;
    report += `Average Confidence: ${(averageConfidence * 100).toFixed(1)}%\n\n`;

    report += `Detailed Results:\n`;
    report += `-----------------\n`;

    results.forEach((result, index) => {
      report += `\n${index + 1}. ${result.molecule}\n`;
      report += `   Legacy: ${result.legacyName}\n`;
      report += `   New:    ${result.newName}\n`;
      report += `   Match:  ${result.match ? "✓" : "✗"}\n`;
      report += `   Conf:   ${(result.confidence * 100).toFixed(1)}%\n`;

      if (result.differences.length > 0) {
        report += `   Diff:   ${result.differences.join(", ")}\n`;
      }
    });

    return report;
  }
}

/**
 * Quick validation function
 */
export async function quickValidation(): Promise<void> {
  const bridge = new ValidationBridge();
  const results = await bridge.runValidationSuite();
  const report = bridge.generateReport(results);

  console.log(report);
}
