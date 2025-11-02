import type { IUPACRule, RingSystem } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { RulePriority } from '../../types';
import { NomenclatureMethod, ExecutionPhase } from '../../immutable-context';

/**
 * Rule: Conjunctive Nomenclature
 * 
 * Special case for fused ring systems and complex structures.
 */
export const CONJUNCTIVE_NOMENCLATURE_RULE: IUPACRule = {
  id: 'conjunctive',
  name: 'Conjunctive Nomenclature Method',
  description: 'Select conjunctive nomenclature for fused systems (special cases)',
  blueBookReference: 'P-51 - Special cases',
  priority: RulePriority.SIX,  // 60 - Mid priority for fused rings
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const candidateRings = state.candidateRings as RingSystem[] | undefined;
    
    // Don't override if a method has already been selected
    if (state.nomenclatureMethod) {
      return false;
    }
    
    // Check for fused ring systems
    return !!candidateRings && candidateRings.some((ring: RingSystem) => ring.fused);
  },
  action: (context: ImmutableNamingContext) => {
    return context.withNomenclatureMethod(
      NomenclatureMethod.CONJUNCTIVE,
      'conjunctive',
      'Conjunctive Nomenclature Method',
      'P-51',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Selected conjunctive nomenclature due to fused ring systems'
    );
  }
};
