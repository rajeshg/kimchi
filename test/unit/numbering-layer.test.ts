import { describe, it, expect } from "bun:test";
import {
  ImmutableNamingContext,
  ExecutionPhase,
  type ContextServices,
} from "src/iupac-engine/immutable-context";
import {
  P14_2_LOWEST_LOCANT_SET_RULE,
  P14_3_PRINCIPAL_GROUP_NUMBERING_RULE,
} from "src/iupac-engine/rules/numbering-layer";
import type {
  ParentStructure,
  FunctionalGroup,
  Chain,
} from "src/iupac-engine/types";
import type { Atom, Bond } from "types";
import { getSharedOPSINService } from "src/iupac-engine/opsin-service";
import { OPSINFunctionalGroupDetector } from "src/iupac-engine/opsin-functional-group-detector";

// Helper to create test services
function createTestServices(): ContextServices {
  return {
    opsin: getSharedOPSINService(),
    detector: new OPSINFunctionalGroupDetector(),
  };
}

function makeAtoms(ids: number[]): Atom[] {
  return ids.map(
    (id) =>
      ({
        id,
        symbol: "C",
        atomicNumber: 6,
        charge: 0,
        hydrogens: 0,
        isotope: null,
        aromatic: false,
        chiral: null,
        isBracket: false,
        atomClass: 0,
        degree: undefined,
        isInRing: undefined,
        ringIds: undefined,
        hybridization: undefined,
      }) as Atom,
  );
}
function makeChain(
  locants: number[],
  multipleBonds = [],
  substituents = [],
): Chain {
  return {
    atoms: makeAtoms(locants),
    bonds: [],
    length: locants.length,
    multipleBonds,
    substituents,
    locants,
  };
}
function makeGroup(
  type: string,
  priority: number,
  locants: number[],
  isPrincipal: boolean,
): FunctionalGroup {
  return {
    type,
    atoms: makeAtoms(locants),
    bonds: [],
    priority,
    isPrincipal,
    locants,
  };
}
describe("P-14 numbering rules", () => {
  it("P-14.2: chooses lowest locant set for principal group", () => {
    const parentStructure: ParentStructure = {
      type: "chain",
      name: "butane",
      chain: makeChain([1, 2, 3, 4]),
      locants: [1, 2, 3, 4],
    };
    const functionalGroups: FunctionalGroup[] = [
      makeGroup("alcohol", 3, [2], true),
      makeGroup("methyl", 10, [3], false),
    ];
    let context = ImmutableNamingContext.create(
      { atoms: [], bonds: [] },
      createTestServices(),
    );
    context = context.withStateUpdate(
      (state) => ({ ...state, parentStructure, functionalGroups }),
      "setup",
      "setup",
      "setup",
      ExecutionPhase.NUMBERING,
      "setup",
    );
    context = P14_2_LOWEST_LOCANT_SET_RULE.action(context);
    const result = context.getState().parentStructure?.locants ?? [];
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it("P-14.3: principal group gets lowest locant for chain", () => {
    const parentStructure: ParentStructure = {
      type: "chain",
      name: "butane",
      chain: makeChain([1, 2, 3, 4]),
      locants: [1, 2, 3, 4],
    };
    const functionalGroups: FunctionalGroup[] = [
      makeGroup("alcohol", 3, [2], true), // Alcohol at atom 2 (position 1 in chain)
      makeGroup("methyl", 10, [3], false),
    ];
    let context = ImmutableNamingContext.create(
      { atoms: [], bonds: [] },
      createTestServices(),
    );
    context = context.withStateUpdate(
      (state) => ({ ...state, parentStructure, functionalGroups }),
      "setup",
      "setup",
      "setup",
      ExecutionPhase.NUMBERING,
      "setup",
    );
    context = P14_3_PRINCIPAL_GROUP_NUMBERING_RULE.action(context);
    const updatedGroups = context.getState().functionalGroups;
    expect(updatedGroups).toBeDefined();
    expect(updatedGroups!.length).toBeGreaterThan(0);
    const firstGroup = updatedGroups![0]!;
    // Alcohol at atom 2 (position 1) should get locant 2 with forward numbering
    expect(firstGroup.locants).toEqual([2]);
  });

  it("P-14.2: tie-break by first point of difference", () => {
    const parentStructure: ParentStructure = {
      type: "chain",
      name: "pentane",
      chain: makeChain([1, 2, 3, 4, 5]),
      locants: [1, 2, 3, 4, 5],
    };
    const functionalGroups: FunctionalGroup[] = [
      makeGroup("alcohol", 3, [2], true),
      makeGroup("methyl", 10, [3], false),
      makeGroup("ethyl", 10, [4], false),
    ];
    let context = ImmutableNamingContext.create(
      { atoms: [], bonds: [] },
      createTestServices(),
    );
    context = context.withStateUpdate(
      (state) => ({ ...state, parentStructure, functionalGroups }),
      "setup",
      "setup",
      "setup",
      ExecutionPhase.NUMBERING,
      "setup",
    );
    context = P14_2_LOWEST_LOCANT_SET_RULE.action(context);
    const result = context.getState().parentStructure?.locants ?? [];
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });
});
