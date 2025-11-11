import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";
import type { RingSystem } from "../../types";
import type { Molecule } from "../../../../types";
import { classifyRingSystems } from "../../../utils/ring-analysis";
import { generateRingLocants } from "./helpers";

/**
 * Rule: P-2.3 - Ring Assemblies (von Baeyer System)
 *
 * For bridged polycyclic compounds, use the von Baeyer system with bicyclo[x.y.z]alkane notation.
 * This applies to compounds that are not fused or spiro.
 */
export const P2_3_RING_ASSEMBLIES_RULE: IUPACRule = {
  id: "P-2.3",
  name: "Ring Assemblies (von Baeyer System)",
  description:
    "Apply von Baeyer bicyclo/tricyclo nomenclature for bridged systems (P-2.3)",
  blueBookReference: BLUE_BOOK_RULES.P2_3,
  priority: RulePriority.SEVEN,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (process.env.VERBOSE) {
      console.log(
        "[P-2.3 CONDITION] candidateRings count:",
        candidateRings?.length,
      );
      console.log(
        "[P-2.3 CONDITION] candidateRings:",
        JSON.stringify(
          candidateRings?.map((rs: RingSystem) => ({
            rings: rs.rings?.length,
            atoms: rs.atoms?.length,
          })),
          null,
          2,
        ),
      );
      console.log(
        "[P-2.3 CONDITION] parentStructure:",
        context.getState().parentStructure,
      );
    }
    if (
      !candidateRings ||
      candidateRings.length === 0 ||
      context.getState().parentStructure
    ) {
      if (process.env.VERBOSE) {
        console.log(
          "[P-2.3 CONDITION] Returning false - no rings or parent already selected",
        );
      }
      return false;
    }
    // Check if any ring system contains multiple rings (bridged/fused)
    const hasMultipleRings = candidateRings.some(
      (rs: RingSystem) => rs.rings && rs.rings.length > 1,
    );
    if (process.env.VERBOSE) {
      console.log("[P-2.3 CONDITION] hasMultipleRings:", hasMultipleRings);
    }
    return hasMultipleRings;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (process.env.VERBOSE) {
      console.log("[P-2.3 ACTION] candidateRings:", candidateRings?.length);
    }
    if (!candidateRings || candidateRings.length === 0) {
      if (process.env.VERBOSE) {
        console.log("[P-2.3 ACTION] No candidateRings, returning early");
      }
      return context;
    }

    // Check if this is a bridged system (not fused, not spiro)
    const ringClassification = classifyRingSystems(
      context.getState().molecule.atoms,
      context.getState().molecule.bonds,
    );
    if (process.env.VERBOSE) {
      console.log(
        "[P-2.3 ACTION] ringClassification.bridged:",
        ringClassification.bridged.length,
      );
    }
    if (ringClassification.bridged.length > 0) {
      // Generate bicyclo/tricyclo name
      const molecule = context.getState().molecule;
      // Combine fused and bridged rings to get the polycyclic core
      // Exclude isolated rings (these are substituents, not part of the core)
      const polycyclicCoreRings = [
        ...ringClassification.fused,
        ...ringClassification.bridged,
      ];
      const coreRingCount = polycyclicCoreRings.length;

      if (process.env.VERBOSE) {
        console.log("[P-2.3 ACTION] polycyclicCoreRings count:", coreRingCount);
        console.log("[P-2.3 ACTION] (excluding isolated substituent rings)");
      }

      const bridgedNameResult = generateBridgedPolycyclicName(
        polycyclicCoreRings,
        molecule,
        coreRingCount,
      );
      if (process.env.VERBOSE) {
        console.log("[P-2.3 ACTION] bridgedNameResult:", bridgedNameResult);
      }

      if (bridgedNameResult && candidateRings[0]) {
        const parentStructure = {
          type: "ring" as const,
          ring: candidateRings[0], // Use first ring as representative
          name: bridgedNameResult.name,
          locants: generateRingLocants(candidateRings[0]),
          vonBaeyerNumbering: bridgedNameResult.vonBaeyerNumbering,
        };

        return context.withParentStructure(
          parentStructure,
          "P-2.3",
          "Ring Assemblies",
          "P-2.3",
          ExecutionPhase.PARENT_STRUCTURE,
          `Applied von Baeyer system: ${bridgedNameResult.name}`,
        );
      }
    }

    return context;
  },
};

/**
 * Helper function to generate von Baeyer bicyclo/tricyclo names
 */
function generateBridgedPolycyclicName(
  bridgedRings: number[][],
  molecule: Molecule,
  ringCount: number,
): { name: string; vonBaeyerNumbering?: Map<number, number> } | null {
  // Use the engine's own naming function
  const {
    generateClassicPolycyclicName,
  } = require("../../naming/iupac-rings/utils");
  return generateClassicPolycyclicName(molecule, bridgedRings, ringCount);
}
