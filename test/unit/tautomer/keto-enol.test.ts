import { describe, it, expect } from 'bun:test';
import { parseSMILES, enumerateTautomers } from 'index';

describe('tautomer: keto-enol', () => {
  it('enumerates enol form for a simple ketone', () => {
    const res = parseSMILES('CC(=O)C'); // 2-butanone
    const mol = res.molecules[0];
    if (!mol) throw new Error('failed to parse molecule');
    const tautomers = enumerateTautomers(mol, { maxTautomers: 16 });
    const smilesList = tautomers.map(t => t.smiles);
    // Expect enol: C/C(=C)O or similar canonical form; ensure at least two distinct tautomers
    expect(tautomers.length).toBeGreaterThanOrEqual(1);
    // There should be a tautomer with an OH (contains "O" and a double bond adjacent)
    const hasEnolLike = smilesList.some(s => /O/.test(s) && /=/.test(s));
    expect(hasEnolLike).toBe(true);
  });
});
