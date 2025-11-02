import type { IUPACRule } from '../../types';
import { RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';

/**
 * Rule: Valence Analysis
 * Analyzes the valence of each atom to understand bonding patterns
 */
export const ATOMIC_VALENCE_RULE: IUPACRule = {
  id: 'atomic-valence',
  name: 'Atomic Valence Analysis',
  description: 'Analyze valence of each atom to understand bonding patterns',
  blueBookReference: 'Basic analysis - no specific rule',
  priority: RulePriority.TEN,  // 100 - Valence analysis runs first
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return Array.isArray(state.molecule?.atoms) && state.molecule.atoms.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (!Array.isArray(state.molecule?.atoms) || !Array.isArray(state.molecule?.bonds)) {
      return context;
    }
    const valenceMap = new Map<number, number>();
    state.molecule.atoms.forEach((atom: any) => {
      const bonds = state.molecule.bonds.filter((b: any) => b.atom1 === atom.id || b.atom2 === atom.id);
      let valence = 0;
      bonds.forEach((bond: any) => {
        switch (bond.type) {
          case 'single': valence += 1; break;
          case 'double': valence += 2; break;
          case 'triple': valence += 3; break;
          case 'aromatic': valence += 1; break;
        }
      });
      valenceMap.set(atom.id, valence);
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          valenceMap
        }
      }),
      'atomic-valence',
      'Atomic Valence Analysis',
      'Basic analysis - no specific rule',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Analyze valence of each atom to understand bonding patterns'
    );
  }
};
