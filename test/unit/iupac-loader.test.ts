import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { IUPACTokenList, IUPACToken } from 'src/utils/iupac/iupac-loader';
import { IUPACLoader, getIUPACLoader, resetIUPACLoader } from 'src/utils/iupac/iupac-loader';

describe('IUPACLoader', () => {
  beforeEach(() => {
    resetIUPACLoader();
  });

  afterEach(() => {
    resetIUPACLoader();
  });

  describe('constructor', () => {
    it('should initialize with default data directory', () => {
      const loader = new IUPACLoader();
      expect(loader).toBeDefined();
    });

    it('should initialize with custom data directory', () => {
      const customDir = '/custom/opsin-iupac-data';
      const loader = new IUPACLoader(customDir);
      expect(loader).toBeDefined();
    });
  });

  describe('loadFile', () => {
    it('should load and parse multipliers.xml', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const firstList = result[0]!;
      expect(firstList!.tagname).toBe('multiplier');
      expect(firstList!.tokens).toBeDefined();
      expect(Array.isArray(firstList!.tokens)).toBe(true);
    });

    it('should parse tokenList attributes correctly', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      const multiplierList = result.find((list) => list.type === 'basic')!;
      expect(multiplierList).toBeDefined();
      expect(multiplierList!.type).toBe('basic');
      expect(multiplierList!.symbol).toBeDefined();
    });

    it('should parse token elements correctly', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      expect(result.length > 0).toBe(true);
      const firstList = result[0]!;
      const token = firstList!.tokens[0]!;

      expect(token).toBeDefined();
      expect(token!.name).toBeDefined();
      expect(token!.value).toBeDefined();
      expect(typeof token!.name).toBe('string');
      expect(typeof token!.value).toBe('string');
    });

    it('should cache file results', () => {
      const loader = new IUPACLoader();

      const result1 = loader.loadFile('multipliers.xml');
      const result2 = loader.loadFile('multipliers.xml');

      expect(result1).toBe(result2);
    });

    it('should load different files correctly', () => {
      const loader = new IUPACLoader();

      const multipliers = loader.loadFile('multipliers.xml');
      const simpleGroups = loader.loadFile('simpleGroups.xml');

      expect(multipliers.length).toBeGreaterThan(0);
      expect(simpleGroups.length).toBeGreaterThan(0);
      expect(multipliers[0]!.tagname).toBe('multiplier');
      expect(simpleGroups[0]!.tagname).not.toBe('multiplier');
    });
  });

  describe('parseXML', () => {
    it('should parse simple XML structure', () => {
      const loader = new IUPACLoader();

      const xml = `<?xml version="1.0"?>
        <tokenLists>
          <tokenList tagname="test" type="basic">
            <token value="1">testToken</token>
          </tokenList>
        </tokenLists>`;

      const result = loader['parseXML'](xml);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]!.tagname).toBe('test');
      expect(result[0]!.type).toBe('basic');
      expect(result[0]!.tokens[0]!.name).toBe('testToken');
      expect(result[0]!.tokens[0]!.value).toBe('1');
    });

    it('should parse tokens with multiple names (pipe-separated)', () => {
      const loader = new IUPACLoader();

      const xml = `<?xml version="1.0"?>
        <tokenLists>
          <tokenList tagname="test">
            <token value="5">pent|penta</token>
          </tokenList>
        </tokenLists>`;

      const result = loader['parseXML'](xml);
      const tokens = result[0]!.tokens;

      expect(tokens.length).toBe(2);
      expect(tokens[0]!.name).toBe('pent');
      expect(tokens[1]!.name).toBe('penta');
      expect(tokens[0]!.value).toBe('5');
      expect(tokens[1]!.value).toBe('5');
    });

    it('should preserve optional attributes on tokens', () => {
      const loader = new IUPACLoader();

      const xml = `<?xml version="1.0"?>
        <tokenLists>
          <tokenList tagname="test">
            <token value="1" labels="label1,label2">testToken</token>
          </tokenList>
        </tokenLists>`;

      const result = loader['parseXML'](xml);
      const token = result[0]!.tokens[0]!;

      expect(token!.labels).toBe('label1,label2');
    });

    it('should handle empty tokenLists', () => {
      const loader = new IUPACLoader();

      const xml = `<?xml version="1.0"?>
        <tokenLists>
        </tokenLists>`;

      const result = loader['parseXML'](xml);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle multiple tokenLists', () => {
      const loader = new IUPACLoader();

      const xml = `<?xml version="1.0"?>
        <tokenLists>
          <tokenList tagname="first">
            <token value="1">token1</token>
          </tokenList>
          <tokenList tagname="second">
            <token value="2">token2</token>
          </tokenList>
        </tokenLists>`;

      const result = loader['parseXML'](xml);

      expect(result.length).toBe(2);
      expect(result[0]!.tagname).toBe('first');
      expect(result[1]!.tagname).toBe('second');
    });
  });

  describe('getAvailableFiles', () => {
    it('should return list of available OPSIN XML files', () => {
      const loader = new IUPACLoader();
      const files = loader.getAvailableFiles();

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.includes('.xml'))).toBe(true);
    });

    it('should include common OPSIN data files', () => {
      const loader = new IUPACLoader();
      const files = loader.getAvailableFiles();

      expect(files.some((f) => f.includes('multipliers'))).toBe(true);
      expect(files.some((f) => f.includes('simpleGroups'))).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear cached files', () => {
      const loader = new IUPACLoader();

      const result1 = loader.loadFile('multipliers.xml');
      loader.clearCache();
      const result2 = loader.loadFile('multipliers.xml');

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });

    it('should clear all cached files', () => {
      const loader = new IUPACLoader();

      loader.loadFile('multipliers.xml');
      loader.loadFile('simpleGroups.xml');
      loader.clearCache();

      const result1 = loader.loadFile('multipliers.xml');
      expect(result1).toBeDefined();
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance via getIUPACLoader', () => {
      const loader1 = getIUPACLoader();
      const loader2 = getIUPACLoader();

      expect(loader1).toBe(loader2);
    });

    it('should reset singleton via resetIUPACLoader', () => {
      const loader1 = getIUPACLoader();
      loader1.loadFile('multipliers.xml');

      resetIUPACLoader();

      const loader2 = getIUPACLoader();
      expect(loader1).not.toBe(loader2);
    });
  });

  describe('real file parsing', () => {
    it('should parse multipliers with expected structure', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      expect(result.length).toBeGreaterThan(0);

      const monoToken = result
        .flatMap((list) => list.tokens)
        .find((token) => token.name === 'mono');

      expect(monoToken).toBeDefined();
      expect(monoToken?.value).toBe('1');
    });

    it('should parse tokens with multiple aliases', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      const allTokens = result.flatMap((list) => list.tokens);

      const sameNameTokens = allTokens.filter(
        (token) => token.name === 'di' || token.name === 'tri'
      );

      expect(sameNameTokens.length).toBeGreaterThan(0);
    });
  });

  describe('token interface', () => {
    it('should return tokens with correct interface', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      const token = result[0]!.tokens[0]!;

      expect(token).toHaveProperty('name');
      expect(token).toHaveProperty('value');
      expect(typeof token!.name).toBe('string');
      expect(typeof token!.value).toBe('string');
    });

     it('should have optional properties on tokens', () => {
       const loader = new IUPACLoader();
       const result = loader.loadFile('multipliers.xml');

       const token = result[0]!.tokens[0]!;

       if (token!.labels !== undefined) {
         expect(typeof token!.labels).toBe('string');
       }
       if (token!.usableAsAJoiner !== undefined) {
         expect(typeof token!.usableAsAJoiner).toBe('boolean');
       }
     });
  });

  describe('tokenList interface', () => {
    it('should return tokenLists with correct interface', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      const tokenList = result[0]!;

      expect(tokenList).toHaveProperty('tagname');
      expect(tokenList).toHaveProperty('tokens');
      expect(Array.isArray(tokenList!.tokens)).toBe(true);
    });

    it('should have optional properties on tokenLists', () => {
      const loader = new IUPACLoader();
      const result = loader.loadFile('multipliers.xml');

      const tokenList = result[0]!;

      if (tokenList!.type !== undefined) {
        expect(typeof tokenList!.type).toBe('string');
      }
      if (tokenList!.symbol !== undefined) {
        expect(typeof tokenList!.symbol).toBe('string');
      }
    });
  });
});
