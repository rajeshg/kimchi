import type { IUPACRule } from '../../types';
import { RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';

/**
 * Rule: P-44.2 - Ring System Seniority
 * Seeds candidate rings from parser-provided ring detection
 */
export const P_44_2_RING_SENIORITY: IUPACRule = {
  id: 'atomic-seed-rings',
  name: 'Seed Candidate Rings from Parser',
  description: 'Seed candidateRings state from parser-provided rings',
  blueBookReference: 'P-44.2 - Ring system seniority',
  priority: RulePriority.FIVE,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return Array.isArray(state.molecule?.rings) && state.molecule.rings.length > 0 && !state.candidateRings;
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    if (!molecule || !Array.isArray(molecule.rings)) return context;
    const ringSystems: any[] = [];
    for (const ringIdxs of molecule.rings) {
      const atoms = ringIdxs.map((i: number) => molecule.atoms[i]).filter(Boolean);
      if (atoms.length < 3) continue;
      const bonds = molecule.bonds.filter((b: any) => ringIdxs.includes(b.atom1) && ringIdxs.includes(b.atom2));
      const hasAromatic = atoms.some((a: any) => !!a.aromatic);
      const hasHetero = atoms.some((a: any) => a.symbol !== 'C' && a.symbol !== 'H');
      const type = hasAromatic ? 'aromatic' : (hasHetero ? 'heterocyclic' : 'aliphatic');
      ringSystems.push({ atoms, bonds, rings: [ringIdxs], size: atoms.length, heteroatoms: atoms.filter((a: any) => a.symbol !== 'C'), type, fused: false, bridged: false, spiro: false });
    }
    if (ringSystems.length === 0) return context;
    return context.withStateUpdate(
      (state) => ({ ...state, candidateRings: ringSystems }),
      'atomic-seed-rings',
      'Seed Candidate Rings from Parser',
      'P-44.2',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      `Seeded ${ringSystems.length} candidate ring(s) from parser`
    );
  }
};
