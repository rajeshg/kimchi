import type { IUPACRule, FunctionalGroup, ParentStructure, Chain, MultipleBond, Substituent, RuleConflict } from '../types';
import { ExecutionPhase, ImmutableNamingContext } from '../immutable-context';
import { generateChainName } from './parent-chain-selection-layer';

/**
 * Numbering Phase Rules (P-14)
 * 
 * This layer implements Blue Book P-14 rules for locant assignment
 * and numbering of parent structures and substituents.
 * 
 * Reference: Blue Book P-14 - Locants and numbering
 * https://iupac.qmul.ac.uk/BlueBook/RuleP14.html
 */

/**
 * Rule: P-14.2 - Lowest Locant Set Principle
 * 
 * When multiple locant sets are possible, choose the set that gives
 * the lowest locant to the principal characteristic group.
 */
export const P14_2_LOWEST_LOCANT_SET_RULE: IUPACRule = {
  id: 'P-14.2',
  name: 'Lowest Locant Set Principle',
  description: 'Apply lowest locant set principle for numbering (P-14.2)',
  blueBookReference: 'P-14.2 - Lowest locant set principle',
  priority: 100,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;
    
    return !!(parentStructure && 
           functionalGroups && 
           functionalGroups.length > 0);
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;
    
    if (!parentStructure || !functionalGroups || functionalGroups.length === 0) {
      return context;
    }
    
    // Normalize functional group locants (map any atom-id placeholders to chain-relative locants)
    const normalizedFunctionalGroups = normalizeFunctionalGroupLocants(functionalGroups, parentStructure);

    // Find the principal functional group
    const principalGroup = normalizedFunctionalGroups.reduce((prev: FunctionalGroup, current: FunctionalGroup) => 
      (prev.priority < current.priority) ? prev : current
    );
    
    // Apply lowest locant set principle
    const optimizedLocants = optimizeLocantSet(parentStructure, principalGroup);

    // Update parent structure with optimized locants and store normalized functional groups
    const updatedParentStructure = {
      ...parentStructure,
      locants: optimizedLocants
    };

    return context.withStateUpdate(
      (state: any) => ({ ...state, parentStructure: updatedParentStructure, functionalGroups: normalizedFunctionalGroups }),
      'P-14.2',
      'Lowest Locant Set Principle',
      'P-14.2',
      ExecutionPhase.NUMBERING,
      `Applied lowest locant set: [${optimizedLocants.join(', ')}]`
    );
  }
};

/**
 * Map functional group locants from atom ids (placeholders) to chain-relative locant numbers
 */
function normalizeFunctionalGroupLocants(functionalGroups: FunctionalGroup[], parentStructure: ParentStructure): FunctionalGroup[] {
  if (!parentStructure) return functionalGroups;

  // Only handle chain parent structures for now
  if (parentStructure.type !== 'chain' || !parentStructure.chain) return functionalGroups;

  const atomIndexToLocant = new Map<number, number>();
  const chainAtoms = parentStructure.chain.atoms || [];
  const chainLocants = parentStructure.locants || chainAtoms.map((_, i) => i + 1);

  for (let i = 0; i < chainAtoms.length; i++) {
    const atom = chainAtoms[i];
    if (atom && typeof atom.id === 'number') {
      atomIndexToLocant.set(atom.id, chainLocants[i] ?? (i + 1));
    }
  }

  return functionalGroups.map((group) => {
    const mappedLocants = (group.locants || []).map((val: number) => {
      // If this value matches an atom id, map to locant, otherwise leave as-is
      return atomIndexToLocant.has(val) ? atomIndexToLocant.get(val)! : val;
    });

    return { ...group, locants: mappedLocants };
  });
}

/**
 * Rule: P-14.3 - Principal Group Numbering
 * 
 * The principal characteristic group receives the lowest possible locant.
 */
