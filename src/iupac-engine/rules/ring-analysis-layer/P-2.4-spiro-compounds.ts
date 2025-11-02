import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { ExecutionPhase } from '../../immutable-context';
import { classifyRingSystems } from '../../../utils/ring-analysis';
import { generateRingLocants } from './helpers';

/**
 * Rule: P-2.4 - Spiro Compounds
 *
 * For spiro compounds, use spiro[x.y]alkane notation where x and y are ring sizes
 * excluding the spiro atom, in ascending order.
 */
export const P2_4_SPIRO_COMPOUNDS_RULE: IUPACRule = {
  id: 'P-2.4',
  name: 'Spiro Compounds',
  description: 'Apply spiro[x.y]alkane nomenclature for spiro systems (P-2.4)',
  blueBookReference: BLUE_BOOK_RULES.P2_4,
  priority: RulePriority.SEVEN,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length === 0 || context.getState().parentStructure) {
      return false;
    }
    // Check if any ring system contains multiple rings (spiro)
    return candidateRings.some((rs: any) => rs.rings && rs.rings.length > 1);
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length === 0) {
      return context;
    }

    // Check if this is a spiro system
    const ringClassification = classifyRingSystems(context.getState().molecule.atoms, context.getState().molecule.bonds);
    if (ringClassification.spiro.length > 0) {
      // Generate spiro name
      const spiroName = generateSpiroPolycyclicName(ringClassification.spiro, context.getState().molecule);

      if (spiroName) {
        const parentStructure = {
          type: 'ring' as const,
          ring: candidateRings[0], // Use first ring as representative
          name: spiroName,
          locants: generateRingLocants(candidateRings[0])
        };

        return context.withParentStructure(
          parentStructure,
          'P-2.4',
          'Spiro Compounds',
          'P-2.4',
          ExecutionPhase.PARENT_STRUCTURE,
          `Applied spiro nomenclature: ${spiroName}`
        );
      }
    }

    return context;
  }
};

/**
 * Helper function to generate spiro names
 */
function generateSpiroPolycyclicName(spiroRings: number[][], molecule: any): string | null {
  // Use the engine's own naming function
  const { generateSpiroName } = require('../../naming/iupac-rings/index');
  return generateSpiroName(spiroRings, molecule);
}
