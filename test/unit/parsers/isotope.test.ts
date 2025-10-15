import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { generateSMILES } from 'src/generators/smiles-generator';

describe('Isotope Support', () => {
  describe('Parsing isotopes', () => {
    it('should parse carbon-13', () => {
      const result = parseSMILES('[13C]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('C');
      expect(atom.isotope).toBe(13);
      expect(atom.atomicNumber).toBe(6);
    });

    it('should parse deuterium (hydrogen-2)', () => {
      const result = parseSMILES('[2H]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('H');
      expect(atom.isotope).toBe(2);
      expect(atom.atomicNumber).toBe(1);
    });

    it('should parse tritium (hydrogen-3)', () => {
      const result = parseSMILES('[3H]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('H');
      expect(atom.isotope).toBe(3);
    });

    it('should parse uranium-238', () => {
      const result = parseSMILES('[238U]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('U');
      expect(atom.isotope).toBe(238);
      expect(atom.atomicNumber).toBe(92);
    });

    it('should parse isotopes with hydrogens', () => {
      const result = parseSMILES('[13CH4]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('C');
      expect(atom.isotope).toBe(13);
      expect(atom.hydrogens).toBe(4);
    });

    it('should parse isotopes with charge', () => {
      const result = parseSMILES('[2H+]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('H');
      expect(atom.isotope).toBe(2);
      expect(atom.charge).toBe(1);
    });

    it('should parse isotopes in molecules', () => {
      const result = parseSMILES('[13C]C([2H])([2H])C');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(5);
      expect(mol.atoms[0]!.isotope).toBe(13);
      expect(mol.atoms[1]!.isotope).toBe(null);
      expect(mol.atoms[2]!.isotope).toBe(2);
      expect(mol.atoms[3]!.isotope).toBe(2);
      expect(mol.atoms[4]!.isotope).toBe(null);
    });

    it('should parse aromatic isotopes', () => {
      const result = parseSMILES('[13c]1ccccc1');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(6);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('C');
      expect(atom.isotope).toBe(13);
      expect(atom.aromatic).toBe(true);
    });

    it('should handle complex isotope notations', () => {
      const result = parseSMILES('[13CH2@:1](C)(O)');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(3);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('C');
      expect(atom.isotope).toBe(13);
      expect(atom.hydrogens).toBe(2);
      expect(atom.chiral).toBe('@');
      expect(atom.atomClass).toBe(1);
    });

    it('should parse three-digit isotopes', () => {
      const result = parseSMILES('[235U]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe('U');
      expect(atom.isotope).toBe(235);
    });
  });

  describe('Generating isotopes', () => {
    it('should generate carbon-13', () => {
      const result = parseSMILES('[13C]');
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe('[13C]');
    });

    it('should generate deuterium', () => {
      const result = parseSMILES('[2H]');
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe('[2H]');
    });

    it('should generate isotopes in molecules', () => {
      const result = parseSMILES('[13C]CC');
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toContain('[13C]');
    });

    it('should generate aromatic isotopes', () => {
      const result = parseSMILES('[13c]1ccccc1');
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toContain('[13c]');
    });

    it('should omit isotope for regular atoms', () => {
      const result = parseSMILES('C');
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe('C');
      expect(smiles).not.toContain('[');
    });
  });

  describe('Round-trip isotopes', () => {
    it('should round-trip carbon-13 methane', () => {
      const input = '[13CH4]';
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);
      expect(result2.molecules[0]!.atoms[0]!.isotope).toBe(13);
    });

    it('should round-trip deuterated ethane', () => {
      const input = '[2H]C([2H])([2H])C([2H])([2H])[2H]';
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);
      
      const deuteriumCount = result2.molecules[0]!.atoms.filter(a => a.isotope === 2).length;
      expect(deuteriumCount).toBe(6);
    });

    it('should round-trip mixed isotopes', () => {
      const input = '[13C]C([2H])C';
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);
      
      const atoms = result2.molecules[0]!.atoms;
      const hasC13 = atoms.some(a => a.isotope === 13);
      const hasH2 = atoms.some(a => a.isotope === 2);
      expect(hasC13).toBe(true);
      expect(hasH2).toBe(true);
    });

    it('should round-trip aromatic isotope', () => {
      const input = '[13c]1ccccc1';
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);
      
      const c13Atom = result2.molecules[0]!.atoms.find(a => a.isotope === 13);
      expect(c13Atom).toBeDefined();
      expect(c13Atom!.aromatic).toBe(true);
    });
  });

  describe('Isotopes with stereochemistry', () => {
    it('should parse isotopes with chirality', () => {
      const result = parseSMILES('[13C@H](Cl)(Br)F');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.isotope).toBe(13);
      expect(atom.chiral).toBe('@');
    });

    it('should round-trip isotopes with chirality', () => {
      const input = '[13C@H](Cl)(Br)F';
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);
      
      const chiralAtom = result2.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralAtom).toBeDefined();
      expect(chiralAtom!.isotope).toBe(13);
    });
  });

  describe('Edge cases', () => {
    it('should handle isotope 0', () => {
      const result = parseSMILES('[0C]');
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms[0]!.isotope).toBe(0);
    });

    it('should distinguish regular vs isotope', () => {
      const result = parseSMILES('C.[13C]');
      expect(result.errors).toEqual([]);
      const mols = result.molecules;
      expect(mols).toHaveLength(2);
      expect(mols[0]!.atoms[0]!.isotope).toBe(null);
      expect(mols[1]!.atoms[0]!.isotope).toBe(13);
    });
  });
});
