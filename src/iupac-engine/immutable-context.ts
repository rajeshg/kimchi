import type { Molecule } from "../../types";
import type { Atom, Bond, MultipleBond } from "types";
import type { OPSINService } from "./opsin-service";
import type { OPSINFunctionalGroupDetector } from "./opsin-functional-group-detector";
import type { RingInfo } from "../utils/ring-analysis";
import { analyzeRings } from "../utils/ring-analysis";

/**
 * Generate a unique ID for a molecule based on its structure
 */
function generateMoleculeId(molecule: Molecule): string {
  // Simple hash based on atoms and bonds
  const atomCount = molecule.atoms.length;
  const bondCount = molecule.bonds.length;
  const elementTypes = molecule.atoms
    .map((atom) => atom.symbol)
    .sort()
    .join("");

  return `mol-${atomCount}-${bondCount}-${elementTypes.slice(0, 10)}-${Date.now()}`;
}
import type {
  Chain,
  RingSystem,
  FunctionalGroup,
  ParentStructure,
  RuleConflict,
} from "./types";

/**
 * Services available to the naming context
 */
export interface ContextServices {
  readonly opsin: OPSINService;
  readonly detector: OPSINFunctionalGroupDetector;
}

interface RawSubstituent {
  position: string;
  type: string;
  size: number;
  name: string;
}

/**
 * Immutable context state interface
 */
export interface ContextState {
  // Core molecular data
  molecule: Molecule;

  // Cached ring analysis (computed once per molecule)
  cachedRingInfo?: RingInfo;

  // Analysis results from phases
  atomicAnalysis?: AtomicAnalysis;
  functionalGroups: FunctionalGroup[];
  candidateChains: Chain[];
  candidateRings: RingSystem[];
  parentStructure?: ParentStructure;
  principalGroup?: FunctionalGroup;

  // Nomenclature method selection
  nomenclatureMethod?: NomenclatureMethod;

  // Naming result
  finalName?: string;
  confidence: number;

  // Phase completion flags
  phaseCompletion: Map<ExecutionPhase, boolean>;

  // Context metadata
  timestamp: Date;
  moleculeId: string;
  // Functional group trace metadata captured from OPSIN detector (pattern, atom ids)
  functionalGroupTrace?: Array<{
    pattern?: string;
    type?: string;
    atomIds: number[];
  }>;

  // Parent chain selection rule state
  longest_chain_length?: number;
  p44_3_1_applied?: boolean;
  max_score?: number;
  max_multiple_bonds?: number;
  p44_3_2_applied?: boolean;
  max_double_bonds?: number;
  p44_3_3_applied?: boolean;
  lowest_multiple_bond_locants?: number[];
  p44_3_4_applied?: boolean;
  lowest_double_bond_locants?: number[];
  p44_3_5_applied?: boolean;
  max_substituents?: number;
  p44_3_6_applied?: boolean;
  lowest_substituent_locants?: number[];
  p44_3_7_applied?: boolean;
  p44_3_8_applied?: boolean;
  selected_chain_final?: Chain;
}

/**
 * Rule execution trace for debugging and auditing
 */
export interface RuleExecutionTrace {
  ruleId: string;
  ruleName: string;
  blueBookSection: string;
  phase: ExecutionPhase;
  timestamp: Date;

  // State before and after rule execution
  beforeState: ContextState;
  afterState: ContextState;

  // Human-readable description of what changed
  description: string;

  // Confidence impact
  confidenceChange?: number;

  // Any conflicts generated
  conflicts: RuleConflict[];
}

/**
 * Execution phases following Blue Book hierarchy
 */
export enum ExecutionPhase {
  NOMENCLATURE_SELECTION = "nomenclature",
  FUNCTIONAL_GROUP = "functional-groups",
  PARENT_STRUCTURE = "parent-structure",
  NUMBERING = "numbering",
  ASSEMBLY = "assembly",
}

/**
 * Nomenclature methods per Blue Book P-51
 */
export enum NomenclatureMethod {
  SUBSTITUTIVE = "substitutive",
  FUNCTIONAL_CLASS = "functional_class",
  SKELETAL_REPLACEMENT = "skeletal_replacement",
  MULTIPLICATIVE = "multiplicative",
  CONJUNCTIVE = "conjunctive",
}

/**
 * Atomic analysis results
 */
export interface AtomicAnalysis {
  valenceMap?: Map<number, number>;
  hybridizationMap?: Map<number, string>;
  aromaticAtoms?: Set<number>;
  heteroatoms?: Array<{ id: number; element: string; type: string }>;
  bondOrderStats?: {
    single: number;
    double: number;
    triple: number;
    aromatic: number;
  };
}

/**
 * Immutable naming context with functional transitions
 */
export class ImmutableNamingContext {
  private readonly state: ContextState;
  private readonly history: RuleExecutionTrace[];
  private readonly services: ContextServices;

