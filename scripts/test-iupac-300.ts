import { readFileSync } from 'fs';
import { generateIUPACNameFromSMILES } from '../index';

interface TestCase {
  smiles: string;
  iupacName: string;
}

const testData: TestCase[] = JSON.parse(
  readFileSync('test/pubchem-iupac-name-300.json', 'utf-8')
);

// Use first 90 as per session summary
const testCases = testData.slice(0, 90);

let matches = 0;
let total = 0;
const mismatches: Array<{ line: number; smiles: string; expected: string; actual: string }> = [];

for (const [index, testCase] of testCases.entries()) {
  total++;
  
  try {
    const result = generateIUPACNameFromSMILES(testCase.smiles);
    const actualName = result.name || 'NO_NAME_GENERATED';
    
    if (actualName === testCase.iupacName) {
      matches++;
    } else {
      mismatches.push({
        line: index + 1,
        smiles: testCase.smiles,
        expected: testCase.iupacName,
        actual: actualName
      });
    }
  } catch (error) {
    mismatches.push({
      line: index + 1,
      smiles: testCase.smiles,
      expected: testCase.iupacName,
      actual: 'ERROR: ' + (error instanceof Error ? error.message : String(error))
    });
  }
}

console.log(`\n${'='.repeat(80)}`);
console.log(`IUPAC Name Generation Test Results`);
console.log(`${'='.repeat(80)}`);
console.log(`Match rate: ${matches}/${total} (${((matches / total) * 100).toFixed(1)}%)`);
console.log(`${'='.repeat(80)}\n`);

if (mismatches.length > 0) {
  console.log(`First 10 mismatches:\n`);
  mismatches.slice(0, 10).forEach(m => {
    console.log(`Line ${m.line}:`);
    console.log(`  SMILES:   ${m.smiles}`);
    console.log(`  Expected: ${m.expected}`);
    console.log(`  Actual:   ${m.actual}`);
    console.log();
  });
}
