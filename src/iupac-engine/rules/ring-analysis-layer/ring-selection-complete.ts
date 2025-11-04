import type { IUPACRule } from "../../types";
import { RulePriority, RingSystemType } from "../../types";
import type { RingSystem } from "../../types";
import type { Atom, Bond } from "types";
import { ExecutionPhase } from "../../immutable-context";
import { analyzeRings } from "../../../utils/ring-analysis";
import { generateBaseCyclicName } from "../../naming/iupac-rings/index";
import { generateRingLocants } from "./helpers";

/**
 * Rule: Parent Ring Selection Complete
 *
 * Finalizes ring system selection and sets the parent structure.
 * This rule should NOT run if there's a heteroatom parent candidate (P-2.1 takes priority).
 */
export const RING_SELECTION_COMPLETE_RULE: IUPACRule = {
  id: "ring-selection-complete",
  name: "Ring Selection Complete",
  description: "Finalize ring system selection and set parent structure",
  blueBookReference: "P-44.2 - Ring system seniority",
  priority: RulePriority.FIVE,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    if (
      !candidateRings ||
      candidateRings.length === 0 ||
      context.getState().parentStructure
    ) {
      return false;
    }

    // P-2.1 has priority: check if there's a heteroatom parent candidate
    // Heteroatom parents: Si, Ge, Sn, Pb (valence 4), P, As, Sb, Bi (valence 3)
    const molecule = context.getState().molecule;
    const HETEROATOM_HYDRIDES = ["Si", "Ge", "Sn", "Pb", "P", "As", "Sb", "Bi"];
    const EXPECTED_VALENCE: Record<string, number> = {
      Si: 4,
      Ge: 4,
      Sn: 4,
      Pb: 4,
      P: 3,
      As: 3,
      Sb: 3,
      Bi: 3,
    };

    const heteroatoms = molecule.atoms.filter((atom) =>
      HETEROATOM_HYDRIDES.includes(atom.symbol),
    );

    // If exactly one heteroatom with correct valence exists, P-2.1 should handle it
    if (heteroatoms.length === 1) {
      const heteroatom = heteroatoms[0]!;
      const implicitHydrogens = heteroatom.hydrogens || 0;
      const heteroatomIndex = molecule.atoms.indexOf(heteroatom);
      const bondOrders = molecule.bonds
        .filter(
          (bond) =>
            bond.atom1 === heteroatomIndex || bond.atom2 === heteroatomIndex,
        )
        .reduce((sum, bond) => {
          const order =
            bond.type === "single"
              ? 1
              : bond.type === "double"
                ? 2
                : bond.type === "triple"
                  ? 3
                  : 1;
          return sum + order;
        }, 0);
      const totalValence = bondOrders + implicitHydrogens;
      const expectedValence = EXPECTED_VALENCE[heteroatom.symbol];

      if (totalValence === expectedValence) {
        // Heteroatom parent is present - let P-2.1 handle it
        if (process.env.VERBOSE)
          console.log("Ring selection: deferring to P-2.1 heteroatom parent");
        return false;
      }
    }

    return true;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;

    if (!candidateRings || candidateRings.length === 0) {
      return context.withConflict(
        {
          ruleId: "ring-selection-complete",
          conflictType: "state_inconsistency",
          description: "No candidate rings available for selection",
          context: {},
        },
        "ring-selection-complete",
        "Ring Selection Complete",
        "P-44.2",
        ExecutionPhase.PARENT_STRUCTURE,
        "No candidate rings available for selection",
      );
    }

    const molecule = context.getState().molecule;
    const ringInfo = analyzeRings(molecule);

    // Check if multiple rings are connected (forming a polycyclic system)
    if (candidateRings.length > 1) {
      // Check if any two rings are connected by bonds
      const areRingsConnected = (
        ring1: RingSystem,
        ring2: RingSystem,
      ): boolean => {
        const ring1AtomIds = new Set(ring1.atoms.map((a: Atom) => a.id));
        const ring2AtomIds = new Set(ring2.atoms.map((a: Atom) => a.id));

        for (const bond of molecule.bonds) {
          const a1InRing1 = ring1AtomIds.has(bond.atom1);
          const a2InRing1 = ring1AtomIds.has(bond.atom2);
          const a1InRing2 = ring2AtomIds.has(bond.atom1);
          const a2InRing2 = ring2AtomIds.has(bond.atom2);

          if ((a1InRing1 && a2InRing2) || (a1InRing2 && a2InRing1)) {
            return true;
          }
        }
        return false;
      };

      let hasConnectedRings = false;
      for (let i = 0; i < candidateRings.length && !hasConnectedRings; i++) {
        for (
          let j = i + 1;
          j < candidateRings.length && !hasConnectedRings;
          j++
        ) {
          if (areRingsConnected(candidateRings[i]!, candidateRings[j]!)) {
            hasConnectedRings = true;
          }
        }
      }

      if (hasConnectedRings) {
        if (process.env.VERBOSE) {
          console.log(
            "[ring-selection-complete] Multiple connected rings detected - treating as polycyclic system",
          );
        }

        // Create a merged parent structure that includes all connected rings
        const allAtoms = new Set<Atom>();
        const allBonds = new Set<Bond>();

        for (const ring of candidateRings) {
          for (const atom of ring.atoms) {
            allAtoms.add(atom);
          }
          if (ring.bonds) {
            for (const bond of ring.bonds) {
              allBonds.add(bond);
            }
          }
        }

        const atomsArray = Array.from(allAtoms);
        const bondsArray = Array.from(allBonds);

        // Collect heteroatoms with proper structure
        const heteroatoms = atomsArray
          .filter((a: Atom) => a.symbol !== "C" && a.symbol !== "H")
          .map((a: Atom, idx: number) => ({
            atom: a,
            type: a.symbol,
            locant: idx + 1,
          }));

        const parentRing = {
          atoms: atomsArray,
          bonds: bondsArray,
          rings: candidateRings.flatMap((r: RingSystem) => r.rings || []),
          size: allAtoms.size,
          heteroatoms: heteroatoms,
          type: RingSystemType.AROMATIC, // Will be determined properly by naming logic
          fused: false,
          bridged: false,
          spiro: false,
        };

        const parentStructure = {
          type: "ring" as const,
          ring: parentRing,
          name: generateBaseCyclicName(molecule, ringInfo),
          locants: generateRingLocants(parentRing),
        };

        return context.withParentStructure(
          parentStructure,
          "ring-selection-complete",
          "Ring Selection Complete",
          "P-44.2",
          ExecutionPhase.PARENT_STRUCTURE,
          "Finalized polycyclic ring system selection",
        );
      }
    }

    // Single ring or multiple disconnected rings - select first one
    const parentRing = candidateRings[0];

    const parentStructure = {
      type: "ring" as const,
      ring: parentRing,
      name: generateBaseCyclicName(molecule, ringInfo),
      locants: generateRingLocants(parentRing),
    };

    return context.withParentStructure(
      parentStructure,
      "ring-selection-complete",
      "Ring Selection Complete",
      "P-44.2",
      ExecutionPhase.PARENT_STRUCTURE,
      "Finalized ring system selection",
    );
  },
};
