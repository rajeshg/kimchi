import type {
  IUPACToken,
  IUPACTokenType,
  IUPACTokenizationResult,
  OPSINRules,
} from './iupac-types';

/**
 * IUPAC tokenizer - converts IUPAC name strings into semantic tokens
 * Uses greedy longest-match algorithm with priority ordering
 */
export class IUPACTokenizer {
  private rules: OPSINRules;
  private locantRegex: RegExp;
  private stereoRegex: RegExp;

  constructor(rules: OPSINRules) {
    this.rules = rules;
    this.locantRegex = /^\d+(?:,\d+)*/;
    this.stereoRegex = /^(?:@{1,2}|E|Z|R|S)/i;
  }

   /**
    * Tokenize an IUPAC name into semantic units
    */
   tokenize(name: string): IUPACTokenizationResult {
     const normalized = name.toLowerCase().trim();
     const tokens: IUPACToken[] = [];
     const errors: string[] = [];
     let pos = 0;

     while (pos < normalized.length) {
       const remaining = normalized.substring(pos);

       // Try each token type in priority order
       const token =
         this.tryLocant(remaining, pos) ||
         this.tryStereo(remaining, pos) ||
         this.tryMultiplier(remaining, pos) ||
         this.trySuffix(remaining, pos) ||
         this.trySubstituent(remaining, pos) ||
         this.tryParent(remaining, pos);

       if (token) {
         tokens.push(token);
         pos += token.length;
       } else {
         // Skip whitespace and hyphens
         const nextChar = remaining[0];
         if (nextChar && /[\s-]/.test(nextChar)) {
           pos++;
           continue;
         }
         // Only report errors for non-whitespace characters that couldn't be tokenized
         errors.push(`Cannot tokenize at position ${pos}: ${nextChar || 'EOF'}`);
         pos++;
       }
     }

     return { tokens, errors };
   }

  /**
   * Try to match a locant (position number like "1", "2,3", "1,2,4")
   */
  private tryLocant(str: string, pos: number): IUPACToken | null {
    const match = this.locantRegex.exec(str);
    if (!match) return null;

    // Must be followed by a hyphen or dash
    const nextChar = str[match[0].length];
    if (!nextChar || !nextChar.match(/[-]/)) {
      return null;
    }

    const positions = match[0].split(',').map(Number);
    return {
      type: 'LOCANT',
      value: match[0],
      position: pos,
      length: match[0].length,
      metadata: {
        positions,
      },
    };
  }

   /**
    * Try to match stereochemistry marker (@, @@, E, Z, R, S)
    * Note: Stereo matching is disabled for MVP - will be implemented in future version
    * This prevents false matches like 'e' in 'ethene' being matched as E stereochemistry
    */
   private tryStereo(_str: string, _pos: number): IUPACToken | null {
     // Stereo matching disabled for MVP
     // TODO: Implement proper stereo matching that only works in specific contexts
     return null;
   }

  /**
   * Try to match a multiplier (di, tri, tetra, etc.)
   */
  private tryMultiplier(str: string, pos: number): IUPACToken | null {
    // Check basic multipliers
    for (const [num, name] of Object.entries(this.rules.multipliers.basic)) {
      if (str.startsWith(name)) {
        // Validate it's followed by a valid continuation
        const nextPos = name.length;
        if (nextPos >= str.length) return null;
        
        const nextChar = str[nextPos];
        if (!nextChar || !nextChar.match(/[a-z]/)) return null;

        return {
          type: 'MULTIPLIER',
          value: name,
          position: pos,
          length: name.length,
          metadata: { count: parseInt(num) },
        };
      }
    }

    return null;
  }