export const P14_3_PRINCIPAL_GROUP_NUMBERING_RULE: IUPACRule = {
  id: 'P-14.3',
  name: 'Principal Group Numbering',
  description: 'Assign lowest locant to principal group (P-14.3)',
  blueBookReference: 'P-14.3 - Numbering of principal group',
  priority: 95,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;
    
    return !!(parentStructure && functionalGroups && functionalGroups.length > 0);
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;
    
    if (!parentStructure || !functionalGroups || functionalGroups.length === 0) {
      return context;
    }
    
    // Principal group gets locant 1 for chains, or the lowest possible for rings
    const principalGroup = functionalGroups.reduce((prev: FunctionalGroup, current: FunctionalGroup) => 
      (prev.priority < current.priority) ? prev : current
    );
    
    const principalLocant = getPrincipalGroupLocant(parentStructure, principalGroup);
    
    // Update functional group locants
    const updatedFunctionalGroups = functionalGroups.map((group: FunctionalGroup) => ({
      ...group,
      locants: group === principalGroup ? [principalLocant] : group.locants
    }));
    
    return context.withStateUpdate(
      (state: any) => ({ 
        ...state, 
        functionalGroups: updatedFunctionalGroups,
        parentStructure: {
          ...parentStructure,
          locants: parentStructure.locants.map((locant: number, index: number) => 
            index === principalLocant - 1 ? principalLocant : locant
          )
        }
      }),
      'P-14.3',
      'Principal Group Numbering',
      'P-14.3',
      ExecutionPhase.NUMBERING,
      `Assigned locant ${principalLocant} to principal group: ${principalGroup.type}`
    );
  }
};

/**
 * Rule: P-14.4 - Multiple Bonds and Substituents
 * 
 * Assign locants to multiple bonds and substituents using
 * the lowest locant set principle.
 */
export const P14_4_MULTIPLE_BONDS_SUBSTITUENTS_RULE: IUPACRule = {
  id: 'P-14.4',
  name: 'Multiple Bonds and Substituents Numbering',
  description: 'Number multiple bonds and substituents (P-14.4)',
  blueBookReference: 'P-14.4 - Numbering of multiple bonds and substituents',
  priority: 90,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    return !!(parentStructure && parentStructure.type === 'chain');
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    
    if (!parentStructure || parentStructure.type !== 'chain') {
      return context;
    }
    
    const chain = parentStructure.chain;
    if (!chain) {
      return context;
    }
    
    // Number multiple bonds
    const numberedBonds = chain.multipleBonds.map((bond: MultipleBond) => {
      // Find locants of the two atoms in the bond
      const atomLocants: number[] = [];
      for (const atom of bond.atoms) {
        const atomIndex = chain.atoms.findIndex((a: any) => a.id === atom.id);
        if (atomIndex >= 0 && chain.locants[atomIndex]) {
          atomLocants.push(chain.locants[atomIndex]);
        }
      }
      const minLocant = atomLocants.length > 0 ? Math.min(...atomLocants) : (bond.locant || 1);
      return {
        ...bond,
        locant: minLocant
      };
    });
    
    // Number substituents
    // Substituents already have correct locants from initial structure analysis
    // based on their attachment point in the chain. We just need to ensure they
    // have the locant field set.
    const numberedSubstituents = chain.substituents.map((substituent: Substituent) => ({
      ...substituent,
      locant: typeof substituent.locant === 'number' ? substituent.locant : 1
    }));
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          chain: {
            ...chain,
            multipleBonds: numberedBonds,
            substituents: numberedSubstituents
          }
        }
      }),
      'P-14.4',
      'Multiple Bonds and Substituents Numbering',
      'P-14.4',
      ExecutionPhase.NUMBERING,
      `Numbered ${numberedBonds.length} bonds and ${numberedSubstituents.length} substituents`
    );
  }
};

/**
 * Rule: P-14.1 - Fixed Locants
 * 
 * Some parent structures have fixed locants that cannot be changed.
 */
