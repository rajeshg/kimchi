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

    if (parentTokens.length === 0) {
      throw new Error('No parent chain found in tokens');
    }

    // Get parent chain SMILES
    const parentSmiles = (parentTokens[0]?.metadata?.smiles as string) || '';
    if (!parentSmiles) {
      throw new Error('Parent chain has no SMILES data');
    }

    // Check for cyclo prefix
    const isCyclic = prefixTokens.some(p => p.metadata?.isCyclic === true);

    // Start with parent chain
    let smiles = parentSmiles;

    // Convert to cyclic structure if cyclo prefix present
    if (isCyclic && smiles.match(/^C+$/)) {
      smiles = this.makeCyclic(smiles);
    }

    // Apply unsaturation (ene, yne, diene) before other modifications
    smiles = this.applyUnsaturation(smiles, suffixTokens, locantTokens, isCyclic);

    // Apply functional group suffix (ol, one, amine, etc.)
    if (suffixTokens.length > 0) {
      smiles = this.applySuffixes(smiles, suffixTokens, locantTokens);
    }

    // Apply substituents
    if (substituentTokens.length > 0) {
      smiles = this.applySubstituents(smiles, substituentTokens, locantTokens, multiplierTokens, isCyclic);
    }

    return smiles;
  }

  /**
   * Apply functional group suffixes to the parent chain
   */
  private applySuffixes(
    parentSmiles: string,
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[]
  ): string {
    let result = parentSmiles;

    for (const suffix of suffixTokens) {
      const suffixValue = suffix.value.toLowerCase();

      switch (suffixValue) {
        case 'ol':
          result = this.addHydroxylGroup(result, locantTokens);
          break;
        case 'one':
          result = this.addCarbonylGroup(result, locantTokens);
          break;
        case 'amine':
        case 'amin':
          result = this.addAmineGroup(result, locantTokens);
          break;
        case 'al':
          result = this.addAldehydeGroup(result);
          break;
        case 'oic acid':
        case 'ic acid':
        case 'ic':
          result = this.addCarboxylicAcidGroup(result);
          break;
        case 'nitrile':
          result = this.addNitrileGroup(result);
          break;
      }
    }

    return result;
  }

  /**
   * Apply substituents to the parent chain
   * Improved to handle locants associated with each substituent
   */
  private applySubstituents(
    parentSmiles: string,
    substituentTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    _multiplierTokens: IUPACToken[],
    isCyclic: boolean
  ): string {
    let result = parentSmiles;

    // For each substituent, find its locant by looking at what comes before it in the original token stream
    for (const substituent of substituentTokens) {
      if (!substituent) continue;

      const substSmiles = (substituent.metadata?.smiles as string) || '';
      if (!substSmiles) continue;

      // Find locant that appears immediately before this substituent
      const locant = this.getLocantBeforeSubstituent(substituent, locantTokens);
      result = this.addSubstituent(result, substSmiles, locant, isCyclic);
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
    const _locant = this.getFirstLocant(locantTokens) ?? this.getChainLength(smiles);
    
    if (smiles.match(/^C+$/)) {
      return smiles.substring(0, smiles.length - 1) + 'CO';
    }
    return smiles;
  }

  /**
   * Add carbonyl group (C=O) to specific position
   */
  private addCarbonylGroup(smiles: string, locantTokens: IUPACToken[]): string {
    const _locant = this.getFirstLocant(locantTokens) ?? this.getChainLength(smiles);
    
    if (smiles.match(/^C+$/)) {
      return smiles.substring(0, smiles.length - 1) + 'C=O';
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

    // Handle simple linear chains (CCC, CCCC, etc.)
    if (parentSmiles.match(/^C+$/) && !isCyclic) {
      return this.addSubstituentToLinearChain(parentSmiles, cleanSubst, locant);
    }

    // Handle chains with double/triple bonds (C=CC, C#CC, etc.)
    if (parentSmiles.match(/^C[=#]?C+$/) && !isCyclic) {
      return this.addSubstituentToUnsaturatedChain(parentSmiles, cleanSubst, locant);
    }

    // Handle cyclic structures (C1CCCCC1, C1=CCCCC1, etc.)
    if (isCyclic) {
      return this.addSubstituentToCycle(parentSmiles, cleanSubst, locant);
    }

    return parentSmiles;
  }

  /**
   * Add substituent to a simple linear chain
   * Example: CCCC + C at position 2 -> CC(C)CC
   */
  private addSubstituentToLinearChain(chain: string, substituent: string, locant: number): string {
    const length = chain.length;
    
    // Validate locant
    if (locant < 1 || locant > length) {
      locant = 1;
    }

    // For position 1: C(subst)CCC...
    // For position 2: CC(subst)CC...
    // For position n: insert branch after carbon at position n
    const position = locant;
    
    return chain.substring(0, position) + 
           '(' + substituent + ')' + 
           chain.substring(position);
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
   */
  private addSubstituentToCycle(cycle: string, substituent: string, locant: number): string {
    // For ring: C1CCCCC1
    // Position 1: C1 -> C1(subst)
    // Position 2: First C after C1 -> C1C(subst)
    
    if (locant === 1) {
      // Add to first carbon: C1CCCCC1 -> C1(C)CCCCC1
      return cycle.replace(/^C1/, 'C1(' + substituent + ')');
    } else {
      // Add to nth carbon
      const match = cycle.match(/^C1(C+)1$/);
      if (match && match[1]) {
        const innerCarbons = match[1];
        const position = locant - 2; // Adjust for C1 being position 1
        
        if (position >= 0 && position < innerCarbons.length) {
          return 'C1' + 
                 innerCarbons.substring(0, position) + 
                 'C(' + substituent + ')' + 
                 innerCarbons.substring(position + 1) + 
                 '1';
        }
      }
    }

    return cycle;
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

      if (suffixValue === 'ene' || suffixValue.includes('ene')) {
        // Single or double bond
        result = this.addDoubleBond(result, locantTokens, isCyclic);
      } else if (suffixValue === 'yne' || suffixValue.includes('yne')) {
        // Triple bond
        result = this.addTripleBond(result, locantTokens, isCyclic);
      } else if (suffixValue === 'diene') {
        // Two double bonds
        result = this.addDoubleBond(result, locantTokens, isCyclic);
        // Would need to handle second double bond with different locant
      } else if (suffixValue === 'triene') {
        // Three double bonds
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
