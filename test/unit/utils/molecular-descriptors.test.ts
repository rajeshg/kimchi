import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import {
  computeDescriptors,
  getAtomCount,
  getBondCount,
  getFormalCharge,
  getElementCounts,
  getHeavyAtomFraction,
} from 'src/utils/molecular-descriptors';

describe('molecular-descriptors', () => {
  describe('getAtomCount', () => {
    it('counts atoms in methane', () => {
      const result = parseSMILES('C');
      expect(result.errors).toEqual([]);
      expect(getAtomCount(result.molecules[0]!)).toBe(1);
    });

    it('counts atoms in ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getAtomCount(result.molecules[0]!)).toBe(3);
    });

    it('counts atoms in benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getAtomCount(result.molecules[0]!)).toBe(6);
    });
  });

  describe('getBondCount', () => {
    it('counts bonds in methane (no bonds)', () => {
      const result = parseSMILES('C');
      expect(result.errors).toEqual([]);
      expect(getBondCount(result.molecules[0]!)).toBe(0);
    });

    it('counts bonds in ethane', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toEqual([]);
      expect(getBondCount(result.molecules[0]!)).toBe(1);
    });

    it('counts bonds in ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getBondCount(result.molecules[0]!)).toBe(2);
    });

    it('counts bonds in benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getBondCount(result.molecules[0]!)).toBe(6);
    });
  });

  describe('getFormalCharge', () => {
    it('returns 0 for neutral molecules', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getFormalCharge(result.molecules[0]!)).toBe(0);
    });

    it('returns positive charge for cations', () => {
      const result = parseSMILES('[NH4+]');
      expect(result.errors).toEqual([]);
      expect(getFormalCharge(result.molecules[0]!)).toBe(1);
    });

    it('returns negative charge for anions', () => {
      const result = parseSMILES('[OH-]');
      expect(result.errors).toEqual([]);
      expect(getFormalCharge(result.molecules[0]!)).toBe(-1);
    });

    it('sums charges in zwitterions', () => {
      const result = parseSMILES('[NH3+]CC(=O)[O-]');
      expect(result.errors).toEqual([]);
      expect(getFormalCharge(result.molecules[0]!)).toBe(0);
    });
  });

  describe('getElementCounts', () => {
    it('counts elements in methane', () => {
      const result = parseSMILES('C');
      expect(result.errors).toEqual([]);
      const counts = getElementCounts(result.molecules[0]!);
      expect(counts).toEqual({ C: 1, H: 4 });
    });

    it('counts elements in ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      const counts = getElementCounts(result.molecules[0]!);
      expect(counts).toEqual({ C: 2, H: 6, O: 1 });
    });

    it('counts elements in benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      const counts = getElementCounts(result.molecules[0]!);
      expect(counts).toEqual({ C: 6, H: 6 });
    });

    it('counts elements in sulfuric acid', () => {
      const result = parseSMILES('OS(=O)(=O)O');
      expect(result.errors).toEqual([]);
      const counts = getElementCounts(result.molecules[0]!);
      expect(counts).toEqual({ O: 4, S: 1, H: 2 });
    });

    it('excludes implicit hydrogens when disabled', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      const counts = getElementCounts(result.molecules[0]!, { includeImplicitH: false });
      expect(counts).toEqual({ C: 2, O: 1 });
    });

    it('includes isotopes when enabled', () => {
      const result = parseSMILES('[13CH4]');
      expect(result.errors).toEqual([]);
      const counts = getElementCounts(result.molecules[0]!, { includeIsotopes: true });
      expect(counts).toEqual({ '13C': 1, H: 4 });
    });
  });

  describe('getHeavyAtomFraction', () => {
    it('returns 0.2 for methane (1 heavy atom, 5 total)', () => {
      const result = parseSMILES('C');
      expect(result.errors).toEqual([]);
      expect(getHeavyAtomFraction(result.molecules[0]!)).toBe(0.2);
    });

    it('returns 0.6 for ethanol (3 heavy atoms, 9 total)', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getHeavyAtomFraction(result.molecules[0]!)).toBe(3 / 9);
    });

    it('returns 0.5 for benzene (6 heavy atoms, 12 total)', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getHeavyAtomFraction(result.molecules[0]!)).toBe(6 / 12);
    });

    it('returns 0 for empty molecule', () => {
      const emptyMol = { atoms: [], bonds: [] };
      expect(getHeavyAtomFraction(emptyMol)).toBe(0);
    });
  });

  describe('computeDescriptors', () => {
    it('computes all basic descriptors for ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      const descriptors = computeDescriptors(result.molecules[0]!);

      expect(descriptors.atomCount).toBe(3);
      expect(descriptors.bondCount).toBe(2);
      expect(descriptors.formalCharge).toBe(0);
      expect(descriptors.elementCounts).toEqual({ C: 2, H: 6, O: 1 });
      expect(descriptors.heavyAtomFraction).toBe(3 / 9);
    });

    it('computes descriptors with options', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      const descriptors = computeDescriptors(result.molecules[0]!, {
        includeImplicitH: false,
        includeIsotopes: true,
      });

      expect(descriptors.atomCount).toBe(3);
      expect(descriptors.bondCount).toBe(2);
      expect(descriptors.formalCharge).toBe(0);
      expect(descriptors.elementCounts).toEqual({ C: 2, O: 1 });
      expect(descriptors.heavyAtomFraction).toBe(3 / 9);
    });
  });
});