export const P14_1_FIXED_LOCANTS_RULE: IUPACRule = {
  id: 'P-14.1',
  name: 'Fixed Locants for Retained Names',
  description: 'Apply fixed locants for retained names (P-14.1)',
  blueBookReference: 'P-14.1 - Fixed locants',
  priority: 80,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    return !!(parentStructure && hasFixedLocants(parentStructure));
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    
    if (!parentStructure || !hasFixedLocants(parentStructure)) {
      return context;
    }
    
    const fixedLocants = getFixedLocants(parentStructure);
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          locants: fixedLocants
        }
      }),
      'P-14.1',
      'Fixed Locants for Retained Names',
      'P-14.1',
      ExecutionPhase.NUMBERING,
      `Applied fixed locants: [${fixedLocants.join(', ')}]`
    );
  }
};

/**
 * Rule: Ring Numbering
 * 
 * Special numbering rules for ring systems, starting at a heteroatom
 * if present, or at a point of unsaturation.
 */
export const RING_NUMBERING_RULE: IUPACRule = {
  id: 'ring-numbering',
  name: 'Ring System Numbering',
  description: 'Number ring systems starting from heteroatom or unsaturation',
  blueBookReference: 'Ring numbering conventions',
  priority: 160, // Must run before P-3.2 (priority 155) - higher priority executes first
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    return !!(parentStructure && parentStructure.type === 'ring');
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    
    if (!parentStructure || parentStructure.type !== 'ring') {
      return context;
    }
    
    const ring = parentStructure.ring;
    if (!ring) {
      return context;
    }
    
    // Number ring starting from heteroatom or unsaturation
    const ringLocants = generateRingLocants(ring);
    
    // Apply numbering starting from preferred position (considering substituents for lowest locants)
    const molecule = state.molecule;
    const startingPosition = findRingStartingPosition(ring, molecule);
    const adjustedLocants = adjustRingLocants(ringLocants, startingPosition);
    
    // Reorder ring.atoms array to match the optimized numbering
    // This ensures that ring.atoms[0] corresponds to locant 1, ring.atoms[1] to locant 2, etc.
    const reorderedAtoms = reorderRingAtoms(ring.atoms, startingPosition);
    const reorderedBonds = ring.bonds; // Bonds don't need reordering as they reference atom IDs
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          locants: adjustedLocants,
          ring: {
            ...ring,
            atoms: reorderedAtoms,
            bonds: reorderedBonds
          }
        }
      }),
      'ring-numbering',
      'Ring System Numbering',
      'Ring conventions',
      ExecutionPhase.NUMBERING,
      `Numbered ring starting from position ${startingPosition}: [${adjustedLocants.join(', ')}]`
    );
  }
};
/**
 * Rule: Substituent Numbering
 *
 * Assign locants to substituent groups on the parent structure.
 */
export const SUBSTITUENT_NUMBERING_RULE: IUPACRule = {
  id: 'substituent-numbering',
  name: 'Substituent Group Numbering',
  description: 'Number substituent groups attached to parent structure',
  blueBookReference: 'Substituent numbering conventions',
  priority: 75,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = state.functionalGroups;
    return !!(functionalGroups && functionalGroups.some((group: FunctionalGroup) => 
      group.type === 'substituent' || !isPrincipalGroup(group)
    ));
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const functionalGroups = state.functionalGroups;
    const parentStructure = state.parentStructure;
    
    if (!functionalGroups || !parentStructure) {
      return context;
    }
    
    // Separate principal groups from substituents
    const principalGroups = functionalGroups.filter((group: FunctionalGroup) => isPrincipalGroup(group));
    const substituentGroups = functionalGroups.filter((group: FunctionalGroup) => !isPrincipalGroup(group));
    
    // Number substituent groups
    const numberedSubstituents = substituentGroups.map((group: FunctionalGroup, index: number) => ({
      ...group,
      locants: assignSubstituentLocants(group, parentStructure, index)
    }));
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        functionalGroups: [...principalGroups, ...numberedSubstituents]
      }),
      'substituent-numbering',
      'Substituent Group Numbering',
      'Substituent conventions',
      ExecutionPhase.NUMBERING,
      `Numbered ${numberedSubstituents.length} substituent groups`
    );
  }
};

