import type { IUPACRule } from '../types';
import { BLUE_BOOK_RULES, RulePriority } from '../types';
import type { ImmutableNamingContext } from '../immutable-context';
import { ExecutionPhase } from '../immutable-context';
import { P2_PARENT_HYDRIDE_RULES } from './bluebook/P-2/parent-hydride-rules';
import { P3_SUBSTITUENT_RULES } from './bluebook/P-3/substituent-rules';
import { RING_NUMBERING_RULE } from './numbering-layer';
import { findRings, analyzeRings } from 'src/utils/ring-analysis';
import type { Molecule, Chain } from 'types';
import { BondType as BondTypeEnum } from 'types';
import { getChainFunctionalGroupPriority } from '../naming/iupac-chains';

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
      const { detectRingSystems } = require('./ring-analysis-layer');
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
       const { findMainChain, findSubstituents } = require('../naming/iupac-chains');
       const mainChain = findMainChain(molecule as any);
       console.log(`[initial-structure-layer] findMainChain returned: ${mainChain?.join(',') || 'empty'}`);
       if (!mainChain || mainChain.length === 0) return context;

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
        const substituents = subsRaw.map((s: any) => ({ atoms: [], bonds: [], type: s.name, locant: parseInt(s.position, 10), isPrincipal: false }));

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



/**
 * Rule: P-44.4 - Ring vs Chain Selection
 *
 * Determine whether to use ring system or chain as parent structure.
 * Ring systems generally have seniority over chains, UNLESS there's a
 * heteroatom parent candidate (P-2.1 takes priority).
 */
export const P44_4_RING_CHAIN_SELECTION_RULE: IUPACRule = {
  id: 'P-44.4',
  name: 'Ring vs Chain Selection',
  description: 'Select ring system over chain when both are present (P-44.4)',
  blueBookReference: BLUE_BOOK_RULES.P44_4,
  priority: RulePriority.SIX,  // 60 - Mid-priority structure selection
  conditions: (context: ImmutableNamingContext) => {
    const candidateRings = context.getState().candidateRings;
    const candidateChains = context.getState().candidateChains;
    
    if (process.env.VERBOSE) {
      console.log('P-44.4 conditions: candidateRings=', candidateRings?.length, 'candidateChains=', candidateChains?.length, 'parentStructure=', !!context.getState().parentStructure);
    }
    
    if (!candidateRings || candidateRings.length === 0 || 
        !candidateChains || candidateChains.length === 0 || 
        context.getState().parentStructure) {
      return false;
    }

    // P-2.1 has priority: check if there's a heteroatom parent candidate
    const molecule = context.getState().molecule;
    const HETEROATOM_HYDRIDES = ['Si', 'Ge', 'Sn', 'Pb', 'P', 'As', 'Sb', 'Bi'];
    const EXPECTED_VALENCE: Record<string, number> = {
      'Si': 4, 'Ge': 4, 'Sn': 4, 'Pb': 4,
      'P': 3, 'As': 3, 'Sb': 3, 'Bi': 3
    };

    const heteroatoms = molecule.atoms.filter(atom =>
      HETEROATOM_HYDRIDES.includes(atom.symbol)
    );

    // If exactly one heteroatom with correct valence exists, P-2.1 should handle it
    if (heteroatoms.length === 1) {
      const heteroatom = heteroatoms[0]!;
      const implicitHydrogens = heteroatom.hydrogens || 0;
      const heteroatomIndex = molecule.atoms.indexOf(heteroatom);
      const bondOrders = molecule.bonds
        .filter(bond => bond.atom1 === heteroatomIndex || bond.atom2 === heteroatomIndex)
        .reduce((sum, bond) => {
          const order = bond.type === 'single' ? 1 : bond.type === 'double' ? 2 : bond.type === 'triple' ? 3 : 1;
          return sum + order;
        }, 0);
      const totalValence = bondOrders + implicitHydrogens;
      const expectedValence = EXPECTED_VALENCE[heteroatom.symbol];

      if (totalValence === expectedValence) {
        // Heteroatom parent is present - let P-2.1 handle it
        if (process.env.VERBOSE) console.log('P-44.4: deferring to P-2.1 heteroatom parent');
        return false;
      }
    }

    return true;
  },
  action: (context: ImmutableNamingContext) => {
    const candidateRings = context.getState().candidateRings;
    const candidateChains = context.getState().candidateChains;

    if (!candidateRings || !candidateChains) {
      return context;
    }

    // According to P-44.4, ring systems generally take precedence over chains
    const ring = candidateRings[0];
    if (!ring) {
      return context;
    }
    const size = ring.size || (ring.atoms ? ring.atoms.length : 0);
    const type = ring.type || (ring.atoms && ring.atoms.some((a: any) => a.aromatic) ? 'aromatic' : 'aliphatic');
    let name = '';
    if (type === 'aromatic') {
      const aromaticNames: { [key: number]: string } = { 6: 'benzene', 5: 'cyclopentadiene', 7: 'cycloheptatriene' };
      name = aromaticNames[size] || `aromatic-${size}-membered`;
    } else {
      const ringNames: { [key: number]: string } = { 3: 'cyclopropane', 4: 'cyclobutane', 5: 'cyclopentane', 6: 'cyclohexane', 7: 'cycloheptane', 8: 'cyclooctane' };
      name = ringNames[size] || `cyclo${size}ane`;
    }
    const locants = ring.atoms ? ring.atoms.map((_: any, idx: number) => idx + 1) : [];

    const parentStructure = {
      type: 'ring' as const,
      ring,
      name,
      locants
    };

    return context.withParentStructure(
      parentStructure,
      'P-44.4',
      'Ring vs Chain Selection',
      'P-44.4',
      ExecutionPhase.PARENT_STRUCTURE,
      'Selected ring system as parent structure over chain'
    );
  }
};

/**
 * Export all initial structure layer rules
 */
export const INITIAL_STRUCTURE_LAYER_RULES: IUPACRule[] = [
  // P-2 rules run first to select simple parent hydrides
  ...P2_PARENT_HYDRIDE_RULES,
  // Ring numbering must run before P-3 substituent detection
  RING_NUMBERING_RULE,
  // P-3 rules run after parent selection to detect substituents
  ...P3_SUBSTITUENT_RULES,
  // Initial structure analysis seeds candidates
  INITIAL_STRUCTURE_ANALYSIS_RULE,
  // P-44.4 selects ring vs chain when no functional groups
  P44_4_RING_CHAIN_SELECTION_RULE
];
