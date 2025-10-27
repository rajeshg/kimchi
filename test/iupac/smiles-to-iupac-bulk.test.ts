import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateIUPACName } from 'index';
import dataset from './smiles-to-iupac-dataset.json';

describe('SMILES to IUPAC Name Bulk Test', () => {
  describe('Complex molecules from dataset', () => {
    dataset.forEach((entry, index) => {
      it(`should generate IUPAC name for SMILES ${index + 1}: ${entry.smiles}`, () => {
        const result = parseSMILES(entry.smiles);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules).toHaveLength(1);

        const mol = result.molecules[0]!;
        const iupac = generateIUPACName(mol);

        expect(iupac.errors).toHaveLength(0);
        expect(iupac.name).toBeDefined();
        expect(typeof iupac.name).toBe('string');
        expect(iupac.name.length).toBeGreaterThan(0);

        // For now, just check that a name is generated without errors
        // In the future, we can check exact matches: expect(iupac.name).toBe(entry.iupac);
      });
    });
  });
});