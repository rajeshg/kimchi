// Core types for SMILES parsing

export enum BondType {
  SINGLE = 'single',
  DOUBLE = 'double',
  TRIPLE = 'triple',
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
  ringClosures: number[]; // list of ring closure digits
  isBracket: boolean; // true if parsed from bracket
}

export interface Bond {
  atom1: number; // atom id
  atom2: number; // atom id
  type: BondType;
  stereo: StereoType; // for double bonds
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
  // Additional properties can be added later, e.g., rings, properties
}

export interface ParseResult {
  molecules: Molecule[];
  errors: string[]; // any parsing errors
}