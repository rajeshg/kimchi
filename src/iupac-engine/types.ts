/**
 * Core types for the IUPAC rule engine
 */

import type { Molecule, Atom, Bond } from '../../types';
import type { ImmutableNamingContext } from './immutable-context';

export interface NamingContext {
  // Core molecule data
  molecule: Molecule;
  
  // Naming state
  parentStructure?: ParentStructure;
  functionalGroups: FunctionalGroup[];
  candidateChains: Chain[];
  candidateRings: RingSystem[];
  namingMethod?: NomenclatureMethod;
  
  // Rule execution state
  currentLayer?: string;
  executedRules: Set<string>;
  conflicts: RuleConflict[];
  
  // Context state
  state: Map<string, any>;
  
  // Methods for rule access
  isAcyclic(): boolean;
  hasFunctionalGroups(): boolean;
  getCandidateChains(): Chain[];
  getCandidateRings(): RingSystem[];
  getFunctionalGroups(): FunctionalGroup[];
  
  // Context manipulation
  updateCandidates(candidates: Chain[] | RingSystem[]): void;
  setParentStructure(structure: ParentStructure): void;
  addFunctionalGroup(group: FunctionalGroup): void;
  setState(key: string, value: any): void;
  getState(key: string): any;
  addConflict(conflict: RuleConflict): void;
}

export interface IUPACRule {
  id: string;
  name: string;
  description: string;
  blueBookReference: string;
  priority: number;
  conditions: (context: ImmutableNamingContext) => boolean;
  action: (context: ImmutableNamingContext) => ImmutableNamingContext;
  dependencies?: string[];
  conflicts?: string[];
}

export interface Layer {
  name: string;
  description: string;
  rules: IUPACRule[];
  dependencies?: string[];
  layerType: LayerType;
}

export interface FunctionalGroup {
  type: string;
  atoms: Atom[];
  bonds: Bond[];
  priority: number;
  isPrincipal: boolean;
  suffix?: string;
  prefix?: string;
  locants: number[];
  // Assembled metadata used during name assembly
  assembledName?: string;
  locantString?: string;
  isMultiplicative?: boolean;
  multiplicity?: number;
}

export interface Chain {
  atoms: Atom[];
  bonds: Bond[];
  length: number;
  multipleBonds: MultipleBond[];
  substituents: Substituent[];
  locants: number[];
}

export interface RingSystem {
  atoms: Atom[];
  bonds: Bond[];
  rings: Ring[];
  size: number;
  heteroatoms: HeteroAtom[];
  type: RingSystemType;
  fused: boolean;
  bridged: boolean;
  spiro: boolean;
}

export enum RingSystemType {
  AROMATIC = 'aromatic',
  ALIPHATIC = 'aliphatic',
  HETEROCYCLIC = 'heterocyclic',
  FUSED = 'fused',
  BRIDGED = 'bridged',
  SPIRO = 'spiro'
}

export interface Ring {
  atoms: Atom[];
  bonds: Bond[];
  size: number;
  aromatic: boolean;
  heteroatoms: HeteroAtom[];
}

export interface ParentStructure {
  type: 'chain' | 'ring';
  chain?: Chain;
  ring?: RingSystem;
  name: string;
  locants: number[];
}

export interface Substituent {
  atoms: Atom[];
  bonds: Bond[];
  type: string;
  locant: number;
  isPrincipal: boolean;
}

export interface MultipleBond {
  atoms: Atom[];
  bond: Bond;
  type: 'double' | 'triple';
  locant: number;
}

export interface HeteroAtom {
  atom: Atom;
  type: string;
  locant: number;
}

export interface RuleConflict {
  ruleId: string;
  conflictType: 'dependency' | 'mutual_exclusion' | 'state_inconsistency';
  description: string;
  context: any;
}

export enum NomenclatureMethod {
  SUBSTITUTIVE = 'substitutive',
  FUNCTIONAL_CLASS = 'functional_class',
  SKELETAL_REPLACEMENT = 'skeletal_replacement',
  MULTIPLICATIVE = 'multiplicative',
  CONJUNCTIVE = 'conjunctive'
}

export enum LayerType {
  ATOMIC = 'atomic',
  FUNCTIONAL_GROUPS = 'functional_groups',
  NOMENCLATURE_METHOD = 'nomenclature_method',
  PARENT_SELECTION = 'parent_selection',
  NUMBERING = 'numbering',
  NAME_ASSEMBLY = 'name_assembly'
}

export interface NamingResult {
  name: string;
  method: NomenclatureMethod;
  parentStructure: ParentStructure;
  functionalGroups: FunctionalGroup[];
  functionalGroupTrace?: Array<{ pattern?: string; type?: string; atomIds: number[] }>;
  locants: number[];
  stereochemistry?: string;
  confidence: number;
  rules: string[];
}

/**
 * Blue Book Rule References
 */
export const BLUE_BOOK_RULES = {
  P44_3_1: 'P-44.3.1', // Maximum length of continuous chain
  P44_3_2: 'P-44.3.2', // Greatest number of multiple bonds
  P44_3_3: 'P-44.3.3', // Greatest number of double bonds
  P44_3_4: 'P-44.3.4', // Lowest locant set for multiple bonds
  P44_3_5: 'P-44.3.5', // Lowest locant set for double bonds
  P44_3_6: 'P-44.3.6', // Greatest number of substituents
  P44_3_7: 'P-44.3.7', // Lowest locant set for substituents
  P44_3_8: 'P-44.3.8', // Lowest alphabetical locant
  
  P51_1: 'P-51.1', // Substitutive nomenclature
  P51_2: 'P-51.2', // Functional class nomenclature
  P51_3: 'P-51.3', // Skeletal replacement nomenclature
  P51_4: 'P-51.4', // Multiplicative nomenclature
  
  P44_1: 'P-44.1', // Principal characteristic group
  P44_2: 'P-44.2', // Ring system seniority
  P44_4: 'P-44.4', // Ring vs chain criteria
  
  P14_4: 'P-14.4' // Numbering for substituents
} as const;