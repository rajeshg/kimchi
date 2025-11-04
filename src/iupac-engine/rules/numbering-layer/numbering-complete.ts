import type { IUPACRule, Chain } from "../../types";
import { RulePriority } from "../../types";
import {
  ExecutionPhase,
  ImmutableNamingContext,
} from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import { validateNumbering } from "./helpers";
import { generateChainName } from "../parent-chain-selection-layer";

/**
 * Rule: Complete Numbering
 *
 * Finalizes the numbering process and validates the complete locant assignment.
 */
export const NUMBERING_COMPLETE_RULE: IUPACRule = {
  id: "numbering-complete",
  name: "Numbering Phase Complete",
  description: "Finalize numbering and validate locant assignments",
  blueBookReference: "P-14 - Complete numbering validation",
  priority: RulePriority.FOUR, // 40 - Final completion step
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    return parentStructure !== undefined;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;

    if (!parentStructure) {
      return context.withConflict(
        {
          ruleId: "numbering-complete",
          conflictType: "state_inconsistency",
          description: "No parent structure available for numbering completion",
          context: {},
        },
        "numbering-complete",
        "Numbering Phase Complete",
        "P-14",
        ExecutionPhase.NUMBERING,
        "No parent structure for completion",
      );
    }

    // Validate numbering consistency
    const validationResult = validateNumbering(
      parentStructure,
      functionalGroups,
    );

    if (!validationResult.isValid) {
      return context.withConflict(
        {
          ruleId: "numbering-complete",
          conflictType: "state_inconsistency",
          description: `Numbering validation failed: ${validationResult.errors.join(", ")}`,
          context: validationResult,
        },
        "numbering-complete",
        "Numbering Phase Complete",
        "P-14",
        ExecutionPhase.NUMBERING,
        "Validation failed",
      );
    }

    // After numbering is validated, recompute human-readable parent name so that
    // multiple-bond locants (assigned in P-14.4) are included in the parent name
    // Pass false to exclude substituents - they will be added in name assembly layer
    let updatedParent = parentStructure;
    if (
      validationResult.isValid &&
      parentStructure.type === "chain" &&
      parentStructure.chain
    ) {
      try {
        const newName = generateChainName(
          parentStructure.chain as Chain,
          false,
        );
        updatedParent = { ...parentStructure, name: newName };
      } catch (_err) {
        // If name generation fails, keep existing name
        updatedParent = parentStructure;
      }
    }

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        numberingComplete: true,
        numberingValidation: validationResult,
        parentStructure: updatedParent,
      }),
      "numbering-complete",
      "Numbering Phase Complete",
      "P-14",
      ExecutionPhase.NUMBERING,
      `Numbering phase completed with ${validationResult.isValid ? "valid" : "validation issues"} locant assignments`,
    );
  },
};
