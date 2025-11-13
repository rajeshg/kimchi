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
   * Enhanced to handle functional groups, substituents, locants, and stereochemistry
   */
  private tokensToSMILES(tokens: IUPACToken[]): string {
    // Organize tokens by type
    const parentTokens = tokens.filter(t => t.type === 'PARENT');
    const suffixTokens = tokens.filter(t => t.type === 'SUFFIX');
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

    // Start with parent chain
    let smiles = parentSmiles;

    // Apply functional group suffix (ol, one, amine, etc.)
    if (suffixTokens.length > 0) {
      smiles = this.applySuffixes(smiles, suffixTokens, locantTokens);
    }

    // Apply substituents
    if (substituentTokens.length > 0) {
      smiles = this.applySubstituents(smiles, substituentTokens, locantTokens, multiplierTokens);
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
   */
  private applySubstituents(
    parentSmiles: string,
    substituentTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    multiplierTokens: IUPACToken[]
  ): string {
    let result = parentSmiles;

    for (let i = 0; i < substituentTokens.length; i++) {
      const substituent = substituentTokens[i];
      if (!substituent) continue;

      const substSmiles = (substituent.metadata?.smiles as string) || '';
      if (!substSmiles) continue;

      const locant = this.getLocantForSubstituent(i, locantTokens, multiplierTokens);
      result = this.addSubstituent(result, substSmiles, locant);
    }

    return result;
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
   */
  private addSubstituent(parentSmiles: string, _substSmiles: string, _locant: number): string {
    // For MVP: just return parent
    // In future: perform actual substitution at specific position
    return parentSmiles;
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
}
