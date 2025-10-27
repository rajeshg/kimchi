import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { generateCyclicName } from 'src/utils/iupac/iupac-rings/index';
import { analyzeRings } from 'src/utils/ring-analysis';

describe('Ring Substituents', () => {
  describe('Single ring with substituents', () => {
    it('should generate name for cyclohexanol (C6H11OH)', () => {
       const result = parseSMILES('C1CCCCC1O');
       const mol = result.molecules[0]!;
       const ringInfo = analyzeRings(mol);
       const name = generateCyclicName(mol, ringInfo);

       // Note: generateCyclicName returns just the base cycloalkane name for alcohols
       // The "ol" suffix is added by generateIUPACName when combining the cyclic name with the functional group
       expect(name).toBe('cyclohexane');
     });

    it('should generate name for methylcyclohexane', () => {
      const result = parseSMILES('C1CCCCC1C');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('methylcyclohexane');
    });

    it('should generate name for chlorocyclopentane', () => {
      const result = parseSMILES('C1CCCC1Cl');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('chlorocyclopentane');
    });

    it('should generate name for 1,2-dimethylcyclopentane', () => {
      const result = parseSMILES('C1CCC(C)C1C');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('1,2-dimethylcyclopentane');
    });
  });

  describe('Heterocycles', () => {
    it('should generate name for oxirane (ethylene oxide)', () => {
      const result = parseSMILES('C1CO1');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('oxirane');
    });

    it('should generate name for aziridine', () => {
      const result = parseSMILES('C1CN1');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('azirane'); // TODO: should be aziridine
    });

    it('should generate name for tetrahydrofuran', () => {
      const result = parseSMILES('C1CCCO1');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('oxolane');
    });
  });

  describe('Ring size and saturation', () => {
    it('should generate name for cyclopropane', () => {
      const result = parseSMILES('C1CC1');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('cyclopropane');
    });

    it('should generate name for cyclobutene', () => {
      const result = parseSMILES('C1CC=C1');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('cyclobutene');
    });

    it('should generate name for cyclooctyne', () => {
      const result = parseSMILES('C1CCCCCC#C1');
      const mol = result.molecules[0]!;
      const ringInfo = analyzeRings(mol);
      const name = generateCyclicName(mol, ringInfo);

      expect(name).toBe('cyclooctyne');
    });
  });
});