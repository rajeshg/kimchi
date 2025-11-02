import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { normalizeCitationName, canonicalizeCitationList, compareCitationArrays } from '../../utils/citation-normalizer';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';
import type { Chain, Substituent } from '../../types';

/**
 * Rule: P-44.3.8 - Lowest Alphabetical Locant
 * 
 * Final tie-breaker: choose the chain that gives the lowest locant to the
 * prefix cited first alphabetically.
 */
export const P44_3_8_ALPHABETICAL_LOCANT_RULE: IUPACRule = {
  id: 'P-44.3.8',
  name: 'Lowest Alphabetical Locant',
  description: 'Final tie-breaker using alphabetical order (P-44.3.8)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_8,
  priority: RulePriority.TWO,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    return chains.length > 1;
  },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.8',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for alphabetical locant selection',
        context: { chains }
      },
      'P-44.3.8',
      'Lowest Alphabetical Locant',
      BLUE_BOOK_RULES.P44_3_8,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for alphabetical locant selection');
      return updatedContext;
    }
    // For each candidate chain, build the list of cited substituent types and compare
    function citationNamesForChain(chain: Chain): string[] {
      const subs = (chain.substituents || []).slice().sort((a: Substituent, b: Substituent) => {
        const la = (a.locant || 0) as number;
        const lb = (b.locant || 0) as number;
        return la - lb;
      });
      // Use only the 'type' property for canonicalization
      const namesRaw: string[] = subs.map((sub: Substituent) => sub.type || '').filter(Boolean);
      return canonicalizeCitationList(namesRaw);
    }
    // Build citation name lists for each chain and pick the minimal according to element-wise alphabetical comparison
    const chainEntries = chains.map((chain: Chain) => ({ chain, names: citationNamesForChain(chain) }));
    chainEntries.sort((A, B) => compareCitationArrays(A.names, B.names));
    let selectedChain: Chain;
    if (chainEntries.length > 0) {
      selectedChain = chainEntries[0]!.chain!;
    } else if (chains.length > 0) {
      selectedChain = chains[0]!;
    } else {
      // Fallback: use a minimal Chain object
      selectedChain = {
        atoms: [],
        bonds: [],
        length: 0,
        multipleBonds: [],
        substituents: [],
        locants: []
      };
    }
    updatedContext = updatedContext.withUpdatedCandidates(
      [selectedChain],
      'P-44.3.8',
      'Lowest Alphabetical Locant',
      BLUE_BOOK_RULES.P44_3_8,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chain with lowest alphabetical locant'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_8_applied: true,
        selected_chain_final: selectedChain
      }),
      'P-44.3.8',
      'Lowest Alphabetical Locant',
      BLUE_BOOK_RULES.P44_3_8,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_8_applied and selected_chain_final'
    );
    return updatedContext;
  }
};
