/**
 * Simple Blue Book Rule Example: P-44.3.1 Maximum Chain Length
 * 
 * This demonstrates how Blue Book rules should be implemented
 * with proper citations and structure.
 */

import { ImmutableNamingContext, ExecutionPhase } from '../../../immutable-context';
import type { IUPACRule } from '../../../types';
import { RulePriority } from '../../../types';

/**
 * Blue Book Rule P-44.3.1: Maximum Length of Continuous Chain
 * 
 * Reference: IUPAC Blue Book 2013, Section P-44.3.1
 * https://iupac.qmul.ac.uk/BlueBook/RuleP44.html
 * 
 * Description: The longest continuous chain of skeletal atoms is chosen 
 * as the parent structure when multiple chains are possible.
 * 
 * Example: In CC(C)C(C(C(C)C)C)C, the 6-carbon chain is selected over 
 * shorter alternatives due to maximum length rule.
 */
export const P44_3_1_MAX_LENGTH_RULE: IUPACRule = {
  id: 'P-44.3.1',
  name: 'Maximum Length of Continuous Chain',
  description: 'Select the longest continuous chain of skeletal atoms per Blue Book P-44.3.1',
  blueBookReference: 'P-44.3.1 - Maximum length of continuous chain',
  priority: 100,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return state.candidateChains && state.candidateChains.length > 1;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const chains = state.candidateChains;
    
    if (!chains || chains.length === 0) {
      return context.withStateUpdate(
        (s) => s,
      'P-44.3.1',
      'Maximum Length Rule',
      'P-44.3.1',
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for length selection'
      );
    }
    
    // Find maximum length
    const maxLength = Math.max(...chains.map((chain: any) => chain.length));
    const longestChains = chains.filter((chain: any) => chain.length === maxLength);
    
    return context.withUpdatedCandidates(
      longestChains,
      'P-44.3.1',
      'Maximum Length Rule',
      'P-44.3.1',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ${maxLength}-carbon chain from ${chains.length} candidates`
    );
  }
};

/**
 * Blue Book Rule P-44.3.6: Greatest Number of Substituents
 * 
 * Reference: IUPAC Blue Book 2013, Section P-44.3.6
 * 
 * Description: If multiple chains have the same length, select the chain 
 * with the greatest number of substituents.
 * 
 * Example: This rule is used as a tie-breaker when P-44.3.1 produces 
 * multiple chains of equal maximum length.
 */
export const P44_3_6_SUBSTITUENTS_RULE: IUPACRule = {
  id: 'P-44.3.6',
  name: 'Greatest Number of Substituents',
  description: 'Select chain with most substituents per Blue Book P-44.3.6',
  blueBookReference: 'P-44.3.6 - Greatest number of substituents',
  priority: 70,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return state.candidateChains && state.candidateChains.length > 1;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const chains = state.candidateChains;
    
    if (!chains || chains.length === 0) {
      return context;
    }
    
    // Count substituents for each chain
    const substituentCounts = chains.map((chain: any) => 
      (chain.substituents && chain.substituents.length) || 0
    );
    
    const maxSubstituents = Math.max(...substituentCounts);
    const chainsWithMaxSubstituents = chains.filter((chain: any, index: number) => 
      substituentCounts[index] === maxSubstituents
    );
    
    return context.withUpdatedCandidates(
      chainsWithMaxSubstituents,
      'P-44.3.6',
      'Greatest Number of Substituents Rule',
      'P-44.3.6',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected chain with ${maxSubstituents} substituents`
    );
  }
};

/**
 * Blue Book Rule P-51.1: Substitutive Nomenclature
 * 
 * Reference: IUPAC Blue Book 2013, Section P-51.1
 * 
 * Description: Substitutive nomenclature (prefixes and suffixes added to 
 * a parent hydride) is the preferred nomenclature method.
 */
export const P51_1_SUBSTITUTIVE_RULE: IUPACRule = {
  id: 'P-51.1',
  name: 'Substitutive Nomenclature Method',
  description: 'Select substitutive nomenclature as default method per Blue Book P-51.1',
  blueBookReference: 'P-51.1 - Substitutive nomenclature',
  priority: RulePriority.FIVE,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return !state.nomenclatureMethod; // Only apply if no method selected yet
  },
  action: (context: ImmutableNamingContext) => {
    return context.withNomenclatureMethod(
      'substitutive' as any,
      'P-51.1',
      'Substitutive Nomenclature Method',
      'P-51.1',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Selected substitutive nomenclature as default method'
    );
  }
};

/**
 * Export all Blue Book rules
 */
export const BLUEBOOK_RULES: IUPACRule[] = [
  P44_3_1_MAX_LENGTH_RULE,
  P44_3_6_SUBSTITUENTS_RULE,
  P51_1_SUBSTITUTIVE_RULE
];

/**
 * Rule metadata for documentation and validation
 */
export const BLUEBOOK_RULE_METADATA = {
  'P-44.3.1': {
    section: 'Parent Structure Selection',
    title: 'Maximum Length of Continuous Chain',
    blueBookUrl: 'https://iupac.qmul.ac.uk/BlueBook/RuleP44.html',
    version: '2013',
    examples: [
      {
        smiles: 'CC(C)C(C(C(C)C)C)C',
        description: '6-carbon chain selected over shorter alternatives'
      }
    ]
  },
  'P-44.3.6': {
    section: 'Parent Structure Selection', 
    title: 'Greatest Number of Substituents',
    blueBookUrl: 'https://iupac.qmul.ac.uk/BlueBook/RuleP44.html',
    version: '2013',
    examples: [
      {
        smiles: 'CC(C)C(C(C(C)C)C)C',
        description: 'Chain with 3 substituents selected over chain with 2 substituents'
      }
    ]
  },
  'P-51.1': {
    section: 'Nomenclature Method Seniority',
    title: 'Substitutive Nomenclature',
    blueBookUrl: 'https://iupac.qmul.ac.uk/BlueBook/RuleP51.html',
    version: '2013',
    examples: [
      {
        smiles: 'CCO',
        description: 'Ethanol uses substitutive nomenclature (not functional class)'
      }
    ]
  }
};