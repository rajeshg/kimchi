import { describe, test, expect } from 'bun:test';
import { IUPACNamer } from '../../../src/iupac-engine/index';

/**
 * Test P-2 Parent Hydride Rules
 *
 * Tests for IUPAC Blue Book P-2.1: Heteroatom parent hydrides
 * and P-2.2: Carbon parent hydrides (alkanes)
 */

describe('P-2 Parent Hydride Rules', () => {
  const namer = new IUPACNamer();

  describe('P-2.1 Heteroatom Parent Hydrides', () => {

    test('silane (SiH4)', () => {
      const result = namer.generateNameFromSMILES('[SiH4]');
      expect(result.name).toBe('silane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('phosphine (PH3)', () => {
      const result = namer.generateNameFromSMILES('[PH3]');
      expect(result.name).toBe('phosphine');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('arsine (AsH3)', () => {
      const result = namer.generateNameFromSMILES('[AsH3]');
      expect(result.name).toBe('arsine');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('stibine (SbH3)', () => {
      const result = namer.generateNameFromSMILES('[SbH3]');
      expect(result.name).toBe('stibine');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('bismuthine (BiH3)', () => {
      const result = namer.generateNameFromSMILES('[BiH3]');
      expect(result.name).toBe('bismuthine');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('germane (GeH4)', () => {
      const result = namer.generateNameFromSMILES('[GeH4]');
      expect(result.name).toBe('germane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('stannane (SnH4)', () => {
      const result = namer.generateNameFromSMILES('[SnH4]');
      expect(result.name).toBe('stannane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

     test('plumbane (PbH4)', () => {
       const result = namer.generateNameFromSMILES('[PbH4]');
       expect(result.name).toBe('plumbane');
       expect(result.confidence).toBeGreaterThan(0.8);
     });

     test('ethylsilane ([SiH3]CC)', () => {
       const result = namer.generateNameFromSMILES('[SiH3]CC');
       expect(result.name).toBe('ethylsilane');
       expect(result.confidence).toBeGreaterThan(0.8);
     });

     test('methylphosphine ([PH2]C)', () => {
       const result = namer.generateNameFromSMILES('[PH2]C');
       expect(result.name).toBe('methylphosphine');
       expect(result.confidence).toBeGreaterThan(0.8);
     });

     test('ethylgermane ([GeH3]CC)', () => {
       const result = namer.generateNameFromSMILES('[GeH3]CC');
       expect(result.name).toBe('ethylgermane');
       expect(result.confidence).toBeGreaterThan(0.8);
     });

     test('methylsilane ([SiH3]C)', () => {
       const result = namer.generateNameFromSMILES('[SiH3]C');
       expect(result.name).toBe('methylsilane');
       expect(result.confidence).toBeGreaterThan(0.8);
     });

    test('should not apply to molecules with multiple heteroatoms', () => {
      // SiH3-PH2 should not use parent hydride rules
      const result = namer.generateNameFromSMILES('[SiH3][PH2]');
      expect(result.name).not.toBe('silane');
      expect(result.name).not.toBe('phosphine');
    });

  });

  describe('P-2.2 Carbon Parent Hydrides (Alkanes)', () => {

    test('methane (CH4)', () => {
      const result = namer.generateNameFromSMILES('C');
      expect(result.name).toBe('methane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('ethane (C2H6)', () => {
      const result = namer.generateNameFromSMILES('CC');
      expect(result.name).toBe('ethane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('propane (C3H8)', () => {
      const result = namer.generateNameFromSMILES('CCC');
      expect(result.name).toBe('propane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('butane (C4H10)', () => {
      const result = namer.generateNameFromSMILES('CCCC');
      expect(result.name).toBe('butane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should not apply to unsaturated molecules', () => {
      // Ethene should not be named as ethane
      const result = namer.generateNameFromSMILES('C=C');
      expect(result.name).toBe('ethene');
      expect(result.name).not.toBe('ethane');
    });

    test('should not apply to molecules with functional groups', () => {
      // Methanol should not be named as methane
      const result = namer.generateNameFromSMILES('CO');
      expect(result.name).toBe('methanol');
      expect(result.name).not.toBe('methane');
    });

  });

  describe('Rule Priority and Execution', () => {

    test('heteroatom rules have higher priority than carbon rules', () => {
      // Test that SiH4 is named silane, not some carbon-based name
      const result = namer.generateNameFromSMILES('[SiH4]');
      expect(result.name).toBe('silane');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('rules only apply to simple hydride molecules', () => {
      // Benzene should not trigger parent hydride rules
      const result = namer.generateNameFromSMILES('c1ccccc1');
      expect(result.name).toBe('benzene');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

  });

});