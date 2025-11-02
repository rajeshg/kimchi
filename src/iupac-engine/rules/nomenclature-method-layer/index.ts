import type { IUPACRule } from '../../types';
import { P51_1_SUBSTITUTIVE_RULE } from './P-51.1-substitutive-nomenclature';
import { P51_2_FUNCTIONAL_CLASS_RULE } from './P-51.2-functional-class-nomenclature';
import { P51_3_SKELETAL_REPLACEMENT_RULE } from './P-51.3-skeletal-replacement-nomenclature';
import { P51_4_MULTIPLICATIVE_RULE } from './P-51.4-multiplicative-nomenclature';
import { CONJUNCTIVE_NOMENCLATURE_RULE } from './conjunctive-nomenclature';

/**
 * Nomenclature Method Selection Layer Rules (P-51)
 * 
 * This layer determines which nomenclature method should be used
 * based on the functional groups and molecular structure.
 * 
 * Reference: Blue Book P-51 - Seniority of nomenclature methods
 * https://iupac.qmul.ac.uk/BlueBook/RuleP51.html
 */

// Export individual rules
export { P51_1_SUBSTITUTIVE_RULE };
export { P51_2_FUNCTIONAL_CLASS_RULE };
export { P51_3_SKELETAL_REPLACEMENT_RULE };
export { P51_4_MULTIPLICATIVE_RULE };
export { CONJUNCTIVE_NOMENCLATURE_RULE };

/**
 * Export all nomenclature method selection layer rules in execution order
 */
export const NOMENCLATURE_METHOD_LAYER_RULES: IUPACRule[] = [
  P51_1_SUBSTITUTIVE_RULE,
  P51_2_FUNCTIONAL_CLASS_RULE,
  P51_3_SKELETAL_REPLACEMENT_RULE,
  P51_4_MULTIPLICATIVE_RULE,
  CONJUNCTIVE_NOMENCLATURE_RULE
];
