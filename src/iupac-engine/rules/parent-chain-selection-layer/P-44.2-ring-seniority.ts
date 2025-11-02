import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findSubstituents: _findSubstituents } = require('../../naming/iupac-chains');

/**
 * Rule: P-44.2 - Ring System Seniority
 * 
 * Prefer ring systems over chains when applicable.
 */
export const P44_2_RING_SENIORITY_RULE: IUPACRule = {
  id: 'P-44.2',
  name: 'Ring System Seniority',
  description: 'Prefer ring systems over chains when applicable',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.TEN,
   conditions: (context) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      return false;
    }
    const rings = state.candidateRings;
    return rings && rings.length > 0;
  },
  action: (context) => {
    const rings = context.getState().candidateRings;
    if (!rings || rings.length === 0) return context;
    // Prefer largest ring system (by atom count)
    const maxSize = Math.max(...rings.map(r => r.atoms.length));
    const largestRings = rings.filter(r => r.atoms.length === maxSize);
    // Choose the first largest ring and set as parentStructure (preserve ring semantics)
    const ring = largestRings[0];
    if (!ring) return context;
    const size = ring.atoms ? ring.atoms.length : (ring.size || 0);
    const type = ring.type || (ring.atoms && ring.atoms.some((a:any) => a.aromatic) ? 'aromatic' : 'aliphatic');
    let name = '';
    if (type === 'aromatic') {
      const aromaticNames: { [key: number]: string } = { 6: 'benzene', 5: 'cyclopentadiene', 7: 'cycloheptatriene' };
      name = aromaticNames[size] || `aromatic-${size}-membered`;
    } else {
      const ringNames: { [key: number]: string } = { 3: 'cyclopropane', 4: 'cyclobutane', 5: 'cyclopentane', 6: 'cyclohexane', 7: 'cycloheptane', 8: 'cyclooctane' };
      name = ringNames[size] || `cyclo${size}ane`;
    }
    const locants = ring.atoms ? ring.atoms.map((_: any, idx: number) => idx + 1) : [];
    // Try to find substituents on the ring atoms so substituted ring names can be produced
    let substituents: any[] = [];
    try {
      const mol = (context.getState() as any).molecule;
      if (ring && ring.atoms && mol) {
        const atomIds = ring.atoms.map((a: any) => a.id);
        substituents = _findSubstituents(mol, atomIds) || [];
      }
    } catch (e) {
      substituents = [];
    }

    const parentStructure = {
      type: 'ring' as const,
      ring,
      name,
      locants,
      substituents
    };
    return context.withParentStructure(
      parentStructure,
      'P-44.2',
      'Ring System Seniority',
      BLUE_BOOK_RULES.P44_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'Selected largest ring system as parent structure'
    );
  }
};
