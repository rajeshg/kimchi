import type { Molecule } from "types";

/** IUPAC token type classification */
export type IUPACTokenType =
  | "LOCANT"
  | "MULTIPLIER"
  | "SUBSTITUENT"
  | "PARENT"
  | "SUFFIX"
  | "STEREO"
  | "PREFIX";

/** Represents a single parsed token from an IUPAC name */
export interface IUPACToken {
  /** Token classification */
  type: IUPACTokenType;
  /** The actual token value (e.g., "2", "methyl", "propan", "ol") */
  value: string;
  /** Starting position in the original string */
  position: number;
  /** Length of the token in characters */
  length: number;
  /** Optional metadata (e.g., atom count for alkanes, functional group type) */
  metadata?: Record<string, any>;
}

/** Result of tokenizing an IUPAC name */
export interface IUPACTokenizationResult {
  /** Array of parsed tokens */
  tokens: IUPACToken[];
  /** Any errors encountered during tokenization */
  errors: string[];
}

/** Result of parsing an IUPAC name into a molecule */
export interface IUPACParseResult {
  /** The resulting molecule, or null if parsing failed */
  molecule: Molecule | null;
  /** List of errors encountered */
  errors: string[];
  /** List of warnings (non-fatal issues) */
  warnings: string[];
}

/** OPSIN rules data structure (from opsin-rules.json) */
export interface OPSINRules {
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
  ringSystems: Record<string, { aliases: string[]; labels?: string }>;
  heteroAtoms?: Record<string, any>;
  heteroAtomPriorityOrder?: string[];
  functionalGroupPriorities?: Record<string, number>;
}

/** Parsed substituent with its attachment points */
export interface ParsedSubstituent {
  /** Type of substituent (e.g., "methyl", "chloro") */
  name: string;
  /** Count multiplier (e.g., 1 for "methyl", 2 for "dimethyl") */
  count: number;
  /** Atom positions where this substituent attaches */
  locants: number[];
  /** SMILES representation of the substituent */
  smiles: string;
}

/** Parsed functional group suffix */
export interface ParsedSuffix {
  /** Suffix type (e.g., "ol", "one", "al") */
  name: string;
  /** Atom position for primary functional group */
  primaryLocant?: number;
  /** Additional locants for multi-functional groups */
  locants: number[];
  /** Type of functional group (alcohol, ketone, etc.) */
  type?: string;
}

/** Configuration for IUPAC parser */
export interface IUPACParserConfig {
  /** Whether to perform strict validation */
  strictMode?: boolean;
  /** Whether to collect warnings */
  collectWarnings?: boolean;
  /** Custom OPSIN rules (defaults to opsin-rules.json) */
  customRules?: Partial<OPSINRules>;
}
