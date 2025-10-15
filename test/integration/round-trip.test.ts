import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'parser';
import { generateSMILES } from 'src/generators/smiles-generator';
import { BondType } from 'types';
import type { Bond } from 'types';

describe('Quick Wins - Already Supported Features', () => {
  describe('Wildcard atom *', () => {
    it('should parse single wildcard atom', () => {
      const result = parseSMILES('*');
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      expect(mol.atoms[0]!.symbol).toBe('*');
    });

    it('should parse wildcard in chain', () => {
      const result = parseSMILES('C*C');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(3);
      expect(mol.atoms[1]!.symbol).toBe('*');
    });

    it('should parse wildcard in ring', () => {
      const result = parseSMILES('C1CC*1');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(4);
      expect(mol.atoms[3]!.symbol).toBe('*');
    });

    it('should parse wildcard with explicit bonds', () => {
      const result = parseSMILES('C-*=C');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(3);
      expect(mol.bonds[0]!.type).toBe(BondType.SINGLE);
      expect(mol.bonds[1]!.type).toBe(BondType.DOUBLE);
    });

    it('should round-trip wildcard atoms', () => {
      const smiles = 'C*C';
      const parsed = parseSMILES(smiles);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const mol = reparsed.molecules[0]!;
      expect(mol.atoms).toHaveLength(3);
    });
  });

  describe('Explicit single bonds between aromatic atoms', () => {
    it('should parse aromatic rings connected with explicit single bond', () => {
      const result = parseSMILES('c1ccccc1-c2ccccc2');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(12);
      const bond = mol.bonds.find((b: Bond) =>
        (b.atom1 === 5 && b.atom2 === 6) ||
        (b.atom1 === 6 && b.atom2 === 5)
      );
      expect(bond?.type).toBe(BondType.SINGLE);
    });

    it('should parse aromatic chains with explicit single bonds', () => {
      const result = parseSMILES('C-C-C-C');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(4);
      mol.bonds.forEach((bond: Bond) => {
        expect(bond.type).toBe(BondType.SINGLE);
      });
    });

    it('should parse mixed aromatic with explicit single bonds', () => {
      const result = parseSMILES('c1ccccc1-n2cccc2');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(11);
    });

    it('should distinguish single vs aromatic bonds', () => {
      const result = parseSMILES('c1ccccc1c2ccccc2');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const bond = mol.bonds.find((b: Bond) =>
        (b.atom1 === 5 && b.atom2 === 6) ||
        (b.atom1 === 6 && b.atom2 === 5)
      );
      expect(bond?.type).toBe(BondType.AROMATIC);
    });
  });

  describe('Ring-closure digit 0', () => {
    it('should parse ring with closure digit 0', () => {
      const result = parseSMILES('C0CCCCC0');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(6);
      expect(mol.bonds).toHaveLength(6);
      const ringBond = mol.bonds.find((b: Bond) =>
        (b.atom1 === 0 && b.atom2 === 5) ||
        (b.atom1 === 5 && b.atom2 === 0)
      );
      expect(ringBond).toBeDefined();
    });

    it('should parse multiple rings using 0', () => {
      const result = parseSMILES('C0CCCC0C1CCCC1');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(10);
    });

    it('should parse 0 with explicit bond', () => {
      const result = parseSMILES('C=0CCCC0');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(5);
      const ringBond = mol.bonds.find((b: Bond) =>
        (b.atom1 === 0 && b.atom2 === 4) ||
        (b.atom1 === 4 && b.atom2 === 0)
      );
      expect(ringBond?.type).toBe(BondType.DOUBLE);
    });

    it('should round-trip structures with 0', () => {
      const smiles = 'C0CCCCC0';
      const parsed = parseSMILES(smiles);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const mol = reparsed.molecules[0]!;
      expect(mol.atoms).toHaveLength(6);
      expect(mol.bonds).toHaveLength(6);
    });
  });

  describe('Two-digit ring numbers with %', () => {
    it('should parse %10 ring closure', () => {
      const result = parseSMILES('C%10CCCCC%10');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(6);
      expect(mol.bonds).toHaveLength(6);
    });

    it('should parse %99 ring closure', () => {
      const result = parseSMILES('C%99CCCCC%99');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(6);
    });

    it('should parse multiple two-digit ring closures', () => {
      const result = parseSMILES('C%10CCCC%10C%11CCCC%11');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(10);
    });

    it('should parse mixed single and two-digit closures', () => {
      const result = parseSMILES('C1CC%10CCC1CC%10');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(8);
    });

    it('should parse %nn with explicit bonds', () => {
      const result = parseSMILES('C=%10CCCC%10');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const ringBond = mol.bonds.find((b: Bond) =>
        (b.atom1 === 0 && b.atom2 === 4) ||
        (b.atom1 === 4 && b.atom2 === 0)
      );
      expect(ringBond?.type).toBe(BondType.DOUBLE);
    });

    it('should handle complex structures with %nn', () => {
      const result = parseSMILES('C%12CC%11CC%10CCC%10C%11C%12');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(10);
    });

    it('should round-trip two-digit ring closures', () => {
      const smiles = 'C%10CCCCC%10';
      const parsed = parseSMILES(smiles);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const mol = reparsed.molecules[0]!;
      expect(mol.atoms).toHaveLength(6);
    });
  });

  describe('Combined quick wins', () => {
    it('should handle wildcard with two-digit ring closure', () => {
      const result = parseSMILES('*%10CCC%10');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms[0]!.symbol).toBe('*');
    });

    it('should handle aromatic with digit 0', () => {
      const result = parseSMILES('c0ccccc0');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(6);
    });

    it('should handle all features together', () => {
      const result = parseSMILES('*%10c0cccc0-c1ccccc1%10');
      expect(result.errors).toEqual([]);
    });
  });
});
