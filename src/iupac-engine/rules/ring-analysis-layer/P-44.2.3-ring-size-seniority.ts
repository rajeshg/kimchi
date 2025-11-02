import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { ExecutionPhase } from '../../immutable-context';

/**
 * Rule: P-44.2.3 - Ring Size Seniority
 * 
 * Choose the smallest ring system when heteroatom seniority doesn't distinguish.
 */
export const P44_2_3_RING_SIZE_SENIORITY_RULE: IUPACRule = {
  id: 'P-44.2.3',
  name: 'Ring Size Seniority',
  description: 'Select smallest ring system (P-44.2.3)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.EIGHT,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }
    
    // Find smallest ring size
    const smallestSize = Math.min(...candidateRings.map((ring: any) => ring.size));
    const smallestRings = candidateRings.filter((ring: any) => ring.size === smallestSize);
    
    return context.withUpdatedRings(
      smallestRings,
      'P-44.2.3',
      'Ring Size Seniority',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected smallest ring(s) (size: ${smallestSize})`
    );
  }
};
