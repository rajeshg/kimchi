import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';
import type { Chain } from '../../types';
import { lexicographicallySmallest } from './helpers';

/**
 * Rule: P-44.3.7 - Lowest Locant Set for Substituents
 * 
 * If still tied, choose the chain with the lowest set of locants for substituents.
 */
export const P44_3_7_SUBSTITUENT_LOCANTS_RULE: IUPACRule = {
  id: 'P-44.3.7',
  name: 'Lowest Locant Set for Substituents',
  description: 'Select chain with lowest locants for substituents (P-44.3.7)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_7,
  priority: RulePriority.THREE,
   conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      const maxSubstituents = context.getState().max_substituents;
      return chains.length > 1 &&
             !!context.getState().p44_3_6_applied &&
             chains.every(chain => chain.substituents.length === maxSubstituents) &&
             !context.getState().p44_3_7_applied &&
             !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.7',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for substituent locant selection',
        context: { chains }
      },
      'P-44.3.7',
      'Lowest Locant Set for Substituents',
      BLUE_BOOK_RULES.P44_3_7,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for substituent locant selection');
      return updatedContext;
    }
      // Get locant sets for substituents for each chain
      const substituentLocantSets: number[][] = chains.map((chain: Chain) => {
        return chain.substituents
          .map(substituent => substituent.locant ?? 0)
          .sort((a, b) => a - b);
      });
      // Find the lexicographically smallest substituent locant set
      const lowestSubstituentLocantSet = lexicographicallySmallest(substituentLocantSets);
      // Find chains with this locant set
      const chainsWithLowestSubstituentLocants = chains.filter((chain: Chain, index: number) => {
        const chainLocants = substituentLocantSets[index] || [];
        return lowestSubstituentLocantSet !== null &&
               chainLocants.length === lowestSubstituentLocantSet.length &&
               chainLocants.every((locant, i) => locant === lowestSubstituentLocantSet[i]);
      });
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithLowestSubstituentLocants,
      'P-44.3.7',
      'Lowest Locant Set for Substituents',
      BLUE_BOOK_RULES.P44_3_7,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with lowest substituent locants'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_7_applied: true,
        lowest_substituent_locants: lowestSubstituentLocantSet ?? undefined
      }),
      'P-44.3.7',
      'Lowest Locant Set for Substituents',
      BLUE_BOOK_RULES.P44_3_7,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_7_applied and lowest_substituent_locants'
    );
    return updatedContext;
  }
};
