import type { Molecule } from "../../types";
import type {
  NamingContext,
  Chain,
  RingSystem,
  FunctionalGroup,
  ParentStructure,
  RuleConflict,
  NomenclatureMethod,
} from "./types";

/**
 * Core implementation of the IUPAC naming context
 */
export class NamingContextImpl implements NamingContext {
  public molecule: Molecule;
  public functionalGroups: FunctionalGroup[] = [];
  public candidateChains: Chain[] = [];
  public candidateRings: RingSystem[] = [];
  public namingMethod?: NomenclatureMethod;
  public currentLayer?: string;
  public executedRules = new Set<string>();
  public conflicts: RuleConflict[] = [];
  public state = new Map<string, unknown>();

  private _parentStructure?: ParentStructure;

  constructor(molecule: Molecule) {
    this.molecule = molecule;
    // Keep context initialization minimal. Heavy analysis (chain/ring seeding)
    // is performed by the rule/layer system (initial-structure, atomic, ring-analysis).
    // Do not seed candidate chains here to avoid duplicating logic and
    // to keep the mutable context lightweight and side-effect free.
    this.initializeContext();
  }

  get parentStructure(): ParentStructure | undefined {
    return this._parentStructure;
  }

  isAcyclic(): boolean {
    // Use the existing ring detection from the molecule
    // This is simplified - will be enhanced with proper ring analysis
    return !this.molecule.atoms.some((atom) => atom.isInRing ?? false);
  }

  hasFunctionalGroups(): boolean {
    return this.functionalGroups.length > 0;
  }

  getCandidateChains(): Chain[] {
    return [...this.candidateChains];
  }

  getCandidateRings(): RingSystem[] {
    return [...this.candidateRings];
  }

  getFunctionalGroups(): FunctionalGroup[] {
    return [...this.functionalGroups];
  }

  updateCandidates(candidates: Chain[] | RingSystem[]): void {
    if (candidates.length > 0 && candidates[0] && "length" in candidates[0]) {
      // It's Chain[]
      this.candidateChains = candidates as Chain[];
    } else {
      // It's RingSystem[]
      this.candidateRings = candidates as RingSystem[];
    }
  }

  setParentStructure(structure: ParentStructure): void {
    this._parentStructure = structure;
  }

  addFunctionalGroup(group: FunctionalGroup): void {
    this.functionalGroups.push(group);
  }

  setState(key: string, value: unknown): void {
    this.state.set(key, value);
  }

  getState(key: string): unknown {
    return this.state.get(key);
  }

  addConflict(conflict: RuleConflict): void {
    this.conflicts.push(conflict);
  }

  /**
   * Initialize the naming context with basic molecular analysis
   */
  private initializeContext(): void {
    // Intentionally minimal: don't perform chain/ring analysis here.
    // The layered rule engine will seed `candidateChains` and
    // `candidateRings` via dedicated rules.
    this.candidateChains = [];
    this.candidateRings = [];
  }
}
