import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Chain } from "../../types";

/**
 * Rule: P-44.3.6 - Greatest Number of Substituents
 *
 * If still tied, choose the chain with the greatest number of substituents.
 */
export const P44_3_6_SUBSTITUENTS_RULE: IUPACRule = {
  id: "P-44.3.6",
  name: "Greatest Number of Substituents",
  description: "Select chain with most substituents (P-44.3.6)",
  blueBookReference: BLUE_BOOK_RULES.P44_3_6,
  priority: RulePriority.FOUR,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    return (
      chains.length > 1 &&
      !!context.getState().p44_3_5_applied &&
      !context.getState().p44_3_6_applied &&
      !context.getState().parentStructure
    );
  },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict(
        {
          ruleId: "P-44.3.6",
          conflictType: "state_inconsistency",
          description: "No candidate chains found for substituent selection",
          context: { chains },
        },
        "P-44.3.6",
        "Greatest Number of Substituents",
        BLUE_BOOK_RULES.P44_3_6,
        ExecutionPhase.PARENT_STRUCTURE,
        "No candidate chains found for substituent selection",
      );
      return updatedContext;
    }
    // Count substituents for each chain
    const substituentCounts = chains.map((chain) => chain.substituents.length);
    const maxSubstituents = Math.max(...substituentCounts);
    const chainsWithMaxSubstituents = chains.filter(
      (chain, index) => substituentCounts[index] === maxSubstituents,
    );
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithMaxSubstituents,
      "P-44.3.6",
      "Greatest Number of Substituents",
      BLUE_BOOK_RULES.P44_3_6,
      ExecutionPhase.PARENT_STRUCTURE,
      "Filtered to chains with most substituents",
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_6_applied: true,
        max_substituents: maxSubstituents,
      }),
      "P-44.3.6",
      "Greatest Number of Substituents",
      BLUE_BOOK_RULES.P44_3_6,
      ExecutionPhase.PARENT_STRUCTURE,
      "Set p44_3_6_applied and max_substituents",
    );
    return updatedContext;
  },
};
