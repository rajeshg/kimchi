import type { Molecule } from 'types';
import type {
  IUPACToken,
  OPSINRules,
} from './iupac-types';
import { parseSMILES } from 'index';

/**
 * IUPAC builder - enhanced to handle complex molecules
 * Strategy: Parse tokens into a SMILES structure, progressively adding:
 * 1. Parent chain (alkane stem)
 * 2. Functional group suffix (ol, one, amine, etc.)
 * 3. Substituents with locants
 * 4. Stereochemistry markers
 */
export class IUPACBuilder {
  private rules: OPSINRules;

  constructor(rules: OPSINRules) {
    this.rules = rules;
  }

  /**
   * Build a molecule from IUPAC tokens by reconstructing SMILES
   */
  build(tokens: IUPACToken[]): Molecule {
    if (tokens.length === 0) {
      throw new Error('No tokens to build molecule');
    }

    // Extract and reconstruct SMILES from tokens
    const smiles = this.tokensToSMILES(tokens);
    
    const result = parseSMILES(smiles);
    if (result.molecules.length === 0 || !result.molecules[0]) {
      throw new Error(`Failed to parse constructed SMILES: ${smiles}`);
    }

    return result.molecules[0];
  }

  /**
   * Convert token stream to SMILES string
   * Enhanced to handle functional groups, substituents, locants, stereochemistry, unsaturation, and cycles
   */
  private tokensToSMILES(tokens: IUPACToken[]): string {
    // Organize tokens by type
    const parentTokens = tokens.filter(t => t.type === 'PARENT');
    const suffixTokens = tokens.filter(t => t.type === 'SUFFIX');
    const prefixTokens = tokens.filter(t => t.type === 'PREFIX');
    const locantTokens = tokens.filter(t => t.type === 'LOCANT');
    const substituentTokens = tokens.filter(t => t.type === 'SUBSTITUENT');
    const multiplierTokens = tokens.filter(t => t.type === 'MULTIPLIER');

    // Check for cyclo prefix or if parent is a non-aromatic ring system (contains ring numbers but not aromatic)
    const hasCycloPrefix = prefixTokens.some(p => p.metadata?.isCyclic === true);
    const parentSmilesForCheck = (parentTokens[0]?.metadata?.smiles as string) || '';
    // Non-aromatic rings: C1...1 pattern (capital C with digits)
    // Aromatic rings: c1...1 pattern (lowercase c with digits) - handled separately
    const parentIsNonAromaticRing = /C.*\d/.test(parentSmilesForCheck) && parentSmilesForCheck.includes('1');
    const isCyclic = hasCycloPrefix || parentIsNonAromaticRing;

    // Special case: cyclo + multiplier + an/ane (e.g., "cyclohexan-1-ol", "dimethylcyclopentan-1-ol")
    // In this case, there's no explicit PARENT token, but we can construct it from the multiplier
    if (parentTokens.length === 0 && isCyclic) {
      const hasSaturatedSuffix = suffixTokens.some(s => s.value === 'an' || s.value === 'ane');
      if (hasSaturatedSuffix && multiplierTokens.length > 0) {
        // Find the multiplier that comes AFTER the "cyclo" prefix
        // This is the chain length indicator (e.g., "hex" in "cyclohexan", "pent" in "cyclopentan")
        const cycloPrefix = prefixTokens.find(p => p.metadata?.isCyclic === true);
        if (cycloPrefix) {
          // Find multiplier that comes after cyclo prefix
          const chainMultiplier = multiplierTokens.find(m => m.position > cycloPrefix.position);
          if (chainMultiplier) {
            const chainLengthMap: { [key: string]: number } = {
              'prop': 3, 'but': 4, 'pent': 5, 'hex': 6, 'hept': 7, 'oct': 8, 'non': 9, 'dec': 10
            };
            const chainLength = chainLengthMap[chainMultiplier.value];
            if (chainLength !== undefined && chainLength > 0) {
              // Create synthetic parent token
              const syntheticParent: IUPACToken = {
                type: 'PARENT',
                value: chainMultiplier.value + 'ane',
                position: chainMultiplier.position,
                length: chainMultiplier.length,
                metadata: {
                  smiles: 'C'.repeat(chainLength),
                  atomCount: chainLength,
                  isRing: false,
                },
              };
              parentTokens.push(syntheticParent);
            }
          }
        }
      }
    }

    if (parentTokens.length === 0) {
      throw new Error('No parent chain found in tokens');
    }

    // Get parent chain SMILES
    const parentSmiles = (parentTokens[0]?.metadata?.smiles as string) || '';
    if (!parentSmiles) {
      throw new Error('Parent chain has no SMILES data');
    }

    // Start with parent chain
    let smiles = parentSmiles;

    // Convert to cyclic structure if cyclo prefix present
    if (isCyclic && smiles.match(/^C+$/)) {
      smiles = this.makeCyclic(smiles);
    }

    // Apply unsaturation (ene, yne, diene) before other modifications
    smiles = this.applyUnsaturation(smiles, suffixTokens, locantTokens, isCyclic);

    // Check if this is an ester (oate suffix) - in that case, first substituent is the ester alkyl group
    const isEster = suffixTokens.some(s => s.value === 'oate' || s.value === 'anoate');
    
    // Apply functional group suffix (ol, one, amine, etc.)
    if (suffixTokens.length > 0) {
      smiles = this.applySuffixes(smiles, suffixTokens, locantTokens, substituentTokens, multiplierTokens);
    }

    // Apply substituents (skip first substituent if it's an ester, as it's part of the ester group)
    const substituentsToApply = isEster && substituentTokens.length > 0 
      ? substituentTokens.slice(1) 
      : substituentTokens;
      
    if (substituentsToApply.length > 0) {
      smiles = this.applySubstituents(smiles, substituentsToApply, locantTokens, multiplierTokens, isCyclic);
    }

    return smiles;
  }

