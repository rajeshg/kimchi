import type { IUPACRule } from '../types';
import { BLUE_BOOK_RULES } from '../types';
import { ExecutionPhase } from '../immutable-context';
import { classifyRingSystems, analyzeRings } from '../../utils/ring-analysis';
import type { Molecule } from '../../../types';
import { BondType } from '../../../types';

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
    // Always run ring detection to ensure rings are found
    return true;
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
 * Rule: P-44.1.1 - Maximum Number of Principal Characteristic Groups
 * 
 * According to IUPAC Blue Book P-44.1.1, the parent structure should contain
 * the maximum number of principal characteristic groups (suffixes like -COOH, -one, etc.).
 * 
 * This rule compares chains with rings and selects chains that have principal functional
 * groups over rings (which typically have zero such groups).
 * 
 * This rule must run BEFORE RING_SELECTION_COMPLETE_RULE to prevent rings from being
 * selected as parent when chains have functional groups.
 */
export const P44_1_1_PRINCIPAL_CHARACTERISTIC_GROUPS_RULE: IUPACRule = {
  id: 'P-44.1.1',
  name: 'Maximum Number of Principal Characteristic Groups',
  description: 'Select parent with maximum number of principal characteristic groups',
  blueBookReference: BLUE_BOOK_RULES.P44_1,
  priority: 55, // Higher than RING_SELECTION_COMPLETE (50) so it runs first
  conditions: (context) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      if (process.env.VERBOSE) console.log('[P-44.1.1] Skipping - parent already selected');
      return false;
    }
    // Only apply if we have both chains and rings to compare
    const chains = state.candidateChains;
    const rings = state.candidateRings;
    const shouldApply = chains && chains.length > 0 && rings && rings.length > 0;
    if (process.env.VERBOSE) {
      console.log(`[P-44.1.1] Conditions check: chains=${chains?.length || 0}, rings=${rings?.length || 0}, shouldApply=${shouldApply}`);
    }
    return shouldApply;
  },
  action: (context) => {
    const state = context.getState();
    const chains = state.candidateChains;
    const molecule = state.molecule;
    
    if (process.env.VERBOSE) {
      console.log('[P-44.1.1] Action executing...');
      console.log(`[P-44.1.1] chains.length=${chains?.length}, molecule=${!!molecule}`);
    }
    
    if (!chains || chains.length === 0 || !molecule) return context;
    
    // Count functional groups that can be expressed as suffixes on each chain
    // Priority >= 4 means ketone/aldehyde or higher (carboxylic acid = 6, amide = 5, etc.)
    const chainFGCounts = chains.map((chain: any) => {
      // Count atoms in the chain that have principal functional groups
      let fgCount = 0;
      for (const atom of chain.atoms) {
        if (!atom || atom.symbol !== 'C') continue;
        
        // Find this atom's index in the molecule
        const atomIdx = molecule.atoms.findIndex((a: any) => a === atom);
        if (atomIdx === -1) continue;
        
        // Check for C=O (ketone/aldehyde)
        let hasDoubleO = false;
        for (const bond of molecule.bonds) {
          if (bond.atom1 !== atomIdx && bond.atom2 !== atomIdx) continue;
          const neighIdx = bond.atom1 === atomIdx ? bond.atom2 : bond.atom1;
          const neigh = molecule.atoms[neighIdx];
          // Check for double bond to oxygen
          if (neigh?.symbol === 'O' && bond.type === BondType.DOUBLE) {
            hasDoubleO = true;
            break;
          }
        }
        if (hasDoubleO) fgCount++;
      }
      
      if (process.env.VERBOSE) {
        console.log(`[P-44.1.1] Chain with ${chain.atoms.length} atoms: fgCount=${fgCount}`);
      }
      
      return { chain, fgCount };
    });
    
    // Find maximum functional group count
    const maxFGCount = Math.max(...chainFGCounts.map(c => c.fgCount));
    
    if (process.env.VERBOSE) {
      console.log(`[P-44.1.1] maxFGCount=${maxFGCount}`);
      console.log(`[P-44.1.1] candidateRings.length=${state.candidateRings?.length || 0}`);
    }
    
    // Rings typically have 0 principal characteristic groups (benzene doesn't have -C=O groups)
    // If any chain has principal functional groups (ketones, aldehydes, etc.), prefer it
    if (maxFGCount > 0) {
      const functionalChains = chainFGCounts
        .filter(c => c.fgCount === maxFGCount)
        .map(c => c.chain);
      
      if (process.env.VERBOSE) {
        console.log(`[P-44.1.1] Selecting ${functionalChains.length} chains with ${maxFGCount} functional groups, clearing rings`);
      }
      
      // Clear rings and keep only chains with functional groups
      return context.withStateUpdate(
        (state: any) => ({
          ...state,
          candidateChains: functionalChains,
          candidateRings: [], // Clear rings since functional chain takes precedence
          p44_1_1_applied: true
        }),
        'P-44.1.1',
        'Maximum Number of Principal Characteristic Groups',
        'P-44.1',
        ExecutionPhase.PARENT_STRUCTURE,
        `Selected chains with ${maxFGCount} principal characteristic groups, cleared rings`
      );
    }
    
    // If no chains have principal functional groups, let normal rules proceed
    // (rings may win via RING_SELECTION_COMPLETE)
    if (process.env.VERBOSE) {
      console.log('[P-44.1.1] No functional groups found, letting other rules proceed');
    }
    return context;
  }
};

