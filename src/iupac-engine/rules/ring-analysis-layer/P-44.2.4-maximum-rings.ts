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
    const shouldApply = candidateRings && candidateRings.length > 1;
    if (process.env.VERBOSE) {
      console.log(`[P-44.2.4 conditions] candidateRings: ${candidateRings?.length}, shouldApply: ${shouldApply}`);
    }
    return shouldApply;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    const molecule = context.getState().molecule;
    
    if (process.env.VERBOSE) {
      console.log('[P-44.2.4] Starting maximum rings rule with', candidateRings?.length, 'rings');
    }
    
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }
    
    // Check if rings are connected (bonded to each other but not sharing atoms)
    // If rings are connected, they form a polycyclic parent and should NOT be filtered
    const areRingsConnected = (ring1: any, ring2: any): boolean => {
      const ring1AtomIds = new Set(ring1.atoms.map((a: any) => a.id));
      const ring2AtomIds = new Set(ring2.atoms.map((a: any) => a.id));
      
      for (const bond of molecule.bonds) {
        const a1InRing1 = ring1AtomIds.has(bond.atom1);
        const a2InRing1 = ring1AtomIds.has(bond.atom2);
        const a1InRing2 = ring2AtomIds.has(bond.atom1);
        const a2InRing2 = ring2AtomIds.has(bond.atom2);
        
        if ((a1InRing1 && a2InRing2) || (a1InRing2 && a2InRing1)) {
          return true;
        }
      }
      return false;
    };
    
    // If any two rings are connected, keep all rings (they form a polycyclic parent)
    let hasConnectedRings = false;
    for (let i = 0; i < candidateRings.length && !hasConnectedRings; i++) {
      for (let j = i + 1; j < candidateRings.length && !hasConnectedRings; j++) {
        if (areRingsConnected(candidateRings[i], candidateRings[j])) {
          hasConnectedRings = true;
        }
      }
    }
    
    if (hasConnectedRings) {
      if (process.env.VERBOSE) {
        console.log(`[P-44.2.4] Rings are connected - keeping all ${candidateRings.length} rings as polycyclic parent`);
      }
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
    
    if (process.env.VERBOSE) {
      console.log(`[P-44.2.4] maxRingsCount: ${maxRingsCount}, bestGroups: ${bestGroups.length}`);
    }
    
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
