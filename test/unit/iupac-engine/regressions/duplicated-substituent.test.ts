import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { RuleEngine } from '../../../../src/iupac-engine/engine';

describe('Regression: duplicated/garbled substituent assembly', () => {
  const cases: Array<{ smiles: string; expected: string }> = [
    { smiles: 'CC1(CCCCC1(Cl)Cl)O', expected: '2,2-dichloro-1-methylcyclohexan-1-ol' },
    { smiles: 'CC1CC2C(=O)CCC(C1O)O2', expected: '6-hydroxy-7-methyl-9-oxabicyclo[3.3.1]nonan-2-one' },
    { smiles: 'CC1CCCC1(C)O', expected: '1,2-dimethylcyclopentan-1-ol' }
  ];

  for (const c of cases) {
    it(`generates correct name for ${c.smiles}`, () => {
      const engine = new RuleEngine();
      const res = parseSMILES(c.smiles);
      expect(res.errors).toHaveLength(0);
      expect(res.molecules).toHaveLength(1);
      const mol = res.molecules[0]!;
      const r = engine.generateName(mol);
      const gen = (r.name || '').trim().toLowerCase();
      const ref = c.expected.trim().toLowerCase();
      if (gen !== ref) {
        console.log(`SMILES: ${c.smiles}`);
        console.log(`  expected: ${ref}`);
        console.log(`  actual:   ${gen}`);
      }
      expect(gen).toBe(ref);
    });
  }
});
