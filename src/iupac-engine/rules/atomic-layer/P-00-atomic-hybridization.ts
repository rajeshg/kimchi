import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";

/**
 * Rule: Hybridization Analysis
 * Determines the hybridization state of each atom
 */
export const ATOMIC_HYBRIDIZATION_RULE: IUPACRule = {
  id: "atomic-hybridization",
  name: "Atomic Hybridization Analysis",
  description: "Determine hybridization state of each atom",
  blueBookReference: "Basic analysis - no specific rule",
  priority: RulePriority.NINE, // 90 - Hybridization analysis
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return (
      Array.isArray(state.molecule?.atoms) && state.molecule.atoms.length > 0
    );
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (
      !Array.isArray(state.molecule?.atoms) ||
      !Array.isArray(state.molecule?.bonds)
    ) {
      return context;
    }
    const hybridizationMap = new Map<number, string>();
    state.molecule.atoms.forEach((atom: any) => {
      let hybridization = "unknown";
      if (atom.hybridization) {
        hybridization = atom.hybridization;
      } else {
        const bonds = state.molecule.bonds.filter(
          (b: any) => b.atom1 === atom.id || b.atom2 === atom.id,
        );
        if (bonds.length === 2) {
          hybridization = "sp";
        } else if (bonds.length === 3) {
          hybridization = "sp2";
        } else if (bonds.length === 4) {
          hybridization = "sp3";
        } else {
          hybridization = "other";
        }
      }
      hybridizationMap.set(atom.id, hybridization);
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          hybridizationMap,
        },
      }),
      "atomic-hybridization",
      "Atomic Hybridization Analysis",
      "Basic analysis - no specific rule",
      ExecutionPhase.NOMENCLATURE_SELECTION,
      "Determine hybridization state of each atom",
    );
  },
};
