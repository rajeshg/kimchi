import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';

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
    
    // Use generateRingName from ring-analysis-layer to properly handle heterocycles
    const { generateRingName: generateRingNameFn, generateRingLocants: generateRingLocantsFn } = require('../ring-analysis-layer');
    const name = generateRingNameFn(ring, context.getState().molecule);
    const locants = generateRingLocantsFn(ring);

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
