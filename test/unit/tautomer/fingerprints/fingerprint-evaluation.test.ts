import { parseSMILES } from 'index';
import { enumerateTautomers } from 'src/utils/tautomer/tautomer-enumerator';
import { computeMorganFingerprint, tanimotoSimilarity } from 'src/utils/morgan-fingerprint';
import { describe, it, expect } from 'bun:test';

const molecules = [
  { name: 'pentane-2,4-dione', smiles: 'CC(=O)CH2C(=O)C' },
  { name: '2-butanone', smiles: 'CC(=O)C' },
  { name: 'imine', smiles: 'C=NH' },
  { name: 'acetamide', smiles: 'CC(=O)N' },
  { name: 'nitro', smiles: 'CC[N+](=O)[O-]' },
];

describe('tautomer: fingerprint evaluation', () => {
  it('computes fingerprint uniqueness & similarity for tautomers', () => {
    for (const m of molecules) {
      const parsed = parseSMILES(m.smiles);
      if (!parsed || !parsed.molecules || parsed.molecules.length === 0) throw new Error('Failed to parse SMILES: ' + m.smiles);
      const mol = parsed.molecules[0]!;
      const tautomers = enumerateTautomers(mol, { maxTautomers: 128, phases: [1,2,3] });
      const smilesList = tautomers.map(t => t.smiles);
      const uniqueSmiles = Array.from(new Set(smilesList));
      const fps = uniqueSmiles.map(s => {
        const parsedS = parseSMILES(s);
        if (!parsedS || !parsedS.molecules || parsedS.molecules.length === 0) throw new Error('Failed to parse SMILES during test: ' + s);
        return { s, fp: computeMorganFingerprint(parsedS.molecules[0]!) };
      });

      // Collision check: count how many distinct SMILES share identical fingerprints
      const fpMap = new Map<string, string[]>();
      for (const { s, fp } of fps) {
        const key = Buffer.from(fp).toString('hex');
        const arr = fpMap.get(key) ?? [];
        arr.push(s);
        fpMap.set(key, arr);
      }

      const collisions = Array.from(fpMap.values()).filter(v => v.length > 1);
      if (process.env.VERBOSE) {
  console.log(`Molecule: ${m.name} (${m.smiles}) -> tautomers=${tautomers.length} uniqueSmiles=${uniqueSmiles.length} fingerprintBuckets=${fpMap.size} collisions=${collisions.length}`);
}
      if (collisions.length > 0) {
        if (process.env.VERBOSE) {
  console.log('Collisions detail:', collisions);
}
      }

      // Compute pairwise Tanimoto similarities for insights
      const sims: number[] = [];
      for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
          const s1 = fps[i]!.fp;
          const s2 = fps[j]!.fp;
          sims.push(tanimotoSimilarity(s1, s2));
        }
      }
      const minSim = sims.length ? Math.min(...sims) : 1.0;
      const maxSim = sims.length ? Math.max(...sims) : 1.0;
      const avgSim = sims.length ? sims.reduce((a,b)=>a+b,0)/sims.length : 1.0;
      if (process.env.VERBOSE) {
  console.log(`  Tanimoto sims: count=${sims.length} min=${minSim.toFixed(3)} avg=${avgSim.toFixed(3)} max=${maxSim.toFixed(3)}`);
}

      // Assert: fingerprint bucket count should be equal to uniqueSmiles (no collisions)
      expect(fpMap.size).toBe(uniqueSmiles.length);
    }
  });
});
