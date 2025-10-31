import type { IUPACRule, FunctionalGroup, RingSystem } from '../types';
import type { ImmutableNamingContext } from '../immutable-context';
import { BLUE_BOOK_RULES } from '../types';
import { NomenclatureMethod, ExecutionPhase } from '../immutable-context';

/**
 * Nomenclature Method Selection Layer Rules (P-51)
 * 
 * This layer determines which nomenclature method should be used
 * based on the functional groups and molecular structure.
 * 
 * Reference: Blue Book P-51 - Seniority of nomenclature methods
 * https://iupac.qmul.ac.uk/BlueBook/RuleP51.html
 */

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
  priority: 100,
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

/**
 * Rule: P-51.2 - Functional Class Nomenclature
 * 
 * For certain functional groups (esters, anhydrides, etc.),
 * functional class nomenclature is preferred.
 */
export const P51_2_FUNCTIONAL_CLASS_RULE: IUPACRule = {
  id: 'P-51.2',
  name: 'Functional Class Nomenclature Method',
  description: 'Select functional class nomenclature for specific cases (P-51.2)',
  blueBookReference: BLUE_BOOK_RULES.P51_2,
  priority: 90,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = Array.isArray(state.functionalGroups) ? state.functionalGroups : [];
    
    // Check if we have functional groups that prefer functional class
    if (!functionalGroups || functionalGroups.length === 0) {
      return false;
    }
    
    // Functional groups that prefer functional class nomenclature
    const functionalClassPreferred = [
      'ester',
      'anhydride',
      'acyl_halide',
      'nitrile',
      'thioester'
    ];
    
    return functionalGroups.some((group: FunctionalGroup) => 
      functionalClassPreferred.includes(group.type)
    );
  },
  action: (context: ImmutableNamingContext) => {
    return context.withNomenclatureMethod(
      NomenclatureMethod.FUNCTIONAL_CLASS,
      'P-51.2',
      'Functional Class Nomenclature Method',
      'P-51.2',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Selected functional class nomenclature due to preferred functional groups'
    );
  }
};

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
  priority: 80,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = Array.isArray(state.functionalGroups) ? state.functionalGroups : [];
    const atomicAnalysis = context.getState().atomicAnalysis;
    
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

/**
 * Rule: P-51.4 - Multiplicative Nomenclature
 * 
 * For compounds with identical substituents that can be named using
 * multiplicative prefixes (di-, tri-, etc.).
 */
export const P51_4_MULTIPLICATIVE_RULE: IUPACRule = {
  id: 'P-51.4',
  name: 'Multiplicative Nomenclature Method',
  description: 'Select multiplicative nomenclature for identical substituents (P-51.4)',
  blueBookReference: BLUE_BOOK_RULES.P51_4,
  priority: 70,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = Array.isArray(state.functionalGroups) ? state.functionalGroups : [];
    
    if (!functionalGroups || functionalGroups.length === 0) {
      return false;
    }
    
    // Check for identical functional groups that could use multiplicative nomenclature
    const groupTypes = functionalGroups.map((group: FunctionalGroup) => group.type);
    const hasDuplicates = groupTypes.some((type: string) => 
      groupTypes.filter((t: string) => t === type).length > 1
    );
    
    return hasDuplicates;
  },
  action: (context: ImmutableNamingContext) => {
    return context.withNomenclatureMethod(
      NomenclatureMethod.MULTIPLICATIVE,
      'P-51.4',
      'Multiplicative Nomenclature Method',
      'P-51.4',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Selected multiplicative nomenclature due to identical substituents'
    );
  }
};

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
  priority: 60,
  conditions: (context: ImmutableNamingContext) => {
    const candidateRings = context.getState().candidateRings as RingSystem[] | undefined;
    
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

/**
 * Export all nomenclature method selection layer rules
 */
export const NOMENCLATURE_METHOD_LAYER_RULES: IUPACRule[] = [
  P51_1_SUBSTITUTIVE_RULE,
  P51_2_FUNCTIONAL_CLASS_RULE,
  P51_3_SKELETAL_REPLACEMENT_RULE,
  P51_4_MULTIPLICATIVE_RULE,
  CONJUNCTIVE_NOMENCLATURE_RULE
];