/**
 * Rule: Complete Numbering
 * 
 * Finalizes the numbering process and validates the complete locant assignment.
 */
export const NUMBERING_COMPLETE_RULE: IUPACRule = {
  id: 'numbering-complete',
  name: 'Numbering Phase Complete',
  description: 'Finalize numbering and validate locant assignments',
  blueBookReference: 'P-14 - Complete numbering validation',
  priority: 50,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    return parentStructure !== undefined;
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    const functionalGroups = state.functionalGroups;
    
    if (!parentStructure) {
      return context.withConflict({
        ruleId: 'numbering-complete',
        conflictType: 'state_inconsistency',
        description: 'No parent structure available for numbering completion',
        context: {}
      }, 'numbering-complete', 'Numbering Phase Complete', 'P-14', ExecutionPhase.NUMBERING, 'No parent structure for completion');
    }
    
    // Validate numbering consistency
    const validationResult = validateNumbering(parentStructure, functionalGroups);
    
    if (!validationResult.isValid) {
      return context.withConflict({
        ruleId: 'numbering-complete',
        conflictType: 'state_inconsistency',
        description: `Numbering validation failed: ${validationResult.errors.join(', ')}`,
        context: validationResult
      }, 'numbering-complete', 'Numbering Phase Complete', 'P-14', ExecutionPhase.NUMBERING, 'Validation failed');
    }
    
    // After numbering is validated, recompute human-readable parent name so that
    // multiple-bond locants (assigned in P-14.4) are included in the parent name
    let updatedParent = parentStructure;
    if (validationResult.isValid && parentStructure.type === 'chain' && parentStructure.chain) {
      try {
        const newName = generateChainName(parentStructure.chain as Chain);
        updatedParent = { ...parentStructure, name: newName };
      } catch (err) {
        // If name generation fails, keep existing name
        updatedParent = parentStructure;
      }
    }

    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        numberingComplete: true,
        numberingValidation: validationResult,
        parentStructure: updatedParent
      }),
      'numbering-complete',
      'Numbering Phase Complete',
      'P-14',
      ExecutionPhase.NUMBERING,
      `Numbering phase completed with ${validationResult.isValid ? 'valid' : 'validation issues'} locant assignments`
    );
  }
};

/**
 * Helper functions for numbering logic
 */

function optimizeLocantSet(parentStructure: ParentStructure, principalGroup: FunctionalGroup): number[] {
  // Get all possible locant sets
  const possibleLocants = generatePossibleLocantSets(parentStructure);
  
  // Find the set that gives lowest locant to principal group
  let bestLocants = parentStructure.locants;
  let bestScore = calculateLocantScore(bestLocants, principalGroup);
  
  for (const locantSet of possibleLocants) {
    const score = calculateLocantScore(locantSet, principalGroup);
    if (score < bestScore) {
      bestScore = score;
      bestLocants = locantSet;
    }
  }
  
  return bestLocants;
}

function getPrincipalGroupLocant(parentStructure: ParentStructure, principalGroup: FunctionalGroup): number {
  if (parentStructure.type === 'chain') {
    // Principal group gets locant 1 for chains
    return 1;
  } else {
    // For rings, principal group gets the lowest available locant
    return Math.min(...parentStructure.locants);
  }
}

