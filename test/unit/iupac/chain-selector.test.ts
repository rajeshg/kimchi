import { describe, it, expect } from 'bun:test';
import type {
  Chain,
  FunctionalGroup,
  FunctionalGroupOccurrence,
  Substituent,
} from 'src/utils/iupac/iupac-types';
import {
  ChainSelector,
  createDefaultChainSelector,
} from 'src/utils/iupac/chain-selector';
import {
  LongestChainFilter,
  MostFunctionalGroupsFilter,
  MostSubstituentsFilter,
  LowestLocantFilter,
  AromaticPreferenceFilter,
  SymmetryFilter,
  createMinLengthFilter,
  createMaxLengthFilter,
  createCustomFilter,
} from 'src/utils/iupac/chain-filter';

/**
 * Helper to create test functional groups
 */
function createTestFG(overrides?: Partial<FunctionalGroup>): FunctionalGroup {
  return {
    name: 'test-fg',
    priority: 1,
    smarts: '[O]',
    suffix: '-ol',
    parenthesized: false,
    atomIndices: [0],
    isPrincipal: false,
    ...overrides,
  };
}

/**
 * Helper to create test substituents
 */
function createTestSubstituent(overrides?: Partial<Substituent>): Substituent {
  return {
    position: '1',
    type: 'alkyl',
    size: 1,
    name: 'methyl',
    ...overrides,
  };
}

/**
 * Helper to create test functional group occurrences
 */
function createTestFGOccurrence(
  overrides?: Partial<FunctionalGroupOccurrence>
): FunctionalGroupOccurrence {
  return {
    functionalGroup: createTestFG(),
    position: 1,
    count: 1,
    ...overrides,
  };
}

/**
 * Helper to create test chains
 */
function createTestChain(overrides?: Partial<Chain>): Chain {
  return {
    atomIndices: [0, 1, 2, 3],
    length: 4,
    functionalGroups: [],
    substituents: [],
    isAromatic: false,
    isCyclic: false,
    ...overrides,
  };
}