/**
 * Rule: Parent Ring Selection Complete
 * 
 * Finalizes ring system selection and sets the parent structure.
 * This rule should NOT run if there's a heteroatom parent candidate (P-2.1 takes priority).
 */
export const RING_SELECTION_COMPLETE_RULE: IUPACRule = {
  id: 'ring-selection-complete',
  name: 'Ring Selection Complete',
  description: 'Finalize ring system selection and set parent structure',
  blueBookReference: 'P-44.2 - Ring system seniority',
  priority: 50,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length === 0 || context.getState().parentStructure) {
      return false;
    }

    // P-2.1 has priority: check if there's a heteroatom parent candidate
    // Heteroatom parents: Si, Ge, Sn, Pb (valence 4), P, As, Sb, Bi (valence 3)
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
        if (process.env.VERBOSE) console.log('Ring selection: deferring to P-2.1 heteroatom parent');
        return false;
      }
    }

    return true;
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
      name: generateRingName(parentRing, context.getState().molecule),
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
 * Groups connected rings (fused/bridged/spiro) into single ring systems
 */
export function detectRingSystems(molecule: any): any[] {
  const ringSystems: any[] = [];
  
  // Get rings - prefer parser-provided rings, fallback to ring analysis
  let rings: number[][] = [];
  if (molecule.rings && Array.isArray(molecule.rings) && molecule.rings.length > 0) {
    rings = molecule.rings;
  } else {
    const ringInfo = analyzeRings(molecule);
    rings = ringInfo.rings;
  }
  
  if (rings.length === 0) {
    return ringSystems; // No rings detected
  }
  
  // Use classifyRingSystems to properly detect fused/bridged/spiro rings
  const classification = classifyRingSystems(molecule.atoms, molecule.bonds);
  
  // Build lookup for ring classification
  const ringClassification = new Map<number, 'isolated' | 'fused' | 'spiro' | 'bridged'>();
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (!ring) continue;
    
    if (classification.isolated.some(r => arraysEqual(r, ring))) {
      ringClassification.set(i, 'isolated');
    } else if (classification.fused.some(r => arraysEqual(r, ring))) {
      ringClassification.set(i, 'fused');
    } else if (classification.spiro.some(r => arraysEqual(r, ring))) {
      ringClassification.set(i, 'spiro');
    } else if (classification.bridged.some(r => arraysEqual(r, ring))) {
      ringClassification.set(i, 'bridged');
    } else {
      ringClassification.set(i, 'isolated');
    }
  }
  
  // Group connected rings into ring systems using union-find
  const parent: number[] = rings.map((_, i) => i);
  
  const find = (x: number): number => {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]!);
    }
    return parent[x]!;
  };
  
  const union = (x: number, y: number): void => {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent[rootX] = rootY;
    }
  };
  
  // Union rings that share atoms
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const ring1 = rings[i]!;
      const ring2 = rings[j]!;
      // Check if rings share any atoms
      const sharedAtoms = ring1.filter(atom => ring2.includes(atom));
      if (sharedAtoms.length > 0) {
        union(i, j);
      }
    }
  }
  
  // Group rings by their root parent
  const groups = new Map<number, number[]>();
  for (let i = 0; i < rings.length; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(i);
  }
  
  // Build ring systems from groups
  for (const [_root, ringIndices] of groups) {
    // Collect all unique atoms and bonds from all rings in this system
    const atomSet = new Set<number>();
    const bondSet = new Set<string>();
    
    for (const ringIdx of ringIndices) {
      const ring = rings[ringIdx]!;
      for (const atomIdx of ring) {
        atomSet.add(atomIdx);
      }
      // Add bonds within this ring
      for (let i = 0; i < ring.length; i++) {
        const atom1 = ring[i]!;
        const atom2 = ring[(i + 1) % ring.length]!;
        const bondKey = atom1 < atom2 ? `${atom1}-${atom2}` : `${atom2}-${atom1}`;
        bondSet.add(bondKey);
      }
    }
    
    // Also add bridging bonds between rings
    for (const bond of molecule.bonds) {
      if (atomSet.has(bond.atom1) && atomSet.has(bond.atom2)) {
        const bondKey = bond.atom1 < bond.atom2 ? `${bond.atom1}-${bond.atom2}` : `${bond.atom2}-${bond.atom1}`;
        bondSet.add(bondKey);
      }
    }
    
    const atomIndices = Array.from(atomSet);
    const atoms = atomIndices.map((idx: number) => molecule.atoms[idx]).filter(Boolean);
    const bonds = molecule.bonds.filter((b: any) => {
      const bondKey = b.atom1 < b.atom2 ? `${b.atom1}-${b.atom2}` : `${b.atom2}-${b.atom1}`;
      return bondSet.has(bondKey);
    });
    
    // Determine if this ring system is fused/bridged/spiro
    const isFused = ringIndices.some(i => ringClassification.get(i) === 'fused');
    const isBridged = ringIndices.some(i => ringClassification.get(i) === 'bridged');
    const isSpiro = ringIndices.some(i => ringClassification.get(i) === 'spiro');
    
    // Determine ring type
    const ringObj = { atoms, bonds, rings: ringIndices.map(i => rings[i]!), size: atoms.length };
    
    ringSystems.push({
      atoms: atoms,
      bonds: bonds,
      rings: ringIndices.map(i => rings[i]!), // Store all rings in this system
      size: atoms.length,
      heteroatoms: atoms.filter((a: any) => a.symbol !== 'C'),
      type: determineRingType(ringObj),
      fused: isFused,
      bridged: isBridged,
      spiro: isSpiro
    });
  }

  return ringSystems;
}

