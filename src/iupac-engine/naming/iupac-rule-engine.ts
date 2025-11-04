import type { Molecule } from "types";
import rules from "../../../opsin-rules.json";
import { matchSMARTS } from "src/matchers/smarts-matcher";

// ============================================================================
// Type Definitions (re-exported from old rule-engine.ts)
// ============================================================================

export interface FunctionalGroupRule {
  priority: number;
  name: string;
  smarts: string;
  suffix: string;
  parenthesized: boolean;
  ignoreIfInRing?: boolean;
}

export interface SubstituentRule {
  name: string;
  smarts: string;
  prefix: string;
}

export interface ChainSelectionRule {
  priority: number;
  name: string;
  description: string;
}

export interface NumberingRule {
  priority: number;
  name: string;
  description: string;
}

/**
 * IUPAC rule engine that provides a single source of truth for all IUPAC nomenclature rules.
 */

// ============================================================================
// Type Definitions (internal)
// ============================================================================

interface RulesData {
  alkanes: Record<string, string>;
  alkaneStemComponents: {
    units: Record<string, string>;
    tens: Record<string, string>;
    hundreds: Record<string, string>;
  };
  multipliers: {
    basic: Record<string, string>;
    group: Record<string, string>;
    vonBaeyer: Record<string, string>;
    ringAssembly: Record<string, string>;
    fractional: Record<string, string>;
  };
  suffixes: Record<string, { aliases: string[]; type?: string }>;
  substituents: Record<string, { aliases: string[]; smiles?: string }>;
  functionalGroups: Record<string, { aliases: string[]; type?: string }>;
  functionalGroupsRules?: {
    groups: FunctionalGroupRule[];
  };
  substituentPatterns?: {
    patterns: SubstituentRule[];
  };
  chainSelectionRules?: {
    rules: ChainSelectionRule[];
  };
  numberingRules?: {
    rules: NumberingRule[];
  };
}

// ============================================================================
// Singleton Rule Engine Class
// ============================================================================

class IUPACRuleEngine {
  private cachedRules: RulesData | null = null;

  /**
   * Load and cache rules from opsin-rules.json
   */
  private loadRules(): RulesData {
    if (this.cachedRules) return this.cachedRules;

    const rulesData = rules as any;
    this.cachedRules = {
      alkanes: rulesData.alkanes || {},
      alkaneStemComponents: rulesData.alkaneStemComponents || {
        units: {},
        tens: {},
        hundreds: {},
      },
      multipliers: rulesData.multipliers || {
        basic: {},
        group: {},
        vonBaeyer: {},
        ringAssembly: {},
        fractional: {},
      },
      suffixes: rulesData.suffixes || {},
      substituents: rulesData.substituents || {},
      functionalGroups: rulesData.functionalGroups || {},
      functionalGroupsRules: rulesData.functionalGroupsRules,
      substituentPatterns: rulesData.substituentPatterns,
      chainSelectionRules: rulesData.chainSelectionRules,
      numberingRules: rulesData.numberingRules,
    };

    return this.cachedRules;
  }

  // ========================================================================
  // Functional Group Rules
  // ========================================================================

