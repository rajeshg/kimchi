import type { IUPACRule, FunctionalGroup } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { NomenclatureMethod, ExecutionPhase } from "../../immutable-context";

/**
 * Rule: P-51.2 - Functional Class Nomenclature
 *
 * For certain functional groups (anhydrides, acyl halides, etc.),
 * functional class nomenclature is preferred.
 *
 * NOTE: Esters are NOT in this list because:
 * - Cyclic esters (lactones) use heterocycle nomenclature (P-66.1.1.4)
 * - Noncyclic esters may use functional class, handled separately
 */
export const P51_2_FUNCTIONAL_CLASS_RULE: IUPACRule = {
  id: "P-51.2",
  name: "Functional Class Nomenclature Method",
  description:
    "Select functional class nomenclature for specific cases (P-51.2)",
  blueBookReference: BLUE_BOOK_RULES.P51_2,
  priority: RulePriority.TEN, // 100 - Highest priority for special cases
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = Array.isArray(state.functionalGroups)
      ? state.functionalGroups
      : [];

    if (process.env.VERBOSE) {
      console.log("[P-51.2] Checking functional class nomenclature conditions");
      console.log(
        "[P-51.2] functionalGroups:",
        functionalGroups.map((g) => ({ type: g.type, priority: g.priority })),
      );
    }

    // Don't override if a method has already been selected (e.g., by ESTER_DETECTION_RULE)
    if (state.nomenclatureMethod) {
      if (process.env.VERBOSE)
        console.log("[P-51.2] Nomenclature method already set, skipping");
      return false;
    }

    // Check if we have functional groups that prefer functional class
    if (!functionalGroups || functionalGroups.length === 0) {
      if (process.env.VERBOSE)
        console.log("[P-51.2] No functional groups found");
      return false;
    }

    // Functional groups that prefer functional class nomenclature
    // NOTE: esters are NOT included here because:
    // - Cyclic esters (lactones) MUST use heterocycle nomenclature (Class 16)
    // - Noncyclic esters can use functional class, but this is handled separately in ESTER_DETECTION_RULE
    // Reference: Blue Book P-66.1.1.4 - Lactones are named as heterocycles
    const functionalClassPreferred = [
      "anhydride",
      "acyl_halide",
      "nitrile",
      "thioester",
      "thiocyanate", // thiocyanate functional group
      "borane", // borane functional group
    ];

    const shouldApply = functionalGroups.some((group: FunctionalGroup) =>
      functionalClassPreferred.includes(group.type),
    );

    if (process.env.VERBOSE) {
      console.log(
        "[P-51.2] Should apply functional class nomenclature:",
        shouldApply,
      );
    }

    return shouldApply;
  },
  action: (context: ImmutableNamingContext) => {
    if (process.env.VERBOSE) {
      console.log(
        "[P-51.2] ACTION: Setting nomenclature method to FUNCTIONAL_CLASS",
      );
    }
    return context.withNomenclatureMethod(
      NomenclatureMethod.FUNCTIONAL_CLASS,
      "P-51.2",
      "Functional Class Nomenclature Method",
      "P-51.2",
      ExecutionPhase.NOMENCLATURE_SELECTION,
      "Selected functional class nomenclature due to preferred functional groups",
    );
  },
};
