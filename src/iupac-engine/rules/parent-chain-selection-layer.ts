import type { IUPACRule } from '../types';
import { BLUE_BOOK_RULES } from '../types';
import { normalizeCitationName, canonicalizeCitationList, compareCitationArrays } from '../utils/citation-normalizer';
import type { ImmutableNamingContext } from '../immutable-context';
import { ExecutionPhase } from '../immutable-context';

// Use canonical types for chain analysis
import type { Chain, MultipleBond, Substituent } from '../types';
// import utility to find substituents on a ring
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findSubstituents: _findSubstituents } = require('../naming/iupac-chains');

/**
 * Find lexicographically smallest array among a list of number arrays.
 * Shorter array wins if equal up to min length.
 */
function lexicographicallySmallest(sets: (number | undefined)[][]): number[] | null {
  if (!sets || sets.length === 0) return null;
  // Normalize undefined entries to 0 and ensure arrays of numbers
  const normalized: number[][] = sets.map(s => (s || []).map(v => (v ?? 0)));
  let lowest = normalized[0] as number[];
  for (let i = 1; i < normalized.length; i++) {
    const current = normalized[i]!;
    const n = Math.min(lowest.length, current.length);
    let decided = false;
    for (let j = 0; j < n; j++) {
      const cv = current[j] ?? 0;
      const lv = lowest[j] ?? 0;
      if (cv < lv) { lowest = current; decided = true; break; }
      if (cv > lv) { decided = true; break; }
    }
    if (!decided && current.length < lowest.length) {
      lowest = current;
    }
  }
  return lowest || null;
}

/**
 * Parent Chain Selection Layer Rules (P-44.3)
 * 
 * This layer implements the strict hierarchy for selecting the parent chain
 * when multiple chains are possible. Rules are applied sequentially until
 * a unique chain is selected.
 * 
 * Reference: Blue Book P-44.3 - Seniority of acyclic chains
 * https://iupac.qmul.ac.uk/BlueBook/RuleP44.html
 */

/**
 * Rule: P-44.3.1 - Maximum Length of Continuous Chain
 * 
 * The longest continuous chain of skeletal atoms is chosen as the parent.
 */
export const P44_3_1_MAX_LENGTH_RULE: IUPACRule = {
  id: 'P-44.3.1',
  name: 'Maximum Length of Continuous Chain',
  description: 'Select the chain with highest score (length + substituents)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_1,
  priority: 100,
   conditions: (context: ImmutableNamingContext) => {
     const chains = context.getState().candidateChains as Chain[];
     return chains.length > 1 && !context.getState().p44_3_8_applied && !context.getState().parentStructure;
   },
   action: (context: ImmutableNamingContext) => {
     const chains = context.getState().candidateChains as Chain[];
     let updatedContext = context;
     if (chains.length === 0) {
       updatedContext = updatedContext.withConflict({
         ruleId: 'P-44.3.1',
         conflictType: 'state_inconsistency',
         description: 'No candidate chains found for selection',
         context: { chains }
       },
       'P-44.3.1',
       'Maximum Length of Continuous Chain',
       BLUE_BOOK_RULES.P44_3_1,
       ExecutionPhase.PARENT_STRUCTURE,
       'No candidate chains found for selection');
       return updatedContext;
     }
     const lengths = chains.map(chain => chain.length);
     const maxLength = Math.max(...lengths);
     const selectedChains = chains.filter((chain, index) => lengths[index] === maxLength);
     updatedContext = updatedContext.withUpdatedCandidates(
       selectedChains,
       'P-44.3.1',
       'Maximum Length of Continuous Chain',
       BLUE_BOOK_RULES.P44_3_1,
       ExecutionPhase.PARENT_STRUCTURE,
       'Filtered to chains with maximum length'
     );
     updatedContext = updatedContext.withStateUpdate(
       (state) => ({
         ...state,
         p44_3_1_applied: true,
         max_length: maxLength
       }),
       'P-44.3.1',
       'Maximum Length of Continuous Chain',
       BLUE_BOOK_RULES.P44_3_1,
       ExecutionPhase.PARENT_STRUCTURE,
       'Set p44_3_1_applied and max_length'
     );
     return updatedContext;
   }
};

