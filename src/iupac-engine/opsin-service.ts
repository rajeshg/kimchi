import fs from "fs";

export interface OPSINRuleEntry {
  name?: string;
  aliases?: string[];
  priority?: number;
  suffix?: string;
  prefix?: string;
  [key: string]: unknown;
}

export interface OPSINRules {
  alkanes?: Record<string, string>;
  multipliers?: {
    basic?: Record<string, string>;
    group?: Record<string, string>;
    vonBaeyer?: Record<string, string>;
    ringAssembly?: Record<string, string>;
    fractional?: Record<string, string>;
  };
  functionalGroups?: Record<string, OPSINRuleEntry>;
  suffixes?: Record<string, { aliases?: string[]; type?: string }>;
  heteroAtoms?: Record<string, string>;
  heteroAtomPriorityOrder?: string[];
  functionalGroupPriorities?: Record<string, number>;
  [key: string]: unknown;
}

export interface FunctionalGroupData {
  name: string;
  priority: number;
  suffix: string;
  prefix?: string;
}

export interface FunctionalGroupMatch {
  type: string;
  name: string;
  suffix: string;
  prefix?: string;
  priority: number;
  atoms: number[];
  pattern: string;
}

/**
 * Stateless OPSIN service for rule lookups
 *
 * Loads opsin-rules.json once at initialization and provides
 * pure lookup functions with no internal state mutation.
 */
export class OPSINService {
  private readonly rules: OPSINRules;
  private readonly functionalGroups: ReadonlyMap<string, FunctionalGroupData>;
  private readonly suffixes: ReadonlyMap<string, string>;
  private readonly priorityMap: Record<string, number>;

  constructor() {
    this.rules = this.loadOPSINRules();
    this.priorityMap = this.rules.functionalGroupPriorities || {};
    this.functionalGroups = this.buildFunctionalGroupsMap();
    this.suffixes = this.buildSuffixesMap();
  }

  private loadOPSINRules(): OPSINRules {
    try {
      const rulesPath = `${import.meta.dir}/../../../opsin-rules.json`;
      const rulesData = fs.readFileSync(rulesPath, "utf8");
      return JSON.parse(rulesData);
    } catch (_error) {
      try {
        const cwdPath = `${process.cwd()}/opsin-rules.json`;
        const rulesData = fs.readFileSync(cwdPath, "utf8");
        return JSON.parse(rulesData);
      } catch (_fallbackError) {
        if (process.env.VERBOSE) {
          console.warn("Failed to load OPSIN rules, using fallback");
        }
        return {};
      }
    }
  }

  private buildFunctionalGroupsMap(): ReadonlyMap<string, FunctionalGroupData> {
    const map = new Map<string, FunctionalGroupData>();

    if (!this.rules.functionalGroups) {
      return map;
    }

    for (const [pattern, data] of Object.entries(this.rules.functionalGroups)) {
      const entry = data || {};

      // Skip halogens - they are substituents, not functional groups
      if (["F", "Cl", "Br", "I", "S"].includes(pattern)) {
        continue;
      }

      const nameFromEntry =
        Array.isArray(entry.aliases) && entry.aliases.length > 0
          ? (entry.aliases[0] as string)
          : entry.name || pattern;
      
      // Apply standard IUPAC name overrides before priority lookup
      let name = nameFromEntry || pattern;
      let suffix = (entry.suffix as string | undefined) || "";
      
      if (pattern === "C#N") {
        name = "nitrile";
        suffix = "nitrile";
      } else if (pattern === "C=O") {
        // Need to check context - this could be aldehyde or ketone
        // For now, we'll use a context-neutral approach by checking if it's being used as aldehyde
        // The detector will handle this properly
      }
      
      const priority =
        (entry.priority as number | undefined) ||
        this.priorityMap[name.toLowerCase()] ||
        999;
      const prefix = entry.prefix as string | undefined;

      map.set(pattern, { name, priority, suffix, prefix });
    }

    return map;
  }

