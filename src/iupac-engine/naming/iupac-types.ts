/**
 * Core IUPAC nomenclature types representing key chemical structures
 */

/**
 * Represents a substituent at a specific position on a chain
 */
export interface NamingSubstituent {
  position: string;
  type: string;
  size: number;
  name: string;
  atoms?: number[]; // Optional atom indices for deduplication
  startAtomId?: number; // Optional starting atom ID for filtering
  attachedToRingAtomId?: number; // Optional ring atom ID for numbering
  locant?: number; // Optional locant after numbering (1-indexed position)
}

/**
 * Metadata about a substituent without position information
 */
export interface NamingSubstituentInfo {
  type: string;
  size: number;
  name: string;
}

/**
 * Represents a carbon chain in the molecule
 */
export interface Chain {
  /** Indices of atoms that make up this chain (in order) */
  atomIndices: number[];
  /** Length of the chain (number of atoms) */
  length: number;
  /** Substituents attached to this chain */
  substituents: NamingSubstituent[];
  /** Functional groups attached to this chain */
  functionalGroups: FunctionalGroupOccurrence[];
  /** Whether this chain is cyclic */
  isCyclic: boolean;
  /** Whether this chain is aromatic */
  isAromatic: boolean;
}

/**
 * Represents a functional group in a molecule
 */
export interface FunctionalGroup {
  /** Name of the functional group (e.g., 'hydroxyl', 'carboxylic acid') */
  name: string;
  /** Priority level for nomenclature (lower = higher priority) */
  priority: number;
  /** SMARTS pattern that matches this group */
  smarts: string;
  /** Suffix to apply in nomenclature (e.g., '-ol', '-acid') */
  suffix: string;
  /** Whether this group needs parentheses in the name */
  parenthesized: boolean;
  /** Indices of atoms in this functional group */
  atomIndices: number[];
  /** Whether this is the principal functional group */
  isPrincipal: boolean;
}

/**
 * Represents an occurrence of a functional group in a specific location
 */
export interface FunctionalGroupOccurrence {
  functionalGroup: FunctionalGroup;
  position: number;
  count: number;
}

/**
 * Represents a complete molecular structure analysis for nomenclature
 */
export interface MolecularStructure {
  /** All chains in the molecule */
  chains: Chain[];
  /** The principal (main) chain */
  principalChain: Chain | null;
  /** All functional groups present */
  functionalGroups: FunctionalGroup[];
  /** The principal functional group */
  principalFunctionalGroup: FunctionalGroup | null;
  /** Ring systems in the molecule */
  rings: Ring[];
}

/**
 * Represents a ring system
 */
export interface Ring {
  /** Indices of atoms in this ring */
  atomIndices: number[];
  /** Size of the ring (number of atoms) */
  size: number;
  /** Whether this ring is aromatic */
  isAromatic: boolean;
  /** Whether this ring is part of a fused system */
  isFused: boolean;
}

/**
 * Represents the result of chain selection
 */
export interface ChainSelectionResult {
  /** The selected main chain */
  chain: Chain;
  /** Reason for selection (for debugging) */
  reason: string;
  /** Score or priority value used for selection */
  score: number;
}

/**
 * Represents the result of numbering a chain
 */
export interface NumberingResult {
  /** Numbering for each atom (1-indexed) */
  numbering: Map<number, number>;
  /** Direction of numbering (1 = left to right, -1 = right to left) */
  direction: 1 | -1;
  /** Score for this numbering scheme */
  score: number;
}