// Helper function to compare arrays
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every(x => setA.has(x));
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
function generateRingName(ringSystem: any, molecule?: Molecule): string {
  const size = ringSystem.size;
  const type = ringSystem.type;
  const atoms = ringSystem.atoms || [];
  
  // Count heteroatoms first (used by both aromatic and saturated checks)
  const heteroCount: Record<string, number> = {};
  if (atoms.length >= 3 && atoms.length <= 6) {
    for (const atom of atoms) {
      if (atom && atom.symbol && atom.symbol !== 'C') {
        heteroCount[atom.symbol] = (heteroCount[atom.symbol] || 0) + 1;
      }
    }
  }
  
  const hasOxygen = heteroCount['O'] || 0;
  const hasNitrogen = heteroCount['N'] || 0;
  const hasSulfur = heteroCount['S'] || 0;
  const totalHetero = hasOxygen + hasNitrogen + hasSulfur;
  
  // Check aromatic heterocycles FIRST (before saturated heterocycles)
  if (type === 'aromatic' && totalHetero > 0) {
    // If we have molecule object and ring atoms, use proper aromatic naming
    // which can distinguish pyrimidine from pyrazine based on nitrogen positions
    if (molecule && ringSystem.rings && ringSystem.rings.length > 0) {
      // Get ring indices from the atoms in the ring
      const ringIndices: number[] = [];
      for (const atom of atoms) {
        const atomIndex = molecule.atoms.findIndex(a => a === atom || (a && atom && a.id === atom.id));
        if (atomIndex !== -1) {
          ringIndices.push(atomIndex);
        }
      }
      
      if (ringIndices.length === atoms.length) {
        // Import the proper aromatic naming function
        const { generateAromaticRingName } = require('../naming/iupac-rings/aromatic-naming');
        const aromaticName = generateAromaticRingName(ringIndices, molecule);
        if (aromaticName && !aromaticName.startsWith('aromatic_C')) {
          return aromaticName;
        }
      }
    }
    
    // Fallback to simple heuristics for aromatic rings
    // 6-membered aromatic heterocycles
    if (size === 6) {
      if (hasNitrogen === 1 && totalHetero === 1) return 'pyridine';
      if (hasNitrogen === 2 && totalHetero === 2) {
        // Without proper position analysis, default to pyrimidine (more common)
        // This should rarely be reached now that we use generateAromaticRingName above
        return 'pyrimidine';
      }
      if (hasNitrogen === 3 && totalHetero === 3) return 'triazine';
      if (hasOxygen === 1 && totalHetero === 1) return 'pyran';
    }
    
    // 5-membered aromatic heterocycles
    if (size === 5) {
      if (hasOxygen === 1 && totalHetero === 1) return 'furan';
      if (hasNitrogen === 1 && totalHetero === 1) return 'pyrrole';
      if (hasSulfur === 1 && totalHetero === 1) return 'thiophene';
      if (hasNitrogen === 2 && totalHetero === 2) return 'imidazole';
      if (hasNitrogen === 1 && hasSulfur === 1 && totalHetero === 2) return 'thiazole';
      if (hasNitrogen === 1 && hasOxygen === 1 && totalHetero === 2) return 'oxazole';
    }
  }
  
  // Check for saturated heterocycles (3-6 membered rings with one heteroatom)
  if (type !== 'aromatic' && totalHetero === 1) {
    // Check if saturated (no double bonds in ring)
    const molecule = { atoms, bonds: ringSystem.bonds || [] };
    const ringIndices = atoms.map((atom: any) => atom.id);
    const isSaturated = !ringIndices.some((atomIdx: number) => {
      return (ringSystem.bonds || []).some((bond: any) => {
        const isInRing = (ringIndices.includes(bond.atom1) && ringIndices.includes(bond.atom2));
        return isInRing && bond.type === BondType.DOUBLE;
      });
    });
    
    if (isSaturated) {
      // 3-membered rings
      if (size === 3 && hasOxygen === 1) return 'oxirane';
      if (size === 3 && hasNitrogen === 1) return 'azirane';
      if (size === 3 && hasSulfur === 1) return 'thiirane';
      
      // 4-membered rings
      if (size === 4 && hasOxygen === 1) return 'oxetane';
      if (size === 4 && hasNitrogen === 1) return 'azetidine';
      if (size === 4 && hasSulfur === 1) return 'thietane';
      
      // 5-membered rings
      if (size === 5 && hasOxygen === 1) return 'oxolane';
      if (size === 5 && hasNitrogen === 1) return 'pyrrolidine';
      if (size === 5 && hasSulfur === 1) return 'thiolane';
      
      // 6-membered rings
      if (size === 6 && hasOxygen === 1) return 'oxane';
      if (size === 6 && hasNitrogen === 1) return 'piperidine';
      if (size === 6 && hasSulfur === 1) return 'thiane';
    }
  }
  
  // Generic aromatic ring names (no heteroatoms)
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
 * Rule: P-2.3 - Ring Assemblies (von Baeyer System)
 *
 * For bridged polycyclic compounds, use the von Baeyer system with bicyclo[x.y.z]alkane notation.
 * This applies to compounds that are not fused or spiro.
 */
export const P2_3_RING_ASSEMBLIES_RULE: IUPACRule = {
  id: 'P-2.3',
  name: 'Ring Assemblies (von Baeyer System)',
  description: 'Apply von Baeyer bicyclo/tricyclo nomenclature for bridged systems (P-2.3)',
  blueBookReference: BLUE_BOOK_RULES.P2_3,
  priority: 75,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (process.env.VERBOSE) {
      console.log('[P-2.3 CONDITION] candidateRings count:', candidateRings?.length);
      console.log('[P-2.3 CONDITION] candidateRings:', JSON.stringify(candidateRings?.map((rs: any) => ({
        rings: rs.rings?.length,
        atoms: rs.atoms?.length
      })), null, 2));
      console.log('[P-2.3 CONDITION] parentStructure:', context.getState().parentStructure);
    }
    if (!candidateRings || candidateRings.length === 0 || context.getState().parentStructure) {
      if (process.env.VERBOSE) {
        console.log('[P-2.3 CONDITION] Returning false - no rings or parent already selected');
      }
      return false;
    }
    // Check if any ring system contains multiple rings (bridged/fused)
    const hasMultipleRings = candidateRings.some((rs: any) => rs.rings && rs.rings.length > 1);
    if (process.env.VERBOSE) {
      console.log('[P-2.3 CONDITION] hasMultipleRings:', hasMultipleRings);
    }
    return hasMultipleRings;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (process.env.VERBOSE) {
      console.log('[P-2.3 ACTION] candidateRings:', candidateRings?.length);
    }
    if (!candidateRings || candidateRings.length === 0) {
      if (process.env.VERBOSE) {
        console.log('[P-2.3 ACTION] No candidateRings, returning early');
      }
      return context;
    }

    // Check if this is a bridged system (not fused, not spiro)
    const ringClassification = classifyRingSystems(context.getState().molecule.atoms, context.getState().molecule.bonds);
    if (process.env.VERBOSE) {
      console.log('[P-2.3 ACTION] ringClassification.bridged:', ringClassification.bridged.length);
    }
    if (ringClassification.bridged.length > 0) {
      // Generate bicyclo/tricyclo name
      const bridgedNameResult = generateBridgedPolycyclicName(ringClassification.bridged, context.getState().molecule);
      if (process.env.VERBOSE) {
        console.log('[P-2.3 ACTION] bridgedNameResult:', bridgedNameResult);
      }

      if (bridgedNameResult) {
        const parentStructure = {
          type: 'ring' as const,
          ring: candidateRings[0], // Use first ring as representative
          name: bridgedNameResult.name,
          locants: generateRingLocants(candidateRings[0]),
          vonBaeyerNumbering: bridgedNameResult.vonBaeyerNumbering
        };

        return context.withParentStructure(
          parentStructure,
          'P-2.3',
          'Ring Assemblies',
          'P-2.3',
          ExecutionPhase.PARENT_STRUCTURE,
          `Applied von Baeyer system: ${bridgedNameResult.name}`
        );
      }
    }

    return context;
  }
};

