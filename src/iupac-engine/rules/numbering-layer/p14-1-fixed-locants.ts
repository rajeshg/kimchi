import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import {
  ExecutionPhase,
  ImmutableNamingContext,
  type ContextState,
} from "../../immutable-context";
import { hasFixedLocants, getFixedLocants } from "./helpers";

export const P14_1_FIXED_LOCANTS_RULE: IUPACRule = {
  id: "P-14.1",
  name: "Fixed Locants for Retained Names",
  description: "Apply fixed locants for retained names (P-14.1)",
  blueBookReference: "P-14.1 - Fixed locants",
  priority: RulePriority.SIX,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    return !!(parentStructure && hasFixedLocants(parentStructure));
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;

    if (!parentStructure || !hasFixedLocants(parentStructure)) {
      return context;
    }

    const fixedLocants = getFixedLocants(parentStructure);

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          locants: fixedLocants,
        },
      }),
      "P-14.1",
      "Fixed Locants for Retained Names",
      "P-14.1",
      ExecutionPhase.NUMBERING,
      `Applied fixed locants: [${fixedLocants.join(", ")}]`,
    );
  },
};