function generatePossibleLocantSets(parentStructure: ParentStructure): number[][] {
  const baseLocants = parentStructure.locants;
  const variations: number[][] = [];
  
  // Generate different numbering directions for chains
  if (parentStructure.type === 'chain') {
    // Normal direction
    variations.push([...baseLocants]);
    
    // Reverse direction (if applicable)
    const reversed = [...baseLocants].reverse().map((locant, index) => index + 1);
    if (JSON.stringify(reversed) !== JSON.stringify(baseLocants)) {
      variations.push(reversed);
    }
  }
  
  return variations.length > 0 ? variations : [baseLocants];
}

function calculateLocantScore(locants: number[], principalGroup: FunctionalGroup): number {
  // Lower score = better (more preferred)
  const principalLocant = locants.find(locant => 
    principalGroup.locants && principalGroup.locants.includes(locant)
  );
  
  return principalLocant || 999; // High penalty if no locant found
}

function hasFixedLocants(parentStructure: ParentStructure): boolean {
  // Check if this parent structure has fixed locant requirements
  const retainedNamesWithFixedLocants = [
    'toluene', 'ethylbenzene', 'isopropylbenzene', 'tert-butylbenzene',
    'styrene', 'acetophenone', 'benzophenone'
  ];
  
  return retainedNamesWithFixedLocants.some(name => 
    parentStructure.name.toLowerCase().includes(name)
  );
}

function getFixedLocants(parentStructure: ParentStructure): number[] {
  // Return fixed locants for specific parent structures
  // This is a simplified implementation
  const fixedLocantMap: { [key: string]: number[] } = {
    'toluene': [1], // Methyl group at position 1
    'ethylbenzene': [1], // Ethyl group at position 1
    'styrene': [1], // Vinyl group at position 1
    'acetophenone': [1], // Carbonyl at position 1
  };
  
  const name = parentStructure.name.toLowerCase();
  for (const [key, locants] of Object.entries(fixedLocantMap)) {
    if (name.includes(key)) {
      return locants;
    }
  }
  
  // Default: use existing locants
  return parentStructure.locants;
}

function generateRingLocants(ring: any): number[] {
  // Generate locants for ring atoms
  const locants: number[] = [];
  for (let i = 0; i < ring.atoms.length; i++) {
    locants.push(i + 1); // 1-based indexing
  }
  return locants;
}

/**
 * Find optimal ring numbering to minimize substituent locants
 * Similar to chain direction optimization
 */
function findOptimalRingNumbering(ring: any, molecule: any): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return 1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return 1;
  }

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: any) => a.id));

  // Find which ring atoms have substituents
  const substituentPositions: number[] = [];
  
  for (let i = 0; i < ring.atoms.length; i++) {
    const ringAtom = ring.atoms[i];
    if (!ringAtom) continue;
    
    // Find bonds from this ring atom to non-ring atoms
    const bonds = molecule.bonds.filter((bond: any) =>
      (bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id)
    );

    for (const bond of bonds) {
      const otherAtomId = bond.atom1 === ringAtom.id ? bond.atom2 : bond.atom1;
      if (!ringAtomIds.has(otherAtomId)) {
        const substituentAtom = molecule.atoms[otherAtomId];
        if (substituentAtom && substituentAtom.symbol !== 'H') {
          // This ring atom has a substituent
          substituentPositions.push(i);
          console.log(`[Ring Numbering] Found substituent at ring position ${i} (atom ${ringAtom.id})`);
          break;
        }
      }
    }
  }

  console.log(`[Ring Numbering] Total substituents found: ${substituentPositions.length}, positions: [${substituentPositions.join(', ')}]`);

  // If no substituents, default numbering is fine
  if (substituentPositions.length === 0) {
    return 1;
  }

  // Try all possible starting positions and find the one with lowest locant set
  let bestStart = 1;
  let bestLocants: number[] = [];

  for (let start = 0; start < ring.atoms.length; start++) {
    // Calculate locants for substituents with this starting position
    const locants: number[] = [];
    
    for (const subPos of substituentPositions) {
      // Calculate the locant for this substituent position
      // Ring numbering goes: start -> start+1 -> ... -> start+n-1 (wrapping around)
      let locant = ((subPos - start + ring.atoms.length) % ring.atoms.length) + 1;
      locants.push(locant);
    }
    
    // Sort locants for comparison
    locants.sort((a, b) => a - b);
    
    console.log(`[Ring Numbering] Starting at position ${start}: locants = [${locants.join(', ')}]`);
    
    // Compare with best so far
    if (bestLocants.length === 0 || compareLocantSets(locants, bestLocants) < 0) {
      bestLocants = locants;
      bestStart = start + 1; // 1-based
      console.log(`[Ring Numbering] New best! Start at ${bestStart}`);
    }
  }

  console.log(`[Ring Numbering] Final decision: start at position ${bestStart}, locants = [${bestLocants.join(', ')}]`);

  return bestStart;
}

