// Core types for SMILES parsing

export enum BondType {
  SINGLE = 'single',
  DOUBLE = 'double',
  TRIPLE = 'triple',
  QUADRUPLE = 'quadruple',
  AROMATIC = 'aromatic',
}

export enum StereoType {
  NONE = 'none',
  UP = 'up', // /
  DOWN = 'down', // \
  EITHER = 'either',
}

/**
 * Atom in a molecule.
 * After parsing, all atoms are enriched with pre-computed properties.
 * Molecules are immutable post-parse - never mutate atoms directly.
 */
export interface Atom {
  id: number; // unique identifier
  symbol: string; // e.g., 'C', 'N', '[Fe]'
  atomicNumber: number; // from symbol
  charge: number; // formal charge
  hydrogens: number; // explicit hydrogens
  isotope: number | null; // isotopic mass, null if unspecified
  aromatic: boolean; // true if aromatic
  chiral: string | null; // e.g., '@', '@@', '@TH1', etc.
  isBracket: boolean; // true if parsed from bracket
  atomClass: number; // atom class for application-specific marking (default 0)
  degree?: number; // heavy atom neighbor count (pre-computed after enrichment)
  isInRing?: boolean; // true if atom is in any ring (pre-computed after enrichment)
  ringIds?: number[]; // IDs of rings this atom belongs to (pre-computed after enrichment)
  hybridization?: 'sp' | 'sp2' | 'sp3' | 'other'; // hybridization state (pre-computed after enrichment)
}

/**
 * Bond between two atoms.
 * After parsing, all bonds are enriched with pre-computed properties.
 * Molecules are immutable post-parse - never mutate bonds directly.
 */
export interface Bond {
  atom1: number; // atom id
  atom2: number; // atom id
  type: BondType;
  stereo: StereoType; // for double bonds
  isInRing?: boolean; // true if bond is in any ring (pre-computed after enrichment)
  ringIds?: number[]; // IDs of rings this bond belongs to (pre-computed after enrichment)
  isRotatable?: boolean; // true if single, non-ring, non-terminal bond (pre-computed after enrichment)
}

/**
 * Molecule representation.
 * After parsing, all molecules are enriched with ring analysis.
 * Molecules are immutable post-parse - create new molecules instead of mutating.
 */
export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
  rings?: number[][]; // ring information (atom IDs) (pre-computed after enrichment)
  ringInfo?: RingInfo; // detailed ring analysis (pre-computed after enrichment)
}

export interface RingInfo {
  atomRings: Map<number, Set<number>>; // atom ID -> set of ring IDs
  bondRings: Map<string, Set<number>>; // bond key -> set of ring IDs
  rings: number[][]; // all rings (atom IDs)
}

export interface ParseError {
  message: string;
  position: number; // character position in SMILES string (0-based)
}

export interface ParseResult {
  molecules: Molecule[];
  errors: ParseError[]; // any parsing errors with position info
}