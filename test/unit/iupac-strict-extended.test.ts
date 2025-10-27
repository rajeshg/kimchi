import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMainChain, generateChainBaseName, findLongestCarbonChain } from 'src/utils/iupac/iupac-chains';

describe('IUPAC strict extended tests', () => {
  it('handles conjugated dienes and picks lowest locants (C=CC=CC)', () => {
    const result = parseSMILES('C=CC=CC');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    const base = generateChainBaseName(main, mol);
    expect(base).not.toBeNull();
    expect(base!.unsaturation).not.toBeNull();
    expect(base!.unsaturation!.type).toBe('ene');
    // for conjugated pentadiene style sequence expect lowest first locant to be 1
    expect(base!.unsaturation!.positions[0]).toBe(1);
  });

  it('handles terminal triple bond renumbering (C#CC)', () => {
    const result = parseSMILES('C#CC');
    const mol = result.molecules[0]!;
    const main = findMainChain(mol);
    const base = generateChainBaseName(main, mol);
    expect(base).not.toBeNull();
    expect(base!.unsaturation).not.toBeNull();
    expect(base!.unsaturation!.type).toBe('yne');
    expect(base!.unsaturation!.positions[0]).toBe(1);
  });

  it('scales to very long linear chains (200 carbons)', () => {
    const carbons = 200;
    const smiles = 'C'.repeat(carbons);
    const result = parseSMILES(smiles);
    const mol = result.molecules[0]!;
    const longest = findLongestCarbonChain(mol);
    const main = findMainChain(mol);
    expect(longest.length).toBe(carbons);
    expect(main.length).toBe(carbons);
  });
});
