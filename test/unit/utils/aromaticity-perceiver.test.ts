import { describe, it, expect } from 'vitest';
import { parseSMILES } from 'parser';
import { generateSMILES } from 'src/generators/smiles-generator';

describe('Aromaticity Perception', () => {
  describe('Basic aromatic systems', () => {
    it('should convert benzene Kekule to aromatic', () => {
      const result = parseSMILES('C1=CC=CC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccccc1');
    });

    it('should convert pyridine Kekule to aromatic', () => {
      const result = parseSMILES('N1=CC=CC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccncc1');
    });

    it('should convert pyrrole Kekule to aromatic', () => {
      const result = parseSMILES('C1=CNC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccnc1');
    });

    it('should convert furan Kekule to aromatic', () => {
      const result = parseSMILES('C1=COC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccoc1');
    });

    it('should convert thiophene Kekule to aromatic', () => {
      const result = parseSMILES('C1=CSC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccsc1');
    });

    it('should convert imidazole Kekule to aromatic', () => {
      const result = parseSMILES('C1=CN=CN1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1cncn1');
    });
  });

  describe('Fused aromatic systems', () => {
    it('should handle naphthalene', () => {
      const result = parseSMILES('c1ccc2ccccc2c1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccc2ccccc2c1');
    });

    it('should handle indole', () => {
      const result = parseSMILES('c1ccc2[nH]ccc2c1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccc2nccc2c1');
    });

    it('should handle quinoline', () => {
      const result = parseSMILES('c1ccc2cccnc2c1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c2c1ccccc1ncc2');
    });
  });

  describe('Substituted aromatics', () => {
    it('should convert phenol Kekule to aromatic', () => {
      const result = parseSMILES('OC1=CC=CC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('Oc1ccccc1');
    });

    it('should convert toluene Kekule to aromatic', () => {
      const result = parseSMILES('CC1=CC=CC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('Cc1ccccc1');
    });

    it('should convert aniline Kekule to aromatic', () => {
      const result = parseSMILES('NC1=CC=CC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('Nc1ccccc1');
    });

    it('should convert benzoic acid Kekule to aromatic', () => {
      const result = parseSMILES('C(=O)(O)C1=CC=CC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('O=C(O)c1ccccc1');
    });
  });

  describe('Non-aromatic rings', () => {
    it('should not convert cyclohexane to aromatic', () => {
      const result = parseSMILES('C1CCCCC1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('C1CCCCC1');
    });

    it('should not convert cyclohexene to aromatic', () => {
      const result = parseSMILES('C1=CCCCC1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('C1=CCCCC1');
    });

    it('should not convert cyclopentadiene to aromatic (4 pi electrons)', () => {
      const result = parseSMILES('C1=CC=CC1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('C=1C=CCC1');
    });
  });

  describe('Already aromatic input', () => {
    it('should preserve aromatic benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccccc1');
    });

    it('should preserve aromatic pyridine', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccncc1');
    });
  });

  describe('Mixed systems', () => {
    it('should handle biphenyl with aromatic conversion', () => {
      const result = parseSMILES('C1=CC=C(C=C1)C2=CC=CC=C2');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1ccc(cc1)-c2ccccc2');
    });

    it('should handle phenylcyclohexane (mixed aromatic/aliphatic)', () => {
      const result = parseSMILES('C1CCCCC1C2=CC=CC=C2');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('C1CCC(CC1)c2ccccc2');
    });
  });

  describe('Six-membered heterocycles', () => {
    it('should convert pyrimidine Kekule to aromatic', () => {
      const result = parseSMILES('C1=CN=CN=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1cncnc1');
    });

    it('should convert pyrazine Kekule to aromatic', () => {
      const result = parseSMILES('C1=NC=NC=C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('c1cncnc1');
    });
  });
});
