import type { ImmutableNamingContext } from '../../../immutable-context';
import { ExecutionPhase } from '../../../immutable-context';
import type { IUPACRule } from '../../../types';

/**
 * Blue Book Rule: Atomic Analysis
 * Basic atomic property analysis required by subsequent rules
 */

export const ATOMIC_VALENCE_RULE: IUPACRule = {
  id: 'atomic-valence',
  name: 'Atomic Valence Analysis',
  description: 'Analyze valence of each atom to understand bonding patterns',
  blueBookReference: 'Basic analysis - no specific rule',
  priority: 1,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const valenceMap = new Map<number, number>();
    
    // Calculate valence for each atom
    molecule.atoms.forEach((atom: any) => {
      const bonds = molecule.bonds.filter((b: any) => 
        b.atom1 === atom.id || b.atom2 === atom.id
      );
      
      let valence = 0;
      bonds.forEach((bond: any) => {
        switch (bond.type) {
          case 'single':
            valence += 1;
            break;
          case 'double':
            valence += 2;
            break;
          case 'triple':
            valence += 3;
            break;
          case 'aromatic':
            valence += 1;
            break;
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
  'Basic Analysis',
  ExecutionPhase.FUNCTIONAL_GROUP,
      'Added atomic valence analysis'
    );
  }
};

export const ATOMIC_HYBRIDIZATION_RULE: IUPACRule = {
  id: 'atomic-hybridization',
  name: 'Atomic Hybridization Analysis',
  description: 'Determine hybridization state of each atom',
  blueBookReference: 'Basic analysis - no specific rule',
  priority: 2,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const hybridizationMap = new Map<number, string>();
    
    molecule.atoms.forEach((atom: any) => {
      let hybridization = 'unknown';
      
      // Use existing hybridization if available
      if ((atom as any).hybridization) {
        hybridization = (atom as any).hybridization;
      } else {
        // Infer from bonding pattern
        const bonds = molecule.bonds.filter((b: any) => 
          b.atom1 === atom.id || b.atom2 === atom.id
        );
        
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
  'Basic Analysis',
  ExecutionPhase.FUNCTIONAL_GROUP,
      'Added atomic hybridization analysis'
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