describe('ChainFilter Base Classes', () => {
  describe('LongestChainFilter', () => {
    it('scores chains by length', () => {
      const filter = new LongestChainFilter();
      const chain = createTestChain({ length: 5 });
      const result = filter.apply(chain);

      expect(result.passes).toBe(true);
      expect(result.score).toBe(5);
      expect(result.reason).toContain('5 atoms');
    });

    it('longer chains get higher scores', () => {
      const filter = new LongestChainFilter();
      const short = createTestChain({ length: 3 });
      const long = createTestChain({ length: 8 });

      const shortResult = filter.apply(short);
      const longResult = filter.apply(long);

      expect(longResult.score).toBeGreaterThan(shortResult.score);
    });
  });

  describe('MostFunctionalGroupsFilter', () => {
    it('scores by number of functional groups', () => {
      const filter = new MostFunctionalGroupsFilter();
      const fg1 = createTestFGOccurrence({
        functionalGroup: createTestFG({ name: 'carboxylic acid' }),
        position: 1,
      });
      const fg2 = createTestFGOccurrence({
        functionalGroup: createTestFG({ name: 'ketone' }),
        position: 2,
      });
      const chain = createTestChain({
        functionalGroups: [fg1, fg2],
      });

      const result = filter.apply(chain);
      expect(result.passes).toBe(true);
      expect(result.score).toBe(2);
      expect(result.reason).toContain('2');
    });

    it('chains with more functional groups score higher', () => {
      const filter = new MostFunctionalGroupsFilter();
      const fg1 = createTestFGOccurrence({
        functionalGroup: createTestFG({ name: 'hydroxyl' }),
      });
      const few = createTestChain({
        functionalGroups: [fg1],
      });
      const fg2 = createTestFGOccurrence({
        functionalGroup: createTestFG({ name: 'hydroxyl' }),
      });
      const fg3 = createTestFGOccurrence({
        functionalGroup: createTestFG({ name: 'ketone' }),
      });
      const fg4 = createTestFGOccurrence({
        functionalGroup: createTestFG({ name: 'aldehyde' }),
      });
      const many = createTestChain({
        functionalGroups: [fg2, fg3, fg4],
      });

      const fewResult = filter.apply(few);
      const manyResult = filter.apply(many);

      expect(manyResult.score).toBeGreaterThan(fewResult.score);
    });
  });

  describe('MostSubstituentsFilter', () => {
    it('scores by number of substituents', () => {
      const filter = new MostSubstituentsFilter();
      const sub1 = createTestSubstituent({ position: '2', name: 'methyl' });
      const sub2 = createTestSubstituent({ position: '3', name: 'ethyl' });
      const chain = createTestChain({
        substituents: [sub1, sub2],
      });

      const result = filter.apply(chain);
      expect(result.passes).toBe(true);
      expect(result.score).toBe(2);
    });
  });

  describe('LowestLocantFilter', () => {
    it('scores by minimum locant position', () => {
      const filter = new LowestLocantFilter();
      const sub = createTestSubstituent({ position: '3', name: 'methyl' });
      const chain = createTestChain({
        length: 6,
        substituents: [sub],
      });

      const result = filter.apply(chain);
      expect(result.passes).toBe(true);
      expect(result.reason).toContain('3');
    });

    it('prefers lower locants', () => {
      const filter = new LowestLocantFilter();
      const lowSub = createTestSubstituent({ position: '2', name: 'methyl' });
      const lowLocant = createTestChain({
        length: 6,
        substituents: [lowSub],
      });
      const highSub = createTestSubstituent({ position: '4', name: 'methyl' });
      const highLocant = createTestChain({
        length: 6,
        substituents: [highSub],
      });

      const lowResult = filter.apply(lowLocant);
      const highResult = filter.apply(highLocant);

      expect(lowResult.score).toBeGreaterThan(highResult.score);
    });

    it('handles chains with no substituents', () => {
      const filter = new LowestLocantFilter();
      const chain = createTestChain({ substituents: [] });

      const result = filter.apply(chain);
      expect(result.passes).toBe(true);
      expect(result.score).toBe(0);
    });
  });

  describe('AromaticPreferenceFilter', () => {
    it('prefers aromatic chains', () => {
      const filter = new AromaticPreferenceFilter();
      const aromatic = createTestChain({ isAromatic: true });
      const aliphatic = createTestChain({ isAromatic: false });

      const aromaticResult = filter.apply(aromatic);
      const aliphaticResult = filter.apply(aliphatic);

      expect(aromaticResult.score).toBeGreaterThan(aliphaticResult.score);
      expect(aromaticResult.reason).toContain('Aromatic');
      expect(aliphaticResult.reason).toContain('Aliphatic');
    });
  });

  describe('createMinLengthFilter', () => {
    it('passes chains meeting minimum length', () => {
      const filter = createMinLengthFilter(4);
      const chain = createTestChain({ length: 5 });

      const result = filter.apply(chain);
      expect(result.passes).toBe(true);
    });

    it('fails chains below minimum length', () => {
      const filter = createMinLengthFilter(4);
      const chain = createTestChain({ length: 2 });

      const result = filter.apply(chain);
      expect(result.passes).toBe(false);
      expect(result.reason).toContain('too short');
    });
  });

  describe('createMaxLengthFilter', () => {
    it('passes chains within maximum length', () => {
      const filter = createMaxLengthFilter(10);
      const chain = createTestChain({ length: 8 });

      const result = filter.apply(chain);
      expect(result.passes).toBe(true);
    });

    it('fails chains exceeding maximum length', () => {
      const filter = createMaxLengthFilter(10);
      const chain = createTestChain({ length: 12 });

      const result = filter.apply(chain);
      expect(result.passes).toBe(false);
      expect(result.reason).toContain('too long');
    });
  });

  describe('createCustomFilter', () => {
    it('applies custom predicate and scorer', () => {
      const filter = createCustomFilter(
        'test-filter',
        10,
        (chain: Chain) => chain.length > 2,
        (chain: Chain) => chain.length * 10
      );

      const passChain = createTestChain({ length: 5 });
      const failChain = createTestChain({ length: 2 });

      const passResult = filter.apply(passChain);
      expect(passResult.passes).toBe(true);
      expect(passResult.score).toBe(50);

      const failResult = filter.apply(failChain);
      expect(failResult.passes).toBe(false);
      expect(failResult.score).toBe(0);
    });
  });

  describe('SymmetryFilter', () => {
    it('detects symmetric substituent positions', () => {
      const filter = new SymmetryFilter();
      const sub1 = createTestSubstituent({ position: '2', name: 'methyl' });
      const sub2 = createTestSubstituent({ position: '2', name: 'ethyl' });
      const symmetricChain = createTestChain({
        length: 5,
        substituents: [sub1, sub2],
      });

      const result = (filter as any).applyWithContext(symmetricChain, {});
      expect(result.reason).toContain('Symmetric');
    });
  });
});

