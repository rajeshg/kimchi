import type { IUPACRule, StructuralSubstituent } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import type {
  ImmutableNamingContext,
  ContextState,
} from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { NamingSubstituent } from "../../naming/iupac-types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  findSubstituentsOnMonocyclicRing: _findSubstituentsOnMonocyclicRing,
} = require("../../naming/iupac-rings");

/**
 * Rule: P-44.4 (chain-analysis placement)
 *
 * Ensure that when both ring candidates and chain candidates exist (i.e., after
 * initial-structure seeding), the ring vs chain decision is made before the
 * acyclic chain seniority rules are applied. This duplicates P-44.4 logic but
 * runs in the chain-analysis layer (so it executes after candidateChains are
 * seeded).
 */
export const P44_4_RING_VS_CHAIN_IN_CHAIN_ANALYSIS_RULE: IUPACRule = {
  id: "P-44.4.chain-analysis",
  name: "Ring vs Chain Selection (chain-analysis)",
  description:
    "Prefer ring system as parent when both ring and chain candidates exist (P-44.4)",
  blueBookReference: BLUE_BOOK_RULES.P44_4,
  priority: RulePriority.TEN,
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      return false;
    }
    const candidateRings = state.candidateRings;
    const candidateChains = state.candidateChains;
    return (
      Array.isArray(candidateRings) &&
      candidateRings.length > 0 &&
      Array.isArray(candidateChains) &&
      candidateChains.length > 0
    );
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState() as ContextState;
    const candidateRings = state.candidateRings;
    const candidateChains = state.candidateChains;
    
    if (!candidateRings || candidateRings.length === 0) return context;
    if (!candidateChains || candidateChains.length === 0) return context;
    
    // Get the largest ring size (number of atoms in ring)
    const ring = candidateRings[0]!;
    const ringSize = ring.size || (ring.atoms ? ring.atoms.length : 0);
    
    // Get the longest chain length
    const longestChain = candidateChains[0]!;
    const chainLength = longestChain.atoms ? longestChain.atoms.length : 0;
    
    // P-44.4 criterion: Compare lengths first
    // Prefer the larger structure (more atoms)
    // If ring has fewer atoms than the longest acyclic chain, prefer the chain
    if (chainLength > ringSize) {
      if (process.env.VERBOSE) {
        console.log(
          `[P-44.4] Chain (${chainLength} atoms) > Ring (${ringSize} atoms): selecting chain as parent`
        );
      }
      // Don't select ring - let chain selection rules handle it
      return context;
    }
    
    // Ring is equal or larger: prefer ring per P-44.4
    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4] Ring (${ringSize} atoms) >= Chain (${chainLength} atoms): selecting ring as parent`
      );
    }
    
    // Generate a simple ring name (aromatic vs aliphatic)
    const type =
      ring.type ||
      (ring.atoms && ring.atoms.some((a) => a.aromatic)
        ? "aromatic"
        : "aliphatic");
    let name = "";
    if (type === "aromatic") {
      const aromaticNames: { [key: number]: string } = {
        6: "benzene",
        5: "cyclopentadiene",
        7: "cycloheptatriene",
      };
      name = aromaticNames[ringSize] || `aromatic-${ringSize}-membered`;
    } else {
      const ringNames: { [key: number]: string } = {
        3: "cyclopropane",
        4: "cyclobutane",
        5: "cyclopentane",
        6: "cyclohexane",
        7: "cycloheptane",
        8: "cyclooctane",
      };
      name = ringNames[ringSize] || `cyclo${ringSize}ane`;
    }
    const locants =
      ring && ring.atoms ? ring.atoms.map((_, idx: number) => idx + 1) : [];
    // Try to find substituents on the ring atoms so substituted ring names can be produced
    let substituents: (StructuralSubstituent | NamingSubstituent)[] = [];
    try {
      const mol = state.molecule;
      if (ring && ring.atoms && mol) {
        substituents =
          (_findSubstituentsOnMonocyclicRing(
            ring.atoms.map((a) => a.id),
            mol,
          ) as (StructuralSubstituent | NamingSubstituent)[]) || [];
      }
    } catch (_e) {
      substituents = [];
    }

    const parentStructure = {
      type: "ring" as const,
      ring,
      name,
      locants,
      substituents,
    };
    return context.withParentStructure(
      parentStructure,
      "P-44.4.chain-analysis",
      "Ring vs Chain Selection (chain-analysis)",
      BLUE_BOOK_RULES.P44_4,
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ring (${ringSize} atoms) as parent over chain (${chainLength} atoms)`,
    );
  },
};
