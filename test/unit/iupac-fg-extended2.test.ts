import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMainChain, getChainFunctionalGroupPriority } from 'src/utils/iupac/iupac-chains';

describe('IUPAC functional-group priority (additional patterns)', () => {
  it('detects anhydride (acetic anhydride)', () => {
    const result = parseSMILES('CC(=O)OC(=O)C');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    expect(main.length).toBeGreaterThanOrEqual(2);
    const p = getChainFunctionalGroupPriority(main, mol);
    expect(p).toBeGreaterThanOrEqual(5);
  });

  it('detects isocyanate (methyl isocyanate CN=C=O)', () => {
    const result = parseSMILES('CN=C=O');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    expect(main.length).toBeGreaterThanOrEqual(2);
    const p = getChainFunctionalGroupPriority(main, mol);
    expect(p).toBeGreaterThanOrEqual(5);
  });

  it('detects isothiocyanate (methyl isothiocyanate CN=C=S)', () => {
    const result = parseSMILES('CN=C=S');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    expect(main.length).toBeGreaterThanOrEqual(2);
    const p = getChainFunctionalGroupPriority(main, mol);
    expect(p).toBeGreaterThanOrEqual(5);
  });

  it('detects sulfonyl chloride (RSO2Cl)', () => {
    const result = parseSMILES('CS(=O)(=O)Cl');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    expect(main.length).toBeGreaterThanOrEqual(2);
    const p = getChainFunctionalGroupPriority(main, mol);
    expect(p).toBeGreaterThanOrEqual(5);
  });
});
