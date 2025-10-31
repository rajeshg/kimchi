import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateIUPACName } from 'index';
import dataset from './smiles-to-iupac-realistic-dataset.json';

// This test is adapted for the new engine. If your engine's API for IUPAC name generation differs, update the call below.
describe('SMILES to IUPAC Name Realistic Test (New Engine)', () => {
  describe('Simple molecules that should work', () => {
     it('should generate and compare IUPAC names for realistic SMILES', () => {
       const mismatches: Array<{smiles: string; generated: string; reference: string}> = [];
       let matchCount = 0;
       dataset.forEach((entry) => {
         const result = parseSMILES(entry.smiles);
         expect(result.errors).toHaveLength(0);
         expect(result.molecules).toHaveLength(1);

         const mol = result.molecules[0]!;
         const iupac = generateIUPACName(mol);

         expect(iupac.errors).toHaveLength(0);
         expect(iupac.name).toBeDefined();
         expect(typeof iupac.name).toBe('string');
         expect(iupac.name.length).toBeGreaterThan(0);

         // Compare generated name to reference name and log mismatches
         const refName = entry.iupac.trim().toLowerCase();
         const genName = iupac.name.trim().toLowerCase();
         if (genName !== refName) {
           mismatches.push({
             smiles: entry.smiles,
             generated: iupac.name,
             reference: entry.iupac
           });
         } else {
           matchCount++;
         }
       });
       const total = dataset.length;
       console.log(`\nIUPAC Realistic Test Summary (New Engine):`);
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
       // Expect at least 50% match rate for realistic molecules
       expect(matchCount / total).toBeGreaterThanOrEqual(0.5);
     });
  });
});
