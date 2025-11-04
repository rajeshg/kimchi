/**
 * Numbering Phase Rules (P-14)
 *
 * This layer implements Blue Book P-14 rules for locant assignment
 * and numbering of parent structures and substituents.
 *
 * Reference: Blue Book P-14 - Locants and numbering
 * https://iupac.qmul.ac.uk/BlueBook/RuleP14.html
 *
 * This file re-exports all rules from the modular numbering-layer/ directory.
 */

export {
  P14_1_FIXED_LOCANTS_RULE,
  P14_2_LOWEST_LOCANT_SET_RULE,
  P14_3_PRINCIPAL_GROUP_NUMBERING_RULE,
  P14_4_MULTIPLE_BONDS_SUBSTITUENTS_RULE,
  RING_NUMBERING_RULE,
  SUBSTITUENT_NUMBERING_RULE,
  NUMBERING_COMPLETE_RULE,
  NUMBERING_LAYER_RULES,
} from "./numbering-layer/index";

// Re-export helper functions for use by other layers
export * from "./numbering-layer/helpers";
