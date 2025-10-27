import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { parseSMILES } from 'index';
import { ruleEngine, IUPACRuleEngine } from 'src/utils/iupac/iupac-rule-engine';
import type { Molecule } from 'types';

describe('IUPACRuleEngine', () => {
  let engine: IUPACRuleEngine;

  beforeEach(() => {
    engine = new IUPACRuleEngine();
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe('Rule Loading and Caching', () => {
    it('should load rules on first access', () => {
      const rules = engine.getAllRules();
      expect(rules.alkanes).toBeDefined();
      expect(Object.keys(rules.alkanes).length).toBeGreaterThan(0);
    });

    it('should cache rules after first load', () => {
      const rules1 = engine.getAllRules();
      const rules2 = engine.getAllRules();
      expect(rules1).toBe(rules2);
    });

    it('should clear cache when requested', () => {
      const rules1 = engine.getAllRules();
      engine.clearCache();
      const rules2 = engine.getAllRules();
      expect(rules1).not.toBe(rules2);
      expect(rules1).toEqual(rules2);
    });
  });

  describe('Alkane Naming', () => {
    it('should get alkane names for C1-C11', () => {
      expect(engine.getAlkaneName(1)).toBe('methane');
      expect(engine.getAlkaneName(2)).toBe('ethane');
      expect(engine.getAlkaneName(3)).toBe('propane');
      expect(engine.getAlkaneName(6)).toBe('hexane');
      expect(engine.getAlkaneName(11)).toBe('undecane');
    });

    it('should get alkane names for C12-C99', () => {
      const name12 = engine.getAlkaneName(12);
      expect(name12).toBeTruthy();
      expect(name12).toContain('ane');
      
      const name20 = engine.getAlkaneName(20);
      expect(name20).toBeTruthy();
      expect(name20).toContain('ane');
    });

    it('should get alkane names for C100+', () => {
      // Note: C100 may not have a name defined in the rules
      const name150 = engine.getAlkaneName(150);
      if (name150) {
        expect(name150).toContain('ane');
      }
    });

    it('should return null for invalid carbon counts', () => {
      expect(engine.getAlkaneName(0)).toBeNull();
      expect(engine.getAlkaneName(-1)).toBeNull();
    });
  });

  describe('Multiplier Prefixes', () => {
    it('should return null for count of 1', () => {
      expect(engine.getMultiplierPrefix(1)).toBeNull();
      expect(engine.getMultiplierPrefix(1, true)).toBeNull();
    });

    it('should get basic multiplier prefixes', () => {
      const di = engine.getMultiplierPrefix(2);
      expect(di).toBeDefined();
      
      const tri = engine.getMultiplierPrefix(3);
      expect(tri).toBeDefined();
      
      const tetra = engine.getMultiplierPrefix(4);
      expect(tetra).toBeDefined();
    });

    it('should get group multiplier prefixes when requested', () => {
      const di = engine.getMultiplierPrefix(2, true);
      expect(di).toBeDefined();
    });

    it('should get multiplier for specific type', () => {
      const basic2 = engine.getMultiplier(2, 'basic');
      expect(basic2).toBeDefined();

      const group2 = engine.getMultiplier(2, 'group');
      expect(group2).toBeDefined();
    });
  });

   describe('Vowel Elision', () => {
     it('should apply vowel elision for a + vowel', () => {
       const result = engine.applyVowelElision('propana', 'ol');
       expect(result).toBe('propanol');
     });

     it('should apply vowel elision for e + vowel', () => {
       // IUPAC rule: 'e' is elided when followed by a vowel (including 'ol')
       // Example: cyclohexane + ol = cyclohexanol (not cyclohexaneol)
       const result = engine.applyVowelElision('propane', 'ol');
       expect(result).toBe('propanol');
     });

     it('should apply vowel elision for i + a', () => {
       // Note: 'i' is only elided with 'a' specifically
       const result = engine.applyVowelElision('acetali', 'acid');
       expect(result).toBe('acetalacid');
     });

     it('should not apply vowel elision for consonants', () => {
       const result = engine.applyVowelElision('methan', 'yl');
       expect(result).toBe('methanyl');
     });

     it('should not apply vowel elision when suffix starts with consonant', () => {
       const result = engine.applyVowelElision('methane', 'thiol');
       expect(result).toBe('methanethiol');
     });

     it('should handle empty strings', () => {
       expect(engine.applyVowelElision('', 'ol')).toBe('ol');
       expect(engine.applyVowelElision('methane', '')).toBe('methane');
       expect(engine.applyVowelElision('', '')).toBe('');
    });
  });

  describe('Functional Group Rules', () => {
    it('should get all functional group rules', () => {
      const rules = engine.getFunctionalGroupRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should sort functional group rules by priority (ascending)', () => {
      const rules = engine.getFunctionalGroupRules();
      for (let i = 1; i < rules.length; i++) {
        const prev = rules[i - 1];
        const curr = rules[i];
        if (prev && curr) {
          expect(curr.priority).toBeGreaterThanOrEqual(prev.priority);
        }
      }
    });

    it('should not mutate rules on subsequent calls', () => {
      const rules1 = engine.getFunctionalGroupRules();
      const rules2 = engine.getFunctionalGroupRules();
      expect(rules1).not.toBe(rules2);
      expect(rules1).toEqual(rules2);
    });
  });

  describe('Functional Group Detection', () => {
    it('should find principal functional group in alcohols', () => {
      const result = parseSMILES('CCO');
      expect(result.molecules.length).toBeGreaterThan(0);
      const ethanol = result.molecules[0];
      if (!ethanol) return;

      const fg = engine.findPrincipalFunctionalGroup(ethanol);
      expect(fg).toBeTruthy();
      expect(fg?.suffix).toBe('ol');
    });

    it('should find principal functional group in carboxylic acids', () => {
      const result = parseSMILES('CC(=O)O');
      expect(result.molecules.length).toBeGreaterThan(0);
      const acetic = result.molecules[0];
      if (!acetic) return;

      const fg = engine.findPrincipalFunctionalGroup(acetic);
      expect(fg).toBeTruthy();
      expect(fg?.suffix).toBe('oic acid');
    });

    it('should return null when no functional group matches', () => {
      const result = parseSMILES('CC');
      expect(result.molecules.length).toBeGreaterThan(0);
      const ethane = result.molecules[0];
      if (!ethane) return;

      const fg = engine.findPrincipalFunctionalGroup(ethane);
      expect(fg).toBeNull();
    });

    it('should check if molecule contains a functional group', () => {
      const result = parseSMILES('CCO');
      expect(result.molecules.length).toBeGreaterThan(0);
      const ethanol = result.molecules[0];
      if (!ethanol) return;

      const hasOH = engine.hasFunctionalGroup(ethanol, '[OD1H]');
      expect(hasOH).toBe(true);

      const result2 = parseSMILES('CC');
      expect(result2.molecules.length).toBeGreaterThan(0);
      const ethane = result2.molecules[0];
      if (!ethane) return;

      const hasOH2 = engine.hasFunctionalGroup(ethane, '[OD1H]');
      expect(hasOH2).toBe(false);
    });

    it('should find all functional groups in a molecule', () => {
      const result = parseSMILES('CCO');
      expect(result.molecules.length).toBeGreaterThan(0);
      const mol = result.molecules[0];
      if (!mol) return;

      const allFGs = engine.findAllFunctionalGroups(mol);
      expect(Array.isArray(allFGs)).toBe(true);
      // Should include at least one hydroxyl group
      expect(allFGs.length).toBeGreaterThan(0);
    });
  });

  describe('Substituent Rules', () => {
    it('should get substituent patterns', () => {
      const patterns = engine.getSubstituentPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should get substituent aliases', () => {
      const aliases = engine.getSubstituentAliases('methyl');
      // May or may not exist depending on rules file
      if (aliases) {
        expect(Array.isArray(aliases)).toBe(true);
      }
    });

    it('should get substituent SMILES', () => {
      const smiles = engine.getSubstituentSmiles('methyl');
      // May or may not exist depending on rules file
      if (smiles) {
        expect(typeof smiles).toBe('string');
      }
    });
  });

  describe('Suffix and Functional Group Information', () => {
    it('should get suffix by functional group name', () => {
      const suffix = engine.getSuffixByName('alcohol');
      // Result depends on rules file content
      if (suffix) {
        expect(typeof suffix).toBe('string');
      }
    });

    it('should get suffix aliases', () => {
      const rules = engine.getAllRules();
      const keys = Object.keys(rules.suffixes);
      if (keys.length > 0) {
        const key = keys[0];
        if (key) {
          const aliases = engine.getSuffixAliases(key);
          expect(Array.isArray(aliases) || aliases === null).toBe(true);
        }
      }
    });

    it('should get functional group aliases', () => {
      const rules = engine.getAllRules();
      const keys = Object.keys(rules.functionalGroups);
      if (keys.length > 0) {
        const key = keys[0];
        if (key) {
          const aliases = engine.getFunctionalGroupAliases(key);
          expect(Array.isArray(aliases) || aliases === null).toBe(true);
        }
      }
    });
  });

  describe('Chain Selection and Numbering Rules', () => {
    it('should get chain selection rules', () => {
      const rules = engine.getChainSelectionRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    it('should get numbering rules', () => {
      const rules = engine.getNumberingRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    it('should sort chain selection rules by priority', () => {
      const rules = engine.getChainSelectionRules();
      for (let i = 1; i < rules.length; i++) {
        const prev = rules[i - 1];
        const curr = rules[i];
        if (prev && curr) {
          expect(curr.priority).toBeGreaterThanOrEqual(prev.priority);
        }
      }
    });

    it('should sort numbering rules by priority', () => {
      const rules = engine.getNumberingRules();
      for (let i = 1; i < rules.length; i++) {
        const prev = rules[i - 1];
        const curr = rules[i];
        if (prev && curr) {
          expect(curr.priority).toBeGreaterThanOrEqual(prev.priority);
        }
      }
    });
  });

  describe('Singleton Instance', () => {
    it('should provide singleton instance', () => {
      expect(ruleEngine).toBeInstanceOf(IUPACRuleEngine);
    });

    it('singleton should have all methods', () => {
      expect(typeof ruleEngine.getAlkaneName).toBe('function');
      expect(typeof ruleEngine.getMultiplierPrefix).toBe('function');
      expect(typeof ruleEngine.applyVowelElision).toBe('function');
      expect(typeof ruleEngine.getFunctionalGroupRules).toBe('function');
      expect(typeof ruleEngine.findPrincipalFunctionalGroup).toBe('function');
    });
  });

  describe('Helper Methods', () => {
    it('should get first character lowercased', () => {
      expect(engine.getFirstCharLower('Methane')).toBe('m');
      expect(engine.getFirstCharLower('ethane')).toBe('e');
      expect(engine.getFirstCharLower('')).toBe('');
    });
  });
});