/**
 * Rule: P-44.4 (chain-analysis placement)
 *
 * Ensure that when both ring candidates and chain candidates exist (i.e., after
 * initial-structure seeding), the ring vs chain decision is made before the
 * acyclic chain seniority rules are applied. This duplicates P-44.4 logic but
 * runs in the chain-analysis layer (so it executes after candidateChains are
 * seeded).
 */
export const P44_4_RING_VS_CHAIN_IN_CHAIN_ANALYSIS_RULE: IUPACRule = {
  id: 'P-44.4.chain-analysis',
  name: 'Ring vs Chain Selection (chain-analysis)',
  description: 'Prefer ring system as parent when both ring and chain candidates exist (P-44.4)',
  blueBookReference: BLUE_BOOK_RULES.P44_4,
  priority: 110,
   conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      return false;
    }
    const candidateRings = state.candidateRings;
    const candidateChains = state.candidateChains;
    return (Array.isArray(candidateRings) && candidateRings.length > 0) && (Array.isArray(candidateChains) && candidateChains.length > 0);
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const candidateRings = state.candidateRings as any[];
    if (!candidateRings || candidateRings.length === 0) return context;
    // Choose the first (already filtered) ring candidate as parent
    const ring = candidateRings[0];
    // Generate a simple ring name (aromatic vs aliphatic)
    const size = ring.size || (ring.atoms ? ring.atoms.length : 0);
    const type = ring.type || (ring.atoms && ring.atoms.some((a:any) => a.aromatic) ? 'aromatic' : 'aliphatic');
    let name = '';
    if (type === 'aromatic') {
      const aromaticNames: { [key: number]: string } = { 6: 'benzene', 5: 'cyclopentadiene', 7: 'cycloheptatriene' };
      name = aromaticNames[size] || `aromatic-${size}-membered`;
    } else {
      const ringNames: { [key: number]: string } = { 3: 'cyclopropane', 4: 'cyclobutane', 5: 'cyclopentane', 6: 'cyclohexane', 7: 'cycloheptane', 8: 'cyclooctane' };
      name = ringNames[size] || `cyclo${size}ane`;
    }
    const locants = ring && ring.atoms ? ring.atoms.map((_: any, idx: number) => idx + 1) : [];
    // Try to find substituents on the ring atoms so substituted ring names can be produced
    let substituents: any[] = [];
    try {
      const mol = (context.getState() as any).molecule;
      if (ring && ring.atoms && mol) {
        substituents = _findSubstituents(mol, ring.atoms as number[]) || [];
      }
    } catch (e) {
      substituents = [];
    }

    const parentStructure = {
      type: 'ring' as const,
      ring,
      name,
      locants,
      substituents
    };
    return context.withParentStructure(
      parentStructure,
      'P-44.4.chain-analysis',
      'Ring vs Chain Selection (chain-analysis)',
      BLUE_BOOK_RULES.P44_4,
      ExecutionPhase.PARENT_STRUCTURE,
      'Selected ring system as parent structure over chain (chain-analysis placement)'
    );
  }
};

/**
 * Rule: P-44.3.2 - Greatest Number of Multiple Bonds
 * 
 * If length is equal, choose the chain with the greatest number of multiple bonds
 * (double + triple bonds combined).
 */
export const P44_3_2_MULTIPLE_BONDS_RULE: IUPACRule = {
  id: 'P-44.3.2',
  name: 'Greatest Number of Multiple Bonds',
  description: 'Select chain with most multiple bonds (P-44.3.2)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_2,
  priority: 90,
   conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      return chains.length > 1 &&
             !!context.getState().p44_3_1_applied &&
             !context.getState().p44_3_2_applied &&
             !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.2',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for multiple bond selection',
        context: { chains }
      },
      'P-44.3.2',
      'Greatest Number of Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for multiple bond selection');
      return updatedContext;
    }
    // Count multiple bonds for each chain
    const multipleBondCounts = chains.map(chain => {
      return chain.multipleBonds.filter(bond => bond.type === 'double' || bond.type === 'triple').length;
    });
    const maxMultipleBonds = Math.max(...multipleBondCounts);
    const chainsWithMaxMultipleBonds = chains.filter((chain, index) =>
      multipleBondCounts[index] === maxMultipleBonds
    );
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithMaxMultipleBonds,
      'P-44.3.2',
      'Greatest Number of Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with most multiple bonds'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_2_applied: true,
        max_multiple_bonds: maxMultipleBonds
      }),
      'P-44.3.2',
      'Greatest Number of Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_2_applied and max_multiple_bonds'
    );
    return updatedContext;
  }
};

