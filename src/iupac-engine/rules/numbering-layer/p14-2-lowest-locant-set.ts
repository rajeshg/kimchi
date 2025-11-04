import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import {
  ExecutionPhase,
  ImmutableNamingContext,
} from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import { normalizeFunctionalGroupLocants, optimizeLocantSet } from "./helpers";

export const P14_2_LOWEST_LOCANT_SET_RULE: IUPACRule = {
  id: "P-14.2",
  name: "Lowest Locant Set Principle",
  description: "Apply lowest locant set principle for numbering (P-14.2)",
  blueBookReference: "P-14.2 - Lowest locant set principle",
  priority: RulePriority.NINE,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;

    return !!(
      parentStructure &&
      functionalGroups &&
      functionalGroups.length > 0
    );
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;

    if (
      !parentStructure ||
      !functionalGroups ||
      functionalGroups.length === 0
    ) {
      return context;
    }

    const normalizedFunctionalGroups = normalizeFunctionalGroupLocants(
      functionalGroups,
      parentStructure,
    );

    const principalGroup = normalizedFunctionalGroups.reduce(
      (prev: FunctionalGroup, current: FunctionalGroup) =>
        prev.priority < current.priority ? prev : current,
    );

    const optimizedLocants = optimizeLocantSet(parentStructure, principalGroup);

    const updatedParentStructure = {
      ...parentStructure,
      locants: optimizedLocants,
    };

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        parentStructure: updatedParentStructure,
        functionalGroups: normalizedFunctionalGroups,
      }),
      "P-14.2",
      "Lowest Locant Set Principle",
      "P-14.2",
      ExecutionPhase.NUMBERING,
      `Applied lowest locant set: [${optimizedLocants.join(", ")}]`,
    );
  },
};
