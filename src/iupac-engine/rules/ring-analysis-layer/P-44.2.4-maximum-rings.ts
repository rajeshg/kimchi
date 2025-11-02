import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { ExecutionPhase } from '../../immutable-context';

/**
 * Rule: P-44.2.4 - Maximum Number of Rings
 * 
 * Among equally sized rings, choose the system with the maximum number of rings.
 */
export const P44_2_4_MAXIMUM_RINGS_RULE: IUPACRule = {
  id: 'P-44.2.4',
  name: 'Maximum Number of Rings',
  description: 'Select ring system with most rings (P-44.2.4)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.SEVEN,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }
    
    // Group rings by size and find size with most rings
    const ringGroups = new Map<number, any[]>();
    candidateRings.forEach((ring: any) => {
      const size = ring.size;
      if (!ringGroups.has(size)) {
        ringGroups.set(size, []);
      }
      ringGroups.get(size)!.push(ring);
    });
    
    const maxRingsCount = Math.max(...Array.from(ringGroups.values()).map(group => group.length));
    const bestGroups = Array.from(ringGroups.values()).filter(group => group.length === maxRingsCount);
    
    // If multiple groups have same number of rings, prefer smaller size
    if (bestGroups.length > 1) {
      const smallestSize = Math.min(...bestGroups.map(group => group[0].size));
      return context.withUpdatedRings(
        ringGroups.get(smallestSize)!,
        'P-44.2.4',
        'Maximum Number of Rings',
        'P-44.2',
        ExecutionPhase.PARENT_STRUCTURE,
        `Selected ring system with ${maxRingsCount} rings (smallest size: ${smallestSize})`
      );
    }
    
    return context.withUpdatedRings(
      bestGroups[0] ?? [],
      'P-44.2.4',
      'Maximum Number of Rings',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ring system with ${maxRingsCount} rings`
    );
  }
};