  /**
   * Try to match a suffix (ol, one, al, amine, acid, etc.)
   */
  private trySuffix(str: string, pos: number): IUPACToken | null {
    // Try longest matches first
    const suffixEntries = Object.entries(this.rules.suffixes).sort(
      (a, b) => b[0].length - a[0].length
    );

    for (const [suffix, suffixData] of suffixEntries) {
      if (str.startsWith(suffix)) {
        // Verify it's at a suffix boundary (end of string or after letter)
        const nextPos = suffix.length;
        const nextChar = str[nextPos];
        if (nextChar && nextChar.match(/[0-9]/)) {
          // Could be continuation with locant
          continue;
        }

        return {
          type: 'SUFFIX',
          value: suffix,
          position: pos,
          length: suffix.length,
          metadata: {
            suffixType: suffixData.type,
          },
        };
      }
    }

    return null;
  }

  /**
   * Try to match a substituent (methyl, ethyl, chloro, bromo, etc.)
   */
  private trySubstituent(str: string, pos: number): IUPACToken | null {
    // Try longest SMILES values first (usually longer names)
    const substEntries = Object.entries(this.rules.substituents).sort(
      (a, b) => {
        const aLen = Math.max(...a[1].aliases.map(x => x.length));
        const bLen = Math.max(...b[1].aliases.map(x => x.length));
        return bLen - aLen;
      }
    );

    for (const [smiles, data] of substEntries) {
      for (const alias of data.aliases) {
        if (str.startsWith(alias)) {
          return {
            type: 'SUBSTITUENT',
            value: alias,
            position: pos,
            length: alias.length,
            metadata: {
              smiles,
              fullAliases: data.aliases,
            },
          };
        }
      }
    }

    return null;
  }

  /**
   * Try to match a parent chain (alkane or ring system)
   */
  private tryParent(str: string, pos: number): IUPACToken | null {
    // Try ring systems first (usually longer)
    const ringSystems = Object.entries(this.rules.ringSystems).sort(
      (a, b) => {
        const aLen = Math.max(...a[1].aliases.map(x => x.length));
        const bLen = Math.max(...b[1].aliases.map(x => x.length));
        return bLen - aLen;
      }
    );

    for (const [smiles, data] of ringSystems) {
      for (const alias of data.aliases) {
        if (str.startsWith(alias)) {
          return {
            type: 'PARENT',
            value: alias,
            position: pos,
            length: alias.length,
            metadata: {
              smiles,
              labels: data.labels,
              isRing: true,
            },
          };
        }
      }
    }

    // Try alkanes
    for (const [smiles, name] of Object.entries(this.rules.alkanes)) {
      if (str.startsWith(name)) {
        return {
          type: 'PARENT',
          value: name,
          position: pos,
          length: name.length,
          metadata: {
            smiles,
            atomCount: smiles.length,
            isRing: false,
          },
        };
      }
    }

    // Try alkane stem components (for longer chains)
    for (const [num, names] of Object.entries(this.rules.alkaneStemComponents.hundreds)) {
      const nameList = names.split('|');
      for (const nm of nameList) {
        if (str.startsWith(nm)) {
          return {
            type: 'PARENT',
            value: nm,
            position: pos,
            length: nm.length,
            metadata: {
              numPart: 'hundreds',
              number: parseInt(num),
            },
          };
        }
      }
    }

    for (const [num, names] of Object.entries(this.rules.alkaneStemComponents.tens)) {
      const nameList = names.split('|');
      for (const nm of nameList) {
        if (str.startsWith(nm)) {
          return {
            type: 'PARENT',
            value: nm,
            position: pos,
            length: nm.length,
            metadata: {
              numPart: 'tens',
              number: parseInt(num),
            },
          };
        }
      }
    }

    for (const [num, names] of Object.entries(this.rules.alkaneStemComponents.units)) {
      const nameList = names.split('|');
      for (const nm of nameList) {
        if (str.startsWith(nm)) {
          return {
            type: 'PARENT',
            value: nm,
            position: pos,
            length: nm.length,
            metadata: {
              numPart: 'units',
              number: parseInt(num),
            },
          };
        }
      }
    }

    return null;
  }
}
