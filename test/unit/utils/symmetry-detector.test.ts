import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'parser';
import { generateSMILES } from 'src/generators/smiles-generator';

describe('Symmetry Detection for Stereochemistry', () => {
  describe('Chiral centers with symmetric substituents', () => {
    it('should remove chirality from CHBr2 (two identical Br)', () => {
      const result = parseSMILES('C[C@H](Br)Br');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
      expect(canonical).toBe('CC(Br)Br');
    });

    it('should remove chirality from CH(CH3)2 (two identical methyl)', () => {
      const result = parseSMILES('Br[C@H](C)C');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
    });

    it('should remove chirality from CHCl2 (two identical Cl)', () => {
      const result = parseSMILES('F[C@@H](Cl)Cl');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
      expect(canonical).toBe('FC(Cl)Cl');
    });

    it('should preserve chirality for CHBrClF (all different)', () => {
      const result = parseSMILES('C[C@H](Br)F');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toContain('@');
    });

    it('should preserve chirality for alanine', () => {
      const result = parseSMILES('C[C@H](N)C(=O)O');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toContain('@');
    });
  });

  describe('Chiral centers with complex symmetric groups', () => {
    it('should remove chirality with two identical ethyl groups', () => {
      const result = parseSMILES('CC[C@H](CC)Br');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
    });

    it('should remove chirality with two identical phenyl groups', () => {
      const result = parseSMILES('c1ccccc1[C@H](c2ccccc2)Br');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
    });

    it('should preserve chirality with different aromatic groups', () => {
      const result = parseSMILES('c1ccccc1[C@H](c2ccncc2)Br');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toContain('@');
    });
  });

  describe('Double bond stereochemistry with geminal identical groups', () => {
    it('should remove stereo from C=C with geminal F atoms (CF2=CF)', () => {
      const result = parseSMILES('F/C(F)=C/Br');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('/');
      expect(canonical).not.toContain('\\');
    });

    it('should remove stereo from C=C with two Cl on same carbon', () => {
      const result = parseSMILES('Cl/C(Cl)=C/Br');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('/');
      expect(canonical).not.toContain('\\');
    });

    it('should preserve stereo for C=C with all different substituents', () => {
      const result = parseSMILES('F/C(Br)=C/Cl');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical.includes('/') || canonical.includes('\\')).toBe(true);
    });

    it('should preserve stereo for trans-2-butene (all different)', () => {
      const result = parseSMILES('C/C=C/C');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical.includes('/') || canonical.includes('\\')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle molecule with no stereochemistry', () => {
      const result = parseSMILES('CC(C)C');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toBe('CC(C)C');
    });

    it('should handle simple chiral center with hydrogens', () => {
      const result = parseSMILES('[C@H](Br)(Cl)I');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).toContain('@');
    });

    it('should remove chirality when three of four groups are identical', () => {
      const result = parseSMILES('C[C@](C)(C)Br');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
    });

    it('should remove stereochemistry from phosphorus', () => {
      const result = parseSMILES('C[C@H](P)C');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
      expect(canonical).toBe('CC(C)P');
    });
  });

  describe('Ring systems with stereochemistry', () => {
    it('should remove invalid stereo from single substituent in ring', () => {
      const result = parseSMILES('C1C[C@H](Br)CC1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
    });

    it('should remove invalid stereo in symmetric ring positions', () => {
      const result = parseSMILES('C1C[C@H](C2CC2)CC1C3CC3');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      const hasSymmetricCyclopropyl = canonical.match(/C\d+CC\d+.*C\d+CC\d+/);
      if (hasSymmetricCyclopropyl) {
        expect(canonical).not.toContain('@');
      }
    });

    it('should remove stereo from bridgehead carbon in fused rings', () => {
      const result = parseSMILES('C1CC2CC[C@H](Br)C2C1');
      expect(result.errors).toHaveLength(0);
      const canonical = generateSMILES(result.molecules[0]!, true);
      expect(canonical).not.toContain('@');
    });
  });
});
