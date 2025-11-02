import type { IUPACRule } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { NomenclatureMethod, ExecutionPhase } from '../../immutable-context';

/**
 * Rule: P-51.1 - Substitutive Nomenclature
 * 
 * Substitutive nomenclature (prefixes and suffixes added to a parent hydride)
 * is the preferred method for most organic compounds.
 */
export const P51_1_SUBSTITUTIVE_RULE: IUPACRule = {
  id: 'P-51.1',
  name: 'Substitutive Nomenclature Method',
  description: 'Select substitutive nomenclature as default method (P-51.1)',
  blueBookReference: BLUE_BOOK_RULES.P51_1,
  priority: RulePriority.FIVE,  // 50 - Default method, lowest priority
  conditions: (context: ImmutableNamingContext) => {
    // Apply if no method has been selected yet
    const state = context.getState();
    return !state.nomenclatureMethod;
  },
  action: (context: ImmutableNamingContext) => {
    return context.withNomenclatureMethod(
      NomenclatureMethod.SUBSTITUTIVE,
      'P-51.1',
      'Substitutive Nomenclature Method',
      'P-51.1',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Selected substitutive nomenclature as default method'
    );
  }
};
