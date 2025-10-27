import { describe, it, expect } from 'bun:test';
import { findLongestHeteroChain, generateHeteroPrefixes, generateChainBaseName } from '../../src/utils/iupac/iupac-chains';
import { BondType } from '../../types';

describe('IUPAC heteroatom utilities', () => {
  it('generateHeteroPrefixes orders prefixes by priority and formats positions', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, // 0
        { symbol: 'O' }, // 1 -> oxa (position 2)
        { symbol: 'N' }, // 2 -> aza (position 3)
        { symbol: 'S' }, // 3 -> thia (position 4)
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2, 3];
    const prefixes = generateHeteroPrefixes(mainChain, molecule);

    // Priority order inside implementation: ['oxa', 'thia', 'aza', ...]
    expect(prefixes).toEqual(['2-oxa', '4-thia', '3-aza']);
  });

  it('findLongestHeteroChain returns the hetero-only chain when no carbons present', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'O' }, // 0
        { symbol: 'N' }, // 1
        { symbol: 'S' }, // 2
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
      ],
    };

    const chain = findLongestHeteroChain(molecule as any);
    expect(chain.length).toBe(3);
    expect(new Set(chain)).toEqual(new Set([0, 1, 2]));
  });

  it('findLongestHeteroChain prefers carbon chain when carbons exist', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, // 0
        { symbol: 'C' }, // 1
        { symbol: 'C' }, // 2
        { symbol: 'O' }, // 3
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE },
      ],
    };

    const chain = findLongestHeteroChain(molecule as any);
    // Should prefer and return the carbon chain (length 3)
    expect(chain.length).toBeGreaterThanOrEqual(3);
    // The returned chain should include the three carbon indices
    expect(new Set(chain)).toEqual(new Set([0, 1, 2]));
  });

  it('generateChainBaseName returns a hetero- prefixed base when heteroatoms are present', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, // 0
        { symbol: 'O' }, // 1
        { symbol: 'C' }, // 2
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2];
    const base = generateChainBaseName(mainChain, molecule as any);
    expect(base).not.toBeNull();
    expect(base!.hydrocarbonBase.startsWith('hetero')).toBeTruthy();
    expect(base!.unsaturation).toBeNull();
  });
});
