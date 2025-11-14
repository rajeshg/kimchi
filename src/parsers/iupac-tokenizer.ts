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

        // Use longest-match strategy to handle ambiguous cases like "oxo" vs "oxolan"
        // Priority order (checked in sequence, but longest match wins for ambiguous cases):
        // 1. Stereo markers (E/Z/R/S/@) - highest priority, no ambiguity
        // 2. Prefixes (N-, O-) - must have hyphen, no ambiguity
        // 3. Locants (position numbers) - no ambiguity
        // 4. Multipliers, Substituents, Parents, Suffixes - use longest match
        
        const stereo = this.tryStereo(remaining, pos);
        if (stereo) {
          tokens.push(stereo);
          pos += stereo.length;
          continue;
        }
        
        const prefix = this.tryPrefix(remaining, pos);
        if (prefix) {
          tokens.push(prefix);
          pos += prefix.length;
          continue;
        }
        
        const locant = this.tryLocant(remaining, pos);
        if (locant) {
          tokens.push(locant);
          pos += locant.length;
          continue;
        }
        
        // For potentially ambiguous matches, collect all candidates and pick longest
        const candidates: IUPACToken[] = [];
        
        const multiplier = this.tryMultiplier(remaining, pos);
        if (multiplier) candidates.push(multiplier);
        
        const substituent = this.trySubstituent(remaining, pos);
        if (substituent) candidates.push(substituent);
        
        const parent = this.tryParent(remaining, pos);
        if (parent) candidates.push(parent);
        
        const suffix = this.trySuffix(remaining, pos);
        if (suffix) candidates.push(suffix);
        
        // Choose longest match
        if (candidates.length > 0) {
          const longest = candidates.reduce((prev, curr) => 
            curr.length > prev.length ? curr : prev
          );
          tokens.push(longest);
          pos += longest.length;
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
    * Also handles compound prefixes like "N,N-", "N,O-"
    */
   private tryPrefix(str: string, pos: number): IUPACToken | null {
     // Check for compound atom locant prefixes (e.g., "N,N-", "N,O-", "O,O-")
     const compoundMatch = /^([nNosOS])(?:,([nNosOS]))*-/.exec(str);
     if (compoundMatch) {
       const prefixValue = compoundMatch[0].slice(0, -1); // Remove trailing hyphen
       const nextChar = str[compoundMatch[0].length];
       // Must be followed by alphabetic characters
       if (nextChar && /[a-z]/.test(nextChar)) {
         return {
           type: 'PREFIX',
           value: prefixValue.toLowerCase(),
           position: pos,
           length: compoundMatch[0].length,
           metadata: {
             isCompound: true,
           },
         };
       }
     }

      // Check for cyclo/bicyclo/tricyclo prefixes with optional heteroatom prefix
      // Heteroatom replacements: oxa (O), aza (N), thia (S), phospha (P), etc.
      // Also handle bridge notation: [n.m.p] for bicyclic or [n.m.p.q.r.s] for tricyclic
      const heteroAtomPrefixes = ['oxa', 'aza', 'thia', 'phospha', 'arsa', 'stiba', 'bismuta', 'selena', 'tellura'];
      const cycloPatterns = ['tricyclo', 'bicyclo', 'cyclo'];
      
      for (const heteroPrefix of heteroAtomPrefixes) {
        for (const pattern of cycloPatterns) {
          const compound = heteroPrefix + pattern;
          if (str.startsWith(compound)) {
            let matchLength = compound.length;
            // Check for bridge notation [n.m.p] or [n.m.p.q.r.s]
            if (str[matchLength] === '[') {
              const closeIdx = str.indexOf(']', matchLength);
              if (closeIdx > matchLength) {
                matchLength = closeIdx + 1;
              }
            }
            const nextChar = str[matchLength];
            if (!nextChar || /[a-z\s]/.test(nextChar)) {
              return {
                type: 'PREFIX',
                value: str.substring(pos, pos + matchLength).toLowerCase(),
                position: pos,
                length: matchLength,
                metadata: {
                  isCyclic: true,
                  heteroAtom: true,
                  hasBridgeNotation: str[compound.length] === '[',
                },
              };
            }
          }
        }
      }
      
      for (const pattern of cycloPatterns) {
        if (str.startsWith(pattern)) {
          let matchLength = pattern.length;
          // Check for bridge notation [n.m.p] or [n.m.p.q.r.s]
          if (str[matchLength] === '[') {
            const closeIdx = str.indexOf(']', matchLength);
            if (closeIdx > matchLength) {
              matchLength = closeIdx + 1;
            }
          }
          const nextChar = str[matchLength];
          // Must be followed by alphabetic character or whitespace (end of prefix)
          if (!nextChar || /[a-z\s]/.test(nextChar)) {
            return {
              type: 'PREFIX',
              value: str.substring(pos, pos + matchLength).toLowerCase(),
              position: pos,
              length: matchLength,
              metadata: {
                isCyclic: true,
                hasBridgeNotation: str[pattern.length] === '[',
              },
            };
          }
        }
      }

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
   * Also handles hydrogen notation like "1H-", "2H-"
   */
  private tryLocant(str: string, pos: number): IUPACToken | null {
    // Check for hydrogen count notation (e.g., "1H-", "2H-")
    const hydrogenMatch = /^(\d+)[hH]-/.exec(str);
    if (hydrogenMatch && hydrogenMatch[1]) {
      return {
        type: 'LOCANT',
        value: hydrogenMatch[0].slice(0, -1), // Remove trailing hyphen
        position: pos,
        length: hydrogenMatch[0].length,
        metadata: {
          hydrogenCount: parseInt(hydrogenMatch[1]),
          isHydrogenNotation: true,
        },
      };
    }

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
   * Includes both basic (di, tri) and group multipliers (bis, tris)
   * Multipliers must be followed by substituents or functional groups, NOT by alkane suffixes
   */
  private tryMultiplier(str: string, pos: number): IUPACToken | null {
    // Check group multipliers first (bis, tris, etc.) - used for complex substituents
    if (this.rules.multipliers.group) {
      for (const [num, name] of Object.entries(this.rules.multipliers.group)) {
        if (str.startsWith(name)) {
          const nextPos = name.length;
          if (nextPos >= str.length) return null;
          
          const nextChar = str[nextPos];
          // Group multipliers typically followed by opening paren or letter
          if (nextChar && /[a-z(]/.test(nextChar)) {
            return {
              type: 'MULTIPLIER',
              value: name,
              position: pos,
              length: name.length,
              metadata: { count: parseInt(num), isGroup: true },
            };
          }
        }
      }
    }

    // Check basic multipliers
    for (const [num, name] of Object.entries(this.rules.multipliers.basic)) {
      if (str.startsWith(name)) {
        // Validate it's followed by a valid continuation
        const nextPos = name.length;
        if (nextPos >= str.length) return null;
        
        const nextChar = str[nextPos];
        if (!nextChar || !nextChar.match(/[a-z]/)) return null;

        // Don't match if followed by alkane/alkene suffixes (these indicate parent chain)
        // "ane", "ene", "yne" are definite alkane suffixes
        // "an" followed by suffix (ol, oic, al, etc.) also indicates parent chain
        const remainder = str.substring(nextPos);
        if (remainder.startsWith('ane') || 
            remainder.startsWith('ene') || 
            remainder.startsWith('yne') ||
            /^an[eo]/.test(remainder)) {  // "ano", "ane" patterns
          return null;
        }

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
   * Uses longest-match strategy to handle overlapping aliases
   */
  private tryParent(str: string, pos: number): IUPACToken | null {
    let bestMatch: IUPACToken | null = null;

    // Try ring systems first - collect ALL matches and choose longest
    for (const [smiles, data] of Object.entries(this.rules.ringSystems)) {
      for (const alias of data.aliases) {
        if (str.startsWith(alias)) {
          if (!bestMatch || alias.length > bestMatch.length) {
            bestMatch = {
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
    }

    // If we found a ring system match, return it
    if (bestMatch) return bestMatch;

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
          // Validate that stem component is followed by valid continuation
          const nextPos = nm.length;
          const remainder = str.substring(nextPos);
          
          // Must be followed by: alkane suffix (ane/ene/yne/an), another stem, or end/hyphen
          if (remainder.length === 0 || remainder[0] === '-') {
            // OK: end of string or hyphen
          } else if (/^(ane|ene|yne|an[eo])/.test(remainder)) {
            // OK: alkane suffix
          } else {
            // Check if followed by another stem component (tens or units)
            let isValidStem = false;
            for (const stemNames of [...Object.values(this.rules.alkaneStemComponents.tens), ...Object.values(this.rules.alkaneStemComponents.units)]) {
              const stemList = stemNames.split('|');
              for (const s of stemList) {
                if (remainder.startsWith(s)) {
                  isValidStem = true;
                  break;
                }
              }
              if (isValidStem) break;
            }
            if (!isValidStem) {
              // Not a valid alkane stem continuation - skip this match
              continue;
            }
          }
          
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
          // Validate that stem component is followed by valid continuation
          const nextPos = nm.length;
          const remainder = str.substring(nextPos);
          
          // Must be followed by: alkane suffix (ane/ene/yne/an), another stem, or end/hyphen
          if (remainder.length === 0 || remainder[0] === '-') {
            // OK: end of string or hyphen
          } else if (/^(ane|ene|yne|an[eo])/.test(remainder)) {
            // OK: alkane suffix
          } else {
            // Check if followed by another stem component
            let isValidStem = false;
            for (const stemNames of Object.values(this.rules.alkaneStemComponents.units)) {
              const stemList = stemNames.split('|');
              for (const s of stemList) {
                if (remainder.startsWith(s)) {
                  isValidStem = true;
                  break;
                }
              }
              if (isValidStem) break;
            }
            if (!isValidStem) {
              // Not a valid alkane stem continuation - skip this match
              continue;
            }
          }
          
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
          // Validate that stem component is followed by valid continuation
          const nextPos = nm.length;
          const remainder = str.substring(nextPos);
          
          // Must be followed by: alkane suffix (ane/ene/yne/an), or end/hyphen
          if (remainder.length === 0 || remainder[0] === '-') {
            // OK: end of string or hyphen
          } else if (/^(ane|ene|yne|an[eo])/.test(remainder)) {
            // OK: alkane suffix
          } else {
            // Units are terminal - must be followed by suffix, not another stem
            continue;
          }
          
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
