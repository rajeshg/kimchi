import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import type {
  ImmutableNamingContext,
  ContextState,
} from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  findSubstituents: _findSubstituents,
} = require("../../naming/iupac-chains");

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
    if (!candidateRings || candidateRings.length === 0) return context;
    // Choose the first (already filtered) ring candidate as parent
    const ring = candidateRings[0]!;
    // Generate a simple ring name (aromatic vs aliphatic)
    const size = ring.size || (ring.atoms ? ring.atoms.length : 0);
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
      name = aromaticNames[size] || `aromatic-${size}-membered`;
    } else {
      const ringNames: { [key: number]: string } = {
        3: "cyclopropane",
        4: "cyclobutane",
        5: "cyclopentane",
        6: "cyclohexane",
        7: "cycloheptane",
        8: "cyclooctane",
      };
      name = ringNames[size] || `cyclo${size}ane`;
    }
    const locants =
      ring && ring.atoms ? ring.atoms.map((_, idx: number) => idx + 1) : [];
    // Try to find substituents on the ring atoms so substituted ring names can be produced
    let substituents: unknown[] = [];
    try {
      const mol = state.molecule;
      if (ring && ring.atoms && mol) {
        substituents =
          _findSubstituents(
            mol,
            ring.atoms.map((a) => a.id),
          ) || [];
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
      "Selected ring system as parent structure over chain (chain-analysis placement)",
    );
  },
};
