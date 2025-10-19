import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { kekulize } from 'src/utils/kekulize';
import type { Bond } from 'types';
import { BondType } from 'types';

describe('kekulize()', () => {
  describe('Simple Aromatic Rings', () => {
    it('should kekulize benzene to 3 single + 3 double bonds', () => {
      const parseResult = parseSMILES('c1ccccc1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const aromaticBonds = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      expect(aromaticBonds).toBe(6);
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      
      expect(singleBonds).toBe(3);
      expect(doubleBonds).toBe(3);
      expect(aromaticBondsAfter).toBe(0);
    });
    
    it('should kekulize pyridine (6-membered N-containing ring)', () => {
      const parseResult = parseSMILES('c1ccncc1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const aromaticBonds = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      expect(aromaticBonds).toBe(6);
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      
      expect(singleBonds).toBe(3);
      expect(doubleBonds).toBe(3);
      expect(aromaticBondsAfter).toBe(0);
    });
    
    it('should kekulize furan (5-membered O-containing ring)', () => {
      const parseResult = parseSMILES('c1ccoc1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      
      expect(singleBonds).toBe(3);
      expect(doubleBonds).toBe(2);
    });
    
    it('should kekulize pyrrole (5-membered N-H ring)', () => {
      const parseResult = parseSMILES('c1cc[nH]c1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      
      expect(singleBonds).toBe(3);
      expect(doubleBonds).toBe(2);
    });
    
    it('should kekulize thiophene (5-membered S-containing ring)', () => {
      const parseResult = parseSMILES('c1ccsc1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      
      expect(singleBonds).toBe(3);
      expect(doubleBonds).toBe(2);
    });
  });
  
  describe('Fused Aromatic Systems', () => {
    it('should kekulize naphthalene (two fused 6-rings)', () => {
      const parseResult = parseSMILES('c1ccc2ccccc2c1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      expect(molecule.bonds.length).toBe(11);
      
      const aromaticBonds = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      expect(aromaticBonds).toBe(11);
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      
      expect(singleBonds).toBe(6);
      expect(doubleBonds).toBe(5);
      expect(aromaticBondsAfter).toBe(0);
    });
    
    it('should kekulize anthracene (three fused 6-rings)', () => {
      const parseResult = parseSMILES('c1ccc2cc3ccccc3cc2c1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      expect(molecule.bonds.length).toBe(16);
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      
      expect(singleBonds).toBe(9);
      expect(doubleBonds).toBe(7);
      expect(aromaticBondsAfter).toBe(0);
    });
    
    it('should kekulize indole (5-ring fused to 6-ring with N-H)', () => {
      const parseResult = parseSMILES('c1ccc2[nH]ccc2c1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      
      expect(singleBonds).toBeGreaterThan(0);
      expect(doubleBonds).toBeGreaterThan(0);
      expect(aromaticBondsAfter).toBe(0);
    });
    
    it('should kekulize quinoline (6-ring fused to 6-ring with N)', () => {
      const parseResult = parseSMILES('c1ccc2ncccc2c1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      
      expect(singleBonds).toBe(6);
      expect(doubleBonds).toBe(5);
      expect(aromaticBondsAfter).toBe(0);
    });
  });
  
  describe('Exocyclic Constraints', () => {
    it('should handle benzoquinone (exocyclic C=O prevents certain patterns)', () => {
      const parseResult = parseSMILES('O=C1C=CC(=O)C=C1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      expect(doubleBonds).toBeGreaterThanOrEqual(2);
    });
    
    it('should handle phenol (exocyclic O-H)', () => {
      const parseResult = parseSMILES('Oc1ccccc1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const aromaticBonds = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      expect(aromaticBonds).toBe(6);
      
      const kekulized = kekulize(molecule);
      
      const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      
      expect(singleBonds).toBe(4);
      expect(doubleBonds).toBe(3);
      expect(aromaticBondsAfter).toBe(0);
    });
  });
  
  describe('Non-Aromatic Molecules', () => {
    it('should not modify ethane (no aromatic bonds)', () => {
      const parseResult = parseSMILES('CC');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      expect(kekulized.bonds.length).toBe(1);
      expect(kekulized.bonds[0]?.type).toBe(BondType.SINGLE);
    });
    
    it('should not modify ethene (no aromatic bonds)', () => {
      const parseResult = parseSMILES('C=C');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const kekulized = kekulize(molecule);
      
      expect(kekulized.bonds.length).toBe(1);
      expect(kekulized.bonds[0]?.type).toBe(BondType.DOUBLE);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle substituted benzene (toluene)', () => {
      const parseResult = parseSMILES('Cc1ccccc1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const aromaticBonds = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      expect(aromaticBonds).toBe(6);
      
      const kekulized = kekulize(molecule);
      
      const ringBonds = kekulized.bonds.slice(1);
      const singleBonds = ringBonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
      const doubleBonds = ringBonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
      
      expect(singleBonds).toBe(3);
      expect(doubleBonds).toBe(3);
    });
    
    it('should preserve original molecule (immutability)', () => {
      const parseResult = parseSMILES('c1ccccc1');
      expect(parseResult.errors).toEqual([]);
      const molecule = parseResult.molecules[0]!;
      
      const originalAromaticCount = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      expect(originalAromaticCount).toBe(6);
      
      kekulize(molecule);
      
      const stillAromaticCount = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
      expect(stillAromaticCount).toBe(6);
    });
  });
});