/**
 * Rule: P-2.4 - Spiro Compounds
 *
 * For spiro compounds, use spiro[x.y]alkane notation where x and y are ring sizes
 * excluding the spiro atom, in ascending order.
 */
export const P2_4_SPIRO_COMPOUNDS_RULE: IUPACRule = {
  id: 'P-2.4',
  name: 'Spiro Compounds',
  description: 'Apply spiro[x.y]alkane nomenclature for spiro systems (P-2.4)',
  blueBookReference: BLUE_BOOK_RULES.P2_4,
  priority: 74,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length === 0 || context.getState().parentStructure) {
      return false;
    }
    // Check if any ring system contains multiple rings (spiro)
    return candidateRings.some((rs: any) => rs.rings && rs.rings.length > 1);
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length === 0) {
      return context;
    }

    // Check if this is a spiro system
    const ringClassification = classifyRingSystems(context.getState().molecule.atoms, context.getState().molecule.bonds);
    if (ringClassification.spiro.length > 0) {
      // Generate spiro name
      const spiroName = generateSpiroPolycyclicName(ringClassification.spiro, context.getState().molecule);

      if (spiroName) {
        const parentStructure = {
          type: 'ring' as const,
          ring: candidateRings[0], // Use first ring as representative
          name: spiroName,
          locants: generateRingLocants(candidateRings[0])
        };

        return context.withParentStructure(
          parentStructure,
          'P-2.4',
          'Spiro Compounds',
          'P-2.4',
          ExecutionPhase.PARENT_STRUCTURE,
          `Applied spiro nomenclature: ${spiroName}`
        );
      }
    }

    return context;
  }
};

