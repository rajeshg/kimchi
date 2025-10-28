import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { enumerateTautomers } from 'src/utils/tautomer/tautomer-enumerator';

describe('tautomer: fingerprint collision handling', () => {
  it('keeps distinct SMILES when fingerprint collides (forced small fpSize)', () => {
    const smi = 'CC(=O)N'; // acetamide - produces multiple tautomers
    const parsed = parseSMILES(smi);
    if (!parsed || !parsed.molecules || parsed.molecules.length === 0) throw new Error('parse failed');
    const mol = parsed.molecules[0]!;

    // Run with fingerprint dedup forced to tiny size to cause collisions
    const withFp = enumerateTautomers(mol, { maxTautomers: 128, phases: [1,2,3], useFingerprintDedup: true, fpSize: 1 });
    const withoutFp = enumerateTautomers(mol, { maxTautomers: 128, phases: [1,2,3], useFingerprintDedup: false });

    const setWithFp = new Set(withFp.map(x => x.smiles));
    const setWithoutFp = new Set(withoutFp.map(x => x.smiles));

    // Ensure fingerprint collisions (small fpSize) do not collapse distinct SMILES
    expect(setWithFp.size).toBe(setWithoutFp.size);
    for (const s of setWithoutFp) expect(setWithFp.has(s)).toBeTruthy();
  });
});
