import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import { detectRingSystems } from "./helpers";
import type { Atom } from "../../../../types";
import type { RingSystem } from "../../types";

/**
 * Rule: P-44.2.1 - Ring System Detection
 *
 * Identify all ring systems in the molecule.
 */
export const P44_2_1_RING_SYSTEM_DETECTION_RULE: IUPACRule = {
  id: "P-44.2.1",
  name: "Ring System Detection",
  description: "Detect and classify all ring systems (P-44.2.1)",
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

    // Update state with detected ring systems
    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        candidateRings: ringSystems as RingSystem[],
      }),
      "P-44.2.1",
      "Ring System Detection",
      "P-44.2",
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${ringSystems.length} ring system(s)`,
    );
  },
};