  private constructor(
    state: ContextState,
    services: ContextServices,
    history: RuleExecutionTrace[] = [],
  ) {
    this.state = Object.freeze({ ...state });
    this.services = services;
    this.history = [...history];
  }

  /**
   * Create initial context from molecule
   */
  static create(
    molecule: Molecule,
    services: ContextServices,
  ): ImmutableNamingContext {
    // Compute ring analysis ONCE and cache it
    const cachedRingInfo = analyzeRings(molecule);

    const initialState: ContextState = {
      molecule,
      cachedRingInfo,
      functionalGroups: [],
      candidateChains: [],
      candidateRings: [],
      confidence: 1.0,
      phaseCompletion: new Map(),
      timestamp: new Date(),
      moleculeId: generateMoleculeId(molecule),
    };

    // Populate candidateChains using the IUPAC utility if available so that
    // parent chain selection rules have reasonable starting candidates.
    try {
      // Local require to avoid circular import issues
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        findMainChain,
        findSubstituents,
      } = require("./naming/iupac-chains");
      const main = findMainChain(
        molecule,
        undefined,
        services.detector,
      ) as number[];
      const candidates: Chain[] = [];
      if (main && main.length >= 2) {
        const atoms = main
          .map((idx) => molecule.atoms[idx])
          .filter(Boolean) as Atom[];
        const bonds: Bond[] = [];
        const multipleBonds: MultipleBond[] = [];
        for (let i = 0; i < main.length - 1; i++) {
          const a = main[i]!;
          const b = main[i + 1]!;
          const bond = molecule.bonds.find(
            (bb) =>
              (bb.atom1 === a && bb.atom2 === b) ||
              (bb.atom1 === b && bb.atom2 === a),
          );
          if (bond) {
            bonds.push(bond);
            if (bond.type !== "single") {
              multipleBonds.push({
                atoms: [molecule.atoms[a]!, molecule.atoms[b]!],
                bond,
                type: bond.type === "double" ? "double" : "triple",
                locant: i + 1,
              });
            }
          }
        }
        const subsRaw = findSubstituents(
          molecule,
          main as number[],
          services.detector,
        );
        const substituents = (subsRaw as RawSubstituent[]).map((s) => {
          if (process.env.VERBOSE) {
            console.log(
              `[immutable-context] Creating substituent: name="${s.name}", type="${s.type}", position="${s.position}", size=${s.size}`,
            );
          }
          return {
            atoms: [],
            bonds: [],
            type: s.name,
            locant: parseInt(s.position, 10),
            isPrincipal: false,
            name: s.name,
          };
        });
        candidates.push({
          atoms,
          bonds,
          length: atoms.length,
          multipleBonds,
          substituents,
          locants: Array.from({ length: atoms.length }, (_, i) => i + 1),
        });
      }
      initialState.candidateChains = candidates;
    } catch (_err) {
      // ignore and leave candidateChains empty
    }

