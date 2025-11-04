import type { IUPACRule, FunctionalGroup } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { NomenclatureMethod, ExecutionPhase } from "../../immutable-context";

/**
 * Rule: P-51.4 - Multiplicative Nomenclature
 *
 * For compounds with identical substituents that can be named using
 * multiplicative prefixes (di-, tri-, etc.).
 */
export const P51_4_MULTIPLICATIVE_RULE: IUPACRule = {
  id: "P-51.4",
  name: "Multiplicative Nomenclature Method",
  description:
    "Select multiplicative nomenclature for identical substituents (P-51.4)",
  blueBookReference: BLUE_BOOK_RULES.P51_4,
  priority: RulePriority.SEVEN, // 70 - Mid-high priority for duplicates
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = Array.isArray(state.functionalGroups)
      ? state.functionalGroups
      : [];

    // Don't override if a method has already been selected
    if (state.nomenclatureMethod) {
      return false;
    }

    if (!functionalGroups || functionalGroups.length === 0) {
      return false;
    }

    // Check for identical functional groups that could use multiplicative nomenclature
    const groupTypes = functionalGroups.map(
      (group: FunctionalGroup) => group.type,
    );
    const hasDuplicates = groupTypes.some(
      (type: string) => groupTypes.filter((t: string) => t === type).length > 1,
    );

    return hasDuplicates;
  },
  action: (context: ImmutableNamingContext) => {
    return context.withNomenclatureMethod(
      NomenclatureMethod.MULTIPLICATIVE,
      "P-51.4",
      "Multiplicative Nomenclature Method",
      "P-51.4",
      ExecutionPhase.NOMENCLATURE_SELECTION,
      "Selected multiplicative nomenclature due to identical substituents",
    );
  },
};
