import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Bond, Atom } from "types";

/**
 * Rule: P-25.1 - Aromatic Parent Structures
 * Identifies atoms that are part of aromatic systems
 */
export const P_25_1_AROMATIC_PARENTS: IUPACRule = {
  id: "atomic-aromatic",
  name: "Aromatic Atom Detection",
  description: "Identify atoms that are part of aromatic systems",
  blueBookReference: "P-25.1 - Aromatic parent structures",
  priority: RulePriority.EIGHT,
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
    const aromaticAtoms = new Set<number>();
    state.molecule.bonds.forEach((bond: Bond) => {
      if (bond.type === "aromatic") {
        aromaticAtoms.add(bond.atom1);
        aromaticAtoms.add(bond.atom2);
      }
    });
    state.molecule.atoms.forEach((atom: Atom) => {
      if (atom.aromatic) {
        aromaticAtoms.add(atom.id);
      }
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          aromaticAtoms,
        },
      }),
      "atomic-aromatic",
      "Aromatic Atom Detection",
      "P-25.1 - Aromatic parent structures",
      ExecutionPhase.NOMENCLATURE_SELECTION,
      "Identify atoms that are part of aromatic systems",
    );
  },
};
