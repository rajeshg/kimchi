import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import { detectRingSystems } from "./helpers";
import type { Atom, Bond, MultipleBond, Chain } from "types";
import type { RingSystem } from "../../types";
import { findSubstituents } from "../../naming/chains/substituent-naming";

/**
 * Rule: P-44.2.1 - Ring System Detection
 *
 * Identify all ring systems in the molecule AND seed candidate chains.
 * This ensures both rings and chains are available for P-44.1.1 comparison.
 */
export const P44_2_1_RING_SYSTEM_DETECTION_RULE: IUPACRule = {
  id: "P-44.2.1",
  name: "Ring System Detection",
  description:
    "Detect and classify all ring systems (P-44.2.1) and seed candidate chains",
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.TEN,
  conditions: () => {
    // Always run ring detection to ensure rings are found
    return true;
  },
  action: (context) => {
    const molecule = context.getState().molecule;
    const ringSystems = detectRingSystems(molecule);

    if (process.env.VERBOSE) {
      console.log(`[P-44.2.1] Detected ${ringSystems.length} ring systems`);
      ringSystems.forEach((ring: unknown, idx: number) => {
        const ringObj = ring as { atoms?: Atom[]; size?: number };
        const atomSymbols =
          ringObj.atoms?.map((a) => a.symbol).join("") || "unknown";
        console.log(
          `[P-44.2.1]   Ring ${idx}: size=${ringObj.size}, atoms=${atomSymbols}`,
        );
      });
    }

    // Seed candidate chains using the same logic as INITIAL_STRUCTURE_ANALYSIS_RULE
    let candidateChains: Chain[] = [];
    try {
      // Local require to avoid circular imports - use specific module paths
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        findMainChain,
      } = require("../../naming/chains/main-chain-selection/index");

      // Pass functional groups from context if available
      const functionalGroups = context.getState().functionalGroups;
      if (process.env.VERBOSE) {
        console.log(
          `[P-44.2.1] Passing ${functionalGroups.length} functional groups to findMainChain`,
        );
      }

      const mainChain = findMainChain(
        molecule,
        functionalGroups,
        context.getDetector(),
      );

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.2.1] findMainChain returned: ${mainChain?.join(",") || "empty"}`,
        );
      }

      // If main chain found, create candidate chain
      if (mainChain && mainChain.length > 0) {
        const atoms = mainChain
          .map((idx: number) => molecule.atoms[idx])
          .filter(Boolean) as Atom[];
        const bonds: Bond[] = [];
        const multipleBonds: MultipleBond[] = [];

        for (let i = 0; i < mainChain.length - 1; i++) {
          const a = mainChain[i]!;
          const b = mainChain[i + 1]!;
          const bond = molecule.bonds.find(
            (bb: Bond) =>
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

        if (process.env.VERBOSE) {
          console.log(
            `[P-44.2.1] Candidate chain: ${mainChain.join(",")}, length: ${atoms.length}`,
          );
        }

        // Calculate substituents for the chain
        const namingSubstituents = findSubstituents(molecule, mainChain);

        // Convert NamingSubstituent[] to StructuralSubstituent[]
        // For name generation, we only need type and locant fields
        const substituents = namingSubstituents.map((sub) => ({
          atoms: [], // Not needed for name generation
          bonds: [], // Not needed for name generation
          type: sub.name || sub.type,
          locant: parseInt(sub.position),
          isPrincipal: false, // Not needed for name generation
          name: sub.name,
          position: sub.position,
        }));

        if (process.env.VERBOSE) {
          console.log(
            `[P-44.2.1] Found ${substituents.length} substituents: ${JSON.stringify(substituents)}`,
          );
        }

        candidateChains.push({
          atoms,
          bonds,
          length: atoms.length,
          multipleBonds,
          substituents,
          locants: Array.from({ length: atoms.length }, (_, i) => i + 1),
        });
      }
    } catch (_err) {
      // If utilities unavailable, continue with empty candidate chains
      if (process.env.VERBOSE) {
        console.log(`[P-44.2.1] Failed to find main chain: ${_err}`);
      }
    }

    // Update state with detected ring systems AND candidate chains
    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        candidateRings: ringSystems as RingSystem[],
        candidateChains,
      }),
      "P-44.2.1",
      "Ring System Detection",
      "P-44.2",
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${ringSystems.length} ring system(s) and ${candidateChains.length} candidate chain(s)`,
    );
  },
};
