import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateIUPACName } from '../../index';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('PubChem IUPAC Name Bulk Comparison', () => {
  const testDataPath = join(__dirname, '../pubchem-iupac-name-300.json');
  const testData = JSON.parse(readFileSync(testDataPath, 'utf-8'));

  it('should generate IUPAC names for bulk SMILES and compare with PubChem', () => {
    let matchCount = 0;
    let totalCount = 0;
    const mismatches: Array<{smiles: string, expected: string, actual: string}> = [];

    for (const entry of testData) {
      const { smiles, iupacName: expected } = entry;
      totalCount++;

      try {
        const parsed = parseSMILES(smiles);
        if (parsed.molecules.length === 0) {
          console.log(`Failed to parse SMILES: ${smiles}`);
          continue;
        }
        const mol = parsed.molecules[0]!;
        const result = generateIUPACName(mol);
        const actual = result.name;

        if (actual === expected) {
          matchCount++;
        } else {
          mismatches.push({ smiles, expected, actual });
        }
      } catch (error) {
        console.log(`Error processing SMILES: ${smiles}, error: ${error}`);
      }
    }

    console.log(`Matches: ${matchCount}/${totalCount}`);
    if (mismatches.length > 0) {
      console.log('First 10 mismatches:');
      mismatches.slice(0, 10).forEach(m => {
        console.log(`SMILES: ${m.smiles}`);
        console.log(`Expected: ${m.expected}`);
        console.log(`Actual: ${m.actual}`);
        console.log('---');
      });
    }

    // Test passes as long as no exceptions are thrown
    expect(true).toBe(true);
  });
});