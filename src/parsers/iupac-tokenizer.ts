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

         // Try each token type in priority order (stereo before prefix to avoid s- conflicts)
         const token =
           this.tryStereo(remaining, pos) ||
           this.tryPrefix(remaining, pos) ||
           this.tryLocant(remaining, pos) ||
           this.tryMultiplier(remaining, pos) ||
           this.trySuffix(remaining, pos) ||
           this.trySubstituent(remaining, pos) ||
           this.tryParent(remaining, pos);

         if (token) {
           tokens.push(token);
           pos += token.length;
         } else {
           // Skip whitespace, hyphens, and special characters (parentheses, brackets, commas)
           const nextChar = remaining[0];
           if (nextChar && /[\s\-\(\)\[\],]/.test(nextChar)) {
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
     * Try to match a prefix (N-, O-, S-, etc.)
     */
   private tryPrefix(str: string, pos: number): IUPACToken | null {
     // Common prefixes for substitution on heteroatoms
     const prefixes = ['n-', 'o-', 's-', 'c-', 'x-'];
     
     for (const prefix of prefixes) {
       if (str.startsWith(prefix)) {
         // Must be followed by alphabetic characters (start of substituent name)
         const nextChar = str[prefix.length];
         if (nextChar && /[a-z]/.test(nextChar)) {
           return {
             type: 'PREFIX',
             value: prefix.substring(0, prefix.length - 1), // Remove hyphen
             position: pos,
             length: prefix.length,
           };
         }
       }
     }

     return null;
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
     * Context-aware: Only matches in valid positions
     * - E/Z: Before lowercase letters (not preceded by 'th' from 'ethene')
     * - R/S: Before lowercase letters
     * - @/@@ : In bridged nomenclature contexts
     */
     private tryStereo(str: string, pos: number): IUPACToken | null {
       // Check for @ or @@ (von Baeyer bridged bicyclic stereochemistry)
       if (str.startsWith("@@")) {
         // Must be followed by a digit, hyphen, space, or letter
         const nextChar = str.charAt(2);
         if (!nextChar || /[\s\d\-a-z]/.test(nextChar)) {
           return {
             type: 'STEREO',
             value: '@@',
             position: pos,
             length: 2,
             metadata: { type: 'von-baeyer' },
           };
         }
       } else if (str.startsWith("@")) {
         const nextChar = str.charAt(1);
         if (!nextChar || /[\s\d\-a-z@]/.test(nextChar)) {
           return {
             type: 'STEREO',
             value: '@',
             position: pos,
             length: 1,
             metadata: { type: 'von-baeyer' },
           };
         }
       }

       // Check for E/Z stereochemistry - allow dash or closing paren after
       // E.g., "(E)-", "(Z)-" or "2-e-" patterns
       if (str[0] === 'e' && str[1] && /[\-\)]/.test(str[1])) {
         return {
           type: 'STEREO',
           value: 'e',
           position: pos,
           length: 1,
           metadata: { type: 'alkene', config: 'E' },
         };
       } else if (str[0] === 'z' && str[1] && /[\-\)]/.test(str[1])) {
         return {
           type: 'STEREO',
           value: 'z',
           position: pos,
           length: 1,
           metadata: { type: 'alkene', config: 'Z' },
         };
       }

       // Check for R/S stereochemistry (stereocenters) - allow dash, comma, or closing paren after
       if (str[0] === 'r' && str[1] && /[\-\),]/.test(str[1])) {
         return {
           type: 'STEREO',
           value: 'r',
           position: pos,
           length: 1,
           metadata: { type: 'stereocenter', config: 'R' },
         };
       } else if (str[0] === 's' && str[1] && /[\-\),]/.test(str[1])) {
         return {
           type: 'STEREO',
           value: 's',
           position: pos,
           length: 1,
           metadata: { type: 'stereocenter', config: 'S' },
         };
       }

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
