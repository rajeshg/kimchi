import type { Chain } from './iupac-types';

/**
 * Base interface for chain filtering and selection
 * Implements the strategy pattern for composable chain evaluation
 */

/**
 * Represents the result of applying a filter to a chain
 */
export interface FilterResult {
  /** Whether the chain passes this filter */
  passes: boolean;
  /** Score for this chain (higher = better) */
  score: number;
  /** Reason for the result (for debugging) */
  reason: string;
}

/**
 * Abstract base class for chain filters
 * Each filter evaluates chains against a specific IUPAC criterion
 */
export abstract class ChainFilter {
  protected name: string;
  protected priority: number;

  constructor(name: string, priority: number) {
    this.name = name;
    this.priority = priority;
  }

  /**
   * Get the filter name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get the filter priority (lower = evaluated first)
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * Apply this filter to a chain
   * Must be implemented by subclasses
   */
  abstract apply(chain: Chain): FilterResult;
}

/**
 * Filter that selects the longest carbon chain
 * IUPAC Rule: Principal chain is the longest chain
 */
export class LongestChainFilter extends ChainFilter {
  constructor() {
    super('longest-chain', 1);
  }

  apply(chain: Chain): FilterResult {
    return {
      passes: true,
      score: chain.length,
      reason: `Chain length: ${chain.length} atoms`,
    };
  }
}

/**
 * Filter that prefers chains containing principal functional groups
 * This approximates the IUPAC principal functional group rule by giving a
 * large score boost to any chain that contains one or more functional groups
 */
export class PrincipalFunctionalGroupFilter extends ChainFilter {
  constructor() {
    super('principal-functional-group', 0);
  }

  apply(chain: Chain): FilterResult {
    const fgCount = chain.functionalGroups.length;
    // Large boost per functional group so FG-containing chains outrank
    // purely hydrocarbon chains even if shorter (heuristic)
    const score = fgCount > 0 ? 1000 + fgCount : 0;
    return {
      passes: true,
      score,
      reason: fgCount > 0 ? `Has ${fgCount} functional groups` : 'No functional groups',
    };
  }
}

/**
 * Filter that prefers ring (bicyclic/spiro) chains when appropriate.
 * Heuristic: prefer cyclic non-aromatic chains (bicyclo/spiro) over fused aromatic
 * chains when both cyclic options exist among candidates.
 */
/* ring dominance filter moved below contextual filter declaration */

/**
 * Filter that selects the chain with the most functional groups
 * IUPAC Rule: If multiple chains have same length, choose the one with most functional groups
 */
export class MostFunctionalGroupsFilter extends ChainFilter {
  constructor() {
    super('most-functional-groups', 2);
  }

  apply(chain: Chain): FilterResult {
    const fgCount = chain.functionalGroups.length;
    return {
      passes: true,
      score: fgCount,
      reason: `Functional groups: ${fgCount}`,
    };
  }
}

/**
 * Filter that selects the chain with the most substituents
 * IUPAC Rule: If lengths are equal, prefer chain with most substituents
 */
export class MostSubstituentsFilter extends ChainFilter {
  constructor() {
    super('most-substituents', 3);
  }

  apply(chain: Chain): FilterResult {
    const subCount = chain.substituents.length;
    return {
      passes: true,
      score: subCount,
      reason: `Substituents: ${subCount}`,
    };
  }
}

/**
 * Filter that prioritizes numbering direction
 * IUPAC Rule: Choose numbering that gives functional groups lowest locants
 */
export class LowestLocantFilter extends ChainFilter {
  constructor() {
    super('lowest-locant', 4);
  }

  apply(chain: Chain): FilterResult {
    // Calculate minimum locant for any substituent or functional group
    const allPositions: number[] = [];

    for (const sub of chain.substituents) {
      const pos = parseInt(sub.position, 10);
      if (!isNaN(pos)) {
        allPositions.push(pos);
      }
    }

    for (const fg of chain.functionalGroups) {
      allPositions.push(fg.position);
    }

    if (allPositions.length === 0) {
      return {
        passes: true,
        score: 0,
        reason: 'No substituents or functional groups',
      };
    }

    const minLocant = Math.min(...allPositions);
    // Higher score = lower locant (better)
    const score = chain.length - minLocant;

    return {
      passes: true,
      score,
      reason: `Minimum locant: ${minLocant}`,
    };
  }
}

/**
 * Filter that prioritizes aromatic systems
 * IUPAC Rule: Aromatic rings are preferred in some cases
 */
export class AromaticPreferenceFilter extends ChainFilter {
  constructor() {
    super('aromatic-preference', 5);
  }

  apply(chain: Chain): FilterResult {
    const aromaticScore = chain.isAromatic ? 1 : 0;
    return {
      passes: true,
      score: aromaticScore,
      reason: chain.isAromatic ? 'Aromatic chain' : 'Aliphatic chain',
    };
  }
}

/**
 * Filter that checks if chain contains a specific atom type
 */
export class ContainsAtomTypeFilter extends ChainFilter {
  private atomType: string;

  constructor(atomType: string) {
    super(`contains-${atomType}`, 6);
    this.atomType = atomType;
  }

  apply(chain: Chain): FilterResult {
    // This is a placeholder - actual implementation would need molecule data
    return {
      passes: true,
      score: 0,
      reason: `Check for ${this.atomType}`,
    };
  }
}

/**
 * Base class for filters that require molecule context
 * Used when chain information alone is insufficient
 */