describe('ChainSelector', () => {
  describe('Single chain selection', () => {
    it('returns null for empty chain list', () => {
      const selector = createDefaultChainSelector();
      const result = selector.selectBestChain([]);

      expect(result.selectedChain).toBeNull();
      expect(result.reason).toContain('No chains');
    });

    it('selects only chain when just one available', () => {
      const selector = createDefaultChainSelector();
      const chain = createTestChain({ length: 5 });

      const result = selector.selectBestChain([chain]);

      expect(result.selectedChain).toBe(chain);
      expect(result.reason).toContain('Only one');
    });
  });

  describe('Multiple chain selection', () => {
    it('selects longest chain as primary criterion', () => {
      const selector = createDefaultChainSelector();
      const short = createTestChain({ length: 4 });
      const long = createTestChain({ length: 8 });

      const result = selector.selectBestChain([short, long]);

      expect(result.selectedChain).toBe(long);
    });

    it('narrows down using multiple filters', () => {
      const selector = createDefaultChainSelector();
      const fg = createTestFGOccurrence({
        functionalGroup: createTestFG({ name: 'carboxylic acid' }),
        position: 1,
      });
      const chain1 = createTestChain({
        length: 6,
        functionalGroups: [fg],
      });
      const sub = createTestSubstituent({ position: '2', name: 'methyl' });
      const chain2 = createTestChain({
        length: 6,
        functionalGroups: [fg],
        substituents: [sub],
      });

      const result = selector.selectBestChain([chain1, chain2]);

      expect(result.selectedChain).toBe(chain2);
    });

    it('applies aromatic preference when other criteria are equal', () => {
      const selector = createDefaultChainSelector();
      const aliphatic = createTestChain({
        length: 6,
        isAromatic: false,
      });
      const aromatic = createTestChain({
        length: 6,
        isAromatic: true,
      });

      const result = selector.selectBestChain([aliphatic, aromatic]);

      expect(result.selectedChain).toBe(aromatic);
    });
  });

  describe('Filter management', () => {
    it('adds custom filters', () => {
      const selector = createDefaultChainSelector();
      const initialCount = selector.getFilters().length;

      const customFilter = createMinLengthFilter(3);
      selector.addFilter(customFilter);

      expect(selector.getFilters().length).toBe(initialCount + 1);
    });

    it('sorts filters by priority', () => {
      const selector = new ChainSelector();
      const filters = selector.getFilters();

      for (let i = 0; i < filters.length - 1; i++) {
        expect(filters[i]!.getPriority()).toBeLessThanOrEqual(filters[i + 1]!.getPriority());
      }
    });

    it('resets to default filters', () => {
      const selector = createDefaultChainSelector();
      selector.addFilter(createMinLengthFilter(5));

      selector.resetToDefaults();

      const filters = selector.getFilters();
      expect(filters.some(f => f.getName() === 'longest-chain')).toBe(true);
      expect(filters.some(f => f.getName() === 'min-length-5')).toBe(false);
    });
  });

  describe('Complex selection scenarios', () => {
    it('handles tie-breaking with multiple criteria', () => {
      const selector = createDefaultChainSelector();
      const sub1 = createTestSubstituent({ position: '2', name: 'methyl' });
      const sub2 = createTestSubstituent({ position: '4', name: 'ethyl' });
      const sub3 = createTestSubstituent({ position: '2', name: 'methyl' });
      const sub4 = createTestSubstituent({ position: '3', name: 'ethyl' });
      const candidates: Chain[] = [
        createTestChain({
          length: 6,
          substituents: [sub1, sub2],
        }),
        createTestChain({
          length: 6,
          substituents: [sub3, sub4],
        }),
      ];

      const result = selector.selectBestChain(candidates);

      expect(result.selectedChain).toBeDefined();
      expect(result.filterResults.size).toBeGreaterThan(0);
    });

    it('provides detailed filter results for debugging', () => {
      const selector = createDefaultChainSelector();
      const chain1 = createTestChain({ length: 5 });
      const chain2 = createTestChain({ length: 8 });

      const result = selector.selectBestChain([chain1, chain2]);

      expect(result.filterResults.size).toBeGreaterThan(0);
      expect(result.filterResults.has('longest-chain')).toBe(true);

      const longestResults = result.filterResults.get('longest-chain');
      expect(longestResults?.length).toBe(2);
    });

    it('builds meaningful selection reason', () => {
      const selector = createDefaultChainSelector();
      const chains = [
        createTestChain({ length: 4 }),
        createTestChain({ length: 7 }),
      ];

      const result = selector.selectBestChain(chains);

      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.reason).not.toContain('undefined');
    });
  });

  describe('Integration with filters', () => {
    it('works with minimum length constraint', () => {
      const filters = [createMinLengthFilter(5), new LongestChainFilter()];
      const selector = new ChainSelector(filters);

      const short = createTestChain({ length: 3 });
      const long = createTestChain({ length: 8 });

      const result = selector.selectBestChain([short, long]);

      expect(result.selectedChain).toBe(long);
    });

    it('respects all filter constraints', () => {
      const filters = [
        createMinLengthFilter(4),
        createMaxLengthFilter(8),
        new LongestChainFilter(),
      ];
      const selector = new ChainSelector(filters);

      const tooShort = createTestChain({ length: 2 });
      const tooLong = createTestChain({ length: 10 });
      const justRight = createTestChain({ length: 6 });

      const result = selector.selectBestChain([tooShort, tooLong, justRight]);

      expect(result.selectedChain).toBe(justRight);
    });
  });
});

describe('createDefaultChainSelector', () => {
  it('returns a ChainSelector instance', () => {
    const selector = createDefaultChainSelector();
    expect(selector).toBeInstanceOf(ChainSelector);
  });

  it('initializes with default filters', () => {
    const selector = createDefaultChainSelector();
    const filters = selector.getFilters();

    expect(filters.length).toBeGreaterThan(0);
    expect(filters.some(f => f.getName() === 'longest-chain')).toBe(true);
    expect(filters.some(f => f.getName() === 'aromatic-preference')).toBe(true);
  });
});