  /**
   * Apply functional group suffixes to the parent chain
   * Enhanced to handle multiple functional groups (e.g., "dione", "diol")
   */
  private applySuffixes(
    parentSmiles: string,
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    substituentTokens: IUPACToken[],
    multiplierTokens: IUPACToken[]
  ): string {
    let result = parentSmiles;

    for (const suffix of suffixTokens) {
      const suffixValue = suffix.value.toLowerCase();

      // Find if there's a multiplier before this suffix (e.g., "di" before "one")
      const multiplier = this.getMultiplierBeforeSuffix(suffix, multiplierTokens);
      const multiplierCount = multiplier ? (multiplier.metadata?.count as number) || 1 : 1;

      // Get locants that appear before this suffix
      const locants = this.getLocantsBeforeSuffix(suffix, locantTokens);

      switch (suffixValue) {
        case 'ol':
          if (multiplierCount > 1 && locants.length > 0) {
            // Multiple -OH groups at specified positions (e.g., "propane-1,2-diol")
            for (const loc of locants) {
              result = this.addHydroxylGroupAtPosition(result, loc);
            }
          } else {
            result = this.addHydroxylGroup(result, locantTokens);
          }
          break;
        case 'one':
          if (multiplierCount > 1 && locants.length > 0) {
            // Multiple C=O groups at specified positions (e.g., "butane-2,3-dione")
            for (const loc of locants) {
              result = this.addCarbonylGroupAtPosition(result, loc);
            }
          } else {
            result = this.addCarbonylGroup(result, locantTokens);
          }
          break;
        case 'amine':
        case 'amin':
          result = this.addAmineGroup(result, locantTokens);
          break;
        case 'amide':
        case 'amid':
          result = this.addAmideGroup(result);
          break;
        case 'al':
          result = this.addAldehydeGroup(result);
          break;
        case 'oic acid':
        case 'ic acid':
        case 'ic':
        case 'anoic':
        case 'oic':
          result = this.addCarboxylicAcidGroup(result);
          break;
        case 'oate':
        case 'anoate':
          // For esters like "methyl butanoate", we need the alkyl group from substituents
          result = this.addEsterGroup(result, substituentTokens);
          break;
        case 'nitrile':
          result = this.addNitrileGroup(result);
          break;
      }
    }

    return result;
  }

  /**
   * Find the multiplier that appears immediately before a suffix token
   */
  private getMultiplierBeforeSuffix(suffix: IUPACToken, multiplierTokens: IUPACToken[]): IUPACToken | null {
    let closestMultiplier: IUPACToken | null = null;
    let closestDistance = Infinity;

    for (const multiplier of multiplierTokens) {
      if (multiplier.position < suffix.position) {
        const distance = suffix.position - multiplier.position;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestMultiplier = multiplier;
        }
      }
    }