export abstract class ContextualChainFilter extends ChainFilter {
  /**
   * Apply this filter with additional context
   */
  abstract applyWithContext(chain: Chain, context: ChainFilterContext): FilterResult;

  apply(chain: Chain): FilterResult {
    return {
      passes: false,
      score: 0,
      reason: 'Contextual filter requires context',
    };
  }
}

/**
 * Context passed to contextual filters
 */
export interface ChainFilterContext {
  /** All candidate chains being evaluated */
  allChains: Chain[];
  /** The molecule being analyzed */
  moleculeData?: Record<string, unknown>;
  /** Any additional parameters */
  params?: Record<string, unknown>;
}

/**
 * Filter that prefers ring (bicyclic/spiro) chains when appropriate.
 * Heuristic: prefer cyclic non-aromatic chains (bicyclo/spiro) over fused aromatic
 * chains when both cyclic options exist among candidates.
 */
export class RingDominanceFilter extends ContextualChainFilter {
  constructor() {
    super('ring-dominance', 2);
  }

  applyWithContext(chain: Chain, context: ChainFilterContext): FilterResult {
    const allChains = context?.allChains || [];
    const cyclicCount = allChains.filter(c => c.isCyclic).length;

    if (cyclicCount === 0) {
      return { passes: true, score: 0, reason: 'No cyclic candidates' };
    }

    // Score preference:
    // +20 if chain is cyclic, +10 additional if non-aromatic cyclic (bicyclo/spiro)
    let score = 0;
    if (chain.isCyclic) score += 20;
    if (chain.isCyclic && !chain.isAromatic) score += 10;

  // Strong preference if this chain was generated as a ring-origin candidate
  // (i.e., exact SSSR ring or union of rings). This helps prefer true ring
  // parents (bicyclo/spiro) over acyclic paths that merely pass through ring atoms.
  const isFromRingOrigin = Boolean((chain as any).isFromRingUnion);
  if (isFromRingOrigin) score += 100;

    return {
      passes: true,
      score,
      reason: chain.isCyclic ? (chain.isAromatic ? 'Aromatic ring chain' : 'Non-aromatic ring chain') : 'Acyclic chain',
    };
  }
}

/**
 * Filter that evaluates based on symmetry
 * Breaks ties by preferring less symmetric chains
 */
export class SymmetryFilter extends ContextualChainFilter {
  constructor() {
    super('symmetry', 7);
  }

  applyWithContext(_chain: Chain, _context: ChainFilterContext): FilterResult {
    // Calculate symmetry score (lower = more asymmetric = preferred)
    const subPositions = _chain.substituents.map(s => parseInt(s.position, 10));
    const isDuplicated = subPositions.some(
      (pos, i) => subPositions.indexOf(pos) !== i
    );

    const symmetryScore = isDuplicated ? 0 : 1;
    return {
      passes: true,
      score: symmetryScore,
      reason: isDuplicated ? 'Symmetric substituent positions' : 'Asymmetric positions',
    };
  }
}

/**
 * Composite filter that combines multiple filters
 */
export class CompositeFilter extends ChainFilter {
  private filters: ChainFilter[];

  constructor(name: string, priority: number, filters: ChainFilter[]) {
    super(name, priority);
    this.filters = filters.sort((a, b) => a.getPriority() - b.getPriority());
  }

  apply(chain: Chain): FilterResult {
    let totalScore = 0;
    const reasons: string[] = [];

    for (const filter of this.filters) {
      const result = filter.apply(chain);
      if (!result.passes) {
        return {
          passes: false,
          score: 0,
          reason: `Failed in ${filter.getName()}: ${result.reason}`,
        };
      }
      totalScore += result.score;
      reasons.push(`${filter.getName()}=${result.score}`);
    }

    return {
      passes: true,
      score: totalScore,
      reason: reasons.join('; '),
    };
  }
}

/**
 * Creates a filter that requires minimum chain length
 */
export function createMinLengthFilter(minLength: number): ChainFilter {
  return new (class extends ChainFilter {
    constructor() {
      super(`min-length-${minLength}`, 0);
    }

    apply(chain: Chain): FilterResult {
      if (chain.length < minLength) {
        return {
          passes: false,
          score: 0,
          reason: `Chain too short: ${chain.length} < ${minLength}`,
        };
      }
      return {
        passes: true,
        score: chain.length,
        reason: `Chain length sufficient: ${chain.length} >= ${minLength}`,
      };
    }
  })();
}

/**
 * Creates a filter that requires maximum chain length
 */
export function createMaxLengthFilter(maxLength: number): ChainFilter {
  return new (class extends ChainFilter {
    constructor() {
      super(`max-length-${maxLength}`, 0);
    }

    apply(chain: Chain): FilterResult {
      if (chain.length > maxLength) {
        return {
          passes: false,
          score: 0,
          reason: `Chain too long: ${chain.length} > ${maxLength}`,
        };
      }
      return {
        passes: true,
        score: maxLength - chain.length,
        reason: `Chain length within limit: ${chain.length} <= ${maxLength}`,
      };
    }
  })();
}

/**
 * Creates a custom filter from a predicate function
 */
export function createCustomFilter(
  name: string,
  priority: number,
  predicate: (chain: Chain) => boolean,
  scorer: (chain: Chain) => number
): ChainFilter {
  return new (class extends ChainFilter {
    constructor() {
      super(name, priority);
    }

    apply(chain: Chain): FilterResult {
      const passes = predicate(chain);
      const score = passes ? scorer(chain) : 0;
      return {
        passes,
        score,
        reason: passes ? 'Predicate satisfied' : 'Predicate failed',
      };
    }
  })();
}

