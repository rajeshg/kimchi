import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';

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
  priority: RulePriority.TEN,  // 100 - Run very early to seed candidate structures
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains;
    if (process.env.VERBOSE) {
      console.log(`[INITIAL_STRUCTURE_ANALYSIS_RULE] condition check: chains=${chains?.length || 0}`);
    }
    // Run when no candidate chains are present
    return !chains || chains.length === 0;
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    try {
      // Use detectRingSystems from ring-analysis-layer to properly group connected rings
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { detectRingSystems } = require('../ring-analysis-layer');
      const ringSystems: any[] = detectRingSystems(molecule);

      if (ringSystems.length > 0) {
        // Update state with candidateRings so ring-analysis rules run
        let ctxWithRings = context.withStateUpdate(
          (state: any) => ({ ...state, candidateRings: ringSystems }),
          'init-structure-analysis',
          'Initial Structure Analysis',
          BLUE_BOOK_RULES.P44_3_1,
          ExecutionPhase.PARENT_STRUCTURE,
          `Detected ${ringSystems.length} ring system(s)`
        );
        // eslint-disable-next-line no-param-reassign
        // @ts-ignore - reassign local context for further actions
        context = ctxWithRings as unknown as ImmutableNamingContext;
      }

       // Local require to avoid circular imports
       // eslint-disable-next-line @typescript-eslint/no-var-requires
       const { findMainChain, findSubstituents } = require('../../naming/iupac-chains');
       const mainChain = findMainChain(molecule as any);
       console.log(`[initial-structure-layer] findMainChain returned: ${mainChain?.join(',') || 'empty'}`);
       
       // If no main chain found, return context (which may have rings already set)
       // This allows ring-only molecules to be processed by ring-analysis rules
       if (!mainChain || mainChain.length === 0) {
         console.log(`[initial-structure-layer] No chain found, returning context with ${ringSystems.length} ring(s)`);
         return context;
       }

      const candidates: any[] = [];
      // Use only the main chain (already optimally oriented by findMainChain)
      const main = mainChain;
      if (main.length >= 1) {
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
        const substituents = subsRaw.map((s: any) => ({ 
          atoms: [], 
          bonds: [], 
          type: s.name, 
          locant: parseInt(s.position, 10), 
          isPrincipal: false,
          name: s.name
        }));

        console.log(`Candidate chain: ${main.join(',')}, length: ${atoms.length}`);
        candidates.push({ atoms, bonds, length: atoms.length, multipleBonds, substituents, locants: Array.from({ length: atoms.length }, (_, i) => i + 1) });
      }

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