    return new ImmutableNamingContext(initialState, services);
  }

  /**
   * Get current state (read-only)
   */
  getState(): Readonly<ContextState> {
    return this.state;
  }

  /**
   * Get OPSIN service for rule lookups
   */
  getOPSIN(): OPSINService {
    return this.services.opsin;
  }

  /**
   * Get OPSIN functional group detector
   */
  getDetector(): OPSINFunctionalGroupDetector {
    return this.services.detector;
  }

  /**
   * Get execution history
   */
  getHistory(): ReadonlyArray<RuleExecutionTrace> {
    return [...this.history];
  }

  /**
   * Get phase completion status
   */
  isPhaseComplete(phase: ExecutionPhase): boolean {
    return this.state.phaseCompletion.get(phase) || false;
  }

  /**
   * Immutable state transition with trace
   */
  withStateUpdate(
    updater: (state: ContextState) => ContextState,
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    const beforeState = this.state;
    const afterState = updater(beforeState);

    const trace: RuleExecutionTrace = {
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      timestamp: new Date(),
      beforeState,
      afterState,
      description,
      conflicts: [],
    };

    const newState = Object.freeze({ ...afterState });
    const newHistory = [...this.history, trace];

    return new ImmutableNamingContext(newState, this.services, newHistory);
  }

  /**
   * Update candidate chains with trace
   */
  withUpdatedCandidates(
    candidates: Chain[],
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    return this.withStateUpdate(
      (state) => ({ ...state, candidateChains: candidates }),
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      description,
    );
  }

  /**
   * Update candidate rings with trace
   */
  withUpdatedRings(
    rings: RingSystem[],
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    return this.withStateUpdate(
      (state) => ({ ...state, candidateRings: rings }),
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      description,
    );
  }

  /**
   * Set parent structure with trace
   */
  withParentStructure(
    parentStructure: ParentStructure,
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    return this.withStateUpdate(
      (state) => ({ ...state, parentStructure }),
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      description,
    );
  }

  /**
   * Add functional groups with trace
   */
  withFunctionalGroups(
    functionalGroups: FunctionalGroup[],
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    return this.withStateUpdate(
      (state) => ({ ...state, functionalGroups }),
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      description,
    );
  }

  /**
   * Update nomenclature method with trace
   */
  withNomenclatureMethod(
    method: NomenclatureMethod,
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    return this.withStateUpdate(
      (state) => ({ ...state, nomenclatureMethod: method }),
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      description,
    );
  }

  /**
   * Mark phase as complete
   */
  withPhaseCompletion(
    phase: ExecutionPhase,
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phaseController: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    const newPhaseCompletion = new Map(this.state.phaseCompletion);
    newPhaseCompletion.set(phase, true);

    return this.withStateUpdate(
      (state) => ({ ...state, phaseCompletion: newPhaseCompletion }),
      ruleId,
      ruleName,
      blueBookSection,
      phaseController,
      description,
    );
  }

  /**
   * Update confidence with trace
   */
  withConfidenceUpdate(
    newConfidence: number,
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    const beforeState = this.state;
    const confidenceChange = newConfidence - this.state.confidence;
    const afterState = {
      ...beforeState,
      confidence: Math.max(0, Math.min(1, newConfidence)),
    };

    const trace: RuleExecutionTrace = {
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      timestamp: new Date(),
      beforeState,
      afterState,
      description,
      confidenceChange,
      conflicts: [],
    };

    const newState = Object.freeze({ ...afterState });
    const newHistory = [...this.history, trace];

    return new ImmutableNamingContext(newState, this.services, newHistory);
  }

  /**
   * Add conflict with trace
   */
  withConflict(
    conflict: RuleConflict,
    ruleId: string,
    ruleName: string,
    blueBookSection: string,
    phase: ExecutionPhase,
    description: string,
  ): ImmutableNamingContext {
    // For conflicts, we'll need to track them in state
    // This is a simplified implementation
    return this.withStateUpdate(
      (state) => ({ ...state }), // Conflicts tracked in trace for now
      ruleId,
      ruleName,
      blueBookSection,
      phase,
      `${description} - Conflict: ${conflict.description}`,
    );
  }

  /**
   * Generate final naming result
   */
  generateResult(): NamingResult {
    return {
      name:
        this.state.finalName ||
        this.state.parentStructure?.name ||
        this.generateFallbackName(),
      method: this.state.nomenclatureMethod || NomenclatureMethod.SUBSTITUTIVE,
      parentStructure: this.state.parentStructure!,
      functionalGroups: this.state.functionalGroups,
      confidence: this.state.confidence,
      rules: this.history.map((trace) => trace.ruleId),
      blueBookSections: this.history.map((trace) => trace.blueBookSection),
      phaseExecution: this.getPhaseExecutionSummary(),
    };
  }

  /**
   * Get phase execution summary
   */
  private getPhaseExecutionSummary(): Record<ExecutionPhase, boolean> {
    const summary = {} as Record<ExecutionPhase, boolean>;
    for (const phase of Object.values(ExecutionPhase)) {
      summary[phase] = this.isPhaseComplete(phase);
    }
    return summary;
  }

  /**
   * Generate fallback name when errors occur
   */
  private generateFallbackName(): string {
    if (this.state.parentStructure?.type === "chain") {
      const length = this.state.parentStructure.chain?.length || 0;
      return length > 0
        ? `Unknown ${length}-carbon compound`
        : "Unknown compound";
    } else if (this.state.parentStructure?.type === "ring") {
      const size = this.state.parentStructure.ring?.size || 0;
      return size > 0
        ? `Unknown ${size}-membered ring`
        : "Unknown ring compound";
    }
    return "Unable to generate IUPAC name";
  }

  /**
   * Get trace for debugging (last N traces)
   */
  getRecentTraces(count: number = 10): RuleExecutionTrace[] {
    return this.history.slice(-count);
  }

  /**
   * Check if context has required data for a phase
   */
  hasRequiredDataForPhase(phase: ExecutionPhase): boolean {
    switch (phase) {
      case ExecutionPhase.FUNCTIONAL_GROUP:
        return this.state.molecule.atoms.length > 0;
      case ExecutionPhase.PARENT_STRUCTURE:
        return (
          this.state.functionalGroups.length > 0 ||
          this.state.molecule.atoms.length > 0
        );
      case ExecutionPhase.NUMBERING:
        return this.state.parentStructure !== undefined;
      case ExecutionPhase.ASSEMBLY:
        return this.state.parentStructure !== undefined;
      default:
        return true;
    }
  }
}

/**
 * Result interface for IUPAC naming
 */
export interface NamingResult {
  name: string;
  method: NomenclatureMethod;
  parentStructure: ParentStructure;
  functionalGroups: FunctionalGroup[];
  confidence: number;
  rules: string[];
  blueBookSections: string[];
  phaseExecution: Record<ExecutionPhase, boolean>;
}
