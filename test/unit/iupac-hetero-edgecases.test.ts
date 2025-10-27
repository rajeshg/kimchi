import { describe, it, expect } from 'bun:test';
import {
  generateHeteroPrefixes,
  findSubstituents,
  generateSubstitutedName,
} from '../../src/utils/iupac/iupac-chains';
import { BondType } from '../../types';

describe('IUPAC heteroatom edge cases', () => {
  it('handles multiple identical hetero types at different positions (oxa at 2 and 4)', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, // 0
        { symbol: 'O' }, // 1 -> pos 2
        { symbol: 'C' }, // 2
        { symbol: 'O' }, // 3 -> pos 4
        { symbol: 'C' }, // 4
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE },
        { atom1: 3, atom2: 4, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2, 3, 4];
    const prefixes = generateHeteroPrefixes(mainChain, molecule);
    expect(prefixes).toEqual(['2-oxa', '4-oxa']);
  });

  it('orders halogen prefixes by position (numeric order preserved)', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, //0
        { symbol: 'F' }, //1 pos2
        { symbol: 'C' }, //2
        { symbol: 'Cl' }, //3 pos4
        { symbol: 'C' }, //4
        { symbol: 'Br' }, //5 pos6
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE },
        { atom1: 3, atom2: 4, type: BondType.SINGLE },
        { atom1: 4, atom2: 5, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2, 3, 4, 5];
    const prefixes = generateHeteroPrefixes(mainChain, molecule);
    // ensure halogens appear and numeric ordering corresponds to positions 2,4,6
    expect(prefixes).toContain('2-fluora');
    expect(prefixes).toContain('4-chlora');
    expect(prefixes).toContain('6-broma');
    const idxFlu = prefixes.indexOf('2-fluora');
    const idxChl = prefixes.indexOf('4-chlora');
    const idxBro = prefixes.indexOf('6-broma');
    // sanity checks
    expect(idxFlu).toBeGreaterThanOrEqual(0);
    expect(idxChl).toBeGreaterThanOrEqual(0);
    expect(idxBro).toBeGreaterThanOrEqual(0);
    // numeric order should be ascending
    expect(idxFlu!).toBeLessThan(idxChl!);
    expect(idxChl!).toBeLessThan(idxBro!);
  });

  it('detects hydroxy substituent attached to main chain', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, //0
        { symbol: 'C' }, //1
        { symbol: 'C' }, //2
        { symbol: 'O', hydrogens: 1 }, //3 substituent on atom 1 -> position 2
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
        { atom1: 1, atom2: 3, type: BondType.SINGLE },
      ],
    };

    const mainChain = [0, 1, 2];
    const subs = findSubstituents(molecule, mainChain as any);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.some(s => s.name === 'hydroxy' && s.position === '2')).toBeTruthy();
  });

  it('generateSubstitutedName merges hetero and substituent prefixes and sorts lexicographically', () => {
    const substituents = [{ position: '2', name: 'methyl' } as any];
    const heteroPrefixes = ['2-oxa'];
    const unsaturation = { type: 'ene' as const, positions: [1] };
    const name = generateSubstitutedName('prop', substituents, heteroPrefixes, unsaturation);
  // lexicographic sort: '2-methyl' comes before '2-oxa'
  // After IUPAC-style hyphen insertion between prefixes and base, expect the hyphenated form
  expect(name).toBe('2-methyl-2-oxa-propene');
  });

  it('handles unknown hetero symbols with default suffix', () => {
    const molecule: any = {
      atoms: [
        { symbol: 'C' }, //0
        { symbol: 'Se' }, //1 -> 'sea' default
        { symbol: 'C' }, //2
      ],
      bonds: [
        { atom1: 0, atom2: 1, type: BondType.SINGLE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE },
      ],
    };

    const prefixes = generateHeteroPrefixes([0, 1, 2], molecule);
    expect(prefixes).toContain('2-sea');
  });
});
