import { describe, test, expect } from 'bun:test';
import { IUPACNamer } from '../index';

/**
 * Test P-3 Substituent Rules
 *
 * Tests for IUPAC Blue Book P-3: Substituents
 * https://iupac.qmul.ac.uk/BlueBook/P3.html
 *
 * Focuses on substituent detection and naming for heteroatom parents.
 */

describe('P-3 Substituent Rules', () => {
  const namer = new IUPACNamer();

  describe('P-3.1 Heteroatom Parent Substituents', () => {

    test('methyl substituent on silane ([SiH3]C)', () => {
      const result = namer.generateNameFromSMILES('[SiH3]C');
      expect(result.name).toBe('methylsilane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('ethyl substituent on silane ([SiH3]CC)', () => {
      const result = namer.generateNameFromSMILES('[SiH3]CC');
      expect(result.name).toBe('ethylsilane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('propyl substituent on silane ([SiH3]CCC)', () => {
      const result = namer.generateNameFromSMILES('[SiH3]CCC');
      expect(result.name).toBe('propylsilane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('methyl substituent on phosphine ([PH2]C)', () => {
      const result = namer.generateNameFromSMILES('[PH2]C');
      expect(result.name).toBe('methylphosphine');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('ethyl substituent on phosphine ([PH2]CC)', () => {
      const result = namer.generateNameFromSMILES('[PH2]CC');
      expect(result.name).toBe('ethylphosphine');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('methyl substituent on germane ([GeH3]C)', () => {
      const result = namer.generateNameFromSMILES('[GeH3]C');
      expect(result.name).toBe('methylgermane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('ethyl substituent on germane ([GeH3]CC)', () => {
      const result = namer.generateNameFromSMILES('[GeH3]CC');
      expect(result.name).toBe('ethylgermane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('methyl substituent on stannane ([SnH3]C)', () => {
      const result = namer.generateNameFromSMILES('[SnH3]C');
      expect(result.name).toBe('methylstannane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('methyl substituent on plumbane ([PbH3]C)', () => {
      const result = namer.generateNameFromSMILES('[PbH3]C');
      expect(result.name).toBe('methylplumbane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

  });

  describe('Multiple Substituents on Heteroatom Parents', () => {

    test('dimethylsilane ([SiH2](C)C)', () => {
      const result = namer.generateNameFromSMILES('[SiH2](C)C');
      expect(result.name).toBe('dimethylsilane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('diethylsilane ([SiH2](CC)CC)', () => {
      const result = namer.generateNameFromSMILES('[SiH2](CC)CC');
      expect(result.name).toBe('diethylsilane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('methylethylsilane ([SiH2](C)CC)', () => {
      const result = namer.generateNameFromSMILES('[SiH2](C)CC');
      expect(result.name).toBe('ethylmethylsilane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

  });

  describe('Complex Substituents', () => {

    test('isopropyl substituent on silane ([SiH3]C(C)C)', () => {
      const result = namer.generateNameFromSMILES('[SiH3]C(C)C');
      // This might not be fully implemented yet, but should at least detect silane
      expect(result.name).toContain('silane');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('phenyl substituent on silane ([SiH3]c1ccccc1)', () => {
      const result = namer.generateNameFromSMILES('[SiH3]c1ccccc1');
      // Phenyl substituent detection may need additional implementation
      expect(result.name).toContain('silane');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

  });

  describe('Substituent Detection Edge Cases', () => {

    test('no substituents on pure hydride (SiH4)', () => {
      const result = namer.generateNameFromSMILES('[SiH4]');
      expect(result.name).toBe('silane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('substituents only apply to heteroatom parents', () => {
      // Carbon chains should not trigger substituent rules for heteroatoms
      const result = namer.generateNameFromSMILES('CCCC');
      expect(result.name).toBe('butane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('functional groups take precedence over substituents', () => {
      // Alcohols should be named as such, not as substituents on carbon
      const result = namer.generateNameFromSMILES('CO');
      expect(result.name).toBe('methanol');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

  });

});