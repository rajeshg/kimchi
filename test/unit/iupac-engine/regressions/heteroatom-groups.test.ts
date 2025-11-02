import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { RuleEngine } from '../../../../src/iupac-engine/engine';

const engine = new RuleEngine();

describe('Regression: heteroatom-containing molecules', () => {
  it('handles diaziridin-one example', () => {
    const smiles = 'CCC(C)(C)N1C(=O)N1C(C)(C)CC';
    const expected = '1,2-bis(2-methylbutan-2-yl)diaziridin-3-one';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });

  it('handles tert-butylamino-oxy N-phenylbutanamide', () => {
    const smiles = 'CC(C)(C)C(C(=O)NC1=CC=CC=C1)ONC(C)(C)C';
    const expected = '2-(tert-butylamino)oxy-3,3-dimethyl-N-phenylbutanamide';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });

  it('handles sulfonyl-sulfinyl example', () => {
    const smiles = 'CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C';
    const expected = '1-(2,2-dimethylpropylsulfonylsulfinyl)-2,2-dimethylpropane';

    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    const mol = parsed.molecules[0]!;
    const gen = engine.generateName(mol).name?.trim().toLowerCase();
    expect(gen).toBe(expected.trim().toLowerCase());
  });
});