/**
 * Rule: P-44.3.3 - Greatest Number of Double Bonds
 * 
 * If still tied, choose the chain with the greatest number of double bonds.
 */
export const P44_3_3_DOUBLE_BONDS_RULE: IUPACRule = {
  id: 'P-44.3.3',
  name: 'Greatest Number of Double Bonds',
  description: 'Select chain with most double bonds (P-44.3.3)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_3,
  priority: 85,
   conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      const maxMultipleBonds = context.getState().max_multiple_bonds;
      return chains.length > 1 &&
             !!context.getState().p44_3_2_applied &&
             chains.every(chain =>
               chain.multipleBonds.filter(bond => bond.type === 'double' || bond.type === 'triple').length === maxMultipleBonds
             ) &&
             !context.getState().p44_3_3_applied &&
             !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.3',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for double bond selection',
        context: { chains }
      },
      'P-44.3.3',
      'Greatest Number of Double Bonds',
      BLUE_BOOK_RULES.P44_3_3,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for double bond selection');
      return updatedContext;
    }
    // Count double bonds for each chain
    const doubleBondCounts = chains.map(chain => {
      return chain.multipleBonds.filter(bond => bond.type === 'double').length;
    });
    const maxDoubleBonds = Math.max(...doubleBondCounts);
    const chainsWithMaxDoubleBonds = chains.filter((chain, index) =>
      doubleBondCounts[index] === maxDoubleBonds
    );
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithMaxDoubleBonds,
      'P-44.3.3',
      'Greatest Number of Double Bonds',
      BLUE_BOOK_RULES.P44_3_3,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with most double bonds'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_3_applied: true,
        max_double_bonds: maxDoubleBonds
      }),
      'P-44.3.3',
      'Greatest Number of Double Bonds',
      BLUE_BOOK_RULES.P44_3_3,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_3_applied and max_double_bonds'
    );
    return updatedContext;
  }
};

/**
 * Rule: P-44.3.4 - Lowest Locant Set for Multiple Bonds
 * 
 * If still tied, choose the chain with the lowest set of locants for multiple bonds.
 */
export const P44_3_4_MULTIPLE_BOND_LOCANTS_RULE: IUPACRule = {
  id: 'P-44.3.4',
  name: 'Lowest Locant Set for Multiple Bonds',
  description: 'Select chain with lowest locants for multiple bonds (P-44.3.4)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_4,
  priority: 80,
   conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      const maxDoubleBonds = context.getState().max_double_bonds;
      return chains.length > 1 &&
             !!context.getState().p44_3_3_applied &&
             chains.every(chain =>
               chain.multipleBonds.filter(bond => bond.type === 'double').length === maxDoubleBonds
             ) &&
             !context.getState().p44_3_4_applied &&
             !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.4',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for multiple bond locant selection',
        context: { chains }
      },
      'P-44.3.4',
      'Lowest Locant Set for Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_4,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for multiple bond locant selection');
      return updatedContext;
    }
    // Get locant sets for multiple bonds for each chain
    const locantSets: number[][] = chains.map((chain: Chain) => {
      return chain.multipleBonds
        .filter(bond => bond.type === 'double' || bond.type === 'triple')
        .map(bond => bond.locant ?? 0)
        .sort((a, b) => a - b);
    });
    // Find the lexicographically smallest locant set
    const lowestLocantSet = lexicographicallySmallest(locantSets);
    // Find chains with this locant set
    let chainsWithLowestLocants = chains;
    if (lowestLocantSet) {
      chainsWithLowestLocants = chains.filter((chain: Chain, index: number) => {
        const chainLocants = locantSets[index] || [];
        return chainLocants.length === lowestLocantSet.length &&
               chainLocants.every((locant, i) => locant === lowestLocantSet[i]);
      });
    }
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithLowestLocants,
      'P-44.3.4',
      'Lowest Locant Set for Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_4,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with lowest multiple bond locants'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_4_applied: true,
        lowest_multiple_bond_locants: lowestLocantSet ?? undefined
      }),
      'P-44.3.4',
      'Lowest Locant Set for Multiple Bonds',
      BLUE_BOOK_RULES.P44_3_4,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_4_applied and lowest_multiple_bond_locants'
    );
    return updatedContext;
  }
};

