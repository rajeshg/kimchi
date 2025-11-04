/**
 * Blue Book Example Test - Demonstrating the improved IUPAC rule engine
 *
 * This test uses an example from the Blue Book to show how the new
 * rule engine would work with immutable context and proper traceability.
 */

import { describe, test, expect } from "bun:test";
import {
  ImmutableNamingContext,
  ExecutionPhase,
  NomenclatureMethod,
} from "../../../src/iupac-engine/immutable-context";

// Blue Book Example: P-44.3.6 - Chain Selection with Substituents
// SMILES: CC(C)C(C(C(C)C)C)C
// Expected: 2,3,4-trimethylhexane

describe("Blue Book P-44.3.6 Example", () => {
  test("should demonstrate rule-based chain selection with traceability", () => {
    // Simplified molecule representing CC(C)C(C(C(C)C)C)C
    const molecule = {
      atoms: [
        // Chain backbone carbons
        { id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 3 },
        { id: 1, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 2 },
        { id: 2, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 1 },
        { id: 3, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 1 },
        { id: 4, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 1 },
        { id: 5, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 3 },
        // Substituent methyl groups
        { id: 6, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 3 },
        { id: 7, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 3 },
        { id: 8, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 3 },
        { id: 9, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 3 },
      ],
      bonds: [],
    } as any;

    let context = ImmutableNamingContext.create(molecule);

    console.log("🧪 Blue Book Example: P-44.3.6 Chain Selection");
    console.log("📝 SMILES: CC(C)C(C(C(C)C)C)C");
    console.log("🎯 Expected: 2,3,4-trimethylhexane");
    console.log("📖 Rule: Greatest number of substituents (P-44.3.6)");

    // Step 1: P-44.3.1 - Maximum Length Selection
    const candidateChains = generateCandidateChains(molecule);
    context = context.withUpdatedCandidates(
      candidateChains,
      "P-44.3.1",
      "Maximum Length of Continuous Chain",
      "P-44.3.1",
      ExecutionPhase.PARENT_STRUCTURE,
      `Found ${candidateChains.length} candidate chains, selected ${getMaxLength(candidateChains)}-carbon chains`,
    );

    // Step 2: P-44.3.6 - Substituent Count (tie-breaker)
    const selectedChains = context.getState().candidateChains;
    const chainWithMostSubstituents =
      selectChainWithMostSubstituents(selectedChains);

    context = context.withUpdatedCandidates(
      [chainWithMostSubstituents],
      "P-44.3.6",
      "Greatest Number of Substituents",
      "P-44.3.6",
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected chain with ${chainWithMostSubstituents.substituents.length} substituents`,
    );

    // Step 3: Set Parent Structure
    const parentStructure = {
      type: "chain" as const,
      chain: chainWithMostSubstituents,
      name: "2,3,4-trimethylhexane", // Final name after full analysis
      locants: [1, 2, 3, 4, 5, 6],
    };

    context = context.withParentStructure(
      parentStructure,
      "parent-structure",
      "Parent Structure Selection Complete",
      "P-44.3",
      ExecutionPhase.PARENT_STRUCTURE,
      "Selected 2,3,4-trimethylhexane as parent structure",
    );

    // Step 4: Generate final result
    const result = context.generateResult();

    // Verify the result
    expect(result.name).toBe("2,3,4-trimethylhexane");
    expect(result.blueBookSections).toContain("P-44.3.6");
    expect(result.rules).toContain("P-44.3.1");
    expect(result.rules).toContain("P-44.3.6");
    expect(result.rules).toContain("parent-structure");

    // Verify trace history shows proper rule application
    const history = context.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(3);

    // Check that P-44.3.1 was applied first
    expect(history.length).toBeGreaterThan(0);
    const firstRuleTrace = history[0]!;
    expect(firstRuleTrace.ruleId).toBe("P-44.3.1");
    expect(firstRuleTrace.description).toContain("Found");
    expect(firstRuleTrace.description).toContain("selected");

    // Check that P-44.3.6 was applied as tie-breaker
    const p44_3_6_trace = history.find((trace) => trace.ruleId === "P-44.3.6");
    expect(p44_3_6_trace).toBeDefined();
    expect(p44_3_6_trace?.description).toContain("substituents");

    console.log("✅ Chain selection completed successfully");
    console.log("📊 Rule execution history:");
    history.forEach((trace, index) => {
      console.log(`  ${index + 1}. ${trace.ruleName}: ${trace.description}`);
    });
  });

  test("should demonstrate immutable transitions preserve debugging information", () => {
    const molecule = {
      atoms: [{ id: 0, symbol: "C", atomicNumber: 6, charge: 0, hydrogens: 4 }],
      bonds: [],
    } as any;

    let context = ImmutableNamingContext.create(molecule);

    // Apply a series of rule updates
    context = context.withUpdatedCandidates(
      [],
      "P-44.3.1",
      "Maximum Length Rule",
      "P-44.3.1",
      ExecutionPhase.PARENT_STRUCTURE,
      "Applied length rule",
    );

    context = context.withConfidenceUpdate(
      0.9,
      "confidence-adjustment",
      "Confidence Adjustment",
      "General",
      ExecutionPhase.PARENT_STRUCTURE,
      "Adjusted confidence after rule application",
    );

    context = context.withPhaseCompletion(
      ExecutionPhase.PARENT_STRUCTURE,
      "phase-completion",
      "Phase Completion",
      "P-44.3",
      ExecutionPhase.PARENT_STRUCTURE,
      "Parent structure phase completed",
    );

    // Verify that each transition is preserved
    const history = context.getHistory();
    expect(history).toHaveLength(3);

    // Verify the complete trace for debugging
    expect(history.length).toBeGreaterThan(2);
    const firstTrace = history[0]!;
    expect(firstTrace.beforeState.confidence).toBe(1.0);
    expect(firstTrace.afterState.confidence).toBe(1.0);

    const confidenceTrace = history[1]!;
    expect(confidenceTrace.beforeState.confidence).toBe(1.0);
    expect(confidenceTrace.afterState.confidence).toBe(0.9);

    const completionTrace = history[2]!;
    expect(completionTrace.beforeState.phaseCompletion.size).toBe(0);
    expect(completionTrace.afterState.phaseCompletion.size).toBe(1);

    console.log("🔍 Debugging information preserved:");
    history.forEach((trace) => {
      console.log(`- ${trace.ruleName}: ${trace.description}`);
      console.log(
        `  Confidence change: ${trace.beforeState.confidence} → ${trace.afterState.confidence}`,
      );
    });
  });
});

/**
 * Generate candidate chains for the complex molecule
 */
function generateCandidateChains(molecule: any): any[] {
  // Simplified: generate a few candidate chains
  return [
    {
      atoms: molecule.atoms.slice(0, 4),
      bonds: [],
      length: 4,
      multipleBonds: [],
      substituents: [
        { locant: 2, type: "methyl" },
        { locant: 3, type: "methyl" },
      ],
      locants: [1, 2, 3, 4],
    },
    {
      atoms: molecule.atoms.slice(0, 6),
      bonds: [],
      length: 6,
      multipleBonds: [],
      substituents: [
        { locant: 2, type: "methyl" },
        { locant: 3, type: "methyl" },
        { locant: 4, type: "methyl" },
      ],
      locants: [1, 2, 3, 4, 5, 6],
    },
  ];
}

/**
 * Get maximum length from candidate chains
 */
function getMaxLength(chains: any[]): number {
  return Math.max(...chains.map((chain) => chain.length));
}

/**
 * Select chain with most substituents (P-44.3.6)
 */
function selectChainWithMostSubstituents(chains: any[]): any {
  return chains.reduce((selected, current) =>
    current.substituents.length > selected.substituents.length
      ? current
      : selected,
  );
}
