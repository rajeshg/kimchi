import type { Chain } from './iupac-types';
import type { ChainFilter, FilterResult, ChainFilterContext } from './chain-filter';
import {
  LongestChainFilter,
  MostFunctionalGroupsFilter,
  MostSubstituentsFilter,
  LowestLocantFilter,
  AromaticPreferenceFilter,
  ContextualChainFilter,
} from './chain-filter';
import { PrincipalFunctionalGroupFilter, RingDominanceFilter } from './chain-filter';

/**
 * Result of chain selection process
 */
export interface ChainSelectionOutcome {
  /** The selected chain */
  selectedChain: Chain | null;
  /** Reason why this chain was selected */
  reason: string;
  /** All candidate chains that were evaluated */
  candidates: Chain[];
  /** Filter results for debugging — stored as tuples so we can map results to chains */
  filterResults: Map<string, { chain: Chain; result: FilterResult }[]>;
}

/**
 * Orchestrates chain selection using a composable filter pipeline
 * Implements IUPAC rules for principal chain selection
 */
export class ChainSelector {
  private filters: ChainFilter[];

  constructor(filters?: ChainFilter[]) {
    // Default filters in IUPAC order
    this.filters = filters || [
      new PrincipalFunctionalGroupFilter(),
      new LongestChainFilter(),
      new RingDominanceFilter(),
      new MostFunctionalGroupsFilter(),
      new MostSubstituentsFilter(),
      new LowestLocantFilter(),
      new AromaticPreferenceFilter(),
    ];

    // Sort filters by priority (lower priority value = evaluated first)
    this.filters.sort((a, b) => a.getPriority() - b.getPriority());
  }

  /**
   * Select the best chain from a list of candidates
   * Applies each filter in order, narrowing down the candidates
   */
  selectBestChain(
    chains: Chain[],
    context?: ChainFilterContext
  ): ChainSelectionOutcome {
    if (chains.length === 0) {
      return {
        selectedChain: null,
        reason: 'No chains provided',
        candidates: [],
        filterResults: new Map(),
      };
    }

    if (chains.length === 1) {
      return {
        selectedChain: chains[0] || null,
        reason: 'Only one chain available',
        candidates: chains,
        filterResults: new Map(),
      };
    }

    let remainingChains = [...chains];
  const filterResults = new Map<string, { chain: Chain; result: FilterResult }[]>();

    // Apply each filter
    for (const filter of this.filters) {

      const results: FilterResult[] = [];

      // Build tuples so we keep results aligned with specific chains
      const tuples: { chain: Chain; result: FilterResult }[] = [];

      if (filter instanceof ContextualChainFilter) {
        // Contextual filters need additional context
        if (!context) {
          continue; // Skip if no context available
        }
        for (const chain of remainingChains) {
          const result = (filter as any).applyWithContext(chain, context);
          results.push(result);
          tuples.push({ chain, result });
        }
      } else {
        // Regular filters apply directly
        for (const chain of remainingChains) {
          const result = filter.apply(chain);
          results.push(result);
          tuples.push({ chain, result });
        }
      }

      // store tuples so that later we can find the result for the selected chain
      filterResults.set(
        filter.getName(),
        tuples.map(t => ({ chain: t.chain, result: t.result }))
      );

      // Keep only chains that pass this filter
      const passingTuples = tuples.filter(t => t.result.passes !== false);

      // If no chains pass this filter, selection fails — clear remainingChains
      if (passingTuples.length === 0) {
        remainingChains = [];
        break;
      }

      // Narrow to only passing chains first
      remainingChains = passingTuples.map(t => t.chain);

      // If multiple chains remain, pick those with the max score for this filter
      // NOTE: some filters are pure constraints (e.g., min-length/max-length) and
      // shouldn't perform score-based tie-breaking at this stage — allow later
      // filters to further narrow the set. Detect those by name prefix.
      const name = filter.getName();
      const isConstraintFilter = name.startsWith('min-length') || name.startsWith('max-length');

      if (remainingChains.length > 1 && !isConstraintFilter) {
        const scores = passingTuples.map(t => t.result.score ?? 0);
        const maxScore = Math.max(...scores);
        // Keep tuples that match max score and update remainingChains accordingly
        const topTuples = passingTuples.filter(t => (t.result.score ?? 0) === maxScore);
        remainingChains = topTuples.map(t => t.chain);
      }
    }

    const selectedChain = remainingChains[0] || null;
  const reason = this.buildSelectionReason(filterResults, selectedChain, chains.length);

    return {
      selectedChain,
      reason,
      candidates: chains,
      filterResults,
    };
  }

  /**
   * Build a human-readable reason for the chain selection
   */
  private buildSelectionReason(
    filterResults: Map<string, { chain: Chain; result: FilterResult }[]>,
    selectedChain: Chain | null,
    totalChains: number
  ): string {
    if (!selectedChain) {
      return `No chain selected from ${totalChains} candidates`;
    }

    const reasons: string[] = [];

    for (const [filterName, tuples] of filterResults) {
      if (tuples.length === 0) continue;

      const match = tuples.find(t => t.chain === selectedChain);
      if (match) {
        reasons.push(`${filterName}: ${match.result.reason || 'pass'}`);
      }
    }

    return reasons.length > 0 ? reasons.join('; ') : 'Selected best chain';
  }

  /**
   * Add a custom filter to the selector
   */
  addFilter(filter: ChainFilter): void {
    this.filters.push(filter);
    this.filters.sort((a, b) => a.getPriority() - b.getPriority());
  }

  /**
   * Get current filters
   */
  getFilters(): ChainFilter[] {
    return [...this.filters];
  }

  /**
   * Reset to default filters
   */
  resetToDefaults(): void {
    this.filters = [
      new PrincipalFunctionalGroupFilter(),
      new LongestChainFilter(),
      new RingDominanceFilter(),
      new MostFunctionalGroupsFilter(),
      new MostSubstituentsFilter(),
      new LowestLocantFilter(),
      new AromaticPreferenceFilter(),
    ];
  }
}

/**
 * Create a default chain selector instance
 */
export function createDefaultChainSelector(): ChainSelector {
  return new ChainSelector();
}
