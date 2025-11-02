import type { IUPACRule } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { NomenclatureMethod, ExecutionPhase } from '../../immutable-context';

/**
 * Rule: P-51.3 - Skeletal Replacement Nomenclature
 * 
 * For heterocyclic compounds where heteroatoms replace carbon atoms
 * in a parent structure.
 */
export const P51_3_SKELETAL_REPLACEMENT_RULE: IUPACRule = {
  id: 'P-51.3',
  name: 'Skeletal Replacement Nomenclature',
  description: 'Select skeletal replacement for heterocyclic systems (P-51.3)',
  blueBookReference: BLUE_BOOK_RULES.P51_3,
  priority: RulePriority.EIGHT,  // 80 - High priority for heteroatoms
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = Array.isArray(state.functionalGroups) ? state.functionalGroups : [];
    const atomicAnalysis = context.getState().atomicAnalysis;
    
    // Don't override if a method has already been selected
    if (state.nomenclatureMethod) {
      return false;
    }
    
    // Check if we have significant heteroatom content
    if (!atomicAnalysis || !atomicAnalysis.heteroatoms) {
      return false;
    }
    
    // Look for heterocyclic patterns
    const heteroatomCount = atomicAnalysis.heteroatoms.length;
    const totalAtoms = context.getState().molecule.atoms.length;
    const heteroatomRatio = heteroatomCount / totalAtoms;
    
    // If heteroatom content is high, consider skeletal replacement
   return heteroatomRatio > 0.2 && functionalGroups.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    return context.withNomenclatureMethod(
      NomenclatureMethod.SKELETAL_REPLACEMENT,
      'P-51.3',
      'Skeletal Replacement Nomenclature',
      'P-51.3',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Selected skeletal replacement nomenclature due to high heteroatom content'
    );
  }
};