  private buildSuffixesMap(): ReadonlyMap<string, string> {
    const map = new Map<string, string>();

    if (!this.rules.suffixes) {
      return map;
    }

    for (const [name, data] of Object.entries(this.rules.suffixes)) {
      if (typeof data === "string") {
        map.set(name, data);
      } else if (data?.aliases && Array.isArray(data.aliases)) {
        map.set(name, data.aliases[0] || name);
      }
    }

    return map;
  }

  /**
   * Get functional group priority (lower = higher priority)
   */
  getFunctionalGroupPriority(pattern: string): number | undefined {
    const group = this.functionalGroups.get(pattern);
    return group?.priority;
  }

  /**
   * Get functional group name
   */
  getFunctionalGroupName(pattern: string): string | undefined {
    const group = this.functionalGroups.get(pattern);
    return group?.name;
  }

  /**
   * Get functional group suffix
   */
  getFunctionalGroupSuffix(pattern: string): string | undefined {
    const group = this.functionalGroups.get(pattern);
    return group?.suffix;
  }

  /**
   * Get functional group prefix
   */
  getFunctionalGroupPrefix(pattern: string): string | undefined {
    const group = this.functionalGroups.get(pattern);
    return group?.prefix;
  }

  /**
   * Get all functional groups data
   */
  getAllFunctionalGroups(): ReadonlyMap<string, FunctionalGroupData> {
    return this.functionalGroups;
  }

  /**
   * Get multiplicative prefix (di, tri, tetra, etc.)
   * @param count - Number to convert to prefix
   * @param type - 'basic' for simple (di, tri), 'group' for complex (bis, tris)
   */
  getMultiplicativePrefix(
    count: number,
    type: "basic" | "group" = "basic",
  ): string | undefined {
    const multipliers = this.rules.multipliers?.[type];
    if (!multipliers) {
      return undefined;
    }
    return multipliers[count.toString()];
  }

  /**
   * Get chain name from alkanes data
   */
  getChainName(length: number): string | undefined {
    if (!this.rules.alkanes) {
      return undefined;
    }

    // Build SMILES pattern for chain (C repeated 'length' times)
    const pattern = "C".repeat(length);
    return this.rules.alkanes[pattern];
  }

  /**
   * Get suffix name
   */
  getSuffix(name: string): string | undefined {
    return this.suffixes.get(name);
  }

  /**
   * Get raw OPSIN rules (for advanced use cases)
   */
  getRawRules(): Readonly<OPSINRules> {
    return this.rules;
  }

  /**
   * Check if a pattern exists in functional groups
   */
  hasFunctionalGroup(pattern: string): boolean {
    return this.functionalGroups.has(pattern);
  }

  /**
   * Get all available multiplicative prefix types
   */
  getAvailableMultiplierTypes(): string[] {
    if (!this.rules.multipliers) {
      return [];
    }
    return Object.keys(this.rules.multipliers);
  }

  /**
   * Get heteroatom prefix for replacement nomenclature
   * @param atomSymbol - Element symbol (e.g., "O", "N", "S")
   * @returns Heteroatom prefix (e.g., "oxa", "aza", "thia"), or undefined if not found
   */
  getHeteroAtomPrefix(atomSymbol: string): string | undefined {
    if (!this.rules.heteroAtoms) {
      return undefined;
    }
    return this.rules.heteroAtoms[atomSymbol];
  }

  /**
   * Get heteroatom priority order from OPSIN rules
   * @returns Array of heteroatom prefixes in IUPAC priority order (e.g., ["fluora", "chlora", "oxa", "thia", "aza", ...])
   */
  getHeteroAtomPriorityOrder(): string[] {
    return this.rules.heteroAtomPriorityOrder || [];
  }
}

// Singleton instance for shared use across the IUPAC engine
let _sharedService: OPSINService | null = null;

export function getSharedOPSINService(): OPSINService {
  if (!_sharedService) {
    _sharedService = new OPSINService();
  }
  return _sharedService;
}
