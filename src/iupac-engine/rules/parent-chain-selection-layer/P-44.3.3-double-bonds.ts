import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Chain } from "../../types";

/**
 * Rule: P-44.3.3 - Greatest Number of Double Bonds
 *
 * If still tied, choose the chain with the greatest number of double bonds.
 */
export const P44_3_3_DOUBLE_BONDS_RULE: IUPACRule = {
  id: "P-44.3.3",
  name: "Greatest Number of Double Bonds",
  description: "Select chain with most double bonds (P-44.3.3)",
  blueBookReference: BLUE_BOOK_RULES.P44_3_3,
  priority: RulePriority.SEVEN,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    const maxMultipleBonds = context.getState().max_multiple_bonds;
    return (
      chains.length > 1 &&
      !!context.getState().p44_3_2_applied &&
      chains.every(
        (chain) =>
          chain.multipleBonds.filter(
            (bond) => bond.type === "double" || bond.type === "triple",
          ).length === maxMultipleBonds,
      ) &&
      !context.getState().p44_3_3_applied &&
      !context.getState().parentStructure
    );
  },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict(
        {
          ruleId: "P-44.3.3",
          conflictType: "state_inconsistency",
          description: "No candidate chains found for double bond selection",
          context: { chains },
        },
        "P-44.3.3",
        "Greatest Number of Double Bonds",
        BLUE_BOOK_RULES.P44_3_3,
        ExecutionPhase.PARENT_STRUCTURE,
        "No candidate chains found for double bond selection",
      );
      return updatedContext;
    }
    // Count double bonds for each chain
    const doubleBondCounts = chains.map((chain) => {
      return chain.multipleBonds.filter((bond) => bond.type === "double")
        .length;
    });
    const maxDoubleBonds = Math.max(...doubleBondCounts);
    const chainsWithMaxDoubleBonds = chains.filter(
      (chain, index) => doubleBondCounts[index] === maxDoubleBonds,
    );
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithMaxDoubleBonds,
      "P-44.3.3",
      "Greatest Number of Double Bonds",
      BLUE_BOOK_RULES.P44_3_3,
      ExecutionPhase.PARENT_STRUCTURE,
      "Filtered to chains with most double bonds",
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_3_applied: true,
        max_double_bonds: maxDoubleBonds,
      }),
      "P-44.3.3",
      "Greatest Number of Double Bonds",
      BLUE_BOOK_RULES.P44_3_3,
      ExecutionPhase.PARENT_STRUCTURE,
      "Set p44_3_3_applied and max_double_bonds",
    );
    return updatedContext;
  },
};
