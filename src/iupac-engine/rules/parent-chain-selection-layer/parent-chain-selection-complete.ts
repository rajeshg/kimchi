import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';
import type { Chain, MultipleBond } from '../../types';

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
  priority: RulePriority.TEN,
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
    // IUPAC rule: Omit locant when unambiguous (chains ≤3 carbons have only one possible position)
    // Include locant for chains ≥4 carbons where position matters (but-1-ene vs but-2-ene)
    if (locStr && length >= 4) {
      parts.push(`${locStr}-${suf}`);
    } else {
      parts.push(suf);
    }
  }
  if (tripleCount > 0) {
    const locStr = tripleBondLocants.join(',');
    const mult = tripleCount > 1 ? (multiplicativePrefixes[tripleCount - 2] || `${tripleCount}-`) : '';
    const suf = `${mult}yne`;
    // IUPAC rule: Omit locant when unambiguous (chains ≤3 carbons have only one possible position)
    // Include locant for chains ≥4 carbons where position matters (but-1-yne vs but-2-yne)
    if (locStr && length >= 4) {
      parts.push(`${locStr}-${suf}`);
    } else {
      parts.push(suf);
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
    // Helper to detect if a substituent name is complex (has internal locants)
    const isComplexSubstituent = (name: string): boolean => {
      // Complex if contains digits followed by hyphen (e.g., "2-methylbutan-2-yloxy")
      // but not just at the start (that's our locant)
      return /\d+-\w/.test(name) || name.includes('oxy') && name.match(/-\d/) !== null;
    };
    
    // Helper to determine if square brackets are needed
    const needsSquareBrackets = (name: string): boolean => {
      // Square brackets for nested complex substituents (contains "oxy" and internal locants)
      return name.includes('oxy') && /\d+-/.test(name) && name.split('oxy').length > 2;
    };
    
    // Create array of individual substituent entries with their locants
    interface SubstituentEntry {
      type: string;
      locant: number;
      sortKey: string; // For alphabetical sorting (the substituent name part)
    }
    
    const substituentEntries: SubstituentEntry[] = [];
    chain.substituents.forEach(sub => {
      if (sub && sub.type && typeof sub.locant === 'number') {
        if (process.env.VERBOSE) console.log(`[generateChainName] substituent: ${sub.type}, locant: ${sub.locant}`);
        
        // Extract the base name for alphabetical sorting (ignore any existing locant prefix)
        const sortKey = sub.type.replace(/^\d+-/, '');
        
        substituentEntries.push({
          type: sub.type,
          locant: sub.locant,
          sortKey: sortKey
        });
      }
    });
    
    // Sort substituents: first by locant (ascending), then alphabetically by name
    substituentEntries.sort((a, b) => {
      if (a.locant !== b.locant) return a.locant - b.locant;
      return a.sortKey.localeCompare(b.sortKey);
    });
    
    // Build substituent prefix string with proper formatting
    const substituentStrings: string[] = substituentEntries.map(entry => {
      const { type, locant } = entry;
      const isComplex = isComplexSubstituent(type);
      const useBrackets = needsSquareBrackets(type);
      
      if (isComplex) {
        // Wrap complex substituents in parentheses or square brackets
        const wrapped = useBrackets ? `[${type}]` : `(${type})`;
        return `${locant}-${wrapped}`;
      } else {
        return `${locant}-${type}`;
      }
    });
    
    const substituentPrefix = substituentStrings.filter(Boolean).join('-');
    return substituentPrefix ? `${substituentPrefix}${baseName}` : baseName;
  }
  return baseName;
}
