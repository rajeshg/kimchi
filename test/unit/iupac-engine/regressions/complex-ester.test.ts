import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { RuleEngine } from '../../../../src/iupac-engine/engine';

const engine = new RuleEngine();

describe('Regression: complex ester handling', () => {
  it('handles a substituted anilino butanoate', () => {
    const smiles = 'CCCC(=O)OC(C)(C)C(=O)NC1=CC(=C(C=C1)[N+](=O)[O-])C(F)(F)F';
    const expected = '[2-methyl-1-[4-nitro-3-(trifluoromethyl)anilino]-1-oxopropan-2-yl]butanoate';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.molecules.length).toBeGreaterThan(0);

    const mol = parsed.molecules[0]!;
    const res = engine.generateName(mol);
    const gen = (res.name || '').trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });

  it('handles dimethyl propoxy butanedioate', () => {
    const smiles = 'CCCOC(CC(=O)OC)C(=O)OC';
    const expected = 'dimethyl2-propoxybutanedioate';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });

  it('handles silyloxy-substituted ester (trimethylsilyloxy case)', () => {
    const smiles = 'CC(C)C(=O)OCC(CO[Si](C)(C)C)O[Si](C)(C)C';
    const expected = '2,3-bis(trimethylsilyloxy)propyl2-methylpropanoate';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });
});
