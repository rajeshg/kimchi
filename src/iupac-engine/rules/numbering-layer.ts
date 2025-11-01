import type { IUPACRule, FunctionalGroup, ParentStructure, Chain, MultipleBond, Substituent, RuleConflict } from '../types';
import type { Atom } from '../../../types';
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
    
    // Get ALL principal groups (may be multiple of the same type)
    const principalGroups = functionalGroups.filter((g: FunctionalGroup) => g.isPrincipal);
    
    if (principalGroups.length === 0) {
      return context;
    }
    
    // For debug logging, pick the first one
    const firstPrincipal = principalGroups[0];
    
    if (process.env.VERBOSE) {
      console.log('[P-14.3] Principal group:', firstPrincipal?.type);
      console.log('[P-14.3] Number of principal groups:', principalGroups.length);
      console.log('[P-14.3] Principal group atoms:', principalGroups.map(g => g.atoms));
      console.log('[P-14.3] Parent chain atoms:', parentStructure.chain?.atoms.map((a: Atom) => a.id));
      console.log('[P-14.3] Parent chain locants:', parentStructure.locants);
    }
    
    // Calculate locants for each principal group
    let principalLocants: number[];
    let optimizedLocants = parentStructure.locants;
    
    if (parentStructure.type === 'chain' && principalGroups.length === 1) {
      // For a single principal group on a chain, optimize numbering to minimize its locant
      const firstPrincipalGroup = principalGroups[0]!;
      optimizedLocants = optimizeLocantSet(parentStructure, firstPrincipalGroup);
      
      // Update parent structure with optimized locants
      parentStructure.locants = optimizedLocants;
      
      // Calculate locant based on optimized numbering
      principalLocants = [getPrincipalGroupLocantFromSet(parentStructure, firstPrincipalGroup, optimizedLocants)];
    } else {
      // For multiple principal groups or rings, calculate positions
      principalLocants = principalGroups.map(group => 
        getPrincipalGroupLocantFromSet(parentStructure, group, parentStructure.locants)
      );
    }
    
    if (process.env.VERBOSE) {
      console.log('[P-14.3] Calculated principal locants:', principalLocants);
    }
    
    // Update functional group locants
    let principalIdx = 0;
    const updatedFunctionalGroups = functionalGroups.map((group: FunctionalGroup) => {
      if (group.isPrincipal && principalIdx < principalLocants.length) {
        const locant = principalLocants[principalIdx];
        principalIdx++;
        return {
          ...group,
          locants: [locant]
        };
      }
      return group;
    });
    
    return context.withStateUpdate(
      (state: any) => ({ 
        ...state, 
        functionalGroups: updatedFunctionalGroups
      }),
      'P-14.3',
      'Principal Group Numbering',
      'P-14.3',
      ExecutionPhase.NUMBERING,
      `Assigned locants ${principalLocants.join(',')} to ${principalGroups.length} principal group(s): ${firstPrincipal?.type}`
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
    const functionalGroups = state.functionalGroups || [];
    const startingPosition = findRingStartingPosition(ring, molecule, functionalGroups);
    const adjustedLocants = adjustRingLocants(ringLocants, startingPosition);
    
    // Reorder ring.atoms array to match the optimized numbering
    // This ensures that ring.atoms[0] corresponds to locant 1, ring.atoms[1] to locant 2, etc.
    const reorderedAtoms = reorderRingAtoms(ring.atoms, startingPosition);
    const reorderedBonds = ring.bonds; // Bonds don't need reordering as they reference atom IDs
    
    // Create mapping from atom ID to new ring position (1-based)
    // This is needed because functional groups store atom IDs in locants[], but we need ring positions
    const atomIdToPosition = new Map<number, number>();
    for (let i = 0; i < reorderedAtoms.length; i++) {
      const atom = reorderedAtoms[i];
      if (atom && typeof atom.id === 'number') {
        atomIdToPosition.set(atom.id, i + 1); // 1-based position
      }
    }
    
    if (process.env.VERBOSE) {
      console.log(`[Ring Numbering] Atom ID to position mapping:`, Array.from(atomIdToPosition.entries()));
    }
    
    // Build set of ring atom IDs
    const ringAtomIds = new Set(reorderedAtoms.map((a: any) => a.id));
    
    // Update functional group locants to use ring positions instead of atom IDs
    // For functional groups attached to the ring (like -OH), we need to find which ring atom they're bonded to
    const updatedFunctionalGroups = functionalGroups.map((fg: any) => {
      if (process.env.VERBOSE) {
        console.log(`[Ring Numbering] Processing functional group ${fg.type}: atoms=${fg.atoms?.map((a: any) => a).join(',')}, old locants=${fg.locants}, old locant=${fg.locant}`);
      }
      
      // Find which ring atoms this functional group is attached to
      const attachedRingPositions: number[] = [];
      
      if (fg.atoms && fg.atoms.length > 0) {
        for (const groupAtomId of fg.atoms) {
          // Check if this functional group atom is itself in the ring
          if (atomIdToPosition.has(groupAtomId)) {
            attachedRingPositions.push(atomIdToPosition.get(groupAtomId)!);
          } else {
            // This functional group atom is NOT in the ring, so find which ring atom it's bonded to
            const bonds = molecule.bonds.filter((bond: any) =>
              (bond.atom1 === groupAtomId || bond.atom2 === groupAtomId)
            );
            
            for (const bond of bonds) {
              const otherAtomId = bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
              if (ringAtomIds.has(otherAtomId)) {
                // Found a ring atom bonded to this functional group
                const position = atomIdToPosition.get(otherAtomId);
                if (position !== undefined && !attachedRingPositions.includes(position)) {
                  attachedRingPositions.push(position);
                }
              }
            }
          }
        }
      }
      
      // If we found ring positions, use those as locants
      if (attachedRingPositions.length > 0) {
        attachedRingPositions.sort((a, b) => a - b);
        
        if (process.env.VERBOSE) {
          console.log(`[Ring Numbering] Updated functional group ${fg.type}: new locants=${attachedRingPositions}, new locant=${attachedRingPositions[0]}`);
        }
        
        return {
          ...fg,
          locants: attachedRingPositions,
          locant: attachedRingPositions[0]
        };
      }
      
      // Otherwise, try to convert existing locants using the atom ID to position map
      if (fg.locants && fg.locants.length > 0) {
        const newLocants = fg.locants.map((atomId: number) => {
          const position = atomIdToPosition.get(atomId);
          return position !== undefined ? position : atomId; // fallback to atom ID if not in ring
        });
        
        const newLocant = fg.locant !== undefined && atomIdToPosition.has(fg.locant)
          ? atomIdToPosition.get(fg.locant)
          : fg.locant;
        
        return {
          ...fg,
          locants: newLocants,
          locant: newLocant
        };
      }
      
      return fg;
    });
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        functionalGroups: updatedFunctionalGroups,
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
    // Pass false to exclude substituents - they will be added in name assembly layer
    let updatedParent = parentStructure;
    if (validationResult.isValid && parentStructure.type === 'chain' && parentStructure.chain) {
      try {
        const newName = generateChainName(parentStructure.chain as Chain, false);
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
  
  if (process.env.VERBOSE) {
    console.log('[optimizeLocantSet] Possible locant sets:', possibleLocants);
  }
  
  // Find the set that gives lowest locant to principal group
  let bestLocants = parentStructure.locants;
  let bestScore = calculateLocantScore(parentStructure, bestLocants, principalGroup);
  
  if (process.env.VERBOSE) {
    console.log('[optimizeLocantSet] Initial best score:', bestScore);
  }
  
  for (const locantSet of possibleLocants) {
    const score = calculateLocantScore(parentStructure, locantSet, principalGroup);
    if (process.env.VERBOSE) {
      console.log('[optimizeLocantSet] Testing locant set:', locantSet, 'score:', score);
    }
    if (score < bestScore) {
      bestScore = score;
      bestLocants = locantSet;
      if (process.env.VERBOSE) {
        console.log('[optimizeLocantSet] New best locants:', bestLocants, 'score:', bestScore);
      }
    }
  }
  
  return bestLocants;
}

function getPrincipalGroupLocant(parentStructure: ParentStructure, principalGroup: FunctionalGroup): number {
  if (parentStructure.type === 'chain') {
    // Find the position of the functional group's first atom in the parent chain
    // The functional group's atoms should have already been set with the carbonyl carbon first
    if (principalGroup.atoms.length === 0) {
      return 1; // Fallback if no atoms
    }
    
    const functionalGroupAtom = principalGroup.atoms[0]!; // Carbonyl carbon for ketones (checked above)
    const chain = parentStructure.chain;
    
    if (!chain) {
      return 1; // Fallback if no chain
    }
    
    if (process.env.VERBOSE) {
      console.log('[getPrincipalGroupLocant] functionalGroupAtom:', functionalGroupAtom);
      console.log('[getPrincipalGroupLocant] functionalGroupAtom type:', typeof functionalGroupAtom);
      console.log('[getPrincipalGroupLocant] functionalGroupAtom.id:', (functionalGroupAtom as any).id);
      console.log('[getPrincipalGroupLocant] chain.atoms:', chain.atoms.map((a: Atom) => a.id));
    }
    
    // Check if functionalGroupAtom is an Atom object or just an ID
    const atomId = typeof functionalGroupAtom === 'number' ? functionalGroupAtom : functionalGroupAtom.id;
    
    // Find where this atom appears in the chain
    const positionInChain = chain.atoms.findIndex((atom: Atom) => atom.id === atomId);
    
    if (process.env.VERBOSE) {
      console.log('[getPrincipalGroupLocant] atomId:', atomId);
      console.log('[getPrincipalGroupLocant] positionInChain:', positionInChain);
    }
    
    if (positionInChain === -1) {
      return 1; // Fallback if atom not found
    }
    
    // Return the locant at that position
    return parentStructure.locants[positionInChain] || 1;
  } else {
    // For rings, principal group gets the lowest available locant
    return Math.min(...parentStructure.locants);
  }
}

function getPrincipalGroupLocantFromSet(parentStructure: ParentStructure, principalGroup: FunctionalGroup, locantSet: number[]): number {
  // Calculate the principal group locant based on a specific locant set
  if (parentStructure.type === 'chain') {
    if (principalGroup.atoms.length === 0) {
      return 1; // Fallback if no atoms
    }
    
    const functionalGroupAtom = principalGroup.atoms[0]!;
    const chain = parentStructure.chain;
    
    if (!chain) {
      return 1; // Fallback if no chain
    }
    
    // Check if functionalGroupAtom is an Atom object or just an ID
    const atomId = typeof functionalGroupAtom === 'number' ? functionalGroupAtom : functionalGroupAtom.id;
    
    // Find where this atom appears in the chain
    const positionInChain = chain.atoms.findIndex((atom: Atom) => atom.id === atomId);
    
    if (positionInChain === -1) {
      return 1; // Fallback if atom not found
    }
    
    // Return the locant at that position from the given locant set
    return locantSet[positionInChain] || 1;
  } else {
    // For rings, find the position of the functional group atom in the ring
    // This is important for lactones where the carbonyl must be at position 2
    if (principalGroup.atoms.length === 0) {
      return Math.min(...locantSet); // Fallback if no atoms
    }
    
    const functionalGroupAtom = principalGroup.atoms[0]!;
    const atomId = typeof functionalGroupAtom === 'number' ? functionalGroupAtom : functionalGroupAtom.id;
    
    // parentStructure.ring should have the atoms in numbered order
    const ring = parentStructure.ring;
    if (ring && ring.atoms) {
      const positionInRing = ring.atoms.findIndex((atom: Atom) => atom.id === atomId);
      if (positionInRing !== -1 && positionInRing < locantSet.length) {
        return locantSet[positionInRing]!;
      }
    }
    
    // Fallback: return lowest locant
    return Math.min(...locantSet);
  }
}

function generatePossibleLocantSets(parentStructure: ParentStructure): number[][] {
  const baseLocants = parentStructure.locants;
  const variations: number[][] = [];
  
  // Generate different numbering directions for chains
  if (parentStructure.type === 'chain') {
    // Normal direction
    variations.push([...baseLocants]);
    
    // Reverse direction: reverse the locant array
    // For a chain [0,1,2,4] with locants [1,2,3,4], reverse gives [4,3,2,1]
    const reversed = [...baseLocants].reverse();
    if (JSON.stringify(reversed) !== JSON.stringify(baseLocants)) {
      variations.push(reversed);
    }
  }
  
  return variations.length > 0 ? variations : [baseLocants];
}

function calculateLocantScore(parentStructure: ParentStructure, locants: number[], principalGroup: FunctionalGroup): number {
  // Lower score = better (more preferred)
  // Find the locant for the principal group based on atom position in the chain
  
  if (!parentStructure.chain || principalGroup.atoms.length === 0) {
    return 999; // High penalty if no chain or no atoms
  }
  
  // Get the functional group's first atom (e.g., carbonyl carbon for ketones)
  const functionalGroupAtom = principalGroup.atoms[0]!;
  const atomId = typeof functionalGroupAtom === 'number' ? functionalGroupAtom : (functionalGroupAtom as Atom).id;
  
  // Find where this atom appears in the chain
  const positionInChain = parentStructure.chain.atoms.findIndex((atom: Atom) => atom.id === atomId);
  
  if (positionInChain === -1) {
    return 999; // High penalty if atom not found
  }
  
  // Return the locant at that position (lower is better)
  return locants[positionInChain] || 999;
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
 * Prioritizes principal functional groups when locant sets are equal
 */
function findOptimalRingNumbering(ring: any, molecule: any, functionalGroups?: any[]): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return 1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return 1;
  }

  console.log(`[Ring Numbering] Functional groups available:`, functionalGroups?.map(g => `${g.type} at atoms [${g.atoms?.join(',')}]`).join(', ') || 'none');

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: any) => a.id));

  // Identify which ring positions have principal functional groups
  const principalGroupPositions = new Set<number>();
  if (functionalGroups && functionalGroups.length > 0) {
    // Find principal functional groups (alcohol, ketone, aldehyde, etc.)
    const principalGroups = functionalGroups.filter((g: any) => 
      g.isPrincipal || g.priority <= 5 || g.type === 'alcohol' || g.type === 'ketone' || g.type === 'aldehyde'
    );
    
    for (const group of principalGroups) {
      if (group.atoms && group.atoms.length > 0) {
        // Find which ring atoms this group is attached to
        for (const groupAtomId of group.atoms) {
          // Find bonds from group atom to ring atoms
          const bonds = molecule.bonds.filter((bond: any) =>
            (bond.atom1 === groupAtomId || bond.atom2 === groupAtomId)
          );
          
          for (const bond of bonds) {
            const otherAtomId = bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
            // Find which ring position this corresponds to
            for (let i = 0; i < ring.atoms.length; i++) {
              if (ring.atoms[i]?.id === otherAtomId) {
                principalGroupPositions.add(i);
                console.log(`[Ring Numbering] Principal group ${group.type} attached to ring position ${i} (atom ${otherAtomId})`);
                break;
              }
            }
          }
        }
      }
    }
  }

  // Count substituents at each ring position (not just which positions have substituents)
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
          console.log(`[Ring Numbering] Found substituent at ring position ${i} (atom ${ringAtom.id})`);
        }
      }
    }
  }

  const totalSubstituents = substituentCounts.reduce((sum, count) => sum + count, 0);
  console.log(`[Ring Numbering] Substituent counts: [${substituentCounts.join(', ')}], total: ${totalSubstituents}`);

  // If no substituents, default numbering is fine
  if (totalSubstituents === 0) {
    return 1;
  }

  // Try all possible starting positions and directions to find the one with lowest locant set
  let bestStart = 1;
  let bestLocants: number[] = [];
  let bestPrincipalLocants: number[] = []; // Track locants for principal groups separately

  // Try both clockwise (direction = 1) and counter-clockwise (direction = -1)
  for (let start = 0; start < ring.atoms.length; start++) {
    for (const direction of [1, -1]) {
      // Calculate locants for ALL substituents with this starting position and direction
      const locants: number[] = [];
      const principalLocants: number[] = [];
      
      for (let i = 0; i < ring.atoms.length; i++) {
        const count = substituentCounts[i];
        if (count && count > 0) {
          // Calculate the locant for this position
          let locant: number;
          if (direction === 1) {
            // Clockwise: start -> start+1 -> ... -> start+n-1 (wrapping around)
            locant = ((i - start + ring.atoms.length) % ring.atoms.length) + 1;
          } else {
            // Counter-clockwise: start -> start-1 -> ... -> start-n+1 (wrapping around)
            locant = ((start - i + ring.atoms.length) % ring.atoms.length) + 1;
          }
          
          // Add one locant for each substituent at this position
          for (let j = 0; j < count; j++) {
            locants.push(locant);
            // Track if this is a principal group position
            if (principalGroupPositions.has(i)) {
              principalLocants.push(locant);
            }
          }
        }
      }
      
      // Sort locants for comparison
      locants.sort((a, b) => a - b);
      principalLocants.sort((a, b) => a - b);
      
      const directionStr = direction === 1 ? 'CW' : 'CCW';
      console.log(`[Ring Numbering] Starting at position ${start} (${directionStr}): locants = [${locants.join(', ')}], principal locants = [${principalLocants.join(', ')}]`);
      
      // Compare with best so far
      // IUPAC Rule P-14.3: Principal groups receive lowest locants first, then all substituents
      if (bestLocants.length === 0) {
        // First candidate
        bestLocants = locants;
        bestPrincipalLocants = principalLocants;
        bestStart = direction === 1 ? (start + 1) : -(start + 1); // 1-based, signed for direction
        console.log(`[Ring Numbering] New best! Start at ${Math.abs(bestStart)} (${directionStr})`);
      } else {
        let shouldUpdate = false;
        let updateReason = "";
        
        // If we have principal groups, compare those FIRST
        if (principalLocants.length > 0 && bestPrincipalLocants.length > 0) {
          const principalComparison = compareLocantSets(principalLocants, bestPrincipalLocants);
          if (principalComparison < 0) {
            shouldUpdate = true;
            updateReason = " (by principal group priority)";
          } else if (principalComparison === 0) {
            // Principal group locants are equal, check all substituent locants
            const locantComparison = compareLocantSets(locants, bestLocants);
            if (locantComparison < 0) {
              shouldUpdate = true;
              updateReason = " (by substituent locants, principal groups tied)";
            }
          }
        } else {
          // No principal groups, just compare all locants
          const locantComparison = compareLocantSets(locants, bestLocants);
          if (locantComparison < 0) {
            shouldUpdate = true;
            updateReason = "";
          }
        }
        
        if (shouldUpdate) {
          bestLocants = locants;
          bestPrincipalLocants = principalLocants;
          bestStart = direction === 1 ? (start + 1) : -(start + 1); // 1-based, signed for direction
          console.log(`[Ring Numbering] New best${updateReason}! Start at ${Math.abs(bestStart)} (${directionStr})`);
        }
      }
    }
  }

  console.log(`[Ring Numbering] Final decision: start at position ${Math.abs(bestStart)} (${bestStart > 0 ? 'CW' : 'CCW'}), locants = [${bestLocants.join(', ')}]`);

  return bestStart;
}