/**
 * Rule: P-2.5 - Fused Ring Systems
 *
 * For fused polycyclic aromatic and aliphatic systems, use fusion nomenclature
 * with appropriate parent ring selection.
 */
export const P2_5_FUSED_RING_SYSTEMS_RULE: IUPACRule = {
  id: 'P-2.5',
  name: 'Fused Ring Systems',
  description: 'Apply fusion nomenclature for fused polycyclic systems (P-2.5)',
  blueBookReference: BLUE_BOOK_RULES.P2_5,
  priority: 73,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1 && !context.getState().parentStructure;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }

    // Check if this is a fused system
    const ringClassification = classifyRingSystems(context.getState().molecule.atoms, context.getState().molecule.bonds);
    if (ringClassification.fused.length > 0) {
      // Generate fused system name
      const fusedName = generateFusedPolycyclicName(ringClassification.fused, context.getState().molecule);

      if (fusedName) {
        const parentStructure = {
          type: 'ring' as const,
          ring: candidateRings[0], // Use first ring as representative
          name: fusedName,
          locants: generateRingLocants(candidateRings[0])
        };

        return context.withParentStructure(
          parentStructure,
          'P-2.5',
          'Fused Ring Systems',
          'P-2.5',
          ExecutionPhase.PARENT_STRUCTURE,
          `Applied fusion nomenclature: ${fusedName}`
        );
      }
    }

    return context;
  }
};

