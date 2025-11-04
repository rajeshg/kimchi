import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Chain } from "../../types";
import { lexicographicallySmallest } from "./helpers";

/**
 * Rule: P-44.3.4 - Lowest Locant Set for Multiple Bonds
 *
 * If still tied, choose the chain with the lowest set of locants for multiple bonds.
 */
export const P44_3_4_MULTIPLE_BOND_LOCANTS_RULE: IUPACRule = {
  id: "P-44.3.4",
  name: "Lowest Locant Set for Multiple Bonds",
  description: "Select chain with lowest locants for multiple bonds (P-44.3.4)",
  blueBookReference: BLUE_BOOK_RULES.P44_3_4,
  priority: RulePriority.SIX,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    const maxDoubleBonds = context.getState().max_double_bonds;
    return (
      chains.length > 1 &&
      !!context.getState().p44_3_3_applied &&
      chains.every(
        (chain) =>
          chain.multipleBonds.filter((bond) => bond.type === "double")
            .length === maxDoubleBonds,
      ) &&
      !context.getState().p44_3_4_applied &&
      !context.getState().parentStructure
    );
  },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict(
        {
          ruleId: "P-44.3.4",
          conflictType: "state_inconsistency",
          description:
            "No candidate chains found for multiple bond locant selection",
          context: { chains },
        },
        "P-44.3.4",
        "Lowest Locant Set for Multiple Bonds",
        BLUE_BOOK_RULES.P44_3_4,
        ExecutionPhase.PARENT_STRUCTURE,
        "No candidate chains found for multiple bond locant selection",
      );
      return updatedContext;
    }
    // Get locant sets for multiple bonds for each chain
    const locantSets: number[][] = chains.map((chain: Chain) => {
      return chain.multipleBonds
        .filter((bond) => bond.type === "double" || bond.type === "triple")
        .map((bond) => bond.locant ?? 0)
        .sort((a, b) => a - b);
    });
    // Find the lexicographically smallest locant set
    const lowestLocantSet = lexicographicallySmallest(locantSets);
    // Find chains with this locant set
    let chainsWithLowestLocants = chains;
    if (lowestLocantSet) {
      chainsWithLowestLocants = chains.filter((chain: Chain, index: number) => {
        const chainLocants = locantSets[index] || [];
        return (
          chainLocants.length === lowestLocantSet.length &&
          chainLocants.every((locant, i) => locant === lowestLocantSet[i])
        );
      });
    }
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithLowestLocants,
      "P-44.3.4",
      "Lowest Locant Set for Multiple Bonds",
      BLUE_BOOK_RULES.P44_3_4,
      ExecutionPhase.PARENT_STRUCTURE,
      "Filtered to chains with lowest multiple bond locants",
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_4_applied: true,
        lowest_multiple_bond_locants: lowestLocantSet ?? undefined,
      }),
      "P-44.3.4",
      "Lowest Locant Set for Multiple Bonds",
      BLUE_BOOK_RULES.P44_3_4,
      ExecutionPhase.PARENT_STRUCTURE,
      "Set p44_3_4_applied and lowest_multiple_bond_locants",
    );
    return updatedContext;
  },
};