/**
 * Rule: P-44.3.5 - Lowest Locant Set for Double Bonds
 * 
 * If still tied, choose the chain with the lowest set of locants for double bonds.
 */
export const P44_3_5_DOUBLE_BOND_LOCANTS_RULE: IUPACRule = {
  id: 'P-44.3.5',
  name: 'Lowest Locant Set for Double Bonds',
  description: 'Select chain with lowest locants for double bonds (P-44.3.5)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_5,
  priority: 75,
   conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      const lowestMultipleBondLocants = context.getState().lowest_multiple_bond_locants;
      return chains.length > 1 &&
             !!context.getState().p44_3_4_applied &&
             !!lowestMultipleBondLocants &&
             !context.getState().p44_3_5_applied &&
             !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.5',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for double bond locant selection',
        context: { chains }
      },
      'P-44.3.5',
      'Lowest Locant Set for Double Bonds',
      BLUE_BOOK_RULES.P44_3_5,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for double bond locant selection');
      return updatedContext;
    }
    // Get locant sets for double bonds for each chain
    const doubleBondLocantSets: number[][] = chains.map((chain: Chain) => {
      return chain.multipleBonds
        .filter(bond => bond.type === 'double')
        .map(bond => bond.locant ?? 0)
        .sort((a, b) => a - b);
    });
    // Find the lexicographically smallest double bond locant set
    const lowestDoubleBondLocantSet = lexicographicallySmallest(doubleBondLocantSets);
    // Find chains with this locant set
    const chainsWithLowestDoubleBondLocants = chains.filter((chain: Chain, index: number) => {
      const chainLocants = doubleBondLocantSets[index] || [];
      return lowestDoubleBondLocantSet !== null &&
             chainLocants.length === lowestDoubleBondLocantSet.length &&
             chainLocants.every((locant, i) => locant === lowestDoubleBondLocantSet[i]);
    });
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithLowestDoubleBondLocants,
      'P-44.3.5',
      'Lowest Locant Set for Double Bonds',
      BLUE_BOOK_RULES.P44_3_5,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with lowest double bond locants'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_5_applied: true,
        lowest_double_bond_locants: lowestDoubleBondLocantSet ?? undefined
      }),
      'P-44.3.5',
      'Lowest Locant Set for Double Bonds',
      BLUE_BOOK_RULES.P44_3_5,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_5_applied and lowest_double_bond_locants'
    );
    return updatedContext;
  }
};

/**
 * Rule: P-44.3.6 - Greatest Number of Substituents
 * 
 * If still tied, choose the chain with the greatest number of substituents.
 */
export const P44_3_6_SUBSTITUENTS_RULE: IUPACRule = {
   id: 'P-44.3.6',
   name: 'Greatest Number of Substituents',
   description: 'Select chain with most substituents (P-44.3.6)',
   blueBookReference: BLUE_BOOK_RULES.P44_3_6,
   priority: 70,
    conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      return chains.length > 1 && !!context.getState().p44_3_5_applied && !context.getState().p44_3_6_applied && !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.6',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for substituent selection',
        context: { chains }
      },
      'P-44.3.6',
      'Greatest Number of Substituents',
      BLUE_BOOK_RULES.P44_3_6,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for substituent selection');
      return updatedContext;
    }
    // Count substituents for each chain
    const substituentCounts = chains.map(chain => chain.substituents.length);
    const maxSubstituents = Math.max(...substituentCounts);
    const chainsWithMaxSubstituents = chains.filter((chain, index) =>
      substituentCounts[index] === maxSubstituents
    );
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithMaxSubstituents,
      'P-44.3.6',
      'Greatest Number of Substituents',
      BLUE_BOOK_RULES.P44_3_6,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with most substituents'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_6_applied: true,
        max_substituents: maxSubstituents
      }),
      'P-44.3.6',
      'Greatest Number of Substituents',
      BLUE_BOOK_RULES.P44_3_6,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_6_applied and max_substituents'
    );
    return updatedContext;
  }
};

