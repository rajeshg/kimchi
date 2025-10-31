import type { ImmutableNamingContext, ExecutionPhase } from './immutable-context';
import type { LayerContract } from './contracts/layer-contracts';
import type { IUPACRule } from './types';

/**
 * Phase controller for executing rules in a specific phase
 */
export class PhaseController {
  private rules: IUPACRule[];
  private contract: LayerContract;
  
  constructor(
    public readonly phase: ExecutionPhase,
    rules: IUPACRule[],
    contract: LayerContract
  ) {
    this.rules = rules.sort((a, b) => a.priority - b.priority);
    this.contract = contract;
  }
  
  /**
   * Check if this phase can execute with the given context
   */
  canExecute(context: ImmutableNamingContext): boolean {
    // Check phase dependencies
    if (!this.checkPhaseDependencies(context)) {
      return false;
    }
    
    // Check if phase is already complete
    if (context.isPhaseComplete(this.phase)) {
      return false;
    }
    
    // Check if context has required data for this phase
    return context.hasRequiredDataForPhase(this.phase);
  }
  
  /**
   * Execute all rules in this phase
   */
  execute(context: ImmutableNamingContext): ImmutableNamingContext {
    let currentContext = context;
    
    // Execute rules in priority order
    for (const rule of this.rules) {
      if (rule.conditions(currentContext)) {
        try {
          const ruleResult = rule.action(currentContext);
          currentContext = ruleResult;
        } catch (error) {
          // Log error but continue with other rules
          currentContext = currentContext.withConflict(
            {
              ruleId: rule.id,
              conflictType: 'state_inconsistency',
              description: `Rule ${rule.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              context: { error }
            },
            rule.id,
            rule.name,
            rule.blueBookReference,
            this.phase,
            `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
    
    // Mark phase as complete
    currentContext = currentContext.withPhaseCompletion(
      this.phase,
      `phase-${this.phase}`,
      `${this.phase} phase completion`,
      `${this.phase} phase`,
      this.phase,
      `Phase ${this.phase} completed successfully`
    );
    
    return currentContext;
  }
  
  /**
   * Get the layer contract for this phase
   */
  getContract(): LayerContract {
    return this.contract;
  }
  
  /**
   * Get all rules in this phase
   */
  getRules(): IUPACRule[] {
    return [...this.rules];
  }
  
  /**
   * Check if phase dependencies are satisfied
   */
  private checkPhaseDependencies(context: ImmutableNamingContext): boolean {
    for (const dependency of this.contract.dependencies) {
      if (!this.isDependencySatisfied(dependency, context)) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Check if a specific dependency is satisfied
   */
  private isDependencySatisfied(dependency: any, context: ImmutableNamingContext): boolean {
    const state = context.getState();
    
    switch (dependency.name) {
      case 'atomicAnalysis':
        return state.atomicAnalysis !== undefined;
      case 'functionalGroups':
        return state.functionalGroups.length > 0;
      case 'parentStructure':
        return state.parentStructure !== undefined;
      case 'candidateChains':
        return state.candidateChains.length > 0;
      case 'candidateRings':
        return state.candidateRings.length > 0;
      default:
        // Unknown dependency - check if it exists in state
        return (state as any)[dependency.name] !== undefined;
    }
  }
  
  /**
   * Validate that the phase produced what it promised
   */
  validateOutput(context: ImmutableNamingContext): boolean {
    const state = context.getState();
    
    for (const provided of this.contract.provides) {
      if (!this.isOutputProvided(provided, state)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if an output was properly provided
   */
  private isOutputProvided(provided: any, state: any): boolean {
    const output = state[provided.name];
    
    if (output === undefined) {
      return false;
    }
    
    // Apply validation rule if provided
    if (provided.validation) {
      return provided.validation(output);
    }
    
    return true;
  }
  
  /**
   * Get phase execution statistics
   */
  getExecutionStats(context: ImmutableNamingContext): PhaseExecutionStats {
    const history = context.getHistory();
    const phaseTraces = history.filter(trace => trace.phase === this.phase);
    
    return {
      phase: this.phase,
      rulesExecuted: phaseTraces.length,
      rulesSucceeded: phaseTraces.filter(trace => 
        !trace.description.includes('failed') && 
        !trace.description.includes('error')
      ).length,
      rulesFailed: phaseTraces.filter(trace => 
        trace.description.includes('failed') || 
        trace.description.includes('error')
      ).length,
      confidenceChange: this.calculateConfidenceChange(history),
      executionTime: this.calculateExecutionTime(phaseTraces)
    };
  }
  
  /**
   * Calculate confidence change from this phase
   */
  private calculateConfidenceChange(history: ReadonlyArray<any>): number {
    const phaseTraces = history.filter(trace => trace.phase === this.phase);
    
    if (phaseTraces.length === 0) {
      return 0;
    }
    
    const firstTrace = phaseTraces[0];
    const lastTrace = phaseTraces[phaseTraces.length - 1];
    
    return lastTrace.afterState.confidence - firstTrace.beforeState.confidence;
  }
  
  /**
   * Calculate execution time for this phase
   */
  private calculateExecutionTime(traces: ReadonlyArray<any>): number {
    if (traces.length === 0) {
      return 0;
    }
    
    const startTime = traces[0].timestamp.getTime();
    const endTime = traces[traces.length - 1].timestamp.getTime();
    
    return endTime - startTime;
  }
}

/**
 * Phase execution statistics
 */
export interface PhaseExecutionStats {
  phase: ExecutionPhase;
  rulesExecuted: number;
  rulesSucceeded: number;
  rulesFailed: number;
  confidenceChange: number;
  executionTime: number; // milliseconds
}

/**
 * Create a phase controller from rule files and contract
 */
export class PhaseControllerFactory {
  /**
   * Create a phase controller with automatic rule discovery
   */
  static create(
    phase: ExecutionPhase,
    rulePatterns: string[],
    contract: LayerContract
  ): PhaseController {
    // In a real implementation, this would use glob patterns
    // to discover and load rule files dynamically
    const rules = this.discoverRules(rulePatterns);
    
    return new PhaseController(phase, rules, contract);
  }
  
  /**
   * Discover rules from file patterns
   */
  private static discoverRules(patterns: string[]): IUPACRule[] {
    const fs = require('fs');
    const path = require('path');
    const rulesDir = path.resolve(__dirname, 'rules');
    const collected: IUPACRule[] = [];

    try {
      if (!fs.existsSync(rulesDir)) return collected;

      const files = fs.readdirSync(rulesDir);

      for (const file of files) {
        // only consider .ts/.js files (compiled or source)
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

        const filePath = path.join(rulesDir, file);
        try {
          // Dynamic import expects a file:// URL in some runtimes; try both approaches
          // Use require as a robust fallback for CommonJS/Test runners
          let mod: any = null;
          try {
            mod = require(filePath);
          } catch (e) {
            // Try dynamic import (Esm)
            try {
              // eslint-disable-next-line no-eval
              const imp = eval('import');
              imp(filePath).then((m: any) => { mod = m; }).catch(() => {});
            } catch (_) {
              // ignore
            }
          }

          if (!mod) continue;

          // A module may export a single rule, an array, or named exports
          const candidates: any[] = [];
          if (mod.default) candidates.push(mod.default);
          // push named exports that look like rules/arrays
          for (const k of Object.keys(mod)) {
            const v = mod[k];
            if (!v) continue;
            // if it's an array of rules
            if (Array.isArray(v) && v.length > 0 && typeof v[0].id === 'string') {
              candidates.push(...v);
            } else if (typeof v === 'object' && typeof v.id === 'string') {
              candidates.push(v);
            }
          }

          for (const c of candidates) {
            if (this.validateRule(c)) collected.push(c as IUPACRule);
          }
          } catch (e) {
            // continue on import errors but log under VERBOSE mode
            if (process.env.VERBOSE) console.warn('discoverRules import failed for', filePath, String(e));
            continue;
          }
      }
    } catch (e) {
      if (process.env.VERBOSE) console.warn('discoverRules failed', String(e));
    }

    // Sort by priority to provide deterministic ordering
    collected.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    return collected;
  }
  
  /**
   * Validate rule metadata and structure
   */
  private static validateRule(rule: any): boolean {
    return (
      rule &&
      typeof rule.id === 'string' &&
      typeof rule.name === 'string' &&
      typeof rule.blueBookReference === 'string' &&
      typeof rule.priority === 'number' &&
      typeof rule.conditions === 'function' &&
      typeof rule.action === 'function'
    );
  }
}