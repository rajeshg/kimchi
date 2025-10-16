export type AtomPrimitiveType =
  | 'wildcard'
  | 'element'
  | 'aromatic_element'
  | 'aliphatic_element'
  | 'atomic_number'
  | 'degree'
  | 'valence'
  | 'connectivity'
  | 'total_h'
  | 'implicit_h'
  | 'ring_membership'
  | 'ring_size'
  | 'ring_connectivity'
  | 'charge'
  | 'aromatic'
  | 'aliphatic';

export type BondPrimitiveType =
  | 'single'
  | 'double'
  | 'triple'
  | 'aromatic'
  | 'any'
  | 'ring'
  | 'not_ring';

export interface AtomPrimitive {
  type: AtomPrimitiveType;
  value?: string | number;
  negate?: boolean;
}

export interface BondPrimitive {
  type: BondPrimitiveType;
  negate?: boolean;
}

export type LogicalOperator = 'and' | 'or' | 'not';

export interface LogicalExpression {
  operator: LogicalOperator;
  operands: (AtomPrimitive | LogicalExpression)[];
}

export interface PatternAtom {
  index: number;
  primitives: AtomPrimitive[];
  logicalExpression?: LogicalExpression;
  recursive?: SMARTSPattern;
}

export interface PatternBond {
  from: number;
  to: number;
  primitives: BondPrimitive[];
  isRingClosure?: boolean;
}

export interface SMARTSPattern {
  atoms: PatternAtom[];
  bonds: PatternBond[];
  components?: SMARTSPattern[];
}

export interface AtomMatch {
  patternIndex: number;
  moleculeIndex: number;
}

export interface BondMatch {
  patternBondIndex: number;
  moleculeBondIndex: number;
}

export interface Match {
  atoms: AtomMatch[];
  bonds?: BondMatch[];
}

export interface MatchResult {
  success: boolean;
  matches: Match[];
  errors?: string[];
}

export interface SMARTSMatchOptions {
  uniqueMatches?: boolean;
  maxMatches?: number;
  timeout?: number;
}
