import { describe, it, expect } from 'bun:test';
import { parseSMILES, computeLogP, logP, crippenLogP } from 'index';

describe('Crippen logP estimator', () => {
  it('computes logP for methane and ethanol (basic sanity)', () => {
    const m1 = parseSMILES('C');
    expect(m1.errors).toHaveLength(0);
    const p1 = computeLogP(m1.molecules[0]!);
    expect(typeof p1).toBe('number');

    const m2 = parseSMILES('CCO');
    expect(m2.errors).toHaveLength(0);
    const p2 = computeLogP(m2.molecules[0]!);
    expect(typeof p2).toBe('number');
  });

  it('handles explicit hydrogens includeHs true/false', () => {
    const r = parseSMILES('N');
    expect(r.errors).toHaveLength(0);
    const mol = r.molecules[0]!;
    const pWith = computeLogP(mol, true);
    const pWithout = computeLogP(mol, false);
    expect(typeof pWith).toBe('number');
    expect(typeof pWithout).toBe('number');
  });

  it('matches RDKit Crippen logP values closely', async () => {
    const testCases = [
      { smiles: 'C', expected: 0.6361 },
      { smiles: 'CCO', expected: -0.0014 },
      { smiles: 'c1ccccc1', expected: 1.6866 },
    ];

    for (const { smiles, expected } of testCases) {
      const parsed = parseSMILES(smiles);
      expect(parsed.errors).toEqual([]);
      const mol = parsed.molecules[0]!;
      const ourLogP = computeLogP(mol, true);

      expect(Math.abs(ourLogP - expected)).toBeLessThan(0.01);
    }
  });

  it('aliases logP and crippenLogP are equivalent to computeLogP', () => {
    const { parseSMILES } = require('index');
    const smiles = 'CCO'; // ethanol
    const mol = parseSMILES(smiles);
    expect(mol).toBeDefined();
    if (!mol) return;
    const molecule = mol.molecules[0]!;
    const val1 = computeLogP(molecule);
    const val2 = logP(molecule);
    const val3 = crippenLogP(molecule);
    expect(val1).toBe(val2);
    expect(val2).toBe(val3);
  });

  it('handles diverse organic molecules', async () => {
    const testCases = [
      { smiles: 'CC', name: 'ethane' },
      { smiles: 'CCC', name: 'propane' },
      { smiles: 'CCCC', name: 'butane' },
      { smiles: 'CC(C)C', name: 'isobutane' },
      { smiles: 'C=C', name: 'ethene' },
      { smiles: 'C#C', name: 'ethyne' },
      { smiles: 'CC(=O)O', name: 'acetic acid' },
      { smiles: 'CC(=O)C', name: 'acetone' },
      { smiles: 'c1ccc(O)cc1', name: 'phenol' },
      { smiles: 'c1ccc(C)cc1', name: 'toluene' },
      { smiles: 'c1ccc(N)cc1', name: 'aniline' },
      { smiles: 'c1ccc(Cl)cc1', name: 'chlorobenzene' },
      { smiles: 'CCN', name: 'ethylamine' },
      { smiles: 'CCOC', name: 'diethyl ether' },
      { smiles: 'c1ccncc1', name: 'pyridine' },
      { smiles: 'c1ccccc1c1ccccc1', name: 'biphenyl' },
      { smiles: 'c1ccc2ccccc2c1', name: 'naphthalene' },
      { smiles: 'CC(C)(C)C', name: 'neopentane' },
      { smiles: 'C1CCCCC1', name: 'cyclohexane' },
      { smiles: 'CC(O)C', name: '2-propanol' },
    ];

    for (const { smiles, name } of testCases) {
      const parsed = parseSMILES(smiles);
      expect(parsed.errors).toEqual([]);
      const mol = parsed.molecules[0]!;
      const ourLogP = computeLogP(mol, true);

      expect(typeof ourLogP).toBe('number');
      expect(isFinite(ourLogP)).toBe(true);
    }
  });
});