    return closestMultiplier;
  }

  /**
   * Find all locants that appear immediately before a suffix token
   */
  private getLocantsBeforeSuffix(suffix: IUPACToken, locantTokens: IUPACToken[]): number[] {
    // Find the closest locant token before the suffix
    let closestLocant: IUPACToken | null = null;
    let closestDistance = Infinity;

    for (const locant of locantTokens) {
      if (locant.position < suffix.position) {
        const distance = suffix.position - locant.position;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLocant = locant;
        }
      }
    }

    if (closestLocant) {
      const positions = (closestLocant.metadata?.positions as number[]) || [];
      return positions;
    }
    
    return [];
  }

  /**
   * Add hydroxyl group at specific position (for multiple -OH groups)
   */
  private addHydroxylGroupAtPosition(smiles: string, position: number): string {
    // For linear chains
    if (smiles.match(/^C+$/) || smiles.match(/^[C()=O]+$/)) {
      const pos = this.findCarbonPosition(smiles, position);
      return smiles.substring(0, pos + 1) + '(O)' + smiles.substring(pos + 1);
    }
    
    // For cyclic structures
    if (smiles.match(/^[O=]*C1[A-Z0-9]+1$/i)) {
      if (position === 1) {
        return smiles.replace(/C1/, 'C1(O)');
      }
      // Find Nth carbon
      const match = smiles.match(/^([O=]*)C1(.+)1$/);
      if (match && match[2]) {
        const prefix = match[1] || '';
        const ringContent = match[2];
        let carbonCount = 1;
        let insertPos = prefix.length + 2;
        
        for (let i = 0; i < ringContent.length; i++) {
          if (ringContent[i] === 'C') {
            carbonCount++;
            if (carbonCount === position) {
              insertPos = prefix.length + 2 + i + 1;
              return smiles.substring(0, insertPos) + '(O)' + smiles.substring(insertPos);
            }
          }
        }
      }
    }
    
    return smiles;
  }

  /**
   * Add carbonyl group at specific position (for multiple C=O groups)
   */
  private addCarbonylGroupAtPosition(smiles: string, position: number): string {
    // For linear chains
    if (smiles.match(/^C+$/) || smiles.match(/^[C()=O]+$/)) {
      const pos = this.findCarbonPosition(smiles, position);
      return smiles.substring(0, pos + 1) + '(=O)' + smiles.substring(pos + 1);
    }
    
    // For cyclic structures
    if (smiles.match(/^[O=]*C1[A-Z0-9]+1$/i)) {
      if (position === 1) {
        // Prepend O= for first position
        return 'O=' + smiles;
      }
      // Find Nth carbon
      const match = smiles.match(/^([O=]*)C1(.+)1$/);
      if (match && match[2]) {
        const prefix = match[1] || '';
        const ringContent = match[2];
        let carbonCount = 1;
        let insertPos = prefix.length + 2;
        
        for (let i = 0; i < ringContent.length; i++) {
          if (ringContent[i] === 'C') {
            carbonCount++;
            if (carbonCount === position) {
              insertPos = prefix.length + 2 + i + 1;
              return smiles.substring(0, insertPos) + '(=O)' + smiles.substring(insertPos);
            }
          }
        }
      }
    }
    
    return smiles;
  }

  /**
   * Apply substituents to the parent chain
   * Improved to handle locants associated with each substituent and multipliers
   */
  private applySubstituents(
    parentSmiles: string,
    substituentTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    multiplierTokens: IUPACToken[],
    isCyclic: boolean
  ): string {
    let result = parentSmiles;

    // For each substituent, find its multiplier and locants
    for (const substituent of substituentTokens) {
      if (!substituent) continue;

      const substSmiles = (substituent.metadata?.smiles as string) || '';
      if (!substSmiles) continue;

      // Find multiplier that appears immediately before this substituent
      const multiplier = this.getMultiplierBeforeSubstituent(substituent, multiplierTokens);
      const multiplierCount = multiplier ? (multiplier.metadata?.count as number) : 1;

      // Find locants that appear before this substituent
      const locants = this.getLocantsBeforeSubstituent(substituent, locantTokens);

      if (process.env.VERBOSE) {
        console.log(`[applySubstituents] substituent="${substituent.value}", multiplierCount=${multiplierCount}, locants=${JSON.stringify(locants)}`);
      }

      // Apply substituent at each locant position
      if (locants.length > 0) {
        for (let i = 0; i < locants.length; i++) {
          const locant = locants[i];
          if (locant !== undefined) {
            if (process.env.VERBOSE) {
              console.log(`[applySubstituents] Applying substituent at locant ${locant}, current result="${result}"`);
            }
            result = this.addSubstituent(result, substSmiles, locant, isCyclic);
          }
        }
      } else if (multiplierCount > 1) {
        // If no locants but there's a multiplier, apply at default position multiple times
        const defaultLocant = this.getLocantBeforeSubstituent(substituent, locantTokens);
        for (let i = 0; i < multiplierCount; i++) {
          result = this.addSubstituent(result, substSmiles, defaultLocant, isCyclic);
        }
      } else {
        // Single substituent with single locant
        const locant = this.getLocantBeforeSubstituent(substituent, locantTokens);
        result = this.addSubstituent(result, substSmiles, locant, isCyclic);
      }
    }

    return result;
  }

  /**
   * Find the locant that appears immediately before a substituent token
   */
  private getLocantBeforeSubstituent(substituent: IUPACToken, locantTokens: IUPACToken[]): number {
    // Find locant with position just before the substituent
    for (const locant of locantTokens) {
      if (locant.position < substituent.position) {
        // Check if this is the closest locant before the substituent
        const positions = (locant.metadata?.positions as number[]) || [];
        if (positions.length > 0 && positions[0]) {
          return positions[0];
        }
      }
    }
    
    return 1; // Default position
  }

  /**
   * Find all locants that appear immediately before a substituent token
   * Used for handling multiple positions like "2,3-dimethyl"
   */
  private getLocantsBeforeSubstituent(substituent: IUPACToken, locantTokens: IUPACToken[]): number[] {
    // Find the closest locant token before the substituent
    let closestLocant: IUPACToken | null = null;
    let closestDistance = Infinity;

    for (const locant of locantTokens) {
      if (locant.position < substituent.position) {
        const distance = substituent.position - locant.position;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLocant = locant;
        }
      }
    }

    if (closestLocant) {
      const positions = (closestLocant.metadata?.positions as number[]) || [];
      return positions;
    }
    
    return []; // No locants found
  }

  /**
   * Find the multiplier that appears immediately before a substituent token
   */
  private getMultiplierBeforeSubstituent(substituent: IUPACToken, multiplierTokens: IUPACToken[]): IUPACToken | null {
    let closestMultiplier: IUPACToken | null = null;
    let closestDistance = Infinity;

    for (const multiplier of multiplierTokens) {
      if (multiplier.position < substituent.position) {
        const distance = substituent.position - multiplier.position;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestMultiplier = multiplier;
        }
      }
    }

    return closestMultiplier;
  }

  /**
   * Get the locant number for a substituent at a specific index
   */
  private getLocantForSubstituent(
    index: number,
    locantTokens: IUPACToken[],
    _multiplierTokens: IUPACToken[]
  ): number {
    if (locantTokens.length === 0) {
      return 1;
    }

    const positions = (locantTokens[0]?.metadata?.positions as number[]) || [];
    const locantPositions = positions.sort((a, b) => a - b);

    return locantPositions[index] ?? locantPositions[0] ?? 1;
  }

  /**
   * Add hydroxyl group (-OH) to specific position
   */
  private addHydroxylGroup(smiles: string, locantTokens: IUPACToken[]): string {
    const chainLength = this.getChainLength(smiles);
    const locant = this.getFirstLocant(locantTokens) ?? 1;
    
    if (process.env.VERBOSE) {
      console.log(`[addHydroxylGroup] smiles="${smiles}", locant=${locant}, chainLength=${chainLength}`);
    }
    
    // For cyclic structures (C1CCCCC1, C1CCOC1, etc.)
    if (smiles.match(/^C1[A-Z0-9]+1$/i)) {
      // Add -OH at specified position
      // Position 1: C1(...) at the start
      if (locant === 1) {
        return smiles.replace(/^C1/, 'C1(O)');
      } else {
        // Position N: find the Nth carbon in the ring
        // Pattern: C1 + (various atoms) + 1
        const match = smiles.match(/^C1(.+)1$/);
        if (match && match[1]) {
          const ringContent = match[1];
          let carbonCount = 1; // C1 is the first carbon
          let insertPos = 2; // Start after "C1"
          
          for (let i = 0; i < ringContent.length; i++) {
            if (ringContent[i] === 'C' || ringContent[i] === 'c') {
              carbonCount++;
              if (carbonCount === locant) {
                insertPos = 2 + i + 1; // Position in original string
                // Insert (O) after this carbon
                return smiles.substring(0, insertPos) + '(O)' + smiles.substring(insertPos);
              }
            }
          }
        }
      }
      return smiles;
    }
    
    // For simple linear chains, add hydroxyl at specified position
    if (smiles.match(/^C+$/)) {
      // If locant is at the end, add as terminal: CCCO
      if (locant === chainLength) {
        const result = smiles.substring(0, smiles.length - 1) + 'CO';
        if (process.env.VERBOSE) {
          console.log(`[addHydroxylGroup] Terminal position, result="${result}"`);
        }
        return result;
      } else {
        // Otherwise, add as branch: CC(O)C for position 2
        const pos = this.findCarbonPosition(smiles, locant);
        const result = smiles.substring(0, pos + 1) + '(O)' + smiles.substring(pos + 1);
        if (process.env.VERBOSE) {
          console.log(`[addHydroxylGroup] Internal position, pos=${pos}, result="${result}"`);
        }
        return result;
      }
    }
    return smiles;
  }

  /**
   * Add carbonyl group (C=O) to specific position
   */
  private addCarbonylGroup(smiles: string, locantTokens: IUPACToken[]): string {
    const chainLength = this.getChainLength(smiles);
    const locant = this.getFirstLocant(locantTokens) ?? 1;
    
    // For cyclic structures (C1CCCCC1, C1CCOC1, etc.)
    if (smiles.match(/^C1[A-Z0-9]+1$/i)) {
      // Add =O at specified position
      // Position 1: C1(...) or =C1(...) at the start
      if (locant === 1) {
        // Check if we need to prepend O= or add (=O)
        // For ketones in rings, we typically use =C1 or C1(=O)
        // Let's use the prepended form for consistency: O=C1...
        return 'O=' + smiles;
      } else {
        // Position N: find the Nth carbon in the ring
        const match = smiles.match(/^C1(.+)1$/);
        if (match && match[1]) {
          const ringContent = match[1];
          let carbonCount = 1; // C1 is the first carbon
          let insertPos = 2; // Start after "C1"
          
          for (let i = 0; i < ringContent.length; i++) {
            if (ringContent[i] === 'C' || ringContent[i] === 'c') {
              carbonCount++;
              if (carbonCount === locant) {
                insertPos = 2 + i + 1; // Position in original string
                // Insert (=O) after this carbon
                return smiles.substring(0, insertPos) + '(=O)' + smiles.substring(insertPos);
              }
            }
          }
        }
      }
      return smiles;
    }
    
    // For simple linear chains, add carbonyl at specified position
    if (smiles.match(/^C+$/)) {
      // If locant is at the end, add as terminal: CCC=O
      if (locant === chainLength) {
        return smiles.substring(0, smiles.length - 1) + 'C=O';
      } else {
        // Otherwise, add as branch: CC(=O)C for position 2
        const pos = this.findCarbonPosition(smiles, locant);
        return smiles.substring(0, pos + 1) + '(=O)' + smiles.substring(pos + 1);
      }
    }
    return smiles;
  }

  /**
   * Add amine group (-NH2) to specific position
   */
  private addAmineGroup(smiles: string, locantTokens: IUPACToken[]): string {
    const _locant = this.getFirstLocant(locantTokens) ?? this.getChainLength(smiles);

    if (smiles.match(/^C+$/)) {
      return smiles.substring(0, smiles.length - 1) + 'CN';
    }
    return smiles;
  }

  /**
   * Add amide group (-CONH2)
   * Example: "ethanamide" -> CC(=O)N
   */
  private addAmideGroup(smiles: string): string {
    if (smiles.match(/^C+$/)) {
      return smiles.substring(0, smiles.length - 1) + 'C(=O)N';
    }
    return smiles;
  }

  /**
   * Add aldehyde group (-CHO)
   */
  private addAldehydeGroup(smiles: string): string {
    if (smiles.match(/^C+$/)) {
      return smiles.substring(0, smiles.length - 1) + 'C=O';
    }
    return smiles;
  }

  /**
   * Add carboxylic acid group (-COOH)
   */
  private addCarboxylicAcidGroup(smiles: string): string {
    if (smiles.match(/^C+$/)) {
      return smiles.substring(0, smiles.length - 1) + 'C(=O)O';
    }
    return smiles;
  }

  /**
   * Add nitrile group (-CN)
   */
  private addNitrileGroup(smiles: string): string {
    if (smiles.match(/^C+$/)) {
      return smiles.substring(0, smiles.length - 1) + 'C#N';
    }
    return smiles;
  }

  /**
   * Add ester group (-COOR) where R comes from substituent
   * For "methyl butanoate": CCCC + methyl -> CCCC(=O)OC
   */
  private addEsterGroup(smiles: string, substituentTokens: IUPACToken[]): string {
    if (smiles.match(/^C+$/)) {
      // Get the alkyl group from substituents (e.g., "methyl" in "methyl butanoate")
      let alkylGroup = 'C'; // Default to methyl
      if (substituentTokens.length > 0 && substituentTokens[0]) {
        const substSmiles = (substituentTokens[0].metadata?.smiles as string) || '';
        alkylGroup = substSmiles.replace(/^-/, ''); // Remove leading dash
      }
      
      return smiles.substring(0, smiles.length - 1) + 'C(=O)O' + alkylGroup;
    }
    return smiles;
  }

  /**
   * Add a substituent group to the main chain
   * Handles branching by inserting substituent at specified locant position
   */
  private addSubstituent(
    parentSmiles: string,
    substSmiles: string,
    locant: number,
    isCyclic: boolean
  ): string {
    // Remove leading dash from substituent SMILES (e.g., "-C" -> "C")
    const cleanSubst = substSmiles.replace(/^-/, '');

    // Handle cyclic structures first (C1CCCCC1, C1=CCCCC1, etc.)
    if (isCyclic) {
      return this.addSubstituentToCycle(parentSmiles, cleanSubst, locant);
    }

    // Check if this is an aromatic ring (c1ccccc1, Cc1ccccc1, c1ccc(cc1), etc.)
    // Pattern: contains aromatic carbons (lowercase c) and ring numbers
    const isAromaticRing = parentSmiles.includes('c') && /c\d/.test(parentSmiles);
    if (isAromaticRing) {
      return this.addSubstituentToAromaticRing(parentSmiles, cleanSubst, locant);
    }

    // Check if this is a linear chain (with or without branches)
    // Pattern: starts with C, contains only C, =, #, (, ), and no ring numbers
    const isLinearChain = /^C[\w=#()]*$/.test(parentSmiles) && !parentSmiles.match(/\d/);
    
    if (isLinearChain) {
      // Check for unsaturated bonds
      if (parentSmiles.includes('=') || parentSmiles.includes('#')) {
        return this.addSubstituentToUnsaturatedChain(parentSmiles, cleanSubst, locant);
      } else {
        return this.addSubstituentToLinearChain(parentSmiles, cleanSubst, locant);
      }
    }

    return parentSmiles;
  }

  /**
   * Add substituent to a simple linear chain
   * Example: CCCC + C at position 2 -> CC(C)CC
   * Handles multiple substituents at same position: CC(C)(C)C
   */
  private addSubstituentToLinearChain(chain: string, substituent: string, locant: number): string {
    const length = this.countCarbons(chain);
    
    // Validate locant
    if (locant < 1 || locant > length) {
      locant = 1;
    }

    // Find the actual position in the SMILES string (accounting for existing branches)
    const insertPos = this.findCarbonPosition(chain, locant);
    
    if (process.env.VERBOSE) {
      console.log(`[addSubstituentToLinearChain] chain="${chain}", substituent="${substituent}", locant=${locant}, insertPos=${insertPos}`);
    }
    
    // Check if there's already a branch at this position
    // Pattern: C(...) means carbon with branch
    if (insertPos < chain.length && chain[insertPos] === 'C') {
      const nextChar = chain[insertPos + 1];
      if (nextChar === '(') {
        // Already has branch, add another branch
        // Find the closing paren and insert new branch after it
        let parenCount = 0;
        let closePos = insertPos + 1;
        for (let i = insertPos + 1; i < chain.length; i++) {
          if (chain[i] === '(') parenCount++;
          else if (chain[i] === ')') {
            parenCount--;
            if (parenCount === 0) {
              closePos = i;
              break;
            }
          }
        }
        const result = chain.substring(0, closePos + 1) + '(' + substituent + ')' + chain.substring(closePos + 1);
        if (process.env.VERBOSE) {
          console.log(`[addSubstituentToLinearChain] Found existing branch, adding after closePos=${closePos}, result="${result}"`);
        }
        return result;
      }
    }
    
    // No existing branch, add new one
    const result = chain.substring(0, insertPos + 1) + 
           '(' + substituent + ')' + 
           chain.substring(insertPos + 1);
    if (process.env.VERBOSE) {
      console.log(`[addSubstituentToLinearChain] No existing branch, result="${result}"`);
    }
    return result;
  }

  /**
   * Count carbons in a SMILES string (ignoring branches)
   */
  private countCarbons(smiles: string): number {
    let count = 0;
    for (let i = 0; i < smiles.length; i++) {
      if (smiles[i] === 'C') count++;
    }
    return count;
  }

  /**
   * Find the position of the nth carbon in a SMILES string (main chain only, skip branches)
   */
  private findCarbonPosition(smiles: string, n: number): number {
    let count = 0;
    let depth = 0; // Track parenthesis depth to skip carbons in branches
    
    for (let i = 0; i < smiles.length; i++) {
      const char = smiles[i];
      
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (char === 'C' && depth === 0) {
        // Only count carbons at depth 0 (main chain)
        count++;
        if (count === n) {
          return i;
        }
      }
    }
    return 0;
  }

  /**
   * Add substituent to unsaturated chain (with = or #)
   * Example: C=CC + C at position 2 -> C=C(C)C
   */
  private addSubstituentToUnsaturatedChain(chain: string, substituent: string, locant: number): string {
    // Find carbon positions (skip bond symbols)
    const carbons: number[] = [];
    for (let i = 0; i < chain.length; i++) {
      if (chain[i] === 'C') {
        carbons.push(i);
      }
    }

    if (locant < 1 || locant > carbons.length) {
      locant = 1;
    }

    const insertPos = carbons[locant - 1];
    if (insertPos === undefined) return chain;

    // Insert substituent after the carbon at locant position
    return chain.substring(0, insertPos + 1) + 
           '(' + substituent + ')' + 
           chain.substring(insertPos + 1);
  }

  /**
   * Add substituent to cyclic structure
   * Example: C1CCCCC1 + C at position 2 -> CC1(C)CCCC1
   * Enhanced to handle cycles with existing branches: C1(O)CCCC1 + C at position 2 -> C1(O)C(C)CCC1
   */
  private addSubstituentToCycle(cycle: string, substituent: string, locant: number): string {
    // For ring: C1CCCCC1 or C1(O)CCCC1 or O=C1CCCC1
    // Position 1: C1 -> C1(subst) or C1(existing)(subst)
    // Position 2: First C after C1 -> C1C(subst) or C1(existing)C(subst)
    
    if (locant === 1) {
      // Add to first carbon
      // Check if C1 already has branches
      if (cycle.match(/^C1\(/)) {
        // Already has branches: C1(...) -> find closing paren and add new branch
        let depth = 0;
        let closePos = 2; // Start after "C1"
        for (let i = 2; i < cycle.length; i++) {
          if (cycle[i] === '(') depth++;
          else if (cycle[i] === ')') {
            depth--;
            if (depth === 0) {
              closePos = i;
              break;
            }
          }
        }
        return cycle.substring(0, closePos + 1) + '(' + substituent + ')' + cycle.substring(closePos + 1);
      } else {
        // No branches yet: C1CCCCC1 -> C1(C)CCCCC1
        return cycle.replace(/^C1/, 'C1(' + substituent + ')');
      }
    } else {
      // Add to nth carbon
      // Need to find the nth carbon in the ring, accounting for branches and functional groups
      // Pattern: [O=]*C1[branches]*[ring content]1
      
      // Strip any leading functional groups (like O=)
      const leadingMatch = cycle.match(/^([O=]*)C1/);
      const prefix = leadingMatch?.[1] || '';
      const restOfCycle = cycle.substring(prefix.length + 2); // After "C1"
      
      // Find the nth carbon (locant-1 because C1 is position 1)
      let carbonCount = 1; // C1 is the first carbon
      let insertPos = prefix.length + 2; // Start after prefix + "C1"
      let depth = 0;
      
      for (let i = 0; i < restOfCycle.length; i++) {
        const char = restOfCycle[i];
        
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        } else if (char === 'C' && depth === 0) {
          // Found a carbon at the main ring level
          carbonCount++;
          if (carbonCount === locant) {
            // This is the carbon we want to add to
            insertPos = prefix.length + 2 + i + 1; // Position after this carbon
            // Check if this carbon already has branches
            if (i + 1 < restOfCycle.length && restOfCycle[i + 1] === '(') {
              // Already has branches - find closing paren
              let branchDepth = 0;
              let branchClosePos = i + 1;
              for (let j = i + 1; j < restOfCycle.length; j++) {
                if (restOfCycle[j] === '(') branchDepth++;
                else if (restOfCycle[j] === ')') {
                  branchDepth--;
                  if (branchDepth === 0) {
                    branchClosePos = j;
                    break;
                  }
                }
              }
              insertPos = prefix.length + 2 + branchClosePos + 1;
            }
            return cycle.substring(0, insertPos) + '(' + substituent + ')' + cycle.substring(insertPos);
          }
        }
      }
    }

    return cycle;
  }

  /**
   * Add substituent to aromatic ring
   * Example: c1ccccc1 + C at position 1 -> Cc1ccccc1
   * Example: c1ccccc1 + C at position 4 -> c1ccc(C)cc1
   */
  private addSubstituentToAromaticRing(ring: string, substituent: string, locant: number): string {
    if (process.env.VERBOSE) {
      console.log(`[addSubstituentToAromaticRing] ring="${ring}", substituent="${substituent}", locant=${locant}`);
    }
    
    // Check if there's already a substituent prepended (e.g., "Cc1ccccc1")
    // Extract the core aromatic ring part
    let coreRing = ring;
    let prefix = '';
    
    // Match any leading substituents (uppercase letters, branches)
    const leadingMatch = ring.match(/^([A-Z][^c]*)/);
    if (leadingMatch && leadingMatch[1]) {
      prefix = leadingMatch[1];
      coreRing = ring.substring(prefix.length);
      if (process.env.VERBOSE) {
        console.log(`[addSubstituentToAromaticRing] Found prefix="${prefix}", coreRing="${coreRing}"`);
      }
    }
    
    // For aromatic rings (5 or 6-membered: furan, thiophene, pyrrole, benzene, pyridine, etc.)
    // Pattern: [nocs]1[nocs]{3,5}1 (e.g., o1cccc1, c1ccsc1, c1ccccc1, n1ccccc1)
    const ringPattern = coreRing.match(/^([nocs])1([nocs=]+)1$/);
    if (ringPattern && ringPattern[1] && ringPattern[2]) {
      const ringSize = ringPattern[2].length + 1; // +1 for the first atom
      
      // Default to position 1 if no locant specified
      if (!locant || locant === 1) {
        // Check if position 1 already has substituent(s)
        if (prefix) {
          // Add to existing substituent at position 1
          const result = prefix + '(' + substituent + ')' + coreRing;
          if (process.env.VERBOSE) {
            console.log(`[addSubstituentToAromaticRing] Position 1 with existing prefix, result="${result}"`);
          }
          return result;
        } else {
          // Simply prepend the substituent: c1ccccc1 -> Cc1ccccc1, n1ccccc1 -> Cn1ccccc1
          const result = substituent + coreRing;
          if (process.env.VERBOSE) {
            console.log(`[addSubstituentToAromaticRing] Position 1 no prefix, result="${result}"`);
          }
          return result;
        }
      }
      
      // Handle positions 2-N for aromatic rings
      // Ring numbering: X1(pos1) Y(pos2) Z(pos3) ... 1
      // where X,Y,Z can be c, n, o, s, etc.
      
      if (locant >= 2 && locant <= ringSize) {
        // Extract all atoms in the ring (not including closing '1')
        const firstAtom = ringPattern[1];
        const middleAtoms = ringPattern[2];
        const atoms = [firstAtom, ...middleAtoms.split('')];
        
        // Build new ring with substituent at correct position
        // Position N means the Nth atom (1-indexed)
        let newRing = atoms[0] + '1'; // First atom with ring number
        for (let i = 1; i < atoms.length; i++) {
          if (i === locant - 1) {
            // This is the position to add the substituent
            newRing += atoms[i] + '(' + substituent + ')';
          } else {
            newRing += atoms[i];
          }
        }
        newRing += '1'; // Close ring
        
        if (process.env.VERBOSE) {
          console.log(`[addSubstituentToAromaticRing] Position ${locant}, result="${prefix + newRing}"`);
        }
        return prefix + newRing;
      }
    }
    
    // For rings with existing substituents, handle more complex cases
    // Check if this ring already has substituents
    if (ring.includes('(')) {
      // Find aromatic carbons (lowercase c) not inside parentheses
      const aromatics = this.findAromaticCarbonPositions(ring);
      
      if (locant > 0 && locant <= aromatics.length) {
        const insertPos = aromatics[locant - 1];
        if (insertPos !== undefined) {
          // Check if there's already a substituent at this position
          if (ring[insertPos + 1] === '(') {
            // Find closing paren and add new substituent
            let depth = 0;
            let closePos = insertPos + 1;
            for (let i = insertPos + 1; i < ring.length; i++) {
              if (ring[i] === '(') depth++;
              else if (ring[i] === ')') {
                depth--;
                if (depth === 0) {
                  closePos = i;
                  break;
                }
              }
            }
            return ring.substring(0, closePos + 1) + '(' + substituent + ')' + ring.substring(closePos + 1);
          } else {
            // No existing substituent, add new one
            return ring.substring(0, insertPos + 1) + '(' + substituent + ')' + ring.substring(insertPos + 1);
          }
        }
      }
    }
    
    // Default: prepend substituent
    return substituent + ring;
  }

  /**
   * Find positions of aromatic carbons (lowercase c) in SMILES, skipping those in branches
   */
  private findAromaticCarbonPositions(smiles: string): number[] {
    const positions: number[] = [];
    let depth = 0;
    
    for (let i = 0; i < smiles.length; i++) {
      const char = smiles[i];
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (char === 'c' && depth === 0) {
        positions.push(i);
      }
    }
    
    return positions;
  }

  /**
   * Get the first locant from locant tokens
   */
  private getFirstLocant(locantTokens: IUPACToken[]): number | null {
    if (locantTokens.length === 0) return null;
    const positions = (locantTokens[0]?.metadata?.positions as number[]) || [];
    return positions.length > 0 ? positions[0]! : null;
  }

  /**
   * Get all locants from locant tokens as a flat array
   */
  private getAllLocants(locantTokens: IUPACToken[]): number[] {
    const allLocants: number[] = [];
    for (const token of locantTokens) {
      const positions = (token.metadata?.positions as number[]) || [];
      allLocants.push(...positions);
    }
    return allLocants;
  }

  /**
   * Get the length of a simple carbon chain
   */
  private getChainLength(smiles: string): number {
    const match = smiles.match(/^C+/);
    return match ? match[0].length : 0;
  }

  /**
   * Convert linear carbon chain to cyclic
   * Example: CCCCCC -> C1CCCCC1
   */
  private makeCyclic(smiles: string): string {
    if (!smiles.match(/^C+$/)) {
      return smiles; // Only works for simple linear chains
    }
    
    const length = smiles.length;
    if (length < 3) {
      return smiles; // Can't make rings smaller than 3
    }

    // Create cyclic SMILES: C1 + (C * (n-1)) + 1
    return 'C1' + 'C'.repeat(length - 1) + '1';
  }

  /**
   * Apply unsaturation (ene, yne, diene, triene) to the carbon chain
   */
  private applyUnsaturation(
    smiles: string,
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    isCyclic: boolean
  ): string {
    const unsaturatedSuffixes = suffixTokens.filter(
      s => s.metadata?.suffixType === 'unsaturated'
    );

    if (unsaturatedSuffixes.length === 0) {
      return smiles;
    }

    let result = smiles;

    for (const suffix of unsaturatedSuffixes) {
      const suffixValue = suffix.value.toLowerCase();

      // Check for diene/triene BEFORE checking for ene (since "diene" contains "ene")
      if (suffixValue === 'diene') {
        // Two double bonds - get all locants
        const locants = this.getAllLocants(locantTokens);
        if (locants.length >= 2) {
          // Add double bonds at each specified position
          for (let i = 0; i < 2 && i < locants.length; i++) {
            const loc = locants[i];
            if (loc !== undefined) {
              result = this.addDoubleBondAtPosition(result, loc, isCyclic);
            }
          }
        } else {
          // Fallback to single double bond
          result = this.addDoubleBond(result, locantTokens, isCyclic);
        }
      } else if (suffixValue === 'triene') {
        // Three double bonds - get all locants
        const locants = this.getAllLocants(locantTokens);
        if (locants.length >= 3) {
          // Add double bonds at each specified position
          for (let i = 0; i < 3 && i < locants.length; i++) {
            const loc = locants[i];
            if (loc !== undefined) {
              result = this.addDoubleBondAtPosition(result, loc, isCyclic);
            }
          }
        } else {
          // Fallback to single double bond
          result = this.addDoubleBond(result, locantTokens, isCyclic);
        }
      } else if (suffixValue === 'yne' || suffixValue.includes('yne')) {
        // Triple bond
        result = this.addTripleBond(result, locantTokens, isCyclic);
      } else if (suffixValue === 'ene' || suffixValue.includes('ene')) {
        // Single double bond (check this LAST since diene/triene contain 'ene')
        result = this.addDoubleBond(result, locantTokens, isCyclic);
      }
    }

    return result;
  }

  /**
   * Add a double bond to the carbon chain
   */
  private addDoubleBond(smiles: string, locantTokens: IUPACToken[], isCyclic: boolean): string {
    const locant = this.getFirstLocant(locantTokens);
    
    // For simple linear alkanes: CCC -> C=CC (default position 1)
    // For but-2-ene: CCCC with locant 2 -> CC=CC
    if (smiles.match(/^C+$/) && !isCyclic) {
      const length = smiles.length;
      const position = locant && locant >= 1 && locant < length ? locant : 1;
      
      // Insert double bond at position
      const before = 'C'.repeat(position - 1);
      const after = 'C'.repeat(length - position);
      return before + 'C=' + after;
    }

    // For cyclic: C1CCCCC1 -> C1=CCCCC1 (default position 1)
    if (isCyclic && smiles.match(/^C1C+1$/)) {
      return smiles.replace(/^C1C/, 'C1=C');
    }

    return smiles;
  }

  /**
   * Add a double bond at a specific position
   * Handles chains that may already have double bonds
   */
  private addDoubleBondAtPosition(smiles: string, position: number, isCyclic: boolean): string {
    // For simple chains: CCCC -> C=CCC (position 1) or CC=CC (position 2)
    if (!smiles.includes('=') && !smiles.includes('#') && !isCyclic) {
      // Simple case - no existing bonds
      const length = this.countCarbons(smiles);
      if (position >= 1 && position < length) {
        const before = 'C'.repeat(position - 1);
        const after = 'C'.repeat(length - position);
        return before + 'C=' + after;
      }
    } else if (smiles.includes('=')) {
      // Already has double bond(s) - need to insert another
      // For CCCC with double bond at 1: C=CCC, now add at 3: C=CC=C
      const carbons = this.findAllCarbonPositions(smiles);
      if (position >= 1 && position < carbons.length) {
        const insertIdx = carbons[position - 1];
        if (insertIdx !== undefined && insertIdx < smiles.length - 1) {
          // Check if next character is already a bond
          if (smiles[insertIdx + 1] !== '=' && smiles[insertIdx + 1] !== '#') {
            return smiles.substring(0, insertIdx + 1) + '=' + smiles.substring(insertIdx + 1);
          }
        }
      }
    }
    
    return smiles;
  }

  /**
   * Find positions of all carbons in SMILES string
   */
  private findAllCarbonPositions(smiles: string): number[] {
    const positions: number[] = [];
    for (let i = 0; i < smiles.length; i++) {
      if (smiles[i] === 'C') {
        positions.push(i);
      }
    }
    return positions;
  }

  /**
   * Add a triple bond to the carbon chain
   */
  private addTripleBond(smiles: string, locantTokens: IUPACToken[], _isCyclic: boolean): string {
    const locant = this.getFirstLocant(locantTokens);
    
    // For simple linear alkanes: CCC -> C#CC (default position 1)
    if (smiles.match(/^C+$/)) {
      const length = smiles.length;
      const position = locant && locant >= 1 && locant < length ? locant : 1;
      
      // Insert triple bond at position
      const before = 'C'.repeat(position - 1);
      const after = 'C'.repeat(length - position);
      return before + 'C#' + after;
    }

    return smiles;
  }
}
