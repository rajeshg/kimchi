import type { IUPACRule } from "../../types";
import { P2_PARENT_HYDRIDE_RULES } from "./P-2.1-heteroatom-parents";
import { P3_SUBSTITUENT_RULES } from "./P-3-heteroatom-substituents";
import { RING_NUMBERING_RULE } from "../numbering-layer";
import { INITIAL_STRUCTURE_ANALYSIS_RULE } from "./P-44.3.1-initial-structure-analysis";
import { P44_4_RING_CHAIN_SELECTION_RULE } from "./P-44.4-ring-vs-chain";

/**
 * Initial Structure Analysis Layer
 *
 * This layer seeds candidate structures (chains and rings) and performs
 * initial analysis to determine parent structure candidates.
 */

/**
 * Export individual rules
 */
export { INITIAL_STRUCTURE_ANALYSIS_RULE, P44_4_RING_CHAIN_SELECTION_RULE };

/**
 * Export all initial structure layer rules in execution order
 */
export const INITIAL_STRUCTURE_LAYER_RULES: IUPACRule[] = [
  // P-2 rules run first to select simple parent hydrides
  ...P2_PARENT_HYDRIDE_RULES,
  // Ring numbering must run before P-3 substituent detection
  RING_NUMBERING_RULE,
  // P-3 rules run after parent selection to detect substituents
  ...P3_SUBSTITUENT_RULES,
  // Initial structure analysis seeds candidates
  INITIAL_STRUCTURE_ANALYSIS_RULE,
  // P-44.4 selects ring vs chain when no functional groups
  P44_4_RING_CHAIN_SELECTION_RULE,
];
