import type { IUPACRule } from '../types';
import { RulePriority } from '../types';
import type { ImmutableNamingContext } from '../immutable-context';
import { ExecutionPhase } from '../immutable-context';

/**
 * Atomic Properties Layer Rules
 * 
 * This layer performs basic molecular analysis at the atomic level.
 * It computes fundamental properties needed by subsequent layers.
 */

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

/**
 * Rule: Hybridization Analysis
 * Determines the hybridization state of each atom
 */
export const ATOMIC_HYBRIDIZATION_RULE: IUPACRule = {
  id: 'atomic-hybridization',
  name: 'Atomic Hybridization Analysis',
  description: 'Determine hybridization state of each atom',
  blueBookReference: 'Basic analysis - no specific rule',
  priority: RulePriority.NINE,  // 90 - Hybridization analysis
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return Array.isArray(state.molecule?.atoms) && state.molecule.atoms.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (!Array.isArray(state.molecule?.atoms) || !Array.isArray(state.molecule?.bonds)) {
      return context;
    }
    const hybridizationMap = new Map<number, string>();
    state.molecule.atoms.forEach((atom: any) => {
      let hybridization = 'unknown';
      if (atom.hybridization) {
        hybridization = atom.hybridization;
      } else {
        const bonds = state.molecule.bonds.filter((b: any) => b.atom1 === atom.id || b.atom2 === atom.id);
        if (bonds.length === 2) {
          hybridization = 'sp';
        } else if (bonds.length === 3) {
          hybridization = 'sp2';
        } else if (bonds.length === 4) {
          hybridization = 'sp3';
        } else {
          hybridization = 'other';
        }
      }
      hybridizationMap.set(atom.id, hybridization);
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          hybridizationMap
        }
      }),
      'atomic-hybridization',
      'Atomic Hybridization Analysis',
      'Basic analysis - no specific rule',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Determine hybridization state of each atom'
    );
  }
};

/**
 * Rule: Aromatic Atom Detection
 * Identifies atoms that are part of aromatic systems
 */
export const ATOMIC_AROMATIC_RULE: IUPACRule = {
  id: 'atomic-aromatic',
  name: 'Aromatic Atom Detection',
  description: 'Identify atoms that are part of aromatic systems',
  blueBookReference: 'P-25.1 - Aromatic parent structures',
  priority: RulePriority.EIGHT,  // 80 - Aromatic atom detection
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return Array.isArray(state.molecule?.atoms) && state.molecule.atoms.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (!Array.isArray(state.molecule?.atoms) || !Array.isArray(state.molecule?.bonds)) {
      return context;
    }
    const aromaticAtoms = new Set<number>();
    state.molecule.bonds.forEach((bond: any) => {
      if (bond.type === 'aromatic') {
        aromaticAtoms.add(bond.atom1);
        aromaticAtoms.add(bond.atom2);
      }
    });
    state.molecule.atoms.forEach((atom: any) => {
      if (atom.aromatic) {
        aromaticAtoms.add(atom.id);
      }
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          aromaticAtoms
        }
      }),
      'atomic-aromatic',
      'Aromatic Atom Detection',
      'P-25.1 - Aromatic parent structures',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Identify atoms that are part of aromatic systems'
    );
  }
};

/**
 * Rule: Heteroatom Detection
 * Identifies non-carbon atoms and their types
 */
export const ATOMIC_HETEROATOM_RULE: IUPACRule = {
  id: 'atomic-heteroatoms',
  name: 'Heteroatom Detection',
  description: 'Identify non-carbon atoms and their types',
  blueBookReference: 'P-44.2.2 - Heteroatom seniority',
  priority: RulePriority.SEVEN,  // 70 - Heteroatom detection
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return Array.isArray(state.molecule?.atoms) && state.molecule.atoms.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (!Array.isArray(state.molecule?.atoms)) {
      return context;
    }
    const heteroatoms: Array<{ id: number; element: string; type: string }> = [];
    state.molecule.atoms.forEach((atom: any) => {
      if (atom.symbol !== 'C') {
        heteroatoms.push({
          id: atom.id,
          element: atom.symbol,
          type: getHeteroatomType(atom.symbol)
        });
      }
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          heteroatoms
        }
      }),
      'atomic-heteroatoms',
      'Heteroatom Detection',
      'P-44.2.2 - Heteroatom seniority',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Identify non-carbon atoms and their types'
    );
  }
};

/**
 * Rule: Bond Order Analysis
 * Analyzes the distribution of bond orders in the molecule
 */
export const ATOMIC_BOND_ORDER_RULE: IUPACRule = {
  id: 'atomic-bond-orders',
  name: 'Bond Order Analysis',
  description: 'Analyze the distribution of bond orders in the molecule',
  blueBookReference: 'P-44.3.2-3 - Multiple bond seniority',
  priority: RulePriority.SIX,  // 60 - Bond order analysis
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    return Array.isArray(state.molecule?.bonds) && state.molecule.bonds.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    if (!Array.isArray(state.molecule?.bonds)) {
      return context;
    }
    const bondOrderStats = {
      single: 0,
      double: 0,
      triple: 0,
      aromatic: 0
    };
    state.molecule.bonds.forEach((bond: any) => {
      switch (bond.type) {
        case 'single': bondOrderStats.single++; break;
        case 'double': bondOrderStats.double++; break;
        case 'triple': bondOrderStats.triple++; break;
        case 'aromatic': bondOrderStats.aromatic++; break;
      }
    });
    return context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          ...state.atomicAnalysis,
          bondOrderStats
        }
      }),
      'atomic-bond-orders',
      'Bond Order Analysis',
      'P-44.3.2-3 - Multiple bond seniority',
      ExecutionPhase.NOMENCLATURE_SELECTION,
      'Analyze the distribution of bond orders in the molecule'
    );
  }
};

/**
 * Rule: Seed Candidate Rings from Parser
 *
 * If the parser/enrichment step produced a `molecule.rings` array, seed
 * `candidateRings` early so the ring-analysis layer can operate on concrete
 * ring candidates. This avoids missing ring parents when the parser already
 * provided ring detection.
 */
export const ATOMIC_SEED_RINGS_RULE: IUPACRule = {
  id: 'atomic-seed-rings',
  name: 'Seed Candidate Rings from Parser',
  description: 'Seed candidateRings state from parser-provided rings',
  blueBookReference: 'P-44.2 - Ring system seniority',
  priority: RulePriority.FIVE,  // 50 - Seed candidate rings (runs last in atomic layer)
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

/**
 * Helper function to categorize heteroatoms
 */
function getHeteroatomType(element: string): string {
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
 * Export all atomic layer rules
 */
export const ATOMIC_LAYER_RULES: IUPACRule[] = [
  ATOMIC_VALENCE_RULE,
  ATOMIC_HYBRIDIZATION_RULE,
  ATOMIC_AROMATIC_RULE,
  ATOMIC_HETEROATOM_RULE,
  ATOMIC_BOND_ORDER_RULE
  , ATOMIC_SEED_RINGS_RULE
];