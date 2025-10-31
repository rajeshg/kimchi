import type { IUPACRule } from '../types';
import { BLUE_BOOK_RULES } from '../types';
import type { ImmutableNamingContext } from '../immutable-context';
import { ExecutionPhase } from '../immutable-context';

/**
 * Initial Structure Analysis Rule
 *
 * Seed candidateChains (and minimal substituent info) using the
 * iupac chain utilities so that parent-selection rules have
 * reasonable starting candidates. This avoids putting analysis
 * logic directly into the mutable context implementation.
 */
export const INITIAL_STRUCTURE_ANALYSIS_RULE: IUPACRule = {
  id: 'init-structure-analysis',
  name: 'Initial Structure Analysis',
  description: 'Seed candidate chains using iupac chain utilities',
  blueBookReference: BLUE_BOOK_RULES.P44_3_1,
  priority: 120,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains;
    // Run when no candidate chains are present
    return !chains || chains.length === 0;
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    try {
      // Local require to avoid circular imports
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { findMainChain, findSubstituents } = require('../../utils/iupac/iupac-chains');
      const main = findMainChain(molecule as any) as number[];
      // If parser provided ring information, seed candidateRings so the
      // ring analysis layer has something to operate on. This avoids
      // missing ring parents when parser precomputes ring membership.
      if (molecule && Array.isArray(molecule.rings) && molecule.rings.length > 0) {
        const ringSystems: any[] = [];
        for (const ringIdxs of molecule.rings) {
          const atoms = ringIdxs.map((i: number) => molecule.atoms[i]).filter(Boolean);
          if (atoms.length < 3) continue;
          const bonds = molecule.bonds.filter((b: any) => ringIdxs.includes(b.atom1) && ringIdxs.includes(b.atom2));
          ringSystems.push({ atoms, bonds, rings: [ringIdxs], size: atoms.length });
        }
        if (ringSystems.length > 0) {
          // Update state with candidateRings so ring-analysis rules run
          // with concrete candidates.
          // Use withStateUpdate to attach candidateRings metadata.
          let ctxWithRings = context.withStateUpdate(
            (state: any) => ({ ...state, candidateRings: ringSystems }),
            'init-structure-analysis',
            'Initial Structure Analysis',
            BLUE_BOOK_RULES.P44_3_1,
            ExecutionPhase.PARENT_STRUCTURE,
            `Seeded ${ringSystems.length} candidate ring(s) from parser rings`
          );
          // Continue analysis with the context that has rings seeded
          // but fall through to also seed candidate chains below.
          // Replace context variable for subsequent operations.
          // eslint-disable-next-line no-param-reassign
          // @ts-ignore - reassign local context for further actions
          context = ctxWithRings as unknown as ImmutableNamingContext;
        }
      }
      if (!main || main.length < 2) return context;

      const candidates: any[] = [];
      const atoms = main.map((idx: number) => molecule.atoms[idx]).filter(Boolean);
      const bonds: any[] = [];
      const multipleBonds: any[] = [];

      for (let i = 0; i < main.length - 1; i++) {
        const a = main[i]!;
        const b = main[i + 1]!;
        const bond = molecule.bonds.find((bb: any) => (bb.atom1 === a && bb.atom2 === b) || (bb.atom1 === b && bb.atom2 === a));
        if (bond) {
          bonds.push(bond);
          if (bond.type !== 'single') {
            multipleBonds.push({ atoms: [molecule.atoms[a], molecule.atoms[b]], bond, type: bond.type === 'double' ? 'double' : 'triple', locant: i + 1 });
          }
        }
      }

      const subsRaw = findSubstituents(molecule as any, main as number[]);
      const substituents = subsRaw.map((s: any) => ({ atoms: [], bonds: [], type: s.name, locant: parseInt(s.position, 10), isPrincipal: false }));

      candidates.push({ atoms, bonds, length: atoms.length, multipleBonds, substituents, locants: Array.from({ length: atoms.length }, (_, i) => i + 1) });

      return context.withUpdatedCandidates(
        candidates,
        'init-structure-analysis',
        'Initial Structure Analysis',
        BLUE_BOOK_RULES.P44_3_1,
        ExecutionPhase.PARENT_STRUCTURE,
        'Seeded candidate chains from iupac chain utilities'
      );
    } catch (err) {
      // If utilities unavailable, do nothing and let later rules/fallbacks run
      return context;
    }
  }
};

export const INITIAL_STRUCTURE_LAYER_RULES: IUPACRule[] = [
  INITIAL_STRUCTURE_ANALYSIS_RULE
];
