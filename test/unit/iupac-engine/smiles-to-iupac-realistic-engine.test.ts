import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import dataset from './smiles-to-iupac-realistic-dataset.json';
const realisticDataset: Array<{ smiles: string; iupac: string }> = dataset as any;
import { RuleEngine } from '../../../src/iupac-engine/engine';

// Known Limitations:
// 1. C=C(C)C generates "butene" instead of "2-methylpropene"
//    - Issue: Chain selection doesn't prioritize double bond placement in main chain
//    - This is a known chain selection limitation documented in the codebase

describe('SMILES to IUPAC Name Realistic Test (New Engine)', () => {
  describe('Simple molecules that should work', () => {
     it('should generate and compare IUPAC names for realistic SMILES', () => {
       const engine = new RuleEngine();
       const mismatches: Array<{smiles: string; generated: string; reference: string}> = [];
       let matchCount = 0;
        realisticDataset.forEach((entry: { smiles: string; iupac: string }) => {
         const result = parseSMILES(entry.smiles);
         expect(result.errors).toHaveLength(0);
         expect(result.molecules).toHaveLength(1);

         const mol = result.molecules[0]!;
         const iupacResult = engine.generateName(mol);
         const genName = iupacResult.name?.trim().toLowerCase();
         const refName = entry.iupac.trim().toLowerCase();

         expect(genName).toBeDefined();
         expect(typeof genName).toBe('string');
         expect(genName.length).toBeGreaterThan(0);

           console.log(`Generated for ${entry.smiles}: ${genName}, ref: ${refName}`);
          if (genName !== refName) {
            mismatches.push({
              smiles: entry.smiles,
              generated: iupacResult.name,
              reference: entry.iupac
            });
          } else {
            matchCount++;
          }
       });
       const total = realisticDataset.length;
       console.log(`\nIUPAC Realistic Test Summary:`);
       console.log(`  Total cases: ${total}`);
       console.log(`  Matches: ${matchCount}`);
       console.log(`  Mismatches: ${mismatches.length}`);
       console.log(`  Match rate: ${(matchCount / total * 100).toFixed(1)}%`);
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
          const fs = require('fs');
          const path = require('path');
          const csvPath = path.join(__dirname, 'smiles-iupac-mismatches.csv');
          const header = 'smiles,expected,actual\n';
          const rows = mismatches.map(m => `${m.smiles},"${m.reference}","${m.generated}"`).join('\n');
          fs.writeFileSync(csvPath, header + rows, 'utf8');
          console.log(`\nFull mismatch report written to: ${csvPath}`);
        }
        // Expect at least 50% match rate for realistic molecules
        expect(matchCount / total).toBeGreaterThanOrEqual(0.5);
      });
  });
});
