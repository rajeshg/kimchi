/**
 * Tests for the improved IUPAC rule engine with immutable context
 */

import { describe, test, expect } from "bun:test";
import {
  ImmutableNamingContext,
  ExecutionPhase,
  type ContextServices,
} from "../../../src/iupac-engine/immutable-context";
import {
  FUNCTIONAL_GROUP_CONTRACT,
  ContractValidator,
} from "../../../src/iupac-engine/layer-contracts";
import { getSharedOPSINService } from "../../../src/iupac-engine/opsin-service";
import { OPSINFunctionalGroupDetector } from "../../../src/iupac-engine/opsin-functional-group-detector";

// Helper to create test services
function createTestServices(): ContextServices {
  return {
    opsin: getSharedOPSINService(),
    detector: new OPSINFunctionalGroupDetector(),
  };
}

describe("Improved IUPAC Rule Engine", () => {
  test("should create immutable context with molecule", () => {
    // Simplified molecule without complex typing
    const molecule = {
      atoms: [{ id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 4 }],
      bonds: [],
    } as any;

    const context = ImmutableNamingContext.create(
      molecule,
      createTestServices(),
    );

    expect(context.getState().molecule).toBe(molecule);
    expect(context.getState().confidence).toBe(1.0);
    expect(context.getHistory()).toHaveLength(0);
  });

  test("should support functional state transitions with traces", () => {
    const molecule = {
      atoms: [{ id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 4 }],
      bonds: [],
    } as any;

    const context = ImmutableNamingContext.create(
      molecule,
      createTestServices(),
    );

    // Update candidate chains with trace
    const chain = {
      atoms: [molecule.atoms[0]],
      bonds: [],
      length: 1,
      multipleBonds: [],
      substituents: [],
      locants: [1],
    };

    const newContext = context.withUpdatedCandidates(
      [chain],
      "test-rule",
      "Test Rule",
      "Test Section",
      ExecutionPhase.PARENT_STRUCTURE,
      "Added test chain candidate",
    );

    // Context should be immutable - original unchanged
    expect(context.getState().candidateChains).toHaveLength(0);
    expect(newContext.getState().candidateChains).toHaveLength(1);

    // Should have trace history
    expect(newContext.getHistory()).toHaveLength(1);
    const firstHistoryEntry = newContext.getHistory()[0]!;
    expect(firstHistoryEntry.ruleId).toBe("test-rule");
    expect(firstHistoryEntry.description).toBe("Added test chain candidate");
  });

  test("should track phase completion", () => {
    const molecule = {
      atoms: [{ id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 4 }],
      bonds: [],
    } as any;

    const context = ImmutableNamingContext.create(
      molecule,
      createTestServices(),
    );

    expect(context.isPhaseComplete(ExecutionPhase.FUNCTIONAL_GROUP)).toBe(
      false,
    );

    const completedContext = context.withPhaseCompletion(
      ExecutionPhase.FUNCTIONAL_GROUP,
      "phase-test",
      "Phase Test",
      "Test Section",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Phase completed",
    );

    expect(
      completedContext.isPhaseComplete(ExecutionPhase.FUNCTIONAL_GROUP),
    ).toBe(true);
    expect(context.isPhaseComplete(ExecutionPhase.FUNCTIONAL_GROUP)).toBe(
      false,
    ); // Original unchanged
  });

  test("should maintain trace history for debugging", () => {
    const molecule = {
      atoms: [{ id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 4 }],
      bonds: [],
    } as any;

    let context = ImmutableNamingContext.create(molecule, createTestServices());

    // Apply multiple rule updates
    context = context.withUpdatedCandidates(
      [],
      "rule-1",
      "Rule 1",
      "P-44.1",
      ExecutionPhase.PARENT_STRUCTURE,
      "Applied rule 1",
    );

    context = context.withConfidenceUpdate(
      0.8,
      "confidence-rule",
      "Confidence Rule",
      "Confidence Section",
      ExecutionPhase.PARENT_STRUCTURE,
      "Updated confidence",
    );

    context = context.withPhaseCompletion(
      ExecutionPhase.PARENT_STRUCTURE,
      "phase-completion",
      "Phase Completion",
      "Completion Section",
      ExecutionPhase.PARENT_STRUCTURE,
      "Phase completed",
    );

    const history = context.getHistory();
    expect(history).toHaveLength(3);

    // Check recent traces
    const recentTraces = context.getRecentTraces(2);
    expect(recentTraces).toHaveLength(2);

    // Verify trace structure
    expect(history.length).toBeGreaterThan(0);
    const firstTrace = history[0]!;
    expect(firstTrace.ruleId).toBe("rule-1");
    expect(firstTrace.blueBookSection).toBe("P-44.1");
    expect(firstTrace.phase).toBe(ExecutionPhase.PARENT_STRUCTURE);
    expect(firstTrace.beforeState).toBeDefined();
    expect(firstTrace.afterState).toBeDefined();
    expect(firstTrace.description).toBe("Applied rule 1");
  });

  test("should check phase readiness", () => {
    const molecule = {
      atoms: [{ id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 4 }],
      bonds: [],
    } as any;

    const context = ImmutableNamingContext.create(
      molecule,
      createTestServices(),
    );

    // Check phase readiness
    expect(
      context.hasRequiredDataForPhase(ExecutionPhase.FUNCTIONAL_GROUP),
    ).toBe(true);
    expect(
      context.hasRequiredDataForPhase(ExecutionPhase.PARENT_STRUCTURE),
    ).toBe(true);
    expect(context.hasRequiredDataForPhase(ExecutionPhase.NUMBERING)).toBe(
      false,
    );
    expect(context.hasRequiredDataForPhase(ExecutionPhase.ASSEMBLY)).toBe(
      false,
    );
  });

  test("should validate layer contracts", () => {
    const molecule = {
      atoms: [
        { id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 3 },
        { id: 1, symbol: "O", atomicNumber: 8, charge: 0, hydrogens: 1 },
      ],
      bonds: [],
    } as any;

    const context = ImmutableNamingContext.create(
      molecule,
      createTestServices(),
    );

    // Add atomic analysis to satisfy functional group contract
    const contextWithAnalysis = context.withStateUpdate(
      (state) => ({
        ...state,
        atomicAnalysis: {
          valenceMap: new Map([
            [0, 4],
            [1, 2],
          ]),
          hybridizationMap: new Map([
            [0, "sp3"],
            [1, "sp3"],
          ]),
          aromaticAtoms: new Set(),
          heteroatoms: [{ id: 1, element: "O", type: "oxygen" }],
          bondOrderStats: { single: 1, double: 0, triple: 0, aromatic: 0 },
        },
      }),
      "atomic-analysis",
      "Atomic Analysis",
      "Basic Analysis",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Added atomic analysis",
    );

    // Validate contract
    const validationResult = ContractValidator.validateContract(
      FUNCTIONAL_GROUP_CONTRACT,
      contextWithAnalysis.getState(),
    );

    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errors).toHaveLength(0);

    // Contract should be satisfied for dependencies
    expect(validationResult.warnings.length).toBeGreaterThan(0); // Expected outputs not yet provided
  });
});
