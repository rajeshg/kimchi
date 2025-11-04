import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Atom } from "types";

/**
 * Rule: P-44.2.2 - Heteroatom Seniority
 * Identifies non-carbon atoms and their types
 */
export const P_44_2_2_HETEROATOM_SENIORITY: IUPACRule = {
  id: "atomic-heteroatoms",
  name: "Heteroatom Detection",
  description: "Identify non-carbon atoms and their types",
  blueBookReference: "P-44.2.2 - Heteroatom seniority",
  priority: RulePriority.SEVEN,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return (
      Array.isArray(state.molecule?.atoms) && state.molecule.atoms.length > 0
    );
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (!Array.isArray(state.molecule?.atoms)) {
      return context;
    }
    const heteroatoms: Array<{ id: number; element: string; type: string }> =
      [];
    state.molecule.atoms.forEach((atom: Atom) => {
      if (atom.symbol !== "C") {
        heteroatoms.push({
          id: atom.id,
          element: atom.symbol,
          type: getHeteroatomType(atom.symbol),
        });
      }
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          heteroatoms,
        },
      }),
      "atomic-heteroatoms",
      "Heteroatom Detection",
      "P-44.2.2 - Heteroatom seniority",
      ExecutionPhase.NOMENCLATURE_SELECTION,
      "Identify non-carbon atoms and their types",
    );
  },
};

function getHeteroatomType(element: string): string {
  const heteroatomCategories = {
    N: "nitrogen",
    O: "oxygen",
    S: "sulfur",
    P: "phosphorus",
    F: "fluorine",
    Cl: "chlorine",
    Br: "bromine",
    I: "iodine",
    B: "boron",
    Si: "silicon",
    Ge: "germanium",
    As: "arsenic",
    Sb: "antimony",
    Se: "selenium",
    Te: "tellurium",
  };

  return (
    heteroatomCategories[element as keyof typeof heteroatomCategories] ||
    "other"
  );
}
