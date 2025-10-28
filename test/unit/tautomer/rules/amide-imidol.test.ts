import { describe, it, expect } from 'bun:test';
import { parseSMILES, enumerateTautomers } from 'index';

describe('tautomer: amide-imidol', () => {
  it('generates imidol-like tautomer for a simple amide', () => {
    const inputSmiles = 'CC(=O)N'; // acetamide
    const res = parseSMILES(inputSmiles);
    const mol = res.molecules[0];
    if (!mol) throw new Error('failed to parse molecule');
    const tautomers = enumerateTautomers(mol, { maxTautomers: 32 });
    expect(tautomers.length).toBeGreaterThanOrEqual(1);
    const smilesList = tautomers.map(t => t.smiles);
    // There should be at least one tautomer with an OH (indicative of imidol-like form) or changed connectivity
    const hasImidolLike = smilesList.some(s => /O/.test(s) && (/(N=|=N)/.test(s)));
    expect(hasImidolLike).toBe(true);
  });
});