/**
 * Find optimal ring numbering when a heteroatom must be at position 1
 * @param ring - The ring structure
 * @param molecule - The molecule structure
 * @param heteroatomIndex - Index of the heteroatom in ring.atoms (0-based)
 * @returns Positive value for clockwise (starting position 1-based), negative for counterclockwise, 0 for no preference
 */
function findOptimalRingNumberingFromHeteroatom(ring: any, molecule: any, heteroatomIndex: number, functionalGroups?: any[]): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return -1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return -1;
  }

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: any) => a.id));

  // Build set of functional group atom IDs to exclude from substituent counting
  const functionalGroupAtomIds = new Set<number>();
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.atoms) {
        for (const fgAtom of fg.atoms) {
          // Handle both atom objects and atom IDs
          const atomId = typeof fgAtom === 'object' ? fgAtom.id : fgAtom;
          if (atomId !== undefined) {
            functionalGroupAtomIds.add(atomId);
            
            // Also add all atoms bonded to this functional group atom
            // (e.g., C=O oxygen should be excluded if C is in the functional group)
            const bonds = molecule.bonds.filter((bond: any) =>
              bond.atom1 === atomId || bond.atom2 === atomId
            );
            for (const bond of bonds) {
              const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
              // Only add if it's not a ring atom (we don't want to exclude ring substituents)
              if (!ringAtomIds.has(otherAtomId)) {
                functionalGroupAtomIds.add(otherAtomId);
              }
            }
          }
        }
      }
    }
  }
  if (process.env.VERBOSE && functionalGroupAtomIds.size > 0) {
    console.log(`[Heteroatom Ring Numbering] Functional group atom IDs to exclude: [${Array.from(functionalGroupAtomIds).join(', ')}]`);
  }

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
          // Skip functional group atoms - they're not substituents
          if (functionalGroupAtomIds.has(otherAtomId)) {
            if (process.env.VERBOSE) {
              console.log(`[Heteroatom Ring Numbering] Skipping functional group atom ${otherAtomId} at position ${i}`);
            }
            continue;
          }
          // Count this substituent
          const currentCount = substituentCounts[i];
          if (currentCount !== undefined) {
            substituentCounts[i] = currentCount + 1;
          }
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(`[Heteroatom Ring Numbering] Substituent counts at each position: [${substituentCounts.join(', ')}]`);
  }
  const heteroAtom = ring.atoms[heteroatomIndex];
  if (!heteroAtom) {
    return -1;
  }
  if (process.env.VERBOSE) {
    console.log(`[Heteroatom Ring Numbering] Heteroatom at index ${heteroatomIndex} (atom ${heteroAtom.id})`);
  }
  // Build a map of ring atom ID → index in ring.atoms
  const ringAtomIdToIndex = new Map<number, number>();
  for (let i = 0; i < ring.atoms.length; i++) {
    const atom = ring.atoms[i];
    if (atom && atom.id !== undefined) {
      ringAtomIdToIndex.set(atom.id, i);
    }
  }

  // Find functional group atoms that are part of the ring
  const functionalGroupRingPositions: number[] = [];
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.atoms) {
        for (const fgAtom of fg.atoms) {
          const atomId = typeof fgAtom === 'object' ? fgAtom.id : fgAtom;
          if (atomId !== undefined && ringAtomIdToIndex.has(atomId)) {
            const idx = ringAtomIdToIndex.get(atomId);
            if (idx !== undefined) {
              functionalGroupRingPositions.push(idx);
            }
          }
        }
      }
    }
  }

  const ringSize = ring.atoms.length;
  
  // IUPAC Priority Order:
  // 1. Heteroatom at position 1 (already ensured)
  // 2. Functional groups at lowest locants (HIGHEST PRIORITY for direction)
  // 3. Substituents at lowest locants (tiebreaker if functional group locants are equal)

  // If there are functional groups in the ring, they take priority for direction selection
  if (functionalGroupRingPositions.length > 0) {
    if (process.env.VERBOSE) {
      console.log(`[Heteroatom Ring Numbering] Functional groups at ring positions: [${functionalGroupRingPositions.join(', ')}]`);
    }
    
    // Direction 1 (clockwise): calculate functional group locants
    const fgLocants1 = functionalGroupRingPositions.map(pos => {
      const offset = (pos - heteroatomIndex + ringSize) % ringSize;
      return offset + 1; // 1-based locant
    }).sort((a, b) => a - b);
    
    // Direction 2 (counterclockwise): calculate functional group locants
    const fgLocants2 = functionalGroupRingPositions.map(pos => {
      const offset = (heteroatomIndex - pos + ringSize) % ringSize;
      return offset + 1; // 1-based locant
    }).sort((a, b) => a - b);
    
    if (process.env.VERBOSE) {
      console.log(`[Heteroatom Ring Numbering] Direction 1 (CW) functional group locants: [${fgLocants1.join(', ')}]`);
      console.log(`[Heteroatom Ring Numbering] Direction 2 (CCW) functional group locants: [${fgLocants2.join(', ')}]`);
    }
    
    // Compare functional group locants first
    const fgComparison = compareLocantSets(fgLocants1, fgLocants2);
    
    if (fgComparison < 0) {
      // Direction 1 has better functional group locants
      if (process.env.VERBOSE) {
        console.log(`[Heteroatom Ring Numbering] Choosing direction 1 (clockwise) based on functional group locants`);
      }
      return heteroatomIndex + 1;
    } else if (fgComparison > 0) {
      // Direction 2 has better functional group locants
      if (process.env.VERBOSE) {
        console.log(`[Heteroatom Ring Numbering] Choosing direction 2 (counterclockwise) based on functional group locants`);
      }
      return -1;
    }
    
    // Functional group locants are equal, fall through to check substituents as tiebreaker
    if (process.env.VERBOSE) {
      console.log(`[Heteroatom Ring Numbering] Functional group locants are equal, checking substituents as tiebreaker`);
    }
  }

  // Calculate substituent locants for both directions
  const totalSubstituents = substituentCounts.reduce((sum, count) => sum + count, 0);
  
  if (totalSubstituents === 0) {
    if (process.env.VERBOSE) {
      console.log(`[Heteroatom Ring Numbering] No substituents found, using default clockwise direction`);
    }
    return heteroatomIndex + 1; // 1-based
  }

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

  if (process.env.VERBOSE) {
    console.log(`[Heteroatom Ring Numbering] Direction 1 (clockwise) substituent locants: [${locants1.join(', ')}]`);
    console.log(`[Heteroatom Ring Numbering] Direction 2 (counterclockwise) substituent locants: [${locants2.join(', ')}]`);
  }

  // Compare the substituent locant sets
  const comparison = compareLocantSets(locants1, locants2);
  
  if (comparison <= 0) {
    // Direction 1 is better or equal (clockwise)
    if (process.env.VERBOSE) {
      console.log(`[Heteroatom Ring Numbering] Choosing direction 1 (clockwise) based on substituent locants`);
    }
    return heteroatomIndex + 1; // 1-based, positive means use as-is
  } else {
    // Direction 2 is better (counterclockwise)
    if (process.env.VERBOSE) {
      console.log(`[Heteroatom Ring Numbering] Choosing direction 2 (counterclockwise) based on substituent locants`);
    }
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

function findRingStartingPosition(ring: any, molecule?: any, functionalGroups?: any[]): number {
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
    const result = findOptimalRingNumberingFromHeteroatom(ring, molecule, heteroatomIndex, functionalGroups);
    
    // If result is negative, it means we need to reverse the ring (counterclockwise)
    if (result < 0) {
      // Reverse the ring atoms for counterclockwise numbering
      // CCW from heteroatomIndex means: heteroatom, then previous atoms in reverse, then following atoms in reverse
      const heteroAtom = ring.atoms[heteroatomIndex];
      const before = ring.atoms.slice(0, heteroatomIndex).reverse(); // atoms before heteroatom, reversed
      const after = ring.atoms.slice(heteroatomIndex + 1).reverse();  // atoms after heteroatom, reversed
      ring.atoms = [heteroAtom, ...before, ...after];
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
    const optimalStart = findOptimalRingNumbering(ring, molecule, functionalGroups);
    if (optimalStart !== 0) {
      return optimalStart; // Can be positive (CW) or negative (CCW)
    }
  }
  
  // Default: start at position 1
  return 1;
}

function adjustRingLocants(locants: number[], startingPosition: number): number[] {
  // After reorderRingAtoms(), the atoms array is already in the correct order
  // where atoms[0] corresponds to the starting position (e.g., heteroatom).
  // Therefore, locants should just be [1, 2, 3, 4, ...] to match the positions.
  // The old logic tried to rotate locants, but that's wrong because the atoms
  // are already reordered.
  return locants.map((_, i) => i + 1);
}

/**
 * Reorder ring atoms array to match the optimized numbering
 * @param atoms - Original ring atoms array
 * @param startingPosition - The position (1-based) that should become position 1
 *                           Positive = clockwise, Negative = counter-clockwise
 * @returns Reordered atoms array where atoms[0] is the new starting position
 */
function reorderRingAtoms(atoms: any[], startingPosition: number): any[] {
  if (Math.abs(startingPosition) === 1 && startingPosition > 0) {
    // Already starting at position 1 clockwise
    return atoms;
  }
  
  // Convert to 0-based index
  const startIndex = Math.abs(startingPosition) - 1;
  const isCounterClockwise = startingPosition < 0;
  
  // Rotate the array so that startIndex becomes index 0
  let reordered = [
    ...atoms.slice(startIndex),
    ...atoms.slice(0, startIndex)
  ];
  
  // If counter-clockwise, reverse the order (except the first element)
  if (isCounterClockwise) {
    const first = reordered[0];
    const rest = reordered.slice(1).reverse();
    reordered = [first, ...rest];
  }
  
  console.log(`[Ring Reordering] Original atom IDs: [${atoms.map((a: any) => a.id).join(', ')}]`);
  console.log(`[Ring Reordering] Reordered atom IDs: [${reordered.map((a: any) => a.id).join(', ')}] (starting from position ${Math.abs(startingPosition)}, ${isCounterClockwise ? 'CCW' : 'CW'})`);
  
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
  // If the group already has valid locants assigned (e.g., from ring numbering), keep them
  if (group.locants && group.locants.length > 0 && group.locants.every((l: number) => l > 0)) {
    return group.locants;
  }
  
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