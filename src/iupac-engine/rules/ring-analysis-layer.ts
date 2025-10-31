import type { IUPACRule } from '../types';
import { BLUE_BOOK_RULES } from '../types';
import { ExecutionPhase } from '../immutable-context';

/**
 * Ring Analysis Layer Rules (P-44.2, P-44.4)
 * 
 * This layer handles ring system analysis and selection according to
 * Blue Book rules for parent structure selection.
 * 
 * Reference: Blue Book P-44.2 - Seniority of ring systems
 * Reference: Blue Book P-44.4 - Ring vs chain criteria
 * https://iupac.qmul.ac.uk/BlueBook/RuleP44.html
 */

/**
 * Rule: P-44.2.1 - Ring System Detection
 * 
 * Identify all ring systems in the molecule.
 */
export const P44_2_1_RING_SYSTEM_DETECTION_RULE: IUPACRule = {
  id: 'P-44.2.1',
  name: 'Ring System Detection',
  description: 'Detect and classify all ring systems (P-44.2.1)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: 100,
  conditions: (context) => {
    // Check if molecule has rings (prefer parser-provided ring arrays when available)
    const molecule = context.getState().molecule;
    return (!!molecule.rings && molecule.rings.length > 0) ||
      molecule.atoms.some((atom: any) => atom.isInRing) ||
      molecule.bonds.some((bond: any) => (bond as any).ring !== undefined);
  },
  action: (context) => {
    const molecule = context.getState().molecule;
    const ringSystems = detectRingSystems(molecule);
    
    // Update state with detected ring systems
    return context.withStateUpdate(
      (state: any) => ({ ...state, candidateRings: ringSystems }),
      'P-44.2.1',
      'Ring System Detection',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${ringSystems.length} ring system(s)`
    );
  }
};

/**
 * Rule: P-44.2.2 - Heteroatom Seniority
 * 
 * Among ring systems, choose the one with the most senior heteroatoms
 * according to Blue Book Table 5.2.
 */
export const P44_2_2_HETEROATOM_SENIORITY_RULE: IUPACRule = {
  id: 'P-44.2.2',
  name: 'Heteroatom Seniority in Ring Systems',
  description: 'Select ring with most senior heteroatoms (P-44.2.2)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: 90,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }
    
    // Seniority order for heteroatoms in rings
    const heteroatomSeniority = {
      'O': 1, 'S': 2, 'Se': 3, 'Te': 4,
      'N': 5, 'P': 6, 'As': 7, 'Sb': 8,
      'B': 9, 'Si': 10, 'Ge': 11
    };
    
    // Calculate seniority score for each ring
    const ringScores = candidateRings.map((ring: any) => {
      let score = 0;
      
      for (const atom of ring.atoms) {
        if (atom.symbol !== 'C' && atom.symbol !== 'H') {
          const atomScore = heteroatomSeniority[atom.symbol as keyof typeof heteroatomSeniority] || 999;
          score += (1000 - atomScore); // Lower score = higher priority
        }
      }
      
      return score;
    });
    
    const maxScore = Math.max(...ringScores);
    const bestRings = candidateRings.filter((ring: any, index: number) => 
      ringScores[index] === maxScore
    );
    
    return context.withUpdatedRings(
      bestRings,
      'P-44.2.2',
      'Heteroatom Seniority',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ring with highest heteroatom seniority (score: ${maxScore})`
    );
  }
};

/**
 * Rule: P-44.2.3 - Ring Size Seniority
 * 
 * Choose the smallest ring system when heteroatom seniority doesn't distinguish.
 */
