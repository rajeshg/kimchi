import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";
import { classifyRingSystems } from "../../../utils/ring-analysis";
import { generateRingLocants } from "./helpers";

/**
 * Rule: P-2.5 - Fused Ring Systems
 *
 * For fused polycyclic aromatic and aliphatic systems, use fusion nomenclature
 * with appropriate parent ring selection.
 */
export const P2_5_FUSED_RING_SYSTEMS_RULE: IUPACRule = {
  id: "P-2.5",
  name: "Fused Ring Systems",
  description: "Apply fusion nomenclature for fused polycyclic systems (P-2.5)",
  blueBookReference: BLUE_BOOK_RULES.P2_5,
  priority: RulePriority.SEVEN,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return (
      candidateRings &&
      candidateRings.length > 1 &&
      !context.getState().parentStructure
    );
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }

    // Check if this is a fused system
    const ringClassification = classifyRingSystems(
      context.getState().molecule.atoms,
      context.getState().molecule.bonds,
    );
    if (ringClassification.fused.length > 0) {
      // Generate fused system name
      const fusedName = generateFusedPolycyclicName(
        ringClassification.fused,
        context.getState().molecule,
      );

      if (fusedName) {
        const parentStructure = {
          type: "ring" as const,
          ring: candidateRings[0], // Use first ring as representative
          name: fusedName,
          locants: generateRingLocants(candidateRings[0]),
        };

        return context.withParentStructure(
          parentStructure,
          "P-2.5",
          "Fused Ring Systems",
          "P-2.5",
          ExecutionPhase.PARENT_STRUCTURE,
          `Applied fusion nomenclature: ${fusedName}`,
        );
      }
    }

    return context;
  },
};

/**
 * Helper function to generate fused system names
 */
function generateFusedPolycyclicName(
  fusedRings: number[][],
  molecule: any,
): string | null {
  // For now, delegate to existing fused naming logic
  // This could be enhanced with specific P-2.5 rules
  const {
    identifyPolycyclicPattern,
  } = require("../../naming/iupac-rings/index");
  return identifyPolycyclicPattern(fusedRings, molecule);
}