/**
 * Rule: P-44.3.7 - Lowest Locant Set for Substituents
 * 
 * If still tied, choose the chain with the lowest set of locants for substituents.
 */
export const P44_3_7_SUBSTITUENT_LOCANTS_RULE: IUPACRule = {
  id: 'P-44.3.7',
  name: 'Lowest Locant Set for Substituents',
  description: 'Select chain with lowest locants for substituents (P-44.3.7)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_7,
  priority: 65,
   conditions: (context: ImmutableNamingContext) => {
      const chains = context.getState().candidateChains as Chain[];
      const maxSubstituents = context.getState().max_substituents;
      return chains.length > 1 &&
             !!context.getState().p44_3_6_applied &&
             chains.every(chain => chain.substituents.length === maxSubstituents) &&
             !context.getState().p44_3_7_applied &&
             !context.getState().parentStructure;
    },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.7',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for substituent locant selection',
        context: { chains }
      },
      'P-44.3.7',
      'Lowest Locant Set for Substituents',
      BLUE_BOOK_RULES.P44_3_7,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for substituent locant selection');
      return updatedContext;
    }
      // Get locant sets for substituents for each chain
      const substituentLocantSets: number[][] = chains.map((chain: Chain) => {
        return chain.substituents
          .map(substituent => substituent.locant ?? 0)
          .sort((a, b) => a - b);
      });
      // Find the lexicographically smallest substituent locant set
      const lowestSubstituentLocantSet = lexicographicallySmallest(substituentLocantSets);
      // Find chains with this locant set
      const chainsWithLowestSubstituentLocants = chains.filter((chain: Chain, index: number) => {
        const chainLocants = substituentLocantSets[index] || [];
        return lowestSubstituentLocantSet !== null &&
               chainLocants.length === lowestSubstituentLocantSet.length &&
               chainLocants.every((locant, i) => locant === lowestSubstituentLocantSet[i]);
      });
    updatedContext = updatedContext.withUpdatedCandidates(
      chainsWithLowestSubstituentLocants,
      'P-44.3.7',
      'Lowest Locant Set for Substituents',
      BLUE_BOOK_RULES.P44_3_7,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chains with lowest substituent locants'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_7_applied: true,
        lowest_substituent_locants: lowestSubstituentLocantSet ?? undefined
      }),
      'P-44.3.7',
      'Lowest Locant Set for Substituents',
      BLUE_BOOK_RULES.P44_3_7,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_7_applied and lowest_substituent_locants'
    );
    return updatedContext;
  }
};

/**
 * Rule: P-44.3.8 - Lowest Alphabetical Locant
 * 
 * Final tie-breaker: choose the chain that gives the lowest locant to the
 * prefix cited first alphabetically.
 */