/**
 * Helper function to generate von Baeyer bicyclo/tricyclo names
 */
function generateBridgedPolycyclicName(bridgedRings: number[][], molecule: any): { name: string; vonBaeyerNumbering?: Map<number, number> } | null {
  // Use the engine's own naming function
  const { generateClassicPolycyclicName } = require('../naming/iupac-rings/utils');
  return generateClassicPolycyclicName(molecule, bridgedRings);
}

/**
 * Helper function to generate spiro names
 */
function generateSpiroPolycyclicName(spiroRings: number[][], molecule: any): string | null {
  // Use the engine's own naming function
  const { generateSpiroName } = require('../naming/iupac-rings/index');
  return generateSpiroName(spiroRings, molecule);
}

/**
 * Helper function to generate fused system names
 */
function generateFusedPolycyclicName(fusedRings: number[][], molecule: any): string | null {
  // For now, delegate to existing fused naming logic
  // This could be enhanced with specific P-2.5 rules
  const { identifyPolycyclicPattern } = require('../naming/iupac-rings/index');
  return identifyPolycyclicPattern(fusedRings, molecule);
}

/**
 * Export all ring analysis layer rules
 */
export const RING_ANALYSIS_LAYER_RULES: IUPACRule[] = [
  P44_2_1_RING_SYSTEM_DETECTION_RULE,
  P44_2_2_HETEROATOM_SENIORITY_RULE,
  P44_2_3_RING_SIZE_SENIORITY_RULE,
  P44_2_4_MAXIMUM_RINGS_RULE,
  P2_3_RING_ASSEMBLIES_RULE,
  P2_4_SPIRO_COMPOUNDS_RULE,
  P2_5_FUSED_RING_SYSTEMS_RULE,
  P44_1_1_PRINCIPAL_CHARACTERISTIC_GROUPS_RULE, // Must run before RING_SELECTION_COMPLETE
  RING_SELECTION_COMPLETE_RULE
];