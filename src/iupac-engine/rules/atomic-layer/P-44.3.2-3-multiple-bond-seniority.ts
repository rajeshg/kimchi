import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";

/**
 * Rule: P-44.3.2-3 - Multiple Bond Seniority
 * Analyzes the distribution of bond orders in the molecule
 */
export const P_44_3_2_3_MULTIPLE_BOND_SENIORITY: IUPACRule = {
  id: "atomic-bond-orders",
  name: "Bond Order Analysis",
  description: "Analyze the distribution of bond orders in the molecule",
  blueBookReference: "P-44.3.2-3 - Multiple bond seniority",
  priority: RulePriority.SIX,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return (
      Array.isArray(state.molecule?.bonds) && state.molecule.bonds.length > 0
    );
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (!Array.isArray(state.molecule?.bonds)) {
      return context;
    }
    const bondOrderStats = {
      single: 0,
      double: 0,
      triple: 0,
      aromatic: 0,
    };
    state.molecule.bonds.forEach((bond: any) => {
      switch (bond.type) {
        case "single":
          bondOrderStats.single++;
          break;
        case "double":
          bondOrderStats.double++;
          break;
        case "triple":
          bondOrderStats.triple++;
          break;
        case "aromatic":
          bondOrderStats.aromatic++;
          break;
      }
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          bondOrderStats,
        },
      }),
      "atomic-bond-orders",
      "Bond Order Analysis",
      "P-44.3.2-3 - Multiple bond seniority",
      ExecutionPhase.NOMENCLATURE_SELECTION,
      "Analyze the distribution of bond orders in the molecule",
    );
  },
};