/**
 * Find optimal ring numbering when a heteroatom must be at position 1
 * @param ring - The ring structure
 * @param molecule - The molecule structure
 * @param heteroatomIndex - Index of the heteroatom in ring.atoms (0-based)
 * @returns Positive value for clockwise (starting position 1-based), negative for counterclockwise, 0 for no preference
 */
function findOptimalRingNumberingFromHeteroatom(ring: any, molecule: any, heteroatomIndex: number): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return -1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return -1;
  }

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: any) => a.id));

  // Count substituents at each ring position (not just which atoms have substituents)
  const substituentCounts: number[] = new Array(ring.atoms.length).fill(0);
  
  for (let i = 0; i < ring.atoms.length; i++) {
    const ringAtom = ring.atoms[i];
    if (!ringAtom) continue;
    
    // Find bonds from this ring atom to non-ring atoms
    const bonds = molecule.bonds.filter((bond: any) =>
      (bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id)
    );

    for (const bond of bonds) {
      const otherAtomId = bond.atom1 === ringAtom.id ? bond.atom2 : bond.atom1;
      if (!ringAtomIds.has(otherAtomId)) {
        const substituentAtom = molecule.atoms[otherAtomId];
        if (substituentAtom && substituentAtom.symbol !== 'H') {
          // Count this substituent
          const currentCount = substituentCounts[i];
          if (currentCount !== undefined) {
            substituentCounts[i] = currentCount + 1;
          }
        }
      }
    }
  }

  console.log(`[Heteroatom Ring Numbering] Substituent counts at each position: [${substituentCounts.join(', ')}]`);
  const heteroAtom = ring.atoms[heteroatomIndex];
  if (!heteroAtom) {
    return -1;
  }
  console.log(`[Heteroatom Ring Numbering] Heteroatom at index ${heteroatomIndex} (atom ${heteroAtom.id})`);

  // If no substituents, default numbering is fine
  const totalSubstituents = substituentCounts.reduce((sum, count) => sum + count, 0);
  if (totalSubstituents === 0) {
    console.log(`[Heteroatom Ring Numbering] No substituents found, using default`);
    return heteroatomIndex + 1; // 1-based
  }

  // For 3-membered rings with heteroatom at index heteroatomIndex:
  // Direction 1: [heteroatom, next, prev] = [heteroatomIndex, heteroatomIndex+1, heteroatomIndex+2] mod ring.atoms.length
  // Direction 2: [heteroatom, prev, next] = [heteroatomIndex, heteroatomIndex-1, heteroatomIndex-2] mod ring.atoms.length
  
  const ringSize = ring.atoms.length;
  
  // Try direction 1: heteroatom → next atom (clockwise)
  const locants1: number[] = [];
  for (let i = 0; i < ringSize; i++) {
    const ringPos = (heteroatomIndex + i) % ringSize;
    const count = substituentCounts[ringPos] ?? 0;
    // Add 'count' copies of locant (i+1) to the list
    for (let j = 0; j < count; j++) {
      locants1.push(i + 1); // i+1 is the locant at this position
    }
  }
  locants1.sort((a, b) => a - b);
  
  // Try direction 2: heteroatom → previous atom (counterclockwise)
  const locants2: number[] = [];
  for (let i = 0; i < ringSize; i++) {
    const ringPos = (heteroatomIndex - i + ringSize) % ringSize;
    const count = substituentCounts[ringPos] ?? 0;
    // Add 'count' copies of locant (i+1) to the list
    for (let j = 0; j < count; j++) {
      locants2.push(i + 1);
    }
  }
  locants2.sort((a, b) => a - b);

  console.log(`[Heteroatom Ring Numbering] Direction 1 (clockwise): locants = [${locants1.join(', ')}]`);
  console.log(`[Heteroatom Ring Numbering] Direction 2 (counterclockwise): locants = [${locants2.join(', ')}]`);

  // Compare the two locant sets
  const comparison = compareLocantSets(locants1, locants2);
  
  if (comparison <= 0) {
    // Direction 1 is better or equal (clockwise)
    console.log(`[Heteroatom Ring Numbering] Choosing direction 1 (clockwise)`);
    return heteroatomIndex + 1; // 1-based, positive means use as-is
  } else {
    // Direction 2 is better (counterclockwise)
    console.log(`[Heteroatom Ring Numbering] Choosing direction 2 (counterclockwise)`);
    return -1; // Negative signals to caller to reverse the ring
  }
}

