import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES } from '../index';

describe('Comprehensive SMILES Tests', () => {
  describe('Charged Atoms', () => {
    it('handles negatively charged oxygen with explicit H', () => {
      const result = parseSMILES('[OH-]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].charge).toBe(-1);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(1);
    });

    it('handles negatively charged oxygen without explicit H', () => {
      const result = parseSMILES('[O-]C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].charge).toBe(-1);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(0);
    });

    it('handles positively charged nitrogen NH4+', () => {
      const result = parseSMILES('[NH4+]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].charge).toBe(1);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(4);
    });

    it('handles carboxylate anion', () => {
      const result = parseSMILES('[O-]C=O');
      expect(result.errors).toHaveLength(0);
      const oxygens = result.molecules[0].atoms.filter(a => a.symbol === 'O');
      expect(oxygens).toHaveLength(2);
      expect(oxygens.some(o => o.charge === -1)).toBe(true);
      expect(oxygens.some(o => o.charge === 0)).toBe(true);
    });

    it('handles ammonium cation', () => {
      const result = parseSMILES('C[NH3+]');
      expect(result.errors).toHaveLength(0);
      const nitrogen = result.molecules[0].atoms.find(a => a.symbol === 'N');
      expect(nitrogen?.charge).toBe(1);
      expect(nitrogen?.hydrogens).toBe(3);
    });

    it('handles multiple charges', () => {
      const result = parseSMILES('[O--]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].charge).toBe(-2);
    });

    it('handles carbocation', () => {
      const result = parseSMILES('CC[C+]CC');
      expect(result.errors).toHaveLength(0);
      const carbon = result.molecules[0].atoms.find(a => a.id === 2);
      expect(carbon?.charge).toBe(1);
    });
  });

  describe('Bond Types', () => {
    it('handles single bonds', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].bonds[0].type).toBe('single');
    });

    it('handles double bonds', () => {
      const result = parseSMILES('C=C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].bonds[0].type).toBe('double');
    });

    it('handles triple bonds', () => {
      const result = parseSMILES('C#C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].bonds[0].type).toBe('triple');
    });

    it('handles aromatic bonds', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].bonds.some(b => b.type === 'aromatic')).toBe(true);
    });

    it('handles mixed bond types', () => {
      const result = parseSMILES('C=CC#N');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].bonds[0].type).toBe('double');
      expect(result.molecules[0].bonds[2].type).toBe('triple');
    });
  });

  describe('Branching', () => {
    it('handles simple branches', () => {
      const result = parseSMILES('CC(C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(4);
      expect(result.molecules[0].bonds).toHaveLength(3);
    });

    it('handles nested branches', () => {
      const result = parseSMILES('CC(C(C)C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(6);
    });

    it('handles multiple branches on same atom', () => {
      const result = parseSMILES('CC(C)(C)C');
      expect(result.errors).toHaveLength(0);
      const centerCarbon = result.molecules[0].atoms.find(a => a.id === 1);
      const bonds = result.molecules[0].bonds.filter(
        b => b.atom1 === 1 || b.atom2 === 1
      );
      expect(bonds).toHaveLength(4);
    });
  });

  describe('Ring Closures', () => {
    it('handles simple ring', () => {
      const result = parseSMILES('C1CCCCC1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(6);
      expect(result.molecules[0].bonds).toHaveLength(6);
    });

    it('handles aromatic ring', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(6);
      expect(result.molecules[0].bonds).toHaveLength(6);
    });

    it('handles fused rings', () => {
      const result = parseSMILES('C1CC2CCCC2CC1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(9);
    });

    it('handles spiro rings', () => {
      const result = parseSMILES('C12(CCCC1)CCCC2');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(9);
    });

    it('handles ring with double bond', () => {
      const result = parseSMILES('C1=CCCCC1');
      expect(result.errors).toHaveLength(0);
      const doubleBond = result.molecules[0].bonds.find(b => b.type === 'double');
      expect(doubleBond).toBeDefined();
    });
  });

  describe('Stereochemistry', () => {
    it('handles chiral center @', () => {
      const result = parseSMILES('C[C@H](O)N');
      expect(result.errors).toHaveLength(0);
      const chiralCarbon = result.molecules[0].atoms.find(a => a.chiral);
      expect(chiralCarbon?.chiral).toBe('@');
    });

    it('handles chiral center @@', () => {
      const result = parseSMILES('C[C@@H](O)N');
      expect(result.errors).toHaveLength(0);
      const chiralCarbon = result.molecules[0].atoms.find(a => a.chiral);
      expect(chiralCarbon?.chiral).toBe('@@');
    });

    it('handles E/Z double bond stereo /', () => {
      const result = parseSMILES('F/C=C/F');
      expect(result.errors).toHaveLength(0);
      const stereoBonds = result.molecules[0].bonds.filter(
        b => b.stereo && b.stereo !== 'none'
      );
      expect(stereoBonds.length).toBeGreaterThan(0);
    });

    it('handles E/Z double bond stereo \\', () => {
      const result = parseSMILES('F\\C=C\\F');
      expect(result.errors).toHaveLength(0);
      const stereoBonds = result.molecules[0].bonds.filter(
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
      expect(result.molecules[0].atoms).toHaveLength(2);
      expect(result.molecules[1].atoms).toHaveLength(1);
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
      expect(result.molecules[0].atoms[0].isotope).toBe(2);
    });

    it('handles carbon-13', () => {
      const result = parseSMILES('[13C]C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].isotope).toBe(13);
    });

    it('handles isotopes with charges', () => {
      const result = parseSMILES('[18OH-]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].isotope).toBe(18);
      expect(result.molecules[0].atoms[0].charge).toBe(-1);
    });
  });

  describe('Hydrogen Calculation', () => {
    it('calculates hydrogens for neutral carbon', () => {
      const result = parseSMILES('C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(4);
    });

    it('calculates hydrogens for methylene', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(3);
    });

    it('calculates hydrogens for quaternary carbon', () => {
      const result = parseSMILES('CC(C)(C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[1].hydrogens).toBe(0);
    });

    it('calculates hydrogens for nitrogen', () => {
      const result = parseSMILES('N');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(3);
    });

    it('calculates hydrogens for oxygen', () => {
      const result = parseSMILES('O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(2);
    });

    it('calculates hydrogens for double bonded carbon', () => {
      const result = parseSMILES('C=C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(2);
    });

    it('calculates hydrogens for triple bonded carbon', () => {
      const result = parseSMILES('C#C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(1);
    });

    it('respects explicit hydrogen count', () => {
      const result = parseSMILES('[CH2]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(2);
    });

    it('handles explicit H0', () => {
      const result = parseSMILES('[CH0](C)(C)(C)C');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].hydrogens).toBe(0);
    });
  });

  describe('Round Trip Generation', () => {
    it('round trips simple molecules', () => {
      const input = 'CC';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0].atoms).toHaveLength(2);
      expect(result2.molecules[0].bonds).toHaveLength(1);
    });

    it('round trips aromatic rings', () => {
      const input = 'c1ccccc1';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0].atoms).toHaveLength(6);
      expect(result2.molecules[0].bonds).toHaveLength(6);
    });

    it('round trips charged molecules', () => {
      const input = '[NH4+]';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0].atoms[0].charge).toBe(1);
      expect(result2.molecules[0].atoms[0].hydrogens).toBe(4);
    });

    it('round trips branched molecules', () => {
      const input = 'CC(C)C';
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const result2 = parseSMILES(output);
      expect(result2.molecules[0].atoms).toHaveLength(4);
      expect(result2.molecules[0].bonds).toHaveLength(3);
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
      expect(result.molecules[0].atoms).toHaveLength(1);
      expect(result.molecules[0].bonds).toHaveLength(0);
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
        expect(result.molecules[0].atoms[0].symbol).toBe(atom);
      });
    });

    it('handles bracket atoms', () => {
      const result = parseSMILES('[C]');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms[0].symbol).toBe('C');
      expect(result.molecules[0].atoms[0].isBracket).toBe(true);
    });

    it('handles aromatic nitrogen in ring', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toHaveLength(0);
      const nitrogen = result.molecules[0].atoms.find(a => a.symbol === 'N');
      expect(nitrogen?.aromatic).toBe(true);
    });
  });

  describe('Complex Molecules', () => {
    it('handles acetic acid', () => {
      const result = parseSMILES('CC(=O)O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(4);
      const doubleBond = result.molecules[0].bonds.find(b => b.type === 'double');
      expect(doubleBond).toBeDefined();
    });

    it('handles isobutyric acid', () => {
      const result = parseSMILES('CC(C)C(=O)O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(6);
    });

    it('handles glycine', () => {
      const result = parseSMILES('NCC(=O)O');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(5);
      const nitrogen = result.molecules[0].atoms.find(a => a.symbol === 'N');
      expect(nitrogen).toBeDefined();
    });

    it('handles pyridine', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(6);
      const nitrogen = result.molecules[0].atoms.find(a => a.symbol === 'N');
      expect(nitrogen?.aromatic).toBe(true);
    });

    it('handles cyclohexene', () => {
      const result = parseSMILES('C1=CCCCC1');
      expect(result.errors).toHaveLength(0);
      expect(result.molecules[0].atoms).toHaveLength(6);
      const doubleBond = result.molecules[0].bonds.find(b => b.type === 'double');
      expect(doubleBond).toBeDefined();
    });
  });
});