  /**
   * Get all functional group rules sorted by priority (ascending = highest priority first)
   */
  getFunctionalGroupRules(): FunctionalGroupRule[] {
    const rulesData = this.loadRules();
    const fgRules = rulesData.functionalGroupsRules?.groups;
    if (!fgRules) return [];
    return [...fgRules].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Find principal functional group in a molecule by matching SMARTS patterns
   */
  findPrincipalFunctionalGroup(molecule: Molecule): FunctionalGroupRule | null {
    const fgRules = this.getFunctionalGroupRules();

    for (const rule of fgRules) {
      try {
        const result = matchSMARTS(rule.smarts, molecule);
        if (result.success && result.matches.length > 0) {
          if (rule.ignoreIfInRing) {
            const nonRingMatch = result.matches.find((m) =>
              m.atoms.some((a) => !molecule.atoms[a.moleculeIndex]?.isInRing),
            );
            if (!nonRingMatch) continue;
          }
          return rule;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Check if a molecule contains a specific functional group (by SMARTS)
   */
  hasFunctionalGroup(molecule: Molecule, smarts: string): boolean {
    try {
      const result = matchSMARTS(smarts, molecule);
      return result.success && result.matches.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get all functional groups present in a molecule (matched against all rules)
   */
  findAllFunctionalGroups(molecule: Molecule): FunctionalGroupRule[] {
    const fgRules = this.getFunctionalGroupRules();
    const found: FunctionalGroupRule[] = [];

    for (const rule of fgRules) {
      if (this.hasFunctionalGroup(molecule, rule.smarts)) {
        found.push(rule);
      }
    }

    return found;
  }

  // ========================================================================
  // Substituent Rules
  // ========================================================================

  /**
   * Get all substituent patterns
   */
  getSubstituentPatterns(): SubstituentRule[] {
    const rulesData = this.loadRules();
    const patterns = rulesData.substituentPatterns?.patterns;
    if (!patterns) return [];
    return [...patterns];
  }

  /**
   * Get substituent aliases for a value
   */
  getSubstituentAliases(value: string): string[] | null {
    const rulesData = this.loadRules();
    return rulesData.substituents[value]?.aliases ?? null;
  }

  /**
   * Get substituent SMILES for a value
   */
  getSubstituentSmiles(value: string): string | undefined {
    const rulesData = this.loadRules();
    return rulesData.substituents[value]?.smiles;
  }

  // ========================================================================
  // Chain Selection and Numbering Rules
  // ========================================================================

  /**
   * Get chain selection rules sorted by priority
   */
  getChainSelectionRules(): ChainSelectionRule[] {
    const rulesData = this.loadRules();
    const csRules = rulesData.chainSelectionRules?.rules;
    if (!csRules) return [];
    return [...csRules].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get numbering rules sorted by priority
   */
  getNumberingRules(): NumberingRule[] {
    const rulesData = this.loadRules();
    const nRules = rulesData.numberingRules?.rules;
    if (!nRules) return [];
    return [...nRules].sort((a, b) => a.priority - b.priority);
  }

  // ========================================================================
  // Alkane Naming
  // ========================================================================

  /**
   * Get the alkane name for a given carbon count
   * For C1-C11, uses direct lookup; for C12+, constructs name using Greek multipliers
   */
  getAlkaneName(carbonCount: number): string | null {
    const rulesData = this.loadRules();

    if (carbonCount >= 1 && carbonCount <= 11) {
      const smiles = "C".repeat(carbonCount);
      const stem = rulesData.alkanes[smiles];
      return stem ? this.applyVowelElision(stem, "ane") : null;
    }

    if (carbonCount >= 12 && carbonCount < 100) {
      return this.generateLargeAlkaneName(carbonCount);
    }

    if (carbonCount === 100) {
      const stem = rulesData.alkaneStemComponents.hundreds["100"];
      return stem ? this.applyVowelElision(stem, "ane") : null;
    }

    if (carbonCount > 100) {
      return this.generateVeryLargeAlkaneName(carbonCount);
    }

    return null;
  }

  /**
   * Generate alkane name for C12-C99
   */
  private generateLargeAlkaneName(carbonCount: number): string | null {
    const rulesData = this.loadRules();
    const tens = Math.floor(carbonCount / 10) * 10;
    const units = carbonCount % 10;

    const tensStemRaw = rulesData.alkaneStemComponents.tens[tens.toString()];
    if (!tensStemRaw) return null;

    let name: string;
    if (units > 0) {
      const unitsStemRaw =
        rulesData.alkaneStemComponents.units[units.toString()];
      if (!unitsStemRaw) return null;
      const tensStem = this.selectVariant(tensStemRaw, unitsStemRaw, true);
      const lastCharOfUnits = unitsStemRaw.slice(-1);
      const firstCharOfTens = tensStem[0] ?? "";

      if (this.isVowel(lastCharOfUnits) || this.isVowel(firstCharOfTens)) {
        name = this.applyVowelElision(unitsStemRaw, tensStem);
      } else {
        name = unitsStemRaw + "a" + tensStem;
      }
      name = this.applyVowelElision(name, "ane");
    } else {
      name = this.selectVariant(tensStemRaw, "", true);
      name = this.applyVowelElision(name, "ane");
    }

    return name;
  }

  /**
   * Generate alkane name for C100+
   */
  private generateVeryLargeAlkaneName(carbonCount: number): string | null {
    const rulesData = this.loadRules();
    const hundreds = Math.floor(carbonCount / 100) * 100;
    const remainder = carbonCount % 100;

    const hundredsStem =
      rulesData.alkaneStemComponents.hundreds[hundreds.toString()];
    if (!hundredsStem) return null;

    let name = hundredsStem;

    if (remainder >= 10) {
      const tens = Math.floor(remainder / 10) * 10;
      const units = remainder % 10;

      const tensStemRaw = rulesData.alkaneStemComponents.tens[tens.toString()];
      if (!tensStemRaw) return null;

      let tensStem: string;
      if (units > 0) {
        const unitsStem =
          rulesData.alkaneStemComponents.units[units.toString()];
        if (!unitsStem) return null;
        tensStem = this.selectVariant(tensStemRaw, unitsStem, true);
        name = this.applyVowelElision(name, tensStem);
        name = this.applyVowelElision(name, unitsStem);
      } else {
        tensStem = this.selectVariant(tensStemRaw, "ane", true);
        name = this.applyVowelElision(name, tensStem);
      }
    } else if (remainder > 0) {
      const unitsStem =
        rulesData.alkaneStemComponents.units[remainder.toString()];
      if (!unitsStem) return null;
      name = this.applyVowelElision(name, unitsStem);
    }

    return this.applyVowelElision(name, "ane");
  }

  // ========================================================================
  // Multiplier and Prefix Rules
  // ========================================================================

  /**
   * Get Greek numeral prefix for a count
   */
  getMultiplierPrefix(
    count: number,
    isGroupMultiplier: boolean = false,
  ): string | null {
    if (count === 1) return null;

    const rulesData = this.loadRules();
    const multiplierType = isGroupMultiplier ? "group" : "basic";
    const prefix = rulesData.multipliers[multiplierType][count.toString()];
    return prefix ?? null;
  }

  /**
   * Get multiplier for a specific count and type
   */
  getMultiplier(
    count: number,
    type: "basic" | "group" | "vonBaeyer" | "ringAssembly" | "fractional",
  ): string | null {
    const rulesData = this.loadRules();
    const multiplier = rulesData.multipliers[type][count.toString()];
    return multiplier ?? null;
  }

  // ========================================================================
  // Suffix and Functional Group Information
  // ========================================================================

  /**
   * Get suffix rule for a specific functional group name
   */
  getSuffixByName(functionalGroupName: string): string | null {
    const rulesData = this.loadRules();
    const suffixEntry = rulesData.suffixes[functionalGroupName];
    if (suffixEntry?.aliases) {
      return suffixEntry.aliases[0] ?? null;
    }
    return null;
  }

  /**
   * Get suffix aliases for a value
   */
  getSuffixAliases(value: string): string[] | null {
    const rulesData = this.loadRules();
    return rulesData.suffixes[value]?.aliases ?? null;
  }

  /**
   * Get suffix type for a value
   */
  getSuffixType(value: string): string | undefined {
    const rulesData = this.loadRules();
    return rulesData.suffixes[value]?.type;
  }

  /**
   * Get functional group aliases for a value
   */
  getFunctionalGroupAliases(value: string): string[] | null {
    const rulesData = this.loadRules();
    return rulesData.functionalGroups[value]?.aliases ?? null;
  }

  /**
   * Get functional group type for a value
   */
  getFunctionalGroupType(value: string): string | undefined {
    const rulesData = this.loadRules();
    return rulesData.functionalGroups[value]?.type;
  }

  // ========================================================================
  // Vowel Elision and Helper Methods
  // ========================================================================

  /**
   * Apply vowel elision rules to combine base name and suffix
   * Example: "propane" + "-ol" → "propanol" (drop 'e')
   */
  applyVowelElision(name: string, suffix: string): string {
    if (!name || !suffix) return name + suffix;

    const lastCharOfName = name.slice(-1).toLowerCase();
    const firstCharOfSuffix = suffix[0];
    if (!firstCharOfSuffix) return name + suffix;

    const firstCharOfSuffixLower = firstCharOfSuffix.toLowerCase();
    const vowels = ["a", "e", "i", "o", "u"];

    if (
      vowels.includes(lastCharOfName) &&
      vowels.includes(firstCharOfSuffixLower)
    ) {
      if (
        lastCharOfName === "a" ||
        lastCharOfName === "o" ||
        lastCharOfName === "e"
      ) {
        return name.slice(0, -1) + suffix;
      }
      if (lastCharOfName === "i" && firstCharOfSuffixLower === "a") {
        return name.slice(0, -1) + suffix;
      }
    }

    return name + suffix;
  }

  /**
   * Check if a character is a vowel
   */
  private isVowel(char: string): boolean {
    return ["a", "e", "i", "o", "u"].includes(char.toLowerCase());
  }

  /**
   * Select variant from pipe-separated options based on next part
   */
  private selectVariant(
    variants: string,
    nextPart: string,
    isTensComponent: boolean = false,
  ): string {
    if (!variants.includes("|")) return variants;

    const parts = variants.split("|");
    const nextFirstChar = nextPart[0]?.toLowerCase() ?? "";

    if (isTensComponent) {
      if (!nextFirstChar) {
        return parts[parts.length - 1] ?? "";
      }
      return parts[0] ?? "";
    }

    if (!nextFirstChar) {
      return parts[parts.length - 1] ?? "";
    }

    if (this.isVowel(nextFirstChar)) {
      return parts[parts.length - 1] ?? "";
    }

    return parts[0] ?? "";
  }

  /**
   * Get first character lowercased
   */
  getFirstCharLower(str: string): string {
    return str[0]?.toLowerCase() ?? "";
  }

  /**
   * Get all loaded rules data (for advanced use cases)
   */
  getAllRules(): RulesData {
    return this.loadRules();
  }

  /**
   * Clear cache (useful for testing or reloading rules)
   */
  clearCache(): void {
    this.cachedRules = null;
  }
}

// ============================================================================
// Singleton Instance and Exports
// ============================================================================

const ruleEngine = new IUPACRuleEngine();

export { ruleEngine, IUPACRuleEngine, type RulesData };
