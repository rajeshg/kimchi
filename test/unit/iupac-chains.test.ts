import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMainChain, findLongestCarbonChain, findSubstituents } from 'src/utils/iupac/iupac-chains';

describe('IUPAC chain selection', () => {
  it('selects propane as main chain for isobutane (CC(C)C)', () => {
    const result = parseSMILES('CC(C)C');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    expect(main.length).toBe(3); // propane
    const subs = findSubstituents(mol, main);
    expect(subs.length).toBe(1);
  });

  it('selects the 4-carbon parent for 2-methylbutane (CC(C)CC)', () => {
    const result = parseSMILES('CC(C)CC');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    expect(main.length).toBe(4); // butane
    const subs = findSubstituents(mol, main);
    expect(subs.length).toBe(1);
  });

  it('handles long linear chains (60 carbons) efficiently', () => {
    const carbons = 60;
    const smiles = 'C'.repeat(carbons);
    const result = parseSMILES(smiles);
    const mol = result.molecules[0]!;
    const main = findLongestCarbonChain(mol);
    expect(main.length).toBe(carbons);
    const main2 = findMainChain(mol);
    expect(main2.length).toBe(carbons);
  });

  it('selects main chain correctly for large branched chain (50+ carbons with branches)', () => {
    const total = 55;
    const branchAt = 20;
    // Build SMILES where a methyl branch is attached at carbon `branchAt`
    // e.g., C...C(C)C...C
    const smiles = 'C'.repeat(branchAt) + '(C)' + 'C'.repeat(total - branchAt);
    const result = parseSMILES(smiles);
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    expect(main.length).toBe(total);
    const subs = findSubstituents(mol, main);
    // exactly one methyl branch
    expect(subs.length).toBe(1);
  });
});