/**
 * Compare two locant sets
 * Returns: < 0 if a is better (lower), > 0 if b is better, 0 if equal
 */
function compareLocantSets(a: number[], b: number[]): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    const aVal = a[i];
    const bVal = b[i];
    if (aVal !== undefined && bVal !== undefined && aVal !== bVal) {
      return aVal - bVal;
    }
  }
  return a.length - b.length;
}

function findRingStartingPosition(ring: any, molecule?: any): number {
  // Start at heteroatom if present, but consider numbering direction
  let heteroatomIndex = -1;
  for (let i = 0; i < ring.atoms.length; i++) {
    const atom = ring.atoms[i];
    if (atom.symbol !== 'C') {
      heteroatomIndex = i;
      break;
    }
  }
  
  if (heteroatomIndex >= 0 && molecule) {
    // Found heteroatom - now determine best numbering direction
    const result = findOptimalRingNumberingFromHeteroatom(ring, molecule, heteroatomIndex);
    
    // If result is negative, it means we need to reverse the ring (counterclockwise)
    if (result < 0) {
      // Reverse the ring atoms (keeping heteroatom at the start)
      const heteroAtom = ring.atoms[heteroatomIndex];
      const remaining = ring.atoms.filter((_: any, idx: number) => idx !== heteroatomIndex);
      remaining.reverse();
      ring.atoms = [heteroAtom, ...remaining];
      console.log(`[Ring Numbering] Reversed ring for counterclockwise numbering: [${ring.atoms.map((a: any) => a.id).join(', ')}]`);
      return 1; // Heteroatom is now at position 1
    }
    
    if (result > 0) {
      return result;
    }
    return heteroatomIndex + 1; // 1-based indexing
  } else if (heteroatomIndex >= 0) {
    return heteroatomIndex + 1; // 1-based indexing
  }
  
  // Start at unsaturation if present
  for (let i = 0; i < ring.bonds.length; i++) {
    const bond = ring.bonds[i];
    if (bond.type === 'double' || bond.type === 'triple') {
      const atom1 = ring.atoms[bond.atom1];
      const atom2 = ring.atoms[bond.atom2];
      return Math.min(atom1.id, atom2.id) + 1;
    }
  }
  
  // If molecule is provided, find the numbering that gives lowest locant set for substituents
  if (molecule) {
    const optimalStart = findOptimalRingNumbering(ring, molecule);
    if (optimalStart > 0) {
      return optimalStart;
    }
  }
  
  // Default: start at position 1
  return 1;
}

