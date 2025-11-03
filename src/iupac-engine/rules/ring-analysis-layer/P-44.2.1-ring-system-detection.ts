import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { ExecutionPhase } from '../../immutable-context';
import { detectRingSystems } from './helpers';

/**
 * Rule: P-44.2.1 - Ring System Detection
 * 
 * Identify all ring systems in the molecule.
 */
export const P44_2_1_RING_SYSTEM_DETECTION_RULE: IUPACRule = {
  id: 'P-44.2.1',
  name: 'Ring System Detection',
  description: 'Detect and classify all ring systems (P-44.2.1)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.TEN,
  conditions: () => {
    // Always run ring detection to ensure rings are found
    return true;
  },
  action: (context) => {
    const molecule = context.getState().molecule;
    const ringSystems = detectRingSystems(molecule);
    
    if (process.env.VERBOSE) {
      console.log(`[P-44.2.1] Detected ${ringSystems.length} ring systems`);
      ringSystems.forEach((ring: any, idx: number) => {
        const atomSymbols = ring.atoms?.map((a: any) => a.symbol).join('') || 'unknown';
        console.log(`[P-44.2.1]   Ring ${idx}: size=${ring.size}, atoms=${atomSymbols}`);
      });
    }
    
    // Update state with detected ring systems
    return context.withStateUpdate(
      (state: any) => ({ ...state, candidateRings: ringSystems }),
      'P-44.2.1',
      'Ring System Detection',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${ringSystems.length} ring system(s)`
    );
  }
};
