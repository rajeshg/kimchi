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
  /** Filter results for debugging */
  filterResults: Map<string, FilterResult[]>;
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
    const filterResults = new Map<string, FilterResult[]>();

    // Apply each filter
    for (const filter of this.filters) {
      if (remainingChains.length === 1) {
        break; // Already narrowed down to one chain
      }

      const results: FilterResult[] = [];

      if (filter instanceof ContextualChainFilter) {
        // Contextual filters need additional context
        if (!context) {
          continue; // Skip if no context available
        }
        for (const chain of remainingChains) {
          const result = (filter as any).applyWithContext(chain, context);
          results.push(result);
        }
      } else {
        // Regular filters apply directly
        for (const chain of remainingChains) {
          const result = filter.apply(chain);
          results.push(result);
        }
      }

      filterResults.set(filter.getName(), results);

      // Filter out chains that don't pass
      const passingChains = remainingChains.filter((_, i) => results[i]?.passes !== false);

      if (passingChains.length > 0) {
        remainingChains = passingChains;
      }

      // Find chains with the highest score for this filter
      if (remainingChains.length > 1 && results.length > 0) {
        const passingResults = results.filter(r => r.passes !== false);
        const scores = remainingChains.map((_, i) => passingResults[i]?.score ?? 0);
        const maxScore = Math.max(...scores);
        remainingChains = remainingChains.filter((_, i) => scores[i] === maxScore);
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
    filterResults: Map<string, FilterResult[]>,
    selectedChain: Chain | null,
    totalChains: number
  ): string {
    if (!selectedChain) {
      return `No chain selected from ${totalChains} candidates`;
    }

    const reasons: string[] = [];

    for (const [filterName, results] of filterResults) {
      if (results.length === 0) continue;

      // Find the result for the selected chain
      const selectedIndex = results.findIndex(r => r.passes);
      if (selectedIndex >= 0) {
        reasons.push(`${filterName}: ${results[selectedIndex]?.reason || 'pass'}`);
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
