import type { IUPACRule } from '../../types';

export { P14_1_FIXED_LOCANTS_RULE } from './p14-1-fixed-locants';
export { P14_2_LOWEST_LOCANT_SET_RULE } from './p14-2-lowest-locant-set';
export { P14_3_PRINCIPAL_GROUP_NUMBERING_RULE } from './p14-3-principal-group-numbering';
export { P14_4_MULTIPLE_BONDS_SUBSTITUENTS_RULE } from './p14-4-multiple-bonds-substituents';
export { RING_NUMBERING_RULE } from './ring-numbering';
export { SUBSTITUENT_NUMBERING_RULE } from './substituent-numbering';
export { NUMBERING_COMPLETE_RULE } from './numbering-complete';

export * from './helpers';

import { P14_1_FIXED_LOCANTS_RULE } from './p14-1-fixed-locants';
import { P14_2_LOWEST_LOCANT_SET_RULE } from './p14-2-lowest-locant-set';
import { P14_3_PRINCIPAL_GROUP_NUMBERING_RULE } from './p14-3-principal-group-numbering';
import { P14_4_MULTIPLE_BONDS_SUBSTITUENTS_RULE } from './p14-4-multiple-bonds-substituents';
import { RING_NUMBERING_RULE } from './ring-numbering';
import { SUBSTITUENT_NUMBERING_RULE } from './substituent-numbering';
import { NUMBERING_COMPLETE_RULE } from './numbering-complete';

export const NUMBERING_LAYER_RULES: IUPACRule[] = [
  P14_1_FIXED_LOCANTS_RULE,
  P14_2_LOWEST_LOCANT_SET_RULE,
  P14_3_PRINCIPAL_GROUP_NUMBERING_RULE,
  P14_4_MULTIPLE_BONDS_SUBSTITUENTS_RULE,
  RING_NUMBERING_RULE,
  SUBSTITUENT_NUMBERING_RULE,
  NUMBERING_COMPLETE_RULE
];
