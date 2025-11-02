import type { IUPACRule, FunctionalGroup } from '../../types';
import { RulePriority } from '../../types';
import { ExecutionPhase, ImmutableNamingContext } from '../../immutable-context';
import { isPrincipalGroup, assignSubstituentLocants } from './helpers';

/**
 * Rule: Substituent Numbering
 *
 * Assign locants to substituent groups on the parent structure.
 */
export const SUBSTITUENT_NUMBERING_RULE: IUPACRule = {
  id: 'substituent-numbering',
  name: 'Substituent Group Numbering',
  description: 'Number substituent groups attached to parent structure',
  blueBookReference: 'Substituent numbering conventions',
  priority: RulePriority.FIVE,  // 50 - After fixed locants
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = state.functionalGroups;
    return !!(functionalGroups && functionalGroups.some((group: FunctionalGroup) => 
      group.type === 'substituent' || !isPrincipalGroup(group)
    ));
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = state.functionalGroups;
    const parentStructure = state.parentStructure;
    
    if (!functionalGroups || !parentStructure) {
      return context;
    }
    
    // Separate principal groups from substituents
    const principalGroups = functionalGroups.filter((group: FunctionalGroup) => isPrincipalGroup(group));
    const substituentGroups = functionalGroups.filter((group: FunctionalGroup) => !isPrincipalGroup(group));
    
    // Number substituent groups
    const numberedSubstituents = substituentGroups.map((group: FunctionalGroup, index: number) => ({
      ...group,
      locants: assignSubstituentLocants(group, parentStructure, index)
    }));
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        functionalGroups: [...principalGroups, ...numberedSubstituents]
      }),
      'substituent-numbering',
      'Substituent Group Numbering',
      'Substituent conventions',
      ExecutionPhase.NUMBERING,
      `Numbered ${numberedSubstituents.length} substituent groups`
    );
  }
};
