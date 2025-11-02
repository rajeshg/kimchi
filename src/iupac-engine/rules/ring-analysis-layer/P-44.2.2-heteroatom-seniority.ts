import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import { ExecutionPhase } from '../../immutable-context';

/**
 * Rule: P-44.2.2 - Heteroatom Seniority
 * 
 * Among ring systems, choose the one with the most senior heteroatoms
 * according to Blue Book Table 5.2.
 */
export const P44_2_2_HETEROATOM_SENIORITY_RULE: IUPACRule = {
  id: 'P-44.2.2',
  name: 'Heteroatom Seniority in Ring Systems',
  description: 'Select ring with most senior heteroatoms (P-44.2.2)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.NINE,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }
    
    // Seniority order for heteroatoms in rings
    const heteroatomSeniority = {
      'O': 1, 'S': 2, 'Se': 3, 'Te': 4,
      'N': 5, 'P': 6, 'As': 7, 'Sb': 8,
      'B': 9, 'Si': 10, 'Ge': 11
    };
    
    // Calculate seniority score for each ring
    const ringScores = candidateRings.map((ring: any) => {
      let score = 0;
      
      for (const atom of ring.atoms) {
        if (atom.symbol !== 'C' && atom.symbol !== 'H') {
          const atomScore = heteroatomSeniority[atom.symbol as keyof typeof heteroatomSeniority] || 999;
          score += (1000 - atomScore); // Lower score = higher priority
        }
      }
      
      return score;
    });
    
    const maxScore = Math.max(...ringScores);
    const bestRings = candidateRings.filter((_ring: any, index: number) => 
      ringScores[index] === maxScore
    );
    
    return context.withUpdatedRings(
      bestRings,
      'P-44.2.2',
      'Heteroatom Seniority',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ring with highest heteroatom seniority (score: ${maxScore})`
    );
  }
};
