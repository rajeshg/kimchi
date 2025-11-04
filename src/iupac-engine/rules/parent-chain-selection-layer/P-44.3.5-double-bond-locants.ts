import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Chain } from "../../types";
import { lexicographicallySmallest } from "./helpers";

/**
 * Rule: P-44.3.5 - Lowest Locant Set for Double Bonds
 *
 * If still tied, choose the chain with the lowest set of locants for double bonds.
 */
export const P44_3_5_DOUBLE_BOND_LOCANTS_RULE: IUPACRule = {
  id: "P-44.3.5",
  name: "Lowest Locant Set for Double Bonds",
  description: "Select chain with lowest locants for double bonds (P-44.3.5)",
  blueBookReference: BLUE_BOOK_RULES.P44_3_5,
  priority: RulePriority.FIVE,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    const lowestMultipleBondLocants =
      context.getState().lowest_multiple_bond_locants;
    return (
      chains.length > 1 &&
      !!context.getState().p44_3_4_applied &&
      !!lowestMultipleBondLocants &&
      !context.getState().p44_3_5_applied &&
      !context.getState().parentStructure
    );
  },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict(
        {
          ruleId: "P-44.3.5",
          conflictType: "state_inconsistency",
          description:
            "No candidate chains found for double bond locant selection",
          context: { chains },
        },
        "P-44.3.5",
        "Lowest Locant Set for Double Bonds",
        BLUE_BOOK_RULES.P44_3_5,
        ExecutionPhase.PARENT_STRUCTURE,
        "No candidate chains found for double bond locant selection",
      );
      return updatedContext;
    }
    // Get locant sets for double bonds for each chain
    const doubleBondLocantSets: number[][] = chains.map((chain: Chain) => {
      return chain.multipleBonds
        .filter((bond) => bond.type === "double")
        .map((bond) => bond.locant ?? 0)
        .sort((a, b) => a - b);
    });
    // Find the lexicographically smallest double bond locant set
    const lowestDoubleBondLocantSet =
      lexicographicallySmallest(doubleBondLocantSets);
    // Find chains with this locant set
    const chainsWithLowestDoubleBondLocants = chains.filter(
      (chain: Chain, index: number) => {
        const chainLocants = doubleBondLocantSets[index] || [];
        return (
          lowestDoubleBondLocantSet !== null &&
          chainLocants.length === lowestDoubleBondLocantSet.length &&
          chainLocants.every(
            (locant, i) => locant === lowestDoubleBondLocantSet[i],
          )
        );
      },
    );
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithLowestDoubleBondLocants,
      "P-44.3.5",
      "Lowest Locant Set for Double Bonds",
      BLUE_BOOK_RULES.P44_3_5,
      ExecutionPhase.PARENT_STRUCTURE,
      "Filtered to chains with lowest double bond locants",
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_5_applied: true,
        lowest_double_bond_locants: lowestDoubleBondLocantSet ?? undefined,
      }),
      "P-44.3.5",
      "Lowest Locant Set for Double Bonds",
      BLUE_BOOK_RULES.P44_3_5,
      ExecutionPhase.PARENT_STRUCTURE,
      "Set p44_3_5_applied and lowest_double_bond_locants",
    );
    return updatedContext;
  },
};
