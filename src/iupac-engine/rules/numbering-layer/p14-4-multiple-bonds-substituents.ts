import type {
  IUPACRule,
  MultipleBond,
  StructuralSubstituent,
} from "../../types";
import { RulePriority } from "../../types";
import type { Atom } from "types";

import {
  ExecutionPhase,
  ImmutableNamingContext,
} from "../../immutable-context";
import type { ContextState } from "../../immutable-context";

export const P14_4_MULTIPLE_BONDS_SUBSTITUENTS_RULE: IUPACRule = {
  id: "P-14.4",
  name: "Multiple Bonds and Substituents Numbering",
  description: "Number multiple bonds and substituents (P-14.4)",
  blueBookReference: "P-14.4 - Numbering of multiple bonds and substituents",
  priority: RulePriority.SEVEN,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    return !!(parentStructure && parentStructure.type === "chain");
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;

    if (!parentStructure || parentStructure.type !== "chain") {
      return context;
    }

    const chain = parentStructure.chain;
    if (!chain) {
      return context;
    }

    const numberedBonds = chain.multipleBonds.map((bond: MultipleBond) => {
      const atomLocants: number[] = [];
      for (const atom of bond.atoms) {
        const atomIndex = chain.atoms.findIndex((a: Atom) => a.id === atom.id);
        if (atomIndex >= 0 && chain.locants[atomIndex]) {
          atomLocants.push(chain.locants[atomIndex]);
        }
      }
      const minLocant =
        atomLocants.length > 0 ? Math.min(...atomLocants) : bond.locant || 1;
      return {
        ...bond,
        locant: minLocant,
      };
    });

    const numberedSubstituents = chain.substituents.map(
      (substituent: StructuralSubstituent) => ({
        ...substituent,
        locant: typeof substituent.locant === "number" ? substituent.locant : 1,
      }),
    );

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          chain: {
            ...chain,
            multipleBonds: numberedBonds,
            substituents: numberedSubstituents,
          },
        },
      }),
      "P-14.4",
      "Multiple Bonds and Substituents Numbering",
      "P-14.4",
      ExecutionPhase.NUMBERING,
      `Numbered ${numberedBonds.length} bonds and ${numberedSubstituents.length} substituents`,
    );
  },
};
