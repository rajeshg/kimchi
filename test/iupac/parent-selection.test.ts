import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import selectPrincipalChain from 'src/utils/iupac/chain-selection';
import { generateIUPACName } from 'src/utils/iupac/iupac-generator';

describe('IUPAC parent selection (representative difficult cases)', () => {
  const cases: Array<{ smiles: string; expectChainLength?: number; expectNameContains?: string; expectFullName?: string }> = [
    { smiles: 'CC(C)(C(C)(C)C)C(C)(C)C', expectChainLength: 5, expectFullName: '2,2,3,3,4,4-hexamethylpentane' },
  { smiles: 'CCC(C)(CCC(C)C)CC', expectChainLength: 7, expectFullName: '2,5-dimethyl-5-ethylheptane' },
    { smiles: 'CC(C)(C(C)(C(C)(C)C)C)C', expectChainLength: 5, expectFullName: '2,2,3,3,4,4-hexamethylpentane' },
     { smiles: 'CC(C)C(C(C(C)C)C)C', expectChainLength: 6 },
  { smiles: 'CCC(C(C)C)(C(C)C)C', expectChainLength: 5 },

    { smiles: 'C1CCC2CCCCC2C1', expectChainLength: 10 },
    { smiles: 'C1CCC2C(C1)CCCC2', expectChainLength: 10 },
    { smiles: 'C1CC2C3CCCCC3CC2C1', expectChainLength: 12 },

    { smiles: 'C1=CC=C(C=C1)C2=CC=CC=C2', expectChainLength: 12 },
    { smiles: 'CC(C1=CC=CC=C1)C2=CC=CC=C2', expectChainLength: 13 },
    { smiles: 'CC1=CC=CC=C1C(C)C', expectChainLength: 6 },
    { smiles: 'CC1CC(C)C(C(C)C)C1', expectChainLength: 6 },
     { smiles: 'C1CC(C2CCCCC2)CCCC1', expectChainLength: 13 },

    { smiles: 'CC(C(=O)O)CC(=O)O', expectChainLength: 4 },
    { smiles: 'OC(=O)CC(=O)O', expectChainLength: 3 },
    { smiles: 'CC(C(=O)O)C(=O)O', expectChainLength: 3 },
    { smiles: 'CCC(=O)C(=O)O', expectChainLength: 4 },
    { smiles: 'CC(C(=O)OC)C(=O)O', expectChainLength: 3 },

    { smiles: 'CCN(CC)CC', expectChainLength: 2 },
     { smiles: 'CC(=O)NC(=O)C', expectChainLength: 2 },
    { smiles: 'CC(=O)OC(=O)C', expectChainLength: 2 },
    { smiles: 'CC(C)(C(=O)O)C(=O)O', expectChainLength: 3 },

    { smiles: 'C1CCC(C(C)C(=O)O)CC1', expectNameContains: 'cyclohex' },
    { smiles: 'C1=CC(=CC=C1C(=O)O)O', expectNameContains: 'benz' },
    { smiles: 'C1CC(=O)CCC1', expectNameContains: 'cyclohexan' },
    { smiles: 'C1CCC(C(=O)O)CC1', expectNameContains: 'cyclohexan' },
    { smiles: 'C1=CC=C(C=C1)C(=O)O', expectNameContains: 'benzo' },
    { smiles: 'CC1=CC=CC=C1C(=O)O', expectNameContains: 'benzo' },
    { smiles: 'C1=CC=C(C=C1)C2=CC=CC=C2C(=O)O', expectNameContains: 'biphenyl' },

    { smiles: 'CC(C)=CC(C)=CC', expectChainLength: 6 },
    { smiles: 'CC(C)=CC=C(C)C', expectChainLength: 6 },
    { smiles: 'CC(C(=O)O)C(C)(C)C', expectChainLength: 4 },

    { smiles: 'C1C(C2CCCCC2)CCCC1', expectNameContains: 'spiro' },
    { smiles: 'C1CC2(CC1)CCCCC2', expectNameContains: 'bicyclo' },
    { smiles: 'CC1=C(C(=O)O)C=CC=C1', expectNameContains: 'benzo' },
    { smiles: 'C1=CC=C2C(=C1)C=CC=C2', expectNameContains: 'naphthalene' },
     { smiles: 'C1=CC=C2C3=CC=CC=C3C=C12', expectChainLength: 12 },
    { smiles: 'C1=CC=C2C3=CC=CC=C3C=C2C=C1', expectNameContains: 'phenanthrene' },

    { smiles: 'CC(C(=O)O)C1=CC=CC=C1', expectNameContains: 'phenylpropanoic acid' },
    { smiles: 'CC(C)C1=CC=CC=C1C(=O)O', expectNameContains: 'propan-2-ylbenzoic acid' },
  ];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    it(`case ${i + 1}: ${c.smiles}`, () => {
      const res = parseSMILES(c.smiles);
      expect(res.errors).toEqual([]);
      const mol = res.molecules[0]!;

      if (typeof c.expectChainLength === 'number') {
        const sel = selectPrincipalChain(mol);
        expect(sel.chain).toBeDefined();
        expect(sel.chain.length).toBe(c.expectChainLength);
      }

      if (c.expectFullName) {
        const gen = generateIUPACName(mol);
        expect(gen.errors).toEqual([]);
        const name = gen.name.toLowerCase();
        expect(name).toBe(c.expectFullName.toLowerCase());
      }

      if (c.expectNameContains) {
        const gen = generateIUPACName(mol);
        expect(gen.errors).toEqual([]);
        const name = gen.name.toLowerCase();
        expect(name).toContain(c.expectNameContains.toLowerCase());
      }
    });
  }
});
