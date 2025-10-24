import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'src/parsers/smiles-parser';
import { getRingInfo } from 'src/utils/ring-information';

describe('Ring Information API', () => {
  describe('getRingInfo', () => {
    it('should provide comprehensive ring information for benzene', () => {
      const result = parseSMILES('c1ccccc1');
      const mol = result.molecules[0]!;
      const ringInfo = getRingInfo(mol);

      expect(ringInfo.numRings()).toBe(1);
      expect(ringInfo.rings()).toEqual([[0, 1, 2, 3, 4, 5]]);
      expect(ringInfo.isAtomInRing(0)).toBe(true);
      expect(ringInfo.isBondInRing(0, 1)).toBe(true);
      expect(ringInfo.atomRingMembership(0)).toBe(1);
      expect(ringInfo.atomRings(0)).toEqual([[0, 1, 2, 3, 4, 5]]);
      expect(ringInfo.ringAtoms(0)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(ringInfo.ringBonds(0)).toEqual([
        { atom1: 0, atom2: 1 },
        { atom1: 1, atom2: 2 },
        { atom1: 2, atom2: 3 },
        { atom1: 3, atom2: 4 },
        { atom1: 4, atom2: 5 },
        { atom1: 5, atom2: 0 }
      ]);
    });

    it('should handle naphthalene (fused rings)', () => {
      const result = parseSMILES('c1ccc2ccccc2c1');
      const mol = result.molecules[0]!;
      const ringInfo = getRingInfo(mol);

      expect(ringInfo.numRings()).toBe(2);
      expect(ringInfo.rings()).toHaveLength(2);
      expect(ringInfo.isAtomInRing(0)).toBe(true);
      expect(ringInfo.isBondInRing(0, 1)).toBe(true);
    });

    it('should handle molecules with no rings', () => {
      const result = parseSMILES('CCO');
      const mol = result.molecules[0]!;
      const ringInfo = getRingInfo(mol);

      expect(ringInfo.numRings()).toBe(0);
      expect(ringInfo.rings()).toEqual([]);
      expect(ringInfo.isAtomInRing(0)).toBe(false);
      expect(ringInfo.isBondInRing(0, 1)).toBe(false);
    });

    it('should handle adamantane (complex polycyclic)', () => {
      const result = parseSMILES('C1C2CC3CC1CC(C2)C3');
      const mol = result.molecules[0]!;
      const ringInfo = getRingInfo(mol);

      expect(ringInfo.numRings()).toBe(3);
      expect(ringInfo.rings()).toHaveLength(3);

      // Check bridgehead atoms (should be in multiple rings)
      const bridgeheadMembership = ringInfo.atomRingMembership(3); // bridgehead
      expect(bridgeheadMembership).toBeGreaterThan(1);
    });
  });





  describe('Ring membership queries', () => {
    it('should handle ring size queries', () => {
      const result = parseSMILES('c1ccccc1');
      const mol = result.molecules[0]!;
      const ringInfo = getRingInfo(mol);

      expect(ringInfo.isAtomInRingOfSize(0, 6)).toBe(true);
      expect(ringInfo.isAtomInRingOfSize(0, 5)).toBe(false);
      expect(ringInfo.isBondInRingOfSize(0, 1, 6)).toBe(true);
      expect(ringInfo.isBondInRingOfSize(0, 1, 5)).toBe(false);
    });

    it('should handle bond ring queries', () => {
      const result = parseSMILES('c1ccccc1');
      const mol = result.molecules[0]!;
      const ringInfo = getRingInfo(mol);

      const bondRings = ringInfo.bondRings(0, 1);
      expect(bondRings).toEqual([[0, 1, 2, 3, 4, 5]]);
    });
  });
});