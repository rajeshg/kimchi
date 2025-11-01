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

  // Fallback: use ring analysis to detect rings
  const ringInfo = analyzeRings(molecule);
  if (ringInfo.rings.length === 0) return ringSystems;

  for (const ring of ringInfo.rings) {
    const atoms = ring.map((i: number) => molecule.atoms[i]).filter(Boolean);
    if (atoms.length < 3) continue;
    const bonds = molecule.bonds.filter((b: any) => ring.includes(b.atom1) && ring.includes(b.atom2));
    const ringObj = { atoms, bonds, rings: [ring], size: atoms.length };
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

  // Fallback heuristic for simple rings: if single bonds == carbon count, assume single ring
  if (ringSystems.length === 0) {
    const carbonCount = molecule.atoms.filter((a: any) => a.symbol === 'C').length;
    const singleBonds = molecule.bonds.filter((b: any) => b.type === 'single');
    if (singleBonds.length === carbonCount) {
      const carbonAtoms = molecule.atoms.filter((a: any) => a.symbol === 'C');
      const carbonBonds = molecule.bonds.filter((b: any) => b.type === 'single' && molecule.atoms[b.atom1].symbol === 'C' && molecule.atoms[b.atom2].symbol === 'C');
      const hasAromatic = carbonAtoms.some((a: any) => a.aromatic);
      const ringSystem = {
        atoms: carbonAtoms,
        bonds: carbonBonds,
        rings: [carbonAtoms.map((a: any) => a.id)],
        size: carbonCount,
        heteroatoms: [],
        type: hasAromatic ? 'aromatic' : 'aliphatic',
        fused: false,
        bridged: false,
        spiro: false
      };
      ringSystems.push(ringSystem);
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
  const atoms = ringSystem.atoms || [];
  
  // Check for heterocycles first (3-6 membered rings with one heteroatom)
  if (atoms.length >= 3 && atoms.length <= 6) {
    const heteroCount: Record<string, number> = {};
    for (const atom of atoms) {
      if (atom && atom.symbol && atom.symbol !== 'C') {
        heteroCount[atom.symbol] = (heteroCount[atom.symbol] || 0) + 1;
      }
    }
    
    const hasOxygen = heteroCount['O'] || 0;
    const hasNitrogen = heteroCount['N'] || 0;
    const hasSulfur = heteroCount['S'] || 0;
    const totalHetero = hasOxygen + hasNitrogen + hasSulfur;
    
    // Only name simple heterocycles (one heteroatom)
    if (totalHetero === 1) {
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
  }
  
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
    return candidateRings && candidateRings.length > 1 && !context.getState().parentStructure;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }

    // Check if this is a bridged system (not fused, not spiro)
    const ringClassification = classifyRingSystems(context.getState().molecule.atoms, context.getState().molecule.bonds);
    if (ringClassification.bridged.length > 0) {
      // Generate bicyclo/tricyclo name
      const bridgedName = generateBridgedPolycyclicName(ringClassification.bridged, context.getState().molecule);

      if (bridgedName) {
        const parentStructure = {
          type: 'ring' as const,
          ring: candidateRings[0], // Use first ring as representative
          name: bridgedName,
          locants: generateRingLocants(candidateRings[0])
        };

        return context.withParentStructure(
          parentStructure,
          'P-2.3',
          'Ring Assemblies',
          'P-2.3',
          ExecutionPhase.PARENT_STRUCTURE,
          `Applied von Baeyer system: ${bridgedName}`
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
    return candidateRings && candidateRings.length > 1 && !context.getState().parentStructure;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
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
function generateBridgedPolycyclicName(bridgedRings: number[][], molecule: any): string | null {
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