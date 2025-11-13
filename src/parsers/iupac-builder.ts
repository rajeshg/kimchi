import type { Molecule } from 'types';
import type {
  IUPACToken,
  OPSINRules,
} from './iupac-types';
import { parseSMILES } from 'index';

/**
 * IUPAC builder - MVP version that handles basic alkanes and simple functional groups
 * Strategy: For MVP, directly construct SMILES from tokens, then parse with existing SMILES parser
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

    // For MVP: extract the essential information and try to reconstruct SMILES
    const smiles = this.tokensToSMILES(tokens);
    
    const result = parseSMILES(smiles);
    if (result.molecules.length === 0 || !result.molecules[0]) {
      throw new Error(`Failed to parse constructed SMILES: ${smiles}`);
    }

    return result.molecules[0];
  }

  /**
   * Convert token stream to SMILES string
   * This is a simplified MVP approach - handles basic cases
   */
  private tokensToSMILES(tokens: IUPACToken[]): string {
    let smiles = '';
    let parentSmiles = '';
    let suffixChain = '';

    // Find parent chain
    for (const token of tokens) {
      if (token.type === 'PARENT') {
        const tokenSmiles = token.metadata?.smiles as string;
        if (tokenSmiles) {
          parentSmiles = tokenSmiles;
          break;
        }
      }
    }

    if (!parentSmiles) {
      throw new Error('No parent chain found in tokens');
    }

    // For MVP, just use the parent chain
    // TODO: Add suffix and substituent handling
    smiles = parentSmiles;

    return smiles;
  }
}
