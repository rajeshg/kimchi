import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';
import type { Chain } from '../../types';

/**
 * Rule: P-44.3.2 - Greatest Number of Multiple Bonds
 * 
 * If length is equal, choose the chain with the greatest number of multiple bonds
 * (double + triple bonds combined).
 */
export const P44_3_2_MULTIPLE_BONDS_RULE: IUPACRule = {
  id: 'P-44.3.2',
  name: 'Greatest Number of Multiple Bonds',
  description: 'Select chain with most multiple bonds (P-44.3.2)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_2,
  priority: RulePriority.EIGHT,
   conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      return chains.length > 1 &&
             !!context.getState().p44_3_1_applied &&
             !context.getState().p44_3_2_applied &&
             !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.2',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for multiple bond selection',
        context: { chains }
      },
      'P-44.3.2',
      'Greatest Number of Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for multiple bond selection');
      return updatedContext;
    }
    // Count multiple bonds for each chain
    const multipleBondCounts = chains.map(chain => {
      return chain.multipleBonds.filter(bond => bond.type === 'double' || bond.type === 'triple').length;
    });
    const maxMultipleBonds = Math.max(...multipleBondCounts);
    const chainsWithMaxMultipleBonds = chains.filter((chain, index) =>
      multipleBondCounts[index] === maxMultipleBonds
    );
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithMaxMultipleBonds,
      'P-44.3.2',
      'Greatest Number of Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with most multiple bonds'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_2_applied: true,
        max_multiple_bonds: maxMultipleBonds
      }),
      'P-44.3.2',
      'Greatest Number of Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_2_applied and max_multiple_bonds'
    );
    return updatedContext;
  }
};
