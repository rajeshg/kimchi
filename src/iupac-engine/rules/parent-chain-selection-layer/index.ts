export { P44_2_RING_SENIORITY_RULE } from "./P-44.2-ring-seniority";
export { P44_3_1_MAX_LENGTH_RULE } from "./P-44.3.1-maximum-length";
export { P44_3_2_MULTIPLE_BONDS_RULE } from "./P-44.3.2-multiple-bonds";
export { P44_3_3_DOUBLE_BONDS_RULE } from "./P-44.3.3-double-bonds";
export { P44_3_4_MULTIPLE_BOND_LOCANTS_RULE } from "./P-44.3.4-multiple-bond-locants";
export { P44_3_5_DOUBLE_BOND_LOCANTS_RULE } from "./P-44.3.5-double-bond-locants";
export { P44_3_6_SUBSTITUENTS_RULE } from "./P-44.3.6-substituents";
export { P44_3_7_SUBSTITUENT_LOCANTS_RULE } from "./P-44.3.7-substituent-locants";
export { P44_3_8_ALPHABETICAL_LOCANT_RULE } from "./P-44.3.8-alphabetical-locant";
export { P44_4_RING_VS_CHAIN_IN_CHAIN_ANALYSIS_RULE } from "./P-44.4-ring-vs-chain-analysis";
export {
  PARENT_CHAIN_SELECTION_COMPLETE_RULE,
  generateChainName,
} from "./parent-chain-selection-complete";
export { RE_ANALYZE_ALKOXY_AFTER_PARENT_RULE } from "./re-analyze-alkoxy-after-parent";
export { ACYL_SUBSTITUENT_CORRECTION_RULE } from "./acyl-substituent-correction";

import type { IUPACRule } from "../../types";
import { P44_2_RING_SENIORITY_RULE } from "./P-44.2-ring-seniority";
import { P44_3_1_MAX_LENGTH_RULE } from "./P-44.3.1-maximum-length";
import { P44_3_2_MULTIPLE_BONDS_RULE } from "./P-44.3.2-multiple-bonds";
import { P44_3_3_DOUBLE_BONDS_RULE } from "./P-44.3.3-double-bonds";
import { P44_3_4_MULTIPLE_BOND_LOCANTS_RULE } from "./P-44.3.4-multiple-bond-locants";
import { P44_3_5_DOUBLE_BOND_LOCANTS_RULE } from "./P-44.3.5-double-bond-locants";
import { P44_3_6_SUBSTITUENTS_RULE } from "./P-44.3.6-substituents";
import { P44_3_7_SUBSTITUENT_LOCANTS_RULE } from "./P-44.3.7-substituent-locants";
import { P44_3_8_ALPHABETICAL_LOCANT_RULE } from "./P-44.3.8-alphabetical-locant";
import { PARENT_CHAIN_SELECTION_COMPLETE_RULE } from "./parent-chain-selection-complete";
import { RE_ANALYZE_ALKOXY_AFTER_PARENT_RULE } from "./re-analyze-alkoxy-after-parent";
import { ACYL_SUBSTITUENT_CORRECTION_RULE } from "./acyl-substituent-correction";

export const PARENT_CHAIN_SELECTION_LAYER_RULES: IUPACRule[] = [
  P44_2_RING_SENIORITY_RULE,
  P44_3_1_MAX_LENGTH_RULE,
  P44_3_2_MULTIPLE_BONDS_RULE,
  P44_3_3_DOUBLE_BONDS_RULE,
  P44_3_4_MULTIPLE_BOND_LOCANTS_RULE,
  P44_3_5_DOUBLE_BOND_LOCANTS_RULE,
  P44_3_6_SUBSTITUENTS_RULE,
  P44_3_7_SUBSTITUENT_LOCANTS_RULE,
  P44_3_8_ALPHABETICAL_LOCANT_RULE,
  PARENT_CHAIN_SELECTION_COMPLETE_RULE,
  RE_ANALYZE_ALKOXY_AFTER_PARENT_RULE,
  ACYL_SUBSTITUENT_CORRECTION_RULE,
];
