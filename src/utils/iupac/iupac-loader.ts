import { readFileSync } from 'fs';
import { join } from 'path';

export interface IUPACToken {
  name: string;
  value: string;
  labels?: string;
  usableAsAJoiner?: boolean;
  defaultInLocant?: string;
  defaultInID?: string;
  addGroup?: string;
  frontLocantsExpected?: string;
  outIDs?: string;
}

export interface IUPACTokenList {
  tagname: string;
  type?: string;
  subType?: string;
  symbol?: string;
  tokens: IUPACToken[];
}

export class IUPACLoader {
  private dataDir: string;
  private cache: Map<string, IUPACTokenList[]> = new Map();
  private tokensByName: Map<string, IUPACToken[]> = new Map();
  private tokensByValue: Map<string, IUPACToken[]> = new Map();
  private isIndexed: boolean = false;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || this.resolveDataDir();
  }

  private resolveDataDir(): string {
    return join(process.cwd(), 'opsin-iupac-data');
  }

  /**
   * Load and parse a single OPSIN XML file
   */
  loadFile(filename: string): IUPACTokenList[] {
    if (this.cache.has(filename)) {
      return this.cache.get(filename)!;
    }

    const filePath = join(this.dataDir, filename);
    const xmlContent = readFileSync(filePath, 'utf-8');
    const result = this.parseXML(xmlContent);
    this.cache.set(filename, result);
    return result;
  }

  /**
   * Load multiple OPSIN files
   */
  loadFiles(filenames: string[]): Map<string, IUPACTokenList[]> {
    const result = new Map<string, IUPACTokenList[]>();
    for (const filename of filenames) {
      result.set(filename, this.loadFile(filename));
    }
    return result;
  }

   /**
    * Parse XML string into token lists
    */
   private parseXML(xmlContent: string): IUPACTokenList[] {
     const tokenLists: IUPACTokenList[] = [];

     const tokenListRegex =
       /<tokenList\s+([^>]*)>([\s\S]*?)<\/tokenList>/g;
     let match;

     while ((match = tokenListRegex.exec(xmlContent)) !== null) {
       const attributesStr = match[1]!;
       const contentStr = match[2]!;

       const attributes = this.parseAttributes(attributesStr);
       const tokens = this.parseTokens(contentStr);

       const tagname = attributes['tagname'] ?? '';

       tokenLists.push({
         tagname,
         type: attributes['type'],
         subType: attributes['subType'],
         symbol: attributes['symbol'],
         tokens,
       });
     }

     return tokenLists;
   }

   /**
    * Parse XML tag attributes
    */
   private parseAttributes(
     attributesStr: string
   ): Record<string, string> {
     const attributes: Record<string, string> = {};
     const attrRegex = /(\w+)=["']([^"']*)["']/g;
     let match;

     while ((match = attrRegex.exec(attributesStr)) !== null) {
       attributes[match[1]!] = match[2]!;
     }

     return attributes;
   }

    /**
     * Parse token elements from content
     */
    private parseTokens(contentStr: string): IUPACToken[] {
      const tokens: IUPACToken[] = [];

      const tokenRegex = /<token\s+([^>]*)>([\s\S]*?)<\/token>/g;
      let match;

      while ((match = tokenRegex.exec(contentStr)) !== null) {
        const attributesStr = match[1]!;
        const nameStr = match[2]!.trim();

        const attributes = this.parseAttributes(attributesStr);

        const names = nameStr.split('|').map((n) => n.trim());

        for (const name of names) {
          const token: IUPACToken = {
            name,
            value: attributes['value'] || '',
            labels: attributes['labels'],
            usableAsAJoiner: attributes['usableAsAJoiner'] === 'yes',
            defaultInLocant: attributes['defaultInLocant'],
            defaultInID: attributes['defaultInID'],
            addGroup: attributes['addGroup'],
            frontLocantsExpected: attributes['frontLocantsExpected'],
            outIDs: attributes['outIDs'],
          };

          tokens.push(token);
        }
      }

      return tokens;
    }

  /**
   * Get all available XML filenames (without full paths)
   */
  getAvailableFiles(): string[] {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(this.dataDir);
      return files.filter((f: string) => f.endsWith('.xml'));
    } catch (error) {
      console.warn('Could not read IUPAC data directory:', error);
      return [];
    }
  }

   /**
    * Clear cache to force reload
    */
   clearCache(): void {
     this.cache.clear();
     this.invalidateIndexes();
   }

  /**
   * Get current cache size (for debugging)
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Build searchable indexes for all loaded tokens
   */
  private buildIndexes(): void {
    if (this.isIndexed) return;

    this.tokensByName.clear();
    this.tokensByValue.clear();

    for (const tokenLists of this.cache.values()) {
      for (const tokenList of tokenLists) {
        for (const token of tokenList.tokens) {
          const nameLower = token.name.toLowerCase();
          if (!this.tokensByName.has(nameLower)) {
            this.tokensByName.set(nameLower, []);
          }
          this.tokensByName.get(nameLower)!.push(token);

          if (token.value) {
            const valueLower = token.value.toLowerCase();
            if (!this.tokensByValue.has(valueLower)) {
              this.tokensByValue.set(valueLower, []);
            }
            this.tokensByValue.get(valueLower)!.push(token);
          }
        }
      }
    }

    this.isIndexed = true;
  }

  /**
   * Search tokens by name (case-insensitive)
   */
  findTokensByName(name: string): IUPACToken[] {
    this.buildIndexes();
    return this.tokensByName.get(name.toLowerCase()) || [];
  }

  /**
   * Search tokens by value (case-insensitive)
   */
  findTokensByValue(value: string): IUPACToken[] {
    this.buildIndexes();
    return this.tokensByValue.get(value.toLowerCase()) || [];
  }

  /**
   * Search tokens by name prefix (case-insensitive)
   */
  findTokensByPrefix(prefix: string): IUPACToken[] {
    this.buildIndexes();
    const prefixLower = prefix.toLowerCase();
    const results: IUPACToken[] = [];

    for (const [name, tokens] of this.tokensByName) {
      if (name.startsWith(prefixLower)) {
        results.push(...tokens);
      }
    }

    return results;
  }

  /**
   * Get all tokens matching a predicate function
   */
  filterTokens(predicate: (token: IUPACToken) => boolean): IUPACToken[] {
    this.buildIndexes();
    const results: IUPACToken[] = [];

    for (const tokens of this.tokensByName.values()) {
      for (const token of tokens) {
        if (predicate(token)) {
          results.push(token);
        }
      }
    }

    return results;
  }

  /**
   * Invalidate indexes when cache is cleared
   */
  private invalidateIndexes(): void {
    this.isIndexed = false;
  }
}

/**
 * Singleton instance for global access
 */
let globalLoader: IUPACLoader | null = null;

export function getIUPACLoader(): IUPACLoader {
  if (!globalLoader) {
    globalLoader = new IUPACLoader();
  }
  return globalLoader;
}

/**
 * Reset global loader (useful for testing)
 */
export function resetIUPACLoader(): void {
  globalLoader = null;
}
