import type { IUPACRule } from "../../types";
import { P44_2_1_RING_SYSTEM_DETECTION_RULE } from "./P-44.2.1-ring-system-detection";
import { P44_2_2_HETEROATOM_SENIORITY_RULE } from "./P-44.2.2-heteroatom-seniority";
import { P44_2_3_RING_SIZE_SENIORITY_RULE } from "./P-44.2.3-ring-size-seniority";
import { P44_2_4_MAXIMUM_RINGS_RULE } from "./P-44.2.4-maximum-rings";
import { RING_SELECTION_COMPLETE_RULE } from "./ring-selection-complete";
import { P44_1_1_PRINCIPAL_CHARACTERISTIC_GROUPS_RULE } from "./P-44.1.1-principal-characteristic-groups";
import { P2_3_RING_ASSEMBLIES_RULE } from "./P-2.3-ring-assemblies";
import { P2_4_SPIRO_COMPOUNDS_RULE } from "./P-2.4-spiro-compounds";
import { P2_5_FUSED_RING_SYSTEMS_RULE } from "./P-2.5-fused-ring-systems";
import { P44_4_RING_CHAIN_SELECTION_RULE } from "../initial-structure-layer/P-44.4-ring-vs-chain";

/**
 * Ring Analysis Layer Rules (P-44.2, P-44.4)
 *
 * This layer handles ring system analysis and selection according to
 * Blue Book rules for parent structure selection.
 *
 * Reference: Blue Book P-44.2 - Seniority of ring systems
 * Reference: Blue Book P-44.4 - Ring vs chain criteria
 * https://iupac.qmul.ac.uk/BlueBook/RuleP44.html
 */

export const RING_ANALYSIS_LAYER_RULES: IUPACRule[] = [
  P44_2_1_RING_SYSTEM_DETECTION_RULE,
  P44_2_2_HETEROATOM_SENIORITY_RULE,
  P44_2_3_RING_SIZE_SENIORITY_RULE,
  P44_2_4_MAXIMUM_RINGS_RULE,
  P44_1_1_PRINCIPAL_CHARACTERISTIC_GROUPS_RULE,
  P2_3_RING_ASSEMBLIES_RULE,
  P2_4_SPIRO_COMPOUNDS_RULE,
  P2_5_FUSED_RING_SYSTEMS_RULE,
  P44_4_RING_CHAIN_SELECTION_RULE, // Must run BEFORE ring-selection-complete
  RING_SELECTION_COMPLETE_RULE,
];

export {
  P44_2_1_RING_SYSTEM_DETECTION_RULE,
  P44_2_2_HETEROATOM_SENIORITY_RULE,
  P44_2_3_RING_SIZE_SENIORITY_RULE,
  P44_2_4_MAXIMUM_RINGS_RULE,
  RING_SELECTION_COMPLETE_RULE,
  P44_1_1_PRINCIPAL_CHARACTERISTIC_GROUPS_RULE,
  P2_3_RING_ASSEMBLIES_RULE,
  P2_4_SPIRO_COMPOUNDS_RULE,
  P2_5_FUSED_RING_SYSTEMS_RULE,
  P44_4_RING_CHAIN_SELECTION_RULE,
};

// Re-export helper functions
export {
  detectRingSystems,
  generateRingName,
  generateRingLocants,
} from "./helpers";
