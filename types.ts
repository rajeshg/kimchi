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
  degree?: number; // heavy atom neighbor count (cached)
  isInRing?: boolean; // true if atom is in any ring (cached)
  ringIds?: number[]; // IDs of rings this atom belongs to (cached)
  hybridization?: 'sp' | 'sp2' | 'sp3' | 'other'; // hybridization state (cached)
}

export interface Bond {
  atom1: number; // atom id
  atom2: number; // atom id
  type: BondType;
  stereo: StereoType; // for double bonds
  isInRing?: boolean; // true if bond is in any ring (cached)
  ringIds?: number[]; // IDs of rings this bond belongs to (cached)
  isRotatable?: boolean; // true if single, non-ring, non-terminal bond (cached)
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
  rings?: number[][]; // cached ring information (atom IDs)
  ringInfo?: RingInfo; // cached detailed ring analysis
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