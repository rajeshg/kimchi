/**
 * Core types for the IUPAC rule engine
 */

import type { Molecule, Atom, Bond } from "../../types";
import type { ImmutableNamingContext } from "./immutable-context";
import type { NamingSubstituent } from "./naming/iupac-types";

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
  state: Map<string, unknown>;

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
  setState(key: string, value: unknown): void;
  getState(key: string): unknown;
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

/**
 * Standard priority values for rule execution within each layer.
 *
 * IMPORTANT: Rules execute in DESCENDING order (higher numbers run FIRST).
 * - Priority 100 executes before priority 50
 * - Priority 50 executes before priority 10
 *
 * Priority values use increments of 10 (10, 20, 30... 100).
 * Higher priority numbers execute earlier in the layer.
 */
export enum RulePriority {
  ONE = 10,
  TWO = 20,
  THREE = 30,
  FOUR = 40,
  FIVE = 50,
  SIX = 60,
  SEVEN = 70,
  EIGHT = 80,
  NINE = 90,
  TEN = 100,
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
  name?: string; // Full name from complex substituent analysis (e.g., flattened alkoxy names)
  locants: number[];
  locant?: number;
  locantsConverted?: boolean; // True if locants have been converted from atom IDs to chain positions
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
  substituents: StructuralSubstituent[];
  locants: number[];
}

export interface RingSystem {
  atoms: Atom[];
  bonds: Bond[];
  rings: Ring[];
  size: number;
  ringCount: number; // Number of individual rings in this system (e.g., 5 for pentacyclic)
  heteroatoms: HeteroAtom[];
  type: RingSystemType;
  fused: boolean;
  bridged: boolean;
  spiro: boolean;
}

export enum RingSystemType {
  AROMATIC = "aromatic",
  ALIPHATIC = "aliphatic",
  HETEROCYCLIC = "heterocyclic",
  FUSED = "fused",
  BRIDGED = "bridged",
  SPIRO = "spiro",
}

export interface Ring {
  atoms: Atom[];
  bonds: Bond[];
  size: number;
  aromatic: boolean;
  heteroatoms: HeteroAtom[];
}

export interface ParentStructure {
  type: "chain" | "ring" | "heteroatom";
  chain?: Chain;
  ring?: RingSystem;
  heteroatom?: Atom;
  name: string;
  locants: number[];
  vonBaeyerNumbering?: Map<number, number>; // For bicyclo/tricyclo systems
  vonBaeyerNumberingOptimized?: boolean; // Track if von Baeyer numbering has been path-reversed/optimized
  assembledName?: string;
  ringNumberingApplied?: boolean; // Track if ring numbering rule has already been applied
  substituents?: (StructuralSubstituent | NamingSubstituent)[]; // Ring substituents attached to the parent structure
}

export interface StructuralSubstituent {
  atoms: Atom[];
  bonds: Bond[];
  type: string;
  locant: number;
  isPrincipal: boolean;
  name?: string;
  prefix?: string;
  position?: string;
  attachedToRingAtomId?: number;
}

export interface MultipleBond {
  atoms: Atom[];
  bond: Bond;
  type: "double" | "triple";
  locant: number;
}

export interface HeteroAtom {
  atom: Atom;
  type: string;
  locant: number;
}

export interface RuleConflict {
  ruleId: string;
  conflictType: "dependency" | "mutual_exclusion" | "state_inconsistency";
  description: string;
  context: unknown;
}

export enum NomenclatureMethod {
  SUBSTITUTIVE = "substitutive",
  FUNCTIONAL_CLASS = "functional_class",
  SKELETAL_REPLACEMENT = "skeletal_replacement",
  MULTIPLICATIVE = "multiplicative",
  CONJUNCTIVE = "conjunctive",
}

export enum LayerType {
  ATOMIC = "atomic",
  FUNCTIONAL_GROUPS = "functional_groups",
  NOMENCLATURE_METHOD = "nomenclature_method",
  PARENT_SELECTION = "parent_selection",
  NUMBERING = "numbering",
  NAME_ASSEMBLY = "name_assembly",
}

export interface NamingResult {
  name: string;
  method: NomenclatureMethod;
  parentStructure: ParentStructure;
  functionalGroups: FunctionalGroup[];
  functionalGroupTrace?: Array<{
    pattern?: string;
    type?: string;
    atomIds: number[];
  }>;
  locants: number[];
  stereochemistry?: string;
  confidence: number;
  rules: string[];
}

/**
 * Blue Book Rule References
 */
export const BLUE_BOOK_RULES = {
  P44_3_1: "P-44.3.1", // Maximum length of continuous chain
  P44_3_2: "P-44.3.2", // Greatest number of multiple bonds
  P44_3_3: "P-44.3.3", // Greatest number of double bonds
  P44_3_4: "P-44.3.4", // Lowest locant set for multiple bonds
  P44_3_5: "P-44.3.5", // Lowest locant set for double bonds
  P44_3_6: "P-44.3.6", // Greatest number of substituents
  P44_3_7: "P-44.3.7", // Lowest locant set for substituents
  P44_3_8: "P-44.3.8", // Lowest alphabetical locant

  P51_1: "P-51.1", // Substitutive nomenclature
  P51_2: "P-51.2", // Functional class nomenclature
  P51_3: "P-51.3", // Skeletal replacement nomenclature
  P51_4: "P-51.4", // Multiplicative nomenclature

  P44_1: "P-44.1", // Principal characteristic group
  P44_2: "P-44.2", // Ring system seniority
  P44_4: "P-44.4", // Ring vs chain criteria

  P2_3: "P-2.3", // Ring assemblies (von Baeyer system)
  P2_4: "P-2.4", // Spiro compounds
  P2_5: "P-2.5", // Fused ring systems

  P14_4: "P-14.4", // Numbering for substituents
  P62_2_1_1: "P-62.2.1.1", // Acyl groups as substituents
} as const;
