import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateIUPACName } from 'index';
import dataset from './smiles-to-iupac-dataset.json';

describe('SMILES to IUPAC Name Bulk Test', () => {
  describe('Complex molecules from dataset', () => {
     it('should generate and compare IUPAC names for all SMILES in bulk dataset', () => {
       const mismatches: Array<{smiles: string; generated: string; reference: string}> = [];
       let matchCount = 0;
       dataset.forEach((entry, index) => {
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
       console.log(`\nIUPAC Bulk Test Summary:`);
       console.log(`  Total cases: ${total}`);
       console.log(`  Matches: ${matchCount}`);
       console.log(`  Mismatches: ${mismatches.length}`);
       console.log(`  Match rate: ${(matchCount / total * 100).toFixed(1)}%`);
       if (mismatches.length > 0) {
         console.log(`\nMismatches:`);
         mismatches.forEach((m, i) => {
           console.log(`#${i + 1}: SMILES: ${m.smiles}`);
           console.log(`   Generated: ${m.generated}`);
           console.log(`   Reference: ${m.reference}`);
         });
       }
       expect(matchCount).toBeGreaterThan(0); // Ensure at least some matches
     });
  });
});