export const P44_2_3_RING_SIZE_SENIORITY_RULE: IUPACRule = {
  id: 'P-44.2.3',
  name: 'Ring Size Seniority',
  description: 'Select smallest ring system (P-44.2.3)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: 80,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }
    
    // Find smallest ring size
    const smallestSize = Math.min(...candidateRings.map((ring: any) => ring.size));
    const smallestRings = candidateRings.filter((ring: any) => ring.size === smallestSize);
    
    return context.withUpdatedRings(
      smallestRings,
      'P-44.2.3',
      'Ring Size Seniority',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected smallest ring(s) (size: ${smallestSize})`
    );
  }
};

/**
 * Rule: P-44.2.4 - Maximum Number of Rings
 * 
 * Among equally sized rings, choose the system with the maximum number of rings.
 */
export const P44_2_4_MAXIMUM_RINGS_RULE: IUPACRule = {
  id: 'P-44.2.4',
  name: 'Maximum Number of Rings',
  description: 'Select ring system with most rings (P-44.2.4)',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: 70,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }
    
    // Group rings by size and find size with most rings
    const ringGroups = new Map<number, any[]>();
    candidateRings.forEach((ring: any) => {
      const size = ring.size;
      if (!ringGroups.has(size)) {
        ringGroups.set(size, []);
      }
      ringGroups.get(size)!.push(ring);
    });
    
    const maxRingsCount = Math.max(...Array.from(ringGroups.values()).map(group => group.length));
    const bestGroups = Array.from(ringGroups.values()).filter(group => group.length === maxRingsCount);
    
    // If multiple groups have same number of rings, prefer smaller size
    if (bestGroups.length > 1) {
      const smallestSize = Math.min(...bestGroups.map(group => group[0].size));
      return context.withUpdatedRings(
        ringGroups.get(smallestSize)!,
        'P-44.2.4',
        'Maximum Number of Rings',
        'P-44.2',
        ExecutionPhase.PARENT_STRUCTURE,
        `Selected ring system with ${maxRingsCount} rings (smallest size: ${smallestSize})`
      );
    }
    
    return context.withUpdatedRings(
      bestGroups[0] ?? [],
      'P-44.2.4',
      'Maximum Number of Rings',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ring system with ${maxRingsCount} rings`
    );
  }
};

/**
 * Rule: P-44.4 - Ring vs Chain Selection
 * 
 * Determine whether to use ring system or chain as parent structure.
 * Ring systems generally have seniority over chains.
 */
export const P44_4_RING_CHAIN_SELECTION_RULE: IUPACRule = {
  id: 'P-44.4',
  name: 'Ring vs Chain Selection',
  description: 'Select ring system over chain when both are present (P-44.4)',
  blueBookReference: BLUE_BOOK_RULES.P44_4,
  priority: 60,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    const candidateChains = context.getState().candidateChains;
    return (candidateRings && candidateRings.length > 0) &&
           (candidateChains && candidateChains.length > 0);
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    const candidateChains = context.getState().candidateChains;
    
    if (!candidateRings || !candidateChains) {
      return context;
    }
    
    // According to P-44.4, ring systems generally take precedence over chains
    const parentStructure = {
      type: 'ring' as const,
      ring: candidateRings[0],
      name: generateRingName(candidateRings[0]),
      locants: generateRingLocants(candidateRings[0])
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
 * Rule: Parent Ring Selection Complete
 * 
 * Finalizes ring system selection and sets the parent structure.
 */
export const RING_SELECTION_COMPLETE_RULE: IUPACRule = {
  id: 'ring-selection-complete',
  name: 'Ring Selection Complete',
  description: 'Finalize ring system selection and set parent structure',
  blueBookReference: 'P-44.2 - Ring system seniority',
  priority: 50,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 0 && !context.getState().parentStructure;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    
    if (!candidateRings || candidateRings.length === 0) {
      return context.withConflict(
        {
          ruleId: 'ring-selection-complete',
          conflictType: 'state_inconsistency',
          description: 'No candidate rings available for selection',
          context: {}
        },
        'ring-selection-complete',
        'Ring Selection Complete',
        'P-44.2',
        ExecutionPhase.PARENT_STRUCTURE,
        'No candidate rings available for selection'
      );
    }
    
    // Select the final ring system
    const parentRing = candidateRings[0];
    
    const parentStructure = {
      type: 'ring' as const,
      ring: parentRing,
      name: generateRingName(parentRing),
      locants: generateRingLocants(parentRing)
    };
    
    return context.withParentStructure(
      parentStructure,
      'ring-selection-complete',
      'Ring Selection Complete',
      'P-44.2',
      ExecutionPhase.PARENT_STRUCTURE,
      'Finalized ring system selection'
    );
  }
};

/**
 * Helper function to detect ring systems in a molecule
 */
function detectRingSystems(molecule: any): any[] {
  const ringSystems: any[] = [];

  // Prefer parser-provided ring membership arrays when present
  if (molecule.rings && Array.isArray(molecule.rings) && molecule.rings.length > 0) {
    for (const ringIdxs of molecule.rings) {
      const atoms = ringIdxs.map((i: number) => molecule.atoms[i]).filter(Boolean);
      if (atoms.length < 3) continue;
      const bonds = molecule.bonds.filter((b: any) => ringIdxs.includes(b.atom1) && ringIdxs.includes(b.atom2));
      const ringObj = { atoms, bonds, rings: [ringIdxs], size: atoms.length };
      ringSystems.push({
        atoms: ringObj.atoms,
        bonds: ringObj.bonds,
        rings: [ringObj.atoms],
        size: ringObj.size,
        heteroatoms: ringObj.atoms.filter((a: any) => a.symbol !== 'C'),
        type: determineRingType(ringObj),
        fused: false,
        bridged: false,
        spiro: false
      });
    }
    return ringSystems;
  }

  // Fallback: group by atoms marked as in-ring
  const ringAtoms = molecule.atoms.filter((atom: any) => atom.isInRing);
  if (ringAtoms.length === 0) return ringSystems;

  const visited = new Set<number>();
  for (const atom of ringAtoms) {
    if (visited.has(atom.id)) continue;
    const ringSystem = exploreRingSystem(atom, molecule, visited);
    if (ringSystem.atoms.length >= 3) {
      ringSystems.push({
        atoms: ringSystem.atoms,
        bonds: ringSystem.bonds,
        rings: [ringSystem],
        size: ringSystem.atoms.length,
        heteroatoms: ringSystem.atoms.filter((a: any) => a.symbol !== 'C'),
        type: determineRingType(ringSystem),
        fused: false,
        bridged: false,
        spiro: false
      });
    }
  }

  return ringSystems;
}

/**
 * Explore connected ring system
 */
function exploreRingSystem(startAtom: any, molecule: any, visited: Set<number>): any {
  const atoms: any[] = [];
  const bonds: any[] = [];
  const queue = [startAtom];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    
    visited.add(current.id);
    atoms.push(current);
    
    // Find bonds in ring
    const currentBonds = molecule.bonds.filter((bond: any) => 
      bond.atom1 === current.id || bond.atom2 === current.id
    );
    
    for (const bond of currentBonds) {
      if (!bonds.find(b => b.id === bond.id)) {
        bonds.push(bond);
      }
      
      const otherAtom = bond.atom1 === current.id ? 
        molecule.atoms[bond.atom2] : molecule.atoms[bond.atom1];
      
      if (otherAtom.isInRing && !visited.has(otherAtom.id)) {
        queue.push(otherAtom);
      }
    }
  }
  
  return { atoms, bonds };
}

/**
 * Determine ring type (aromatic, aliphatic, heterocyclic)
 */
function determineRingType(ringSystem: any): string {
  const hasAromaticAtoms = ringSystem.atoms.some((atom: any) => atom.aromatic);
  const hasHeteroatoms = ringSystem.atoms.some((atom: any) => atom.symbol !== 'C');
  
  if (hasAromaticAtoms) {
    return 'aromatic';
  } else if (hasHeteroatoms) {
    return 'heterocyclic';
  } else {
    return 'aliphatic';
  }
}

/**
 * Generate ring name from ring system
 */
function generateRingName(ringSystem: any): string {
  const size = ringSystem.size;
  const type = ringSystem.type;
  
  if (type === 'aromatic') {
    const aromaticNames: { [key: number]: string } = {
      5: 'cyclopentadiene', 6: 'benzene', 7: 'cycloheptatriene'
    };
    return aromaticNames[size] || `aromatic-${size}-membered`;
  }
  
  // Base ring names
  const ringNames: { [key: number]: string } = {
    3: 'cyclopropane', 4: 'cyclobutane', 5: 'cyclopentane', 
    6: 'cyclohexane', 7: 'cycloheptane', 8: 'cyclooctane'
  };
  
  return ringNames[size] || `cyclo${size - 1}ane`;
}

/**
 * Generate locants for ring atoms
 */
function generateRingLocants(ringSystem: any): number[] {
  return ringSystem.atoms.map((atom: any, index: number) => index + 1);
}

/**
 * Export all ring analysis layer rules
 */
export const RING_ANALYSIS_LAYER_RULES: IUPACRule[] = [
  P44_2_1_RING_SYSTEM_DETECTION_RULE,
  P44_2_2_HETEROATOM_SENIORITY_RULE,
  P44_2_3_RING_SIZE_SENIORITY_RULE,
  P44_2_4_MAXIMUM_RINGS_RULE,
  P44_4_RING_CHAIN_SELECTION_RULE,
  RING_SELECTION_COMPLETE_RULE
];