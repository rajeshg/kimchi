import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMainChain, getChainFunctionalGroupPriority } from 'src/utils/iupac/iupac-chains';

describe('IUPAC functional-group priority (extended)', () => {
  const cases: { smiles: string; name: string; minPriority: number }[] = [
    { smiles: 'CC(=O)OCC', name: 'ester (ethyl acetate)', minPriority: 5 },
    { smiles: 'CCC#N', name: 'nitrile (propionitrile)', minPriority: 4 },
    { smiles: 'CC(=O)N', name: 'amide (acetamide)', minPriority: 5 },
    { smiles: 'CC(=O)Cl', name: 'acid chloride (acetyl chloride)', minPriority: 5 },
    { smiles: 'CP(=O)(O)O', name: 'phosphonic acid (methylphosphonic acid)', minPriority: 6 },
    { smiles: 'CS(=O)(=O)N', name: 'sulfonamide (sulfonamide)', minPriority: 5 },
    { smiles: 'CC[N+](=O)[O-]', name: 'nitro (nitroethane)', minPriority: 4 },
  ];

  for (const c of cases) {
    it(`detects ${c.name}`, () => {
      const result = parseSMILES(c.smiles);
      const mol = result.molecules[0]!;
      const main = findMainChain(mol);
      expect(main.length).toBeGreaterThanOrEqual(2);
      const priority = getChainFunctionalGroupPriority(main, mol);
      expect(priority).toBeGreaterThanOrEqual(c.minPriority);
    });
  }
});
