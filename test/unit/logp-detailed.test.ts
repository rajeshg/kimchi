import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { computeLogP, getCrippenAtomContribs } from 'src/utils/logp';
import { parseSMARTS } from 'src/parsers/smarts-parser';
import { matchSMARTS } from 'src/matchers/smarts-matcher';
import { addExplicitHydrogensWithMapping } from 'src/utils/hydrogen-utils';

describe('LogP Calculation - Component Tests', () => {
  describe('1. SMARTS Pattern Parsing', () => {
    it('parses simple aliphatic carbon patterns', () => {
      const patterns = ['[CH4]', '[CH3]C', '[CH2](C)C'];
      
      for (const smarts of patterns) {
        const result = parseSMARTS(smarts);
        expect(result.errors).toEqual([]);
        expect(result.pattern).not.toBeNull();
        expect(result.pattern!.atoms.length).toBeGreaterThan(0);
      }
    });

    it('parses semicolon-separated patterns correctly', () => {
      const smarts = '[NH3,NH2,NH;+,+2,+3]';
      const result = parseSMARTS(smarts);
      
      expect(result.errors).toEqual([]);
      expect(result.pattern).not.toBeNull();
      
      const logicalExpr = result.pattern!.atoms[0]?.logicalExpression;
      expect(logicalExpr).toBeDefined();
      expect(logicalExpr?.operator).toBe('and');
    });

    it('parses aromatic patterns', () => {
      const patterns = ['[cH]', 'c', '[c](:a)(:a):a'];
      
      for (const smarts of patterns) {
        const result = parseSMARTS(smarts);
        expect(result.errors).toEqual([]);
        expect(result.pattern).not.toBeNull();
      }
    });

    it('parses charge patterns', () => {
      const patterns = ['[+]', '[+2]', '[NH3+]', '[O-]'];
      
      for (const smarts of patterns) {
        const result = parseSMARTS(smarts);
        expect(result.errors).toEqual([]);
        expect(result.pattern).not.toBeNull();
      }
    });
  });

  describe('2. Pattern Matching', () => {
    it('matches C1 pattern [CH4] to methane', () => {
      const mol = parseSMILES('C').molecules[0]!;
      const pattern = parseSMARTS('[CH4]').pattern!;
      const result = matchSMARTS(pattern, mol);
      
      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('matches C18 pattern [cH] to benzene carbons', () => {
      const mol = parseSMILES('c1ccccc1').molecules[0]!;
      const pattern = parseSMARTS('[cH]').pattern!;
      const result = matchSMARTS(pattern, mol);
      
      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(6);
    });

    it('matches O2 pattern [OH,OH2] to ethanol oxygen', () => {
      const mol = parseSMILES('CCO').molecules[0]!;
      const pattern = parseSMARTS('[OH,OH2]').pattern!;
      const result = matchSMARTS(pattern, mol);
      
      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('does not match N patterns to carbon atoms', () => {
      const mol = parseSMILES('C').molecules[0]!;
      const withHs = addExplicitHydrogensWithMapping(mol);
      const pattern = parseSMARTS('[NH3,NH2,NH;+,+2,+3]').pattern!;
      const result = matchSMARTS(pattern, withHs.molecule);
      
      expect(result.success).toBe(false);
    });

    it('does not match N patterns to oxygen atoms', () => {
      const mol = parseSMILES('O').molecules[0]!;
      const withHs = addExplicitHydrogensWithMapping(mol);
      const pattern = parseSMARTS('[NH3,NH2,NH;+,+2,+3]').pattern!;
      const result = matchSMARTS(pattern, withHs.molecule);
      
      expect(result.success).toBe(false);
    });
  });

  describe('3. Atom Contribution Calculation', () => {
    it('calculates contributions for methane (C)', () => {
      const mol = parseSMILES('C').molecules[0]!;
      const { logpContribs, mrContribs } = getCrippenAtomContribs(mol, true);
      
      expect(logpContribs.length).toBe(1);
      expect(logpContribs[0]).toBeCloseTo(0.6361, 4);
    });

    it('calculates contributions for ethanol (CCO)', () => {
      const mol = parseSMILES('CCO').molecules[0]!;
      const { logpContribs, mrContribs } = getCrippenAtomContribs(mol, true);
      
      expect(logpContribs.length).toBe(3);
      
      const totalLogP = logpContribs.reduce((sum, v) => sum + v, 0);
      expect(totalLogP).toBeCloseTo(-0.0014, 2);
    });

    it('calculates contributions for benzene (c1ccccc1)', () => {
      const mol = parseSMILES('c1ccccc1').molecules[0]!;
      const { logpContribs, mrContribs } = getCrippenAtomContribs(mol, true);
      
      expect(logpContribs.length).toBe(6);
      
      for (let i = 0; i < 6; i++) {
        expect(logpContribs[i]).toBeCloseTo(0.2811, 4);
      }
    });

    it('returns zero for unmatched atoms', () => {
      const mol = parseSMILES('[Xe]').molecules[0]!;
      const { logpContribs } = getCrippenAtomContribs(mol, false);
      
      expect(logpContribs[0]).toBe(0);
    });
  });

  describe('4. Hydrogen Handling', () => {
    it('includeHs=true adds explicit hydrogens', () => {
      const mol = parseSMILES('C').molecules[0]!;
      const withHs = addExplicitHydrogensWithMapping(mol);
      
      expect(withHs.molecule.atoms.length).toBe(5);
      expect(withHs.augmentedToOriginal.length).toBe(5);
    });

    it('includeHs=false uses implicit hydrogens only', () => {
      const mol = parseSMILES('C').molecules[0]!;
      const { logpContribs } = getCrippenAtomContribs(mol, false);
      
      expect(logpContribs.length).toBe(1);
    });

    it('maps contributions back to original atom indices', () => {
      const mol = parseSMILES('CC').molecules[0]!;
      const { logpContribs } = getCrippenAtomContribs(mol, true);
      
      expect(logpContribs.length).toBe(2);
    });
  });

  describe('5. Pattern Priority and Ordering', () => {
    it('matches more specific patterns first', () => {
      const mol = parseSMILES('CCO').molecules[0]!;
      const { logpContribs } = getCrippenAtomContribs(mol, true);
      
      expect(logpContribs[0]).not.toBe(0);
      expect(logpContribs[1]).not.toBe(0);
      expect(logpContribs[2]).not.toBe(0);
    });

    it('stops after first match per atom', () => {
      const mol = parseSMILES('c1ccccc1').molecules[0]!;
      const { logpContribs } = getCrippenAtomContribs(mol, true);
      
      for (let i = 0; i < 6; i++) {
        expect(logpContribs[i]).toBeCloseTo(0.2811, 4);
      }
    });
  });

  describe('6. End-to-End Integration', () => {
    it('computes correct logP for methane', () => {
      const mol = parseSMILES('C').molecules[0]!;
      const logp = computeLogP(mol, true);
      
      expect(logp).toBeCloseTo(0.6361, 2);
    });

    it('computes correct logP for ethanol', () => {
      const mol = parseSMILES('CCO').molecules[0]!;
      const logp = computeLogP(mol, true);
      
      expect(logp).toBeCloseTo(-0.0014, 2);
    });

    it('computes correct logP for benzene', () => {
      const mol = parseSMILES('c1ccccc1').molecules[0]!;
      const logp = computeLogP(mol, true);
      
      expect(logp).toBeCloseTo(1.6866, 2);
    });
  });

  describe('7. Edge Cases', () => {
    it('handles molecules with no atoms', () => {
      const mol = { atoms: [], bonds: [] };
      const { logpContribs } = getCrippenAtomContribs(mol, false);
      
      expect(logpContribs).toEqual([]);
    });

    it('handles molecules with explicit hydrogens already present', () => {
      const mol = parseSMILES('[H]C([H])([H])[H]').molecules[0]!;
      const logp = computeLogP(mol, false);
      
      expect(typeof logp).toBe('number');
    });
  });
});

describe('LogP Pattern Debugging', () => {
  it('debugs which pattern matches each atom in methane', () => {
    const mol = parseSMILES('C').molecules[0]!;
    const patterns = [
      { label: 'C1', smarts: '[CH4]', expectedLogP: 0.1441 },
    ];

    for (const { label, smarts, expectedLogP } of patterns) {
      const parsed = parseSMARTS(smarts);
      expect(parsed.errors).toEqual([]);
      
      const result = matchSMARTS(parsed.pattern!, mol);
      if (result.success) {
        console.log(`Pattern ${label} (${smarts}) matched ${result.matches.length} times`);
      }
    }
  });

  it('debugs which pattern matches each atom in ethanol', () => {
    const mol = parseSMILES('CCO').molecules[0]!;
    const patterns = [
      { label: 'C1', smarts: '[CH3]C', desc: 'CH3 attached to C' },
      { label: 'C3', smarts: '[CH2X4]([N,O,P,S,F,Cl,Br,I])[A;!#1]', desc: 'CH2 attached to heteroatom' },
      { label: 'O2', smarts: '[OH,OH2]', desc: 'Alcohol or water oxygen' },
    ];

    for (const { label, smarts, desc } of patterns) {
      const parsed = parseSMARTS(smarts);
      if (parsed.errors.length > 0) {
        console.log(`Pattern ${label} failed to parse: ${parsed.errors.join(', ')}`);
        continue;
      }
      
      const result = matchSMARTS(parsed.pattern!, mol);
      if (result.success) {
        console.log(`Pattern ${label} (${desc}): ${result.matches.length} matches`);
        for (const match of result.matches) {
          const atomIdx = match.atoms[0]?.moleculeIndex;
          if (atomIdx !== undefined) {
            console.log(`  - Atom ${atomIdx} (${mol.atoms[atomIdx]?.symbol})`);
          }
        }
      }
    }
  });
});