export const P44_3_8_ALPHABETICAL_LOCANT_RULE: IUPACRule = {
  id: 'P-44.3.8',
  name: 'Lowest Alphabetical Locant',
  description: 'Final tie-breaker using alphabetical order (P-44.3.8)',
  blueBookReference: BLUE_BOOK_RULES.P44_3_8,
  priority: 60,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    return chains.length > 1;
  },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'P-44.3.8',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains found for alphabetical locant selection',
        context: { chains }
      },
      'P-44.3.8',
      'Lowest Alphabetical Locant',
      BLUE_BOOK_RULES.P44_3_8,
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains found for alphabetical locant selection');
      return updatedContext;
    }
    // For each candidate chain, build the list of cited substituent types and compare
    function citationNamesForChain(chain: Chain): string[] {
      const subs = (chain.substituents || []).slice().sort((a: Substituent, b: Substituent) => {
        const la = (a.locant || 0) as number;
        const lb = (b.locant || 0) as number;
        return la - lb;
      });
      // Use only the 'type' property for canonicalization
      const namesRaw: string[] = subs.map((sub: Substituent) => sub.type || '').filter(Boolean);
      return canonicalizeCitationList(namesRaw);
    }
    // Build citation name lists for each chain and pick the minimal according to element-wise alphabetical comparison
    const chainEntries = chains.map((chain: Chain) => ({ chain, names: citationNamesForChain(chain) }));
    chainEntries.sort((A, B) => compareCitationArrays(A.names, B.names));
    let selectedChain: Chain;
    if (chainEntries.length > 0) {
      selectedChain = chainEntries[0]!.chain!;
    } else if (chains.length > 0) {
      selectedChain = chains[0]!;
    } else {
      // Fallback: use a minimal Chain object
      selectedChain = {
        atoms: [],
        bonds: [],
        length: 0,
        multipleBonds: [],
        substituents: [],
        locants: []
      };
    }
    updatedContext = updatedContext.withUpdatedCandidates(
      [selectedChain],
      'P-44.3.8',
      'Lowest Alphabetical Locant',
      BLUE_BOOK_RULES.P44_3_8,
      ExecutionPhase.PARENT_STRUCTURE,
      'Filtered to chain with lowest alphabetical locant'
    );
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        p44_3_8_applied: true,
        selected_chain_final: selectedChain
      }),
      'P-44.3.8',
      'Lowest Alphabetical Locant',
      BLUE_BOOK_RULES.P44_3_8,
      ExecutionPhase.PARENT_STRUCTURE,
      'Set p44_3_8_applied and selected_chain_final'
    );
    return updatedContext;
  }
};

/**
 * Rule: Parent Chain Selection Complete
 * 
 * This rule finalizes the parent chain selection and sets the parent structure.
 */
export const PARENT_CHAIN_SELECTION_COMPLETE_RULE: IUPACRule = {
  id: 'parent-chain-selection-complete',
  name: 'Parent Chain Selection Complete',
  description: 'Finalize parent chain selection and set parent structure',
  blueBookReference: 'P-44.3 - Chain seniority hierarchy',
  priority: 1000,
  conditions: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    // Only finalize chain parent selection if no parentStructure has already been set (e.g., a ring)
    return chains.length > 0 && !context.getState().parentStructure;
  },
  action: (context: ImmutableNamingContext) => {
    const chains = context.getState().candidateChains as Chain[];
    let updatedContext = context;
    if (chains.length === 0) {
      updatedContext = updatedContext.withConflict({
        ruleId: 'parent-chain-selection-complete',
        conflictType: 'state_inconsistency',
        description: 'No candidate chains available for parent selection',
        context: {}
      },
      'parent-chain-selection-complete',
      'Parent Chain Selection Complete',
      'P-44.3 - Chain seniority hierarchy',
      ExecutionPhase.PARENT_STRUCTURE,
      'No candidate chains available for parent selection');
      return updatedContext;
    }
    // Select the final parent chain
    const parentChain = chains[0] as Chain;
    console.log(`Final selected parentChain atoms: ${parentChain.atoms.map(a => a.id)}, substituents: ${JSON.stringify(parentChain.substituents)}`);
    // Create parent structure
    const parentStructure = {
      type: 'chain' as const,
      chain: parentChain,
      name: generateChainName(parentChain, false), // Base name without substituents for substitutive nomenclature
      assembledName: undefined, // Will be set during name assembly
      locants: parentChain.locants,
      substituents: parentChain.substituents || []
    };
    updatedContext = updatedContext.withParentStructure(
      parentStructure,
      'P-44.3.8',
      'Lowest Alphabetical Locant',
      BLUE_BOOK_RULES.P44_3_8,
      ExecutionPhase.PARENT_STRUCTURE,
      'Selected chain with lowest alphabetical locant'
    );
    return updatedContext;
  }
};

