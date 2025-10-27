import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMainChain, generateChainBaseName, findSubstituents } from 'src/utils/iupac/iupac-chains';

describe('IUPAC stricter assertions', () => {
  it('chooses chain giving lowest double-bond locant for C=CC(C)CC', () => {
    const result = parseSMILES('C=CC(C)CC');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    const base = generateChainBaseName(main, mol);
    expect(base).not.toBeNull();
    expect(base!.unsaturation).not.toBeNull();
    // strict: double bond should be numbered at position 1 on the chosen main chain
    expect(base!.unsaturation!.positions[0]).toBe(1);
  });

  it('reports substituent locant 2 for isobutane (CC(C)C)', () => {
    const result = parseSMILES('CC(C)C');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    const subs = findSubstituents(mol, main).map(s => s.position).sort();
    expect(subs).toEqual(['2']);
  });

  it('reports two substituents at position 2 for CC(C)(C)C (2,2-dimethylpropane)', () => {
    const result = parseSMILES('CC(C)(C)C');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    const subs = findSubstituents(mol, main).map(s => s.position).sort();
    expect(subs).toEqual(['2', '2']);
  });
});
