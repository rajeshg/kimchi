import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';

describe('IUPAC chain candidate builders (internal helpers)', () => {
  it('decalin should have ring-based candidates', () => {
    const res = parseSMILES('C1CCC2CCCCC2C1');
    expect(res.errors).toEqual([]);
    const mol = res.molecules[0]!;
    // ensure ring analysis finds rings
    const ra = require('src/utils/ring-analysis');
    const rings = ra.analyzeRings(mol).rings;
    expect(rings.length).toBeGreaterThanOrEqual(2);
  });

  it('biphenyl should be identified by fused naming', async () => {
    const res = parseSMILES('c1ccccc1-c2ccccc2');
    expect(res.errors).toEqual([]);
    const mol = res.molecules[0]!;
    const fn = await import('src/utils/iupac/iupac-rings/fused-naming');
    const rings = (await import('src/utils/ring-analysis')).analyzeRings(mol).rings;
    const name = fn.identifyPolycyclicPattern(rings, mol);
    expect(name).toBe('biphenyl');
  });

  it('spiro system should expose a spiro relation', () => {
    const res = parseSMILES('C1C(C2CCCCC2)CCCC1');
    expect(res.errors).toEqual([]);
    const mol = res.molecules[0]!;
    const ra = require('src/utils/ring-analysis');
    const rings = ra.analyzeRings(mol).rings;
    // prefer the ring classification helper for spiro detection
    const cls = require('src/utils/ring-analysis').classifyRingSystems(mol.atoms, mol.bonds);
    expect(rings.length).toBeGreaterThanOrEqual(2);
    expect(cls.spiro.length).toBeGreaterThanOrEqual(1);
  });
});
