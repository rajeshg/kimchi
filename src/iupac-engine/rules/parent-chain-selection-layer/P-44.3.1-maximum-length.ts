import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';
import type { Chain } from '../../types';

/**
 * Rule: P-44.3.1 - Maximum Length of Continuous Chain
 * 
 * The longest continuous chain of skeletal atoms is chosen as the parent.
 */
export const P44_3_1_MAX_LENGTH_RULE: IUPACRule = {
  id: 'P-44.3.1',
  name: 'Maximum Length of Continuous Chain',
  description: 'Select the chain with highest score (length + substituents)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_1,
  priority: RulePriority.NINE,
   conditions: (context: ImmutableNamingContext) => {
     const chains = context.getState().candidateChains as Chain[];
     return chains.length > 1 && !context.getState().p44_3_8_applied && !context.getState().parentStructure;
   },
   action: (context: ImmutableNamingContext) => {
     const chains = context.getState().candidateChains as Chain[];
     let updatedContext = context;
     if (chains.length === 0) {
       updatedContext = updatedContext.withConflict({
         ruleId: 'P-44.3.1',
         conflictType: 'state_inconsistency',
         description: 'No candidate chains found for selection',
         context: { chains }
       },
       'P-44.3.1',
       'Maximum Length of Continuous Chain',
       BLUE_BOOK_RULES.P44_3_1,
       ExecutionPhase.PARENT_STRUCTURE,
       'No candidate chains found for selection');
       return updatedContext;
     }
     const lengths = chains.map(chain => chain.length);
     const maxLength = Math.max(...lengths);
     const selectedChains = chains.filter((chain, index) => lengths[index] === maxLength);
     updatedContext = updatedContext.withUpdatedCandidates(
       selectedChains,
       'P-44.3.1',
       'Maximum Length of Continuous Chain',
       BLUE_BOOK_RULES.P44_3_1,
       ExecutionPhase.PARENT_STRUCTURE,
       'Filtered to chains with maximum length'
     );
     updatedContext = updatedContext.withStateUpdate(
       (state) => ({
         ...state,
         p44_3_1_applied: true,
         max_length: maxLength
       }),
       'P-44.3.1',
       'Maximum Length of Continuous Chain',
       BLUE_BOOK_RULES.P44_3_1,
       ExecutionPhase.PARENT_STRUCTURE,
       'Set p44_3_1_applied and max_length'
     );
     return updatedContext;
   }
};
