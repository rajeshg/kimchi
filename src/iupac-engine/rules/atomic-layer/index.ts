import type { IUPACRule } from '../../types';
import { ATOMIC_VALENCE_RULE } from './P-00-atomic-valence';
import { ATOMIC_HYBRIDIZATION_RULE } from './P-00-atomic-hybridization';
import { P_25_1_AROMATIC_PARENTS } from './P-25.1-aromatic-parents';
import { P_44_2_2_HETEROATOM_SENIORITY } from './P-44.2.2-heteroatom-seniority';
import { P_44_3_2_3_MULTIPLE_BOND_SENIORITY } from './P-44.3.2-3-multiple-bond-seniority';
import { P_44_2_RING_SENIORITY } from './P-44.2-ring-seniority';

/**
 * Atomic Properties Layer Rules
 * 
 * This layer performs basic molecular analysis at the atomic level.
 * It computes fundamental properties needed by subsequent layers.
 */

/**
 * Helper function to categorize heteroatoms
 */
export function getHeteroatomType(element: string): string {
  const heteroatomCategories = {
    'N': 'nitrogen',
    'O': 'oxygen',
    'S': 'sulfur',
    'P': 'phosphorus',
    'F': 'fluorine',
    'Cl': 'chlorine',
    'Br': 'bromine',
    'I': 'iodine',
    'B': 'boron',
    'Si': 'silicon',
    'Ge': 'germanium',
    'As': 'arsenic',
    'Sb': 'antimony',
    'Se': 'selenium',
    'Te': 'tellurium'
  };
  
  return heteroatomCategories[element as keyof typeof heteroatomCategories] || 'other';
}

/**
 * Export individual rules
 */
export {
  ATOMIC_VALENCE_RULE,
  ATOMIC_HYBRIDIZATION_RULE,
  P_25_1_AROMATIC_PARENTS as ATOMIC_AROMATIC_RULE,
  P_44_2_2_HETEROATOM_SENIORITY as ATOMIC_HETEROATOM_RULE,
  P_44_3_2_3_MULTIPLE_BOND_SENIORITY as ATOMIC_BOND_ORDER_RULE,
  P_44_2_RING_SENIORITY as ATOMIC_SEED_RINGS_RULE
};

/**
 * Export all atomic layer rules in execution order
 */
export const ATOMIC_LAYER_RULES: IUPACRule[] = [
  ATOMIC_VALENCE_RULE,
  ATOMIC_HYBRIDIZATION_RULE,
  P_25_1_AROMATIC_PARENTS,
  P_44_2_2_HETEROATOM_SENIORITY,
  P_44_3_2_3_MULTIPLE_BOND_SENIORITY,
  P_44_2_RING_SENIORITY
];