function adjustRingLocants(locants: number[], startingPosition: number): number[] {
  if (startingPosition === 1) {
    return locants;
  }
  
  // Rotate locants to start from the desired position
  const rotated = [...locants];
  const rotation = startingPosition - 1;
  
  for (let i = 0; i < rotated.length; i++) {
    rotated[i] = ((i + rotation - 1) % locants.length) + 1;
  }
  
  return rotated;
}

/**
 * Reorder ring atoms array to match the optimized numbering
 * @param atoms - Original ring atoms array
 * @param startingPosition - The position (1-based) that should become position 1
 * @returns Reordered atoms array where atoms[0] is the new starting position
 */
function reorderRingAtoms(atoms: any[], startingPosition: number): any[] {
  if (startingPosition === 1 || atoms.length === 0) {
    return atoms;
  }
  
  // Convert to 0-based index
  const startIndex = startingPosition - 1;
  
  // Rotate the array so that startIndex becomes index 0
  const reordered = [
    ...atoms.slice(startIndex),
    ...atoms.slice(0, startIndex)
  ];
  
  console.log(`[Ring Reordering] Original atom IDs: [${atoms.map((a: any) => a.id).join(', ')}]`);
  console.log(`[Ring Reordering] Reordered atom IDs: [${reordered.map((a: any) => a.id).join(', ')}] (starting from position ${startingPosition})`);
  
  return reordered;
}

function assignLowestAvailableLocant(usedLocants: number[], preferredLocant: number, index: number): number {
  let locant = preferredLocant;
  let counter = 1;
  
  // Find lowest available locant
  while (usedLocants.includes(locant) || locant === preferredLocant && counter <= index + 1) {
    locant++;
    counter++;
  }
  
  return locant;
}

function isPrincipalGroup(group: FunctionalGroup): boolean {
  return group.isPrincipal || group.priority <= 5; // Top priority groups
}

function assignSubstituentLocants(group: FunctionalGroup, parentStructure: ParentStructure, index: number): number[] {
  // Simple implementation - assign consecutive locants
  const usedLocants = parentStructure.locants || [];
  const locants: number[] = [];
  
  for (let i = 0; i < (group.locants?.length || 1); i++) {
    let locant = i + 1;
    let attempts = 0;
    
    // Find available locant
    while (usedLocants.includes(locant) && attempts < 100) {
      locant++;
      attempts++;
    }
    
    locants.push(locant);
  }
  
  return locants;
}

function validateNumbering(parentStructure: ParentStructure, functionalGroups: FunctionalGroup[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for duplicate locants
  const allLocants = [
    ...parentStructure.locants,
    ...functionalGroups.flatMap(group => group.locants || [])
  ];
  
  const duplicates = findDuplicates(allLocants);
  if (duplicates.length > 0) {
    errors.push(`Duplicate locants found: ${duplicates.join(', ')}`);
  }
  
  // Check locant range
  const maxLocant = Math.max(...allLocants.filter(n => !isNaN(n)));
  const expectedMax = parentStructure.locants.length;
  
  if (maxLocant > expectedMax) {
    errors.push(`Locant ${maxLocant} exceeds parent structure size (${expectedMax})`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function findDuplicates(arr: number[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  
  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.add(item);
    }
    seen.add(item);
  }
  
  return Array.from(duplicates);
}

/**
 * Export all numbering layer rules
 * Note: RING_NUMBERING_RULE moved to initial-structure-layer to run before P-3.2
 */
export const NUMBERING_LAYER_RULES: IUPACRule[] = [
  P14_2_LOWEST_LOCANT_SET_RULE,
  P14_3_PRINCIPAL_GROUP_NUMBERING_RULE,
  P14_4_MULTIPLE_BONDS_SUBSTITUENTS_RULE,
  P14_1_FIXED_LOCANTS_RULE,
  SUBSTITUENT_NUMBERING_RULE,
  NUMBERING_COMPLETE_RULE
];