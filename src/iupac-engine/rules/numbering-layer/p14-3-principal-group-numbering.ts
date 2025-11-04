import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import type { Atom } from "types";
import {
  ExecutionPhase,
  ImmutableNamingContext,
} from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import { optimizeLocantSet, getPrincipalGroupLocantFromSet } from "./helpers";

export const P14_3_PRINCIPAL_GROUP_NUMBERING_RULE: IUPACRule = {
  id: "P-14.3",
  name: "Principal Group Numbering",
  description: "Assign lowest locant to principal group (P-14.3)",
  blueBookReference: "P-14.3 - Numbering of principal group",
  priority: RulePriority.EIGHT,
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

    const principalGroups = functionalGroups.filter(
      (g: FunctionalGroup) => g.isPrincipal,
    );

    if (principalGroups.length === 0) {
      return context;
    }

    const firstPrincipal = principalGroups[0];

    if (process.env.VERBOSE) {
      console.log("[P-14.3] Principal group:", firstPrincipal?.type);
      console.log(
        "[P-14.3] Number of principal groups:",
        principalGroups.length,
      );
      console.log(
        "[P-14.3] Principal group atoms:",
        principalGroups.map((g) => g.atoms),
      );
      console.log(
        "[P-14.3] Principal group bonds:",
        principalGroups.map((g) => g.bonds),
      );
      console.log(
        "[P-14.3] Parent chain atoms:",
        parentStructure.chain?.atoms.map((a: Atom) => a.id),
      );
      console.log("[P-14.3] Parent chain locants:", parentStructure.locants);
    }

    let principalLocants: number[];
    let optimizedLocants = parentStructure.locants;

    if (parentStructure.type === "chain" && principalGroups.length === 1) {
      const firstPrincipalGroup = principalGroups[0]!;
      optimizedLocants = optimizeLocantSet(
        parentStructure,
        firstPrincipalGroup,
      );

      parentStructure.locants = optimizedLocants;

      principalLocants = [
        getPrincipalGroupLocantFromSet(
          parentStructure,
          firstPrincipalGroup,
          optimizedLocants,
        ),
      ];
    } else {
      principalLocants = principalGroups.map((group) =>
        getPrincipalGroupLocantFromSet(
          parentStructure,
          group,
          parentStructure.locants,
        ),
      );
    }

    if (process.env.VERBOSE) {
      console.log("[P-14.3] Calculated principal locants:", principalLocants);
    }

    let principalIdx = 0;
    const updatedFunctionalGroups = functionalGroups.map(
      (group: FunctionalGroup) => {
        if (group.isPrincipal && principalIdx < principalLocants.length) {
          const locant = principalLocants[principalIdx]!;
          principalIdx++;
          return {
            ...group,
            locants: [locant],
          };
        }

        // For non-principal groups, convert atom IDs to chain positions
        if (
          !group.isPrincipal &&
          group.locants &&
          parentStructure.type === "chain" &&
          parentStructure.chain
        ) {
          const chainAtomIds = parentStructure.chain.atoms.map(
            (a: Atom) => a.id,
          );
          const convertedLocants = group.locants.map((atomId: number) => {
            const position = chainAtomIds.indexOf(atomId);
            if (position !== -1) {
              // Convert to 1-based position using the optimized locant set
              return optimizedLocants[position] ?? position + 1;
            }
            return atomId; // Fallback to atom ID if not found in chain
          });

          if (process.env.VERBOSE) {
            console.log(
              `[P-14.3] Non-principal group ${group.type}: atom IDs ${group.locants} → positions ${convertedLocants}`,
            );
          }

          return {
            ...group,
            locants: convertedLocants,
          };
        }

        return group;
      },
    );

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        functionalGroups: updatedFunctionalGroups,
      }),
      "P-14.3",
      "Principal Group Numbering",
      "P-14.3",
      ExecutionPhase.NUMBERING,
      `Assigned locants ${principalLocants.join(",")} to ${principalGroups.length} principal group(s): ${firstPrincipal?.type}`,
    );
  },
};