/**
 * Helper function to generate chain name from chain object
 * @param chain - The chain to generate a name for
 * @param includeSubstituents - If false, only return the base chain name without substituents (default: true)
 */
export function generateChainName(chain: Chain, includeSubstituents: boolean = true): string {
  if (process.env.VERBOSE) console.log(`[generateChainName] called with chain.length=${chain.length}, includeSubstituents=${includeSubstituents}, chain.substituents=${JSON.stringify(chain.substituents)}`);
  const length = chain.length;
  // Base chain names
  const chainNames = [
    '', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec',
    'undec', 'dodec', 'tridec', 'tetradec', 'pentadec', 'hexadec', 'heptadec', 'octadec', 'nonadec'
  ];
  let baseName = 'unknown';
  if (length < chainNames.length) {
    baseName = chainNames[length] + 'ane';
  } else {
    baseName = `${length}-carbon alkane`;
  }
  // Add unsaturation suffixes and include locants (e.g., but-2-ene, but-1,3-diene)
  const doubleBondLocants: number[] = chain.multipleBonds
    .filter((bond: MultipleBond) => bond.type === 'double')
    .map(b => (typeof b.locant === 'number' ? b.locant : NaN))
    .filter(n => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const tripleBondLocants: number[] = chain.multipleBonds
    .filter((bond: MultipleBond) => bond.type === 'triple')
    .map(b => (typeof b.locant === 'number' ? b.locant : NaN))
    .filter(n => !Number.isNaN(n))
    .sort((a, b) => a - b);

  // Work from the root (e.g., 'but' for 'butane')
  const root = (chainNames[length] || `${length}-carbon`).replace(/ane$/, '');
  // Total counts of multiple bonds (may be present even if locants not assigned yet)
  const doubleCount = chain.multipleBonds.filter((b: MultipleBond) => b.type === 'double').length;
  const tripleCount = chain.multipleBonds.filter((b: MultipleBond) => b.type === 'triple').length;

  const multiplicativePrefixes = ['di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];

  let unsatSuffix = '';
  const parts: string[] = [];
  if (doubleCount > 0) {
    const locStr = doubleBondLocants.join(',');
    const mult = doubleCount > 1 ? (multiplicativePrefixes[doubleCount - 2] || `${doubleCount}-`) : '';
    const suf = `${mult}ene`;
    // Omit the locant '1' for monosubstituted short chains (ethene written as 'ethene')
    if (locStr === '1') {
      parts.push(suf);
    } else {
      parts.push(locStr ? `${locStr}-${suf}` : suf);
    }
  }
  if (tripleCount > 0) {
    const locStr = tripleBondLocants.join(',');
    const mult = tripleCount > 1 ? (multiplicativePrefixes[tripleCount - 2] || `${tripleCount}-`) : '';
    const suf = `${mult}yne`;
    if (locStr === '1') {
      parts.push(suf);
    } else {
      parts.push(locStr ? `${locStr}-${suf}` : suf);
    }
  }

  if (parts.length > 0 || doubleCount > 0 || tripleCount > 0) {
    // join multiple unsaturation parts with '-' (e.g., '1,3-diene-5-yne')
    unsatSuffix = parts.join('-');
    // If we have no locant parts but unsaturation exists, add suffix without locants
    if (!unsatSuffix) {
      if (doubleCount > 0 && tripleCount === 0) baseName = `${root}-ene`;
      else if (tripleCount > 0 && doubleCount === 0) baseName = `${root}-yne`;
      else baseName = `${root}-en-yne`;
    } else {
      // IUPAC rule: Add "a" to root when multiple unsaturations (diene, triene, diyne, etc.)
      // Examples: buta-1,3-diene, hexa-1,3,5-triene
      const hasMultipleUnsaturations = doubleCount > 1 || tripleCount > 1 || (doubleCount > 0 && tripleCount > 0);
      const rootWithA = hasMultipleUnsaturations ? `${root}a` : root;
      
      // If unsaturation suffix begins with a digit (locant), insert hyphen
      if (unsatSuffix.match(/^\d/)) {
        baseName = `${rootWithA}-${unsatSuffix}`;
      } else {
        baseName = `${rootWithA}${unsatSuffix}`;
      }
    }
  }
  // Handle substituents
  const substituents = chain.substituents ?? [];
  if (includeSubstituents && substituents.length > 0) {
    // Group by type and collect locants
    const substituentMap: Record<string, number[]> = {};
    chain.substituents.forEach(sub => {
      if (sub && sub.type && typeof sub.locant === 'number') {
  if (process.env.VERBOSE) console.log(`[generateChainName] substituent: ${sub.type}, locant: ${sub.locant}`);
  if (!substituentMap[sub.type]) substituentMap[sub.type] = [];
  substituentMap[sub.type]!.push(sub.locant);
      }
    });
    // Build substituent prefix string
    const substituentStrings: string[] = Object.entries(substituentMap).map(([type, locantsRaw]) => {
      const locants: number[] = Array.isArray(locantsRaw)
        ? (locantsRaw as Array<number | undefined>).map(x => typeof x === 'number' ? x : 0)
        : [];
      locants.sort((a, b) => a - b);
      const locantStr = locants.join(',');
      let prefix = '';
      if (locants.length === 1) {
        prefix = `${locantStr}-${type}`;
      } else if (locants.length > 1) {
        const multiplicity = locants.length;
        const multiplicativePrefixes = ['di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];
        const multiPrefix = multiplicativePrefixes[multiplicity - 2] || `${multiplicity}-`;
        prefix = `${locantStr}-${multiPrefix}${type}`;
      }
      return prefix;
    });
    const substituentPrefix = substituentStrings.filter(Boolean).join('-');
    return substituentPrefix ? `${substituentPrefix}${baseName}` : baseName;
  }
  return baseName;
}


/**
 * Export all parent chain selection layer rules
 */
// --- NEW: P-44.2 Ring System Seniority Rule ---
/**
 * Convert a RingSystem to a minimal Chain object for parent selection.
 */
function ringSystemToChain(ring: import('../types').RingSystem): import('../types').Chain {
  return {
    atoms: ring.atoms,
    bonds: ring.bonds,
    length: ring.atoms.length,
    multipleBonds: [], // Could be populated if needed
    substituents: [], // Could be populated if needed
    locants: [], // Could be populated if needed
  };
}

export const P44_2_RING_SENIORITY_RULE: IUPACRule = {
  id: 'P-44.2',
  name: 'Ring System Seniority',
  description: 'Prefer ring systems over chains when applicable',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: 110, // Higher than chain rules
   conditions: (context) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      return false;
    }
    const rings = state.candidateRings;
    return rings && rings.length > 0;
  },
  action: (context) => {
    const rings = context.getState().candidateRings;
    if (!rings || rings.length === 0) return context;
    // Prefer largest ring system (by atom count)
    const maxSize = Math.max(...rings.map(r => r.atoms.length));
    const largestRings = rings.filter(r => r.atoms.length === maxSize);
    // Choose the first largest ring and set as parentStructure (preserve ring semantics)
    const ring = largestRings[0];
    const size = ring.atoms ? ring.atoms.length : (ring.size || 0);
    const type = ring.type || (ring.atoms && ring.atoms.some((a:any) => a.aromatic) ? 'aromatic' : 'aliphatic');
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
      'P-44.2',
      'Ring System Seniority',
      BLUE_BOOK_RULES.P44_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'Selected largest ring system as parent structure'
    );
  }
};

export const PARENT_CHAIN_SELECTION_LAYER_RULES: IUPACRule[] = [
  P44_2_RING_SENIORITY_RULE,
  P44_3_1_MAX_LENGTH_RULE,
  P44_3_2_MULTIPLE_BONDS_RULE,
  P44_3_3_DOUBLE_BONDS_RULE,
  P44_3_4_MULTIPLE_BOND_LOCANTS_RULE,
  P44_3_5_DOUBLE_BOND_LOCANTS_RULE,
  P44_3_6_SUBSTITUENTS_RULE,
  P44_3_7_SUBSTITUENT_LOCANTS_RULE,
  P44_3_8_ALPHABETICAL_LOCANT_RULE,
  PARENT_CHAIN_SELECTION_COMPLETE_RULE
];