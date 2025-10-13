import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES } from '../index';
import { BondType } from '../types';

describe('Comprehensive SMILES Tests', () => {
  describe('Charged Atoms', () => {
    it('handles negatively charged oxygen with explicit H', () => {
      const result = parseSMILES('[OH-]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.charge).toBe(-1);
      expect(result.molecules[0]!.atoms[0]!!.hydrogens).toBe(1);
    });

    it('handles negatively charged oxygen without explicit H', () => {
      const result = parseSMILES('[O-]C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.charge).toBe(-1);
      expect(result.molecules[0]!.atoms[0]!!.hydrogens).toBe(0);
    });

    it('handles positively charged nitrogen NH4+', () => {
      const result = parseSMILES('[NH4+]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.charge).toBe(1);
      expect(result.molecules[0]!.atoms[0]!!.hydrogens).toBe(4);
    });

    it('handles carboxylate anion', () => {
      const result = parseSMILES('[O-]C=O');
      expect(result.errors).toHaveLength(0);
      const oxygens = result.molecules[0]!.atoms.filter(a => a.symbol === 'O');
      expect(oxygens).toHaveLength(2);
      expect(oxygens.some(o => o.charge === -1)).toBe(true);
      expect(oxygens.some(o => o.charge === 0)).toBe(true);
    });

    it('handles ammonium cation', () => {
      const result = parseSMILES('C[NH3+]');
      expect(result.errors).toHaveLength(0);
      const nitrogen = result.molecules[0]!.atoms.find(a => a.symbol === 'N');
      expect(nitrogen?.charge).toBe(1);
      expect(nitrogen?.hydrogens).toBe(3);
    });

    it('handles multiple charges', () => {
      const result = parseSMILES('[O--]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.charge).toBe(-2);
    });

    it('handles carbocation', () => {
      const result = parseSMILES('CC[C+]CC');
      expect(result.errors).toHaveLength(0);
      const carbon = result.molecules[0]!.atoms.find(a => a.id === 2);
      expect(carbon?.charge).toBe(1);
    });
  });

  describe('Bond Types', () => {
    it('handles single bonds', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(1);
      expect(result.molecules[0]!.bonds![0]!.type).toBe(BondType.SINGLE);
    });

    it('handles double bonds', () => {
      const result = parseSMILES('C=C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!!.bonds![0]!.type).toBe(BondType.DOUBLE);
    });

    it('handles triple bonds', () => {
      const result = parseSMILES('C#C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!!.bonds![0]!.type).toBe(BondType.TRIPLE);
    });

    it('handles quadruple bonds', () => {
      const result = parseSMILES('C$C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!!.bonds![0]!.type).toBe(BondType.QUADRUPLE);
    });

    it('handles aromatic bonds', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.bonds.some(b => b.type === 'aromatic')).toBe(true);
    });

    it('handles mixed bond types', () => {
      const result = parseSMILES('C=CC#N');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!!.bonds![0]!.type).toBe(BondType.DOUBLE);
      expect(result.molecules[0]!!.bonds![2]!.type).toBe(BondType.TRIPLE);
    });
  });

  describe('Branching', () => {
    it('handles simple branches', () => {
      const result = parseSMILES('CC(C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(4);
      expect(result.molecules[0]!.bonds).toHaveLength(3);
    });

    it('handles nested branches', () => {
      const result = parseSMILES('CC(C(C)C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
    });

    it('handles multiple branches on same atom', () => {
      const result = parseSMILES('CC(C)(C)C');
      expect(result.errors).toHaveLength(0);
      const centerCarbon = result.molecules[0]!.atoms.find(a => a.id === 1);
      const bonds = result.molecules[0]!.bonds.filter(
        b => b.atom1 === 1 || b.atom2 === 1
      );
      expect(bonds).toHaveLength(4);
    });
  });

  describe('Ring Closures', () => {
    it('handles simple ring', () => {
      const result = parseSMILES('C1CCCCC1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
      expect(result.molecules[0]!.bonds).toHaveLength(6);
    });

    it('handles aromatic ring', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
      expect(result.molecules[0]!.bonds).toHaveLength(6);
    });

    it('handles fused rings', () => {
      const result = parseSMILES('C1CC2CCCC2CC1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(9);
    });

    it('handles spiro rings', () => {
      const result = parseSMILES('C12(CCCC1)CCCC2');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(9);
    });

    it('handles ring with double bond', () => {
      const result = parseSMILES('C1=CCCCC1');
      expect(result.errors).toHaveLength(0);
      const doubleBond = result.molecules[0]!.bonds.find(b => b.type === 'double');
      expect(doubleBond).toBeDefined();
    });

    it('handles two-digit ring numbers', () => {
      const result = parseSMILES('C%10CCCCC%10');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
      expect(result.molecules[0]!.bonds).toHaveLength(6);
    });
  });

  describe('Stereochemistry', () => {
    it('handles chiral center @', () => {
      const result = parseSMILES('C[C@H](O)N');
      expect(result.errors).toHaveLength(0);
      const chiralCarbon = result.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon?.chiral).toBe('@');
    });

    it('handles chiral center @@', () => {
      const result = parseSMILES('C[C@@H](O)N');
      expect(result.errors).toHaveLength(0);
      const chiralCarbon = result.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon?.chiral).toBe('@@');
    });

    it('handles extended chirality TH1/TH2', () => {
      const result1 = parseSMILES('C[C@TH1H](O)N');
      expect(result1.errors).toHaveLength(0);
      const chiralCarbon1 = result1.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon1?.chiral).toBe('@TH1');

      const result2 = parseSMILES('C[C@TH2H](O)N');
      expect(result2.errors).toHaveLength(0);
      const chiralCarbon2 = result2.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon2?.chiral).toBe('@TH2');
    });

    it('handles extended chirality in brackets', () => {
      const result1 = parseSMILES('C[CH@TH1](O)N');
      expect(result1.errors).toHaveLength(0);
      const chiralCarbon1 = result1.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon1?.chiral).toBe('@TH1');

      const result2 = parseSMILES('C[CH@AL1](O)N');
      expect(result2.errors).toHaveLength(0);
      const chiralCarbon2 = result2.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon2?.chiral).toBe('@AL1');
    });

    it('handles extended chirality AL1/AL2', () => {
      const result1 = parseSMILES('[C@AL1](C)(O)N');
      expect(result1.errors).toHaveLength(0);
      const chiralCarbon1 = result1.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon1?.chiral).toBe('@AL1');

      const result2 = parseSMILES('[C@AL2](C)(O)N');
      expect(result2.errors).toHaveLength(0);
      const chiralCarbon2 = result2.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralCarbon2?.chiral).toBe('@AL2');
    });

    it('handles extended chirality SP1/SP2/SP3', () => {
      const result1 = parseSMILES('[Pt@SP1](Cl)(Br)(I)F');
      expect(result1.errors).toHaveLength(0);
      const chiralPt1 = result1.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralPt1?.chiral).toBe('@SP1');

      const result2 = parseSMILES('[Pt@SP2](Cl)(Br)(I)F');
      expect(result2.errors).toHaveLength(0);
      const chiralPt2 = result2.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralPt2?.chiral).toBe('@SP2');

      const result3 = parseSMILES('[Pt@SP3](Cl)(Br)(I)F');
      expect(result3.errors).toHaveLength(0);
      const chiralPt3 = result3.molecules[0]!.atoms.find(a => a.chiral);
      expect(chiralPt3?.chiral).toBe('@SP3');
    });

    it('handles E/Z double bond stereo /', () => {
      const result = parseSMILES('F/C=C/F');
      expect(result.errors).toHaveLength(0);
      const stereoBonds = result.molecules[0]!.bonds.filter(
        b => b.stereo && b.stereo !== 'none'
      );
      expect(stereoBonds.length).toBeGreaterThan(0);
    });

    it('handles E/Z double bond stereo \\', () => {
      const result = parseSMILES('F\\C=C\\F');
      expect(result.errors).toHaveLength(0);
      const stereoBonds = result.molecules[0]!.bonds.filter(
        b => b.stereo && b.stereo !== 'none'
      );
      expect(stereoBonds.length).toBeGreaterThan(0);
    });
  });

  describe('Disconnected Structures', () => {
    it('handles simple disconnected molecules', () => {
      const result = parseSMILES('CC.O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(2);
      expect(result.molecules[0]!.atoms).toHaveLength(2);
      expect(result.molecules[1]!.atoms).toHaveLength(1);
    });

    it('handles multiple disconnected molecules', () => {
      const result = parseSMILES('C.O.N');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(3);
    });

    it('handles complex disconnected structures', () => {
      const result = parseSMILES('c1ccccc1.CC(=O)O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(2);
    });
  });

  describe('Isotopes', () => {
    it('handles deuterium', () => {
      const result = parseSMILES('[2H]C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.isotope).toBe(2);
    });

    it('handles explicit hydrogen atoms', () => {
      // Molecular hydrogen
      const result1 = parseSMILES('[H][H]');
      expect(result1.errors).toHaveLength(0);
      expect(result1.molecules[0]!.atoms).toHaveLength(2);
      expect(result1.molecules[0]!.atoms[0]!.symbol).toBe('H');
      expect(result1.molecules[0]!.atoms[1]!.symbol).toBe('H');

      // Deuterium
      const result2 = parseSMILES('[2H][2H]');
      expect(result2.errors).toHaveLength(0);
      expect(result2.molecules[0]!.atoms[0]!!.isotope).toBe(2);
      expect(result2.molecules[0]!.atoms[1]!!.isotope).toBe(2);

      // Tritium
      const result3 = parseSMILES('[3H]C');
      expect(result3.errors).toHaveLength(0);
      expect(result3.molecules[0]!.atoms[0]!!.isotope).toBe(3);

      // Charged hydrogen
      const result4 = parseSMILES('[H+]');
      expect(result4.errors).toHaveLength(0);
      expect(result4.molecules[0]!.atoms[0]!.charge).toBe(1);

      // Deuterium ion
      const result5 = parseSMILES('[2H+]');
      expect(result5.errors).toHaveLength(0);
      expect(result5.molecules[0]!.atoms[0]!!.isotope).toBe(2);
      expect(result5.molecules[0]!.atoms[0]!.charge).toBe(1);
    });

    it('handles carbon-13', () => {
      const result = parseSMILES('[13C]C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.isotope).toBe(13);
    });

    it('handles isotopes with charges', () => {
      const result = parseSMILES('[18OH-]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.isotope).toBe(18);
      expect(result.molecules[0]!.atoms[0]!.charge).toBe(-1);
    });
  });

  describe('Hydrogen Calculation', () => {
    it('calculates hydrogens for neutral carbon', () => {
      const result = parseSMILES('C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(4);
    });

    it('calculates hydrogens for methylene', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(3);
    });

    it('calculates hydrogens for quaternary carbon', () => {
      const result = parseSMILES('CC(C)(C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[1]!.hydrogens).toBe(0);
    });

    it('calculates hydrogens for nitrogen', () => {
      const result = parseSMILES('N');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(3);
    });

    it('calculates hydrogens for oxygen', () => {
      const result = parseSMILES('O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(2);
    });

    it('calculates hydrogens for double bonded carbon', () => {
      const result = parseSMILES('C=C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(2);
    });

    it('calculates hydrogens for triple bonded carbon', () => {
      const result = parseSMILES('C#C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(1);
    });

    it('respects explicit hydrogen count', () => {
      const result = parseSMILES('[CH2]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(2);
    });

    it('handles explicit H0', () => {
      const result = parseSMILES('[CH0](C)(C)(C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.hydrogens).toBe(0);
    });
  });

  describe('Round Trip Generation', () => {
    it('round trips simple molecules', () => {
      const input = 'CC';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0]!.atoms).toHaveLength(2);
      expect(result2.molecules[0]!.bonds).toHaveLength(1);
    });

    it('round trips aromatic rings', () => {
      const input = 'c1ccccc1';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0]!.atoms).toHaveLength(6);
      expect(result2.molecules[0]!.bonds).toHaveLength(6);
    });

    it('round trips charged molecules', () => {
      const input = '[NH4+]';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0]!.atoms[0]!.charge).toBe(1);
      expect(result2.molecules[0]!.atoms[0]!.hydrogens).toBe(4);
    });

    it('round trips branched molecules', () => {
      const input = 'CC(C)C';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0]!.atoms).toHaveLength(4);
      expect(result2.molecules[0]!.bonds).toHaveLength(3);
    });
  });

  describe('Canonical Ordering', () => {
    it('canonicalizes carboxylate to start with neutral O', () => {
      const result1 = parseSMILES('[O-]C=O');
      const result2 = parseSMILES('O=C[O-]');
      const canonical1 = generateSMILES(result1.molecules);
      const canonical2 = generateSMILES(result2.molecules);
      expect(canonical1).toBe(canonical2);
      expect(canonical1).toBe('O=C[O-]');
    });

    it('canonicalizes based on degree', () => {
      const result1 = parseSMILES('CC(C)C');
      const result2 = parseSMILES('C(C)(C)C');
      const canonical1 = generateSMILES(result1.molecules);
      const canonical2 = generateSMILES(result2.molecules);
      expect(canonical1).toBe(canonical2);
    });

    it('prefers neutral atoms over charged', () => {
      const result = parseSMILES('[O-]C=O');
      const canonical = generateSMILES(result.molecules);
      expect(canonical[0]).toBe('O');
      expect(canonical).not.toMatch(/^\[O-\]/);
    });

    it('canonicalizes methylcyclohexane', () => {
      const result1 = parseSMILES('C1CC[C@H](C)CC1');
      const result2 = parseSMILES('CC1CCCCC1');
      const canonical1 = generateSMILES(result1.molecules);
      const canonical2 = generateSMILES(result2.molecules);
      expect(canonical1).toBe('CC1CCCCC1');
    });
  });

  describe('Edge Cases', () => {
    it('handles single atom', () => {
      const result = parseSMILES('C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(1);
      expect(result.molecules[0]!.bonds).toHaveLength(0);
    });

    it('handles empty string', () => {
      const result = parseSMILES('');
      expect(result.molecules).toHaveLength(0);
    });

    it('handles organic subset atoms', () => {
      const atoms = ['B', 'C', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I'];
      atoms.forEach(atom => {
        const result = parseSMILES(atom);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules[0]!.atoms[0]!.symbol).toBe(atom);
      });
    });

    it('handles additional element symbols', () => {
      const elements = ['H', 'He', 'Li', 'Na', 'Mg', 'Al', 'Si', 'K', 'Ca', 'Ti', 'Fe', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Kr', 'Rb', 'Sr', 'Zr', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'U'];
      elements.forEach(element => {
        const result = parseSMILES(element);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules[0]!.atoms[0]!.symbol).toBe(element);
      });
    });

    it('handles bracket atoms', () => {
      const result = parseSMILES('[C]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.symbol).toBe('C');
      expect(result.molecules[0]!.atoms[0]!.isBracket).toBe(true);
    });

    it('handles wildcard atoms', () => {
      // Wildcard outside brackets
      const result1 = parseSMILES('*');
      expect(result1.errors).toHaveLength(0);
      expect(result1.molecules[0]!.atoms[0]!.symbol).toBe('*');
      expect(result1.molecules[0]!.atoms[0]!.hydrogens).toBe(0);

      // Wildcard in brackets with properties
      const result2 = parseSMILES('[*H2+2]');
      expect(result2.errors).toHaveLength(0);
      expect(result2.molecules[0]!.atoms[0]!.symbol).toBe('*');
      expect(result2.molecules[0]!.atoms[0]!.hydrogens).toBe(2);
      expect(result2.molecules[0]!.atoms[0]!.charge).toBe(2);

      // Wildcard in molecule
      const result3 = parseSMILES('C*C');
      expect(result3.errors).toHaveLength(0);
      expect(result3.molecules[0]!.atoms).toHaveLength(3);
      expect(result3.molecules[0]!.atoms[1]!.symbol).toBe('*');
    });

    it('handles atom classes', () => {
      // Basic atom class
      const result1 = parseSMILES('[CH4:2]');
      expect(result1.errors).toHaveLength(0);
      expect(result1.molecules[0]!.atoms[0]!.atomClass).toBe(2);

      // Atom class with multiple digits
      const result2 = parseSMILES('[C:123]');
      expect(result2.errors).toHaveLength(0);
      expect(result2.molecules[0]!.atoms[0]!.atomClass).toBe(123);

      // Default atom class is 0
      const result3 = parseSMILES('[CH4]');
      expect(result3.errors).toHaveLength(0);
      expect(result3.molecules[0]!.atoms[0]!.atomClass).toBe(0);

      // Atom class with other properties
      const result4 = parseSMILES('[13CH3+:5]');
      expect(result4.errors).toHaveLength(0);
      expect(result4.molecules[0]!.atoms[0]!.atomClass).toBe(5);
      expect(result4.molecules[0]!.atoms[0]!!.isotope).toBe(13);
      expect(result4.molecules[0]!.atoms[0]!.charge).toBe(1);
    });

    it('handles aromatic nitrogen in ring', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toHaveLength(0);
      const nitrogen = result.molecules[0]!.atoms.find(a => a.symbol === 'N');
      expect(nitrogen?.aromatic).toBe(true);
    });

    it('validates aromaticity', () => {
      // Valid aromatic ring
      const result1 = parseSMILES('c1ccccc1');
      expect(result1.errors).toHaveLength(0);
      expect(result1.molecules[0]!.atoms.every(a => a.aromatic)).toBe(true);

      // Invalid: aromatic atom not in ring
      const result2 = parseSMILES('cC');
      expect(result2.errors.length).toBeGreaterThan(0);
      expect(result2.errors.some(e => e.message.includes('not in a ring'))).toBe(true);

      // Invalid: aromatic ring violating Hückel's rule
      const result3 = parseSMILES('c1ccc1'); // cyclobutadiene, 4 π electrons
      expect(result3.errors.length).toBeGreaterThan(0);
      expect(result3.errors.some(e => e.message.includes('violates Hückel'))).toBe(true);
    });
  });

  describe('Complex Molecules', () => {
    it('handles acetic acid', () => {
      const result = parseSMILES('CC(=O)O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(4);
      const doubleBond = result.molecules[0]!.bonds.find(b => b.type === 'double');
      expect(doubleBond).toBeDefined();
    });

    it('handles isobutyric acid', () => {
      const result = parseSMILES('CC(C)C(=O)O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
    });

    it('handles glycine', () => {
      const result = parseSMILES('NCC(=O)O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(5);
      const nitrogen = result.molecules[0]!.atoms.find(a => a.symbol === 'N');
      expect(nitrogen).toBeDefined();
    });

    it('handles pyridine', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
      const nitrogen = result.molecules[0]!.atoms.find(a => a.symbol === 'N');
      expect(nitrogen?.aromatic).toBe(true);
    });

    it('handles cyclohexene', () => {
      const result = parseSMILES('C1=CCCCC1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
      const doubleBond = result.molecules[0]!.bonds.find(b => b.type === 'double');
      expect(doubleBond).toBeDefined();
    });
  });

  describe('Edge Cases: Advanced Features', () => {
    it('handles isotopes with atom classes', () => {
      const result = parseSMILES('[13C:1][12C:2]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!!.isotope).toBe(13);
      expect(result.molecules[0]!.atoms[0]!.atomClass).toBe(1);
      expect(result.molecules[0]!.atoms[1]!!.isotope).toBe(12);
      expect(result.molecules[0]!.atoms[1]!.atomClass).toBe(2);
    });

    it('handles large ring numbers', () => {
      const result = parseSMILES('C%99CCCCCCCC%99');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(9);
      expect(result.molecules[0]!.bonds).toHaveLength(9);
    });

    it('handles multiple large ring numbers', () => {
      const result = parseSMILES('C%10CC%20CCC%20CC%10');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.bonds).toHaveLength(9);
    });

    it('handles lanthanides', () => {
      const elements = ['La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu'];
      elements.forEach(element => {
        const result = parseSMILES(`[${element}]`);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules[0]!.atoms[0]!.symbol).toBe(element);
      });
    });

    it('handles actinides', () => {
      const elements = ['Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr'];
      elements.forEach(element => {
        const result = parseSMILES(`[${element}]`);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules[0]!.atoms[0]!.symbol).toBe(element);
      });
    });

    it('handles invalid aromaticity - non-aromatic element', () => {
      const result = parseSMILES('f1ccccc1');
      const fluorine = result.molecules[0]!?.atoms.find(a => a.symbol === 'F');
      expect(fluorine).toBeDefined();
      expect(fluorine?.aromatic).toBe(false);
    });

    it('handles invalid aromaticity - chain not ring', () => {
      const result = parseSMILES('ccccc');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('not in a ring'))).toBe(true);
    });

    it('handles wildcard in simple chain', () => {
      const result = parseSMILES('C*C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(3);
      expect(result.molecules[0]!.atoms[1]!.symbol).toBe('*');
      expect(result.molecules[0]!.atoms[1]!.hydrogens).toBe(0);
    });

    it('handles wildcard with explicit bonds', () => {
      const result = parseSMILES('C=*=C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.bonds![0]!.type).toBe(BondType.DOUBLE);
      expect(result.molecules[0]!.bonds![1]!.type).toBe(BondType.DOUBLE);
    });

    it('handles complex bracket notation: isotope + chirality + charge + atom class', () => {
      const result = parseSMILES('[13C@H+:7]');
      expect(result.errors).toHaveLength(0);
      const atom = result.molecules[0]!.atoms[0]!;
      expect(atom!.isotope).toBe(13);
      expect(atom.chiral).toBe('@');
      expect(atom.hydrogens).toBe(1);
      expect(atom.charge).toBe(1);
      expect(atom.atomClass).toBe(7);
    });

    it('handles isotope + charge + atom class on nitrogen', () => {
      const result = parseSMILES('[15NH3+:3]');
      expect(result.errors).toHaveLength(0);
      const atom = result.molecules[0]!.atoms[0]!;
      expect(atom.symbol).toBe('N');
      expect(atom!.isotope).toBe(15);
      expect(atom.hydrogens).toBe(3);
      expect(atom.charge).toBe(1);
      expect(atom.atomClass).toBe(3);
    });

    it('handles multiple wildcards in molecule', () => {
      const result = parseSMILES('*C*C*');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(5);
      const wildcards = result.molecules[0]!.atoms.filter(a => a.symbol === '*');
      expect(wildcards).toHaveLength(3);
    });

    it('handles ring with mixed bond types', () => {
      const result = parseSMILES('C1=CC=CC=C1');
      expect(result.errors).toHaveLength(0);
      const singleBonds = result.molecules[0]!.bonds.filter(b => b.type === 'single');
      const doubleBonds = result.molecules[0]!.bonds.filter(b => b.type === 'double');
      expect(singleBonds).toHaveLength(3);
      expect(doubleBonds).toHaveLength(3);
    });

    it('handles atom class with zero', () => {
      const result = parseSMILES('[C:0]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.atomClass).toBe(0);
    });

    it('handles atom class with large number', () => {
      const result = parseSMILES('[C:9999]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.atomClass).toBe(9999);
    });

    it('handles very long chain with branches', () => {
      const result = parseSMILES('CC(C)C(C)C(C)C(C)C(C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(12);
    });

    it('handles deeply nested branches', () => {
      const result = parseSMILES('C(C(C(C(C))))');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(5);
      expect(result.molecules[0]!.bonds).toHaveLength(4);
    });

    it('handles noble gases', () => {
      const elements = ['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn'];
      elements.forEach(element => {
        const result = parseSMILES(`[${element}]`);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules[0]!.atoms[0]!.symbol).toBe(element);
      });
    });

    it('handles transition metals', () => {
      const elements = ['Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn'];
      elements.forEach(element => {
        const result = parseSMILES(`[${element}]`);
        expect(result.errors).toHaveLength(0);
        expect(result.molecules[0]!.atoms[0]!.symbol).toBe(element);
      });
    });

    it('handles aromatic pyrrole nitrogen', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toHaveLength(0);
      const nitrogen = result.molecules[0]!.atoms.find(a => a.symbol === 'N');
      expect(nitrogen?.aromatic).toBe(true);
    });

    it('handles five-membered aromatic ring', () => {
      const result = parseSMILES('c1cncc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(5);
    });

    it('handles simple aromatic six-membered rings', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms).toHaveLength(6);
      expect(result.molecules[0]!.atoms.every(a => a.aromatic)).toBe(true);
    });

    it('handles conflicting ring bond types', () => {
      const result = parseSMILES('C1=CCC=C1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.bonds).toHaveLength(5);
    });

    it('handles isotope on wildcard', () => {
      const result = parseSMILES('[2*]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.symbol).toBe('*');
      expect(result.molecules[0]!.atoms[0]!!.isotope).toBe(2);
    });

    it('handles wildcard with atom class', () => {
      const result = parseSMILES('[*:5]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.atoms[0]!.symbol).toBe('*');
      expect(result.molecules[0]!.atoms[0]!.atomClass).toBe(5);
    });

    it('handles multiple disconnected aromatic rings', () => {
      const result = parseSMILES('c1ccccc1.c1ccncc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules).toHaveLength(2);
      expect(result.molecules[0]!.atoms.every(a => a.aromatic)).toBe(true);
      expect(result.molecules[1]!.atoms.every(a => a.aromatic)).toBe(true);
    });

    it('handles ring with explicit single bonds', () => {
      const result = parseSMILES('C1CCCCC1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0]!.bonds.every(b => b.type === 'single')).toBe(true);
    });

    it('handles aromatic sulfur', () => {
      const result = parseSMILES('c1cscc1');
      expect(result.errors).toHaveLength(0);
      const sulfur = result.molecules[0]!.atoms.find(a => a.symbol === 'S');
      expect(sulfur?.aromatic).toBe(true);
    });

    it('handles aromatic oxygen', () => {
      const result = parseSMILES('c1cocc1');
      expect(result.errors).toHaveLength(0);
      const oxygen = result.molecules[0]!.atoms.find(a => a.symbol === 'O');
      expect(oxygen?.aromatic).toBe(true);
    });

    it('handles aromatic boron', () => {
      const result = parseSMILES('c1cbcc1');
      expect(result.errors).toHaveLength(0);
      const boron = result.molecules[0]!.atoms.find(a => a.symbol === 'B');
      expect(boron?.aromatic).toBe(true);
    });

    it('handles aromatic phosphorus', () => {
      const result = parseSMILES('c1cpcc1');
      expect(result.errors).toHaveLength(0);
      const phosphorus = result.molecules[0]!.atoms.find(a => a.symbol === 'P');
      expect(phosphorus?.aromatic).toBe(true);
    });
  });
});
