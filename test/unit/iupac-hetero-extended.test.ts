import { describe, it, expect } from 'bun:test';
import { generateHeteroPrefixes, generateChainBaseName } from '../../src/utils/iupac/iupac-chains';
import { BondType } from '../../types';

describe('IUPAC heteroatom extended cases', () => {
  it('places priority hetero prefixes before halogens and others', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, // 0
        { symbol: 'O' }, // 1 -> 2-oxa
        { symbol: 'F' }, // 2 -> 3-fluora
        { symbol: 'Cl' }, // 3 -> 4-chlora
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2, 3];
    const prefixes = generateHeteroPrefixes(mainChain, molecule);

    // 'oxa' is priority and should come before halogen-derived prefixes
    const oxaIndex = prefixes.findIndex(p => p.includes('oxa'));
    const chlIndex = prefixes.findIndex(p => p.includes('chlora'));
    const fluIndex = prefixes.findIndex(p => p.includes('fluora'));

    expect(oxaIndex).toBeGreaterThanOrEqual(0);
    expect(chlIndex).toBeGreaterThanOrEqual(0);
    expect(fluIndex).toBeGreaterThanOrEqual(0);

    expect(oxaIndex).toBeLessThan(chlIndex);
    expect(oxaIndex).toBeLessThan(fluIndex);
  });

  it('generates unsaturation info correctly alongside heteroatoms', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, // 0
        { symbol: 'C' }, // 1
        { symbol: 'O' }, // 2
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE }, // double at position 1
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2];
    const base = generateChainBaseName(mainChain, molecule as any);
    expect(base).not.toBeNull();
    expect(base!.unsaturation).not.toBeNull();
    expect(base!.unsaturation!.type).toBe('ene');
    // double bond should be at position 1 (lowest numbering)
    expect(base!.unsaturation!.positions[0]).toBe(1);
    // hetero present -> hetero prefix expected in hydrocarbonBase
    expect(base!.hydrocarbonBase.startsWith('hetero')).toBeTruthy();
  });

  it('respects the configured priority order for multiple hetero types', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, // 0
        { symbol: 'O' }, // 1 -> oxa
        { symbol: 'S' }, // 2 -> thia
        { symbol: 'N' }, // 3 -> aza
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2, 3];
    const prefixes = generateHeteroPrefixes(mainChain, molecule);
    // priorityOrder = ['oxa', 'thia', 'aza', ...]
    expect(prefixes[0]).toContain('oxa');
    expect(prefixes[1]).toContain('thia');
    expect(prefixes[2]).toContain('aza');
  });
});
