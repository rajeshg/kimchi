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
  private readonly priorityMap: Record<string, number> = {
    "carboxylic acid": 1,
    "sulfonic acid": 2,
    ester: 3,
    "acid halide": 4,
    amide: 5,
    hydrazide: 6,
    nitrile: 7,
    cyanohydrin: 7,
    aldehyde: 8,
    ketone: 9,
    alcohol: 10,
    phenol: 10,
    amine: 11,
    ether: 12,
  };

  constructor() {
    this.rules = this.loadOPSINRules();
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
      const name = nameFromEntry || pattern;
      const priority =
        this.priorityMap[name.toLowerCase()] ||
        (entry.priority as number | undefined) ||
        999;
      const suffix = (entry.suffix as string | undefined) || "";
      const prefix = entry.prefix as string | undefined;

      map.set(pattern, { name, priority, suffix, prefix });
    }

    // Override OPSIN names for certain patterns to use standard IUPAC names
    if (map.has("C#N")) {
      const entry = map.get("C#N")!;
      map.set("C#N", {
        ...entry,
        name: "nitrile",
        suffix: "nitrile",
      });
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
}
