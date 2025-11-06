import type { IUPACRule } from "../../types";
import { RulePriority, RingSystemType } from "../../types";
import type { RingSystem } from "../../types";
import type { Atom, Bond } from "types";
import { ExecutionPhase } from "../../immutable-context";
import { analyzeRings } from "../../../utils/ring-analysis";
import {
  generateBaseCyclicName,
  findSubstituentsOnMonocyclicRing,
} from "../../naming/iupac-rings/index";
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
    const state = context.getState();
    const candidateRings = state.candidateRings;
    if (
      !candidateRings ||
      candidateRings.length === 0 ||
      state.parentStructure
    ) {
      return false;
    }

    // P-2.1 has priority: check if there's a heteroatom parent candidate
    // Heteroatom parents: Si, Ge, Sn, Pb (valence 4), P, As, Sb, Bi (valence 3)
    const molecule = state.molecule;
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

    // P-44.4 criterion: If there are candidate chains, check size comparison
    // Don't select ring if a longer acyclic chain exists
    const candidateChains = state.candidateChains;
    if (process.env.VERBOSE) {
      console.log(
        `[ring-selection-complete conditions] candidateChains count: ${candidateChains?.length || 0}`
      );
    }
    if (candidateChains && candidateChains.length > 0) {
      const ring = candidateRings[0]!;
      const ringSize = ring.size || (ring.atoms ? ring.atoms.length : 0);
      
      const longestChain = candidateChains[0]!;
      const chainLength = longestChain.atoms ? longestChain.atoms.length : 0;
      
      if (process.env.VERBOSE) {
        console.log(
          `[ring-selection-complete conditions] Comparing: Chain (${chainLength} atoms) vs Ring (${ringSize} atoms)`
        );
      }
      
      if (chainLength > ringSize) {
        if (process.env.VERBOSE) {
          console.log(
            `[ring-selection-complete conditions] Chain > Ring: deferring to chain selection`
          );
        }
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

        // Find substituents on the polycyclic ring system
        const polycyclicRingAtomIds = atomsArray.map((atom) => atom.id);
        const polycyclicSubstituents = findSubstituentsOnMonocyclicRing(
          polycyclicRingAtomIds,
          molecule,
        );

        if (process.env.VERBOSE) {
          console.log(
            `[ring-selection-complete] Found ${polycyclicSubstituents.length} substituents on polycyclic ring`,
          );
        }

        const parentStructure = {
          type: "ring" as const,
          ring: parentRing,
          name: generateBaseCyclicName(molecule, ringInfo),
          locants: generateRingLocants(parentRing),
          substituents: polycyclicSubstituents,
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
    if (!parentRing) {
      return context.withConflict(
        {
          ruleId: "ring-selection-complete",
          conflictType: "state_inconsistency",
          description: "No parent ring available",
          context: {},
        },
        "ring-selection-complete",
        "Ring Selection Complete",
        "P-44.2",
        ExecutionPhase.PARENT_STRUCTURE,
        "No parent ring available",
      );
    }

    // Find substituents on the ring
    const ringAtomIdArray = parentRing.atoms.map((atom) => atom.id);
    const substituents = findSubstituentsOnMonocyclicRing(
      ringAtomIdArray,
      molecule,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[ring-selection-complete] Found ${substituents.length} substituents on ring`,
      );
      console.log(
        `[ring-selection-complete] Substituents:`,
        substituents.map((s) => `${s.name} at position ${s.position}`),
      );
    }

    const parentStructure = {
      type: "ring" as const,
      ring: parentRing,
      name: generateBaseCyclicName(molecule, ringInfo),
      locants: generateRingLocants(parentRing),
      substituents: substituents,
    };

    // Filter functional groups to only include those directly attached to the ring
    // Functional groups on side chains should NOT be principal groups
    const functionalGroups = context.getState().functionalGroups || [];
    const ringAtomIds = new Set(parentRing.atoms.map((atom) => atom.id));

    const filteredFunctionalGroups = functionalGroups.filter((fg) => {
      // Check if the functional group atom is in the ring or directly attached to a ring atom
      if (!fg.atoms || fg.atoms.length === 0) return true; // Keep if no atoms specified

      for (const fgAtom of fg.atoms) {
        const fgAtomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;

        // If FG atom is in ring, keep it
        if (ringAtomIds.has(fgAtomId)) return true;

        // If FG atom is directly bonded to a ring atom, check if it's a simple substituent
        // (not part of a longer side chain)
        for (const bond of molecule.bonds) {
          if (bond.atom1 === fgAtomId || bond.atom2 === fgAtomId) {
            const otherAtomId =
              bond.atom1 === fgAtomId ? bond.atom2 : bond.atom1;
            if (ringAtomIds.has(otherAtomId)) {
              // FG atom is directly bonded to ring - but is it part of a side chain?
              // Count how many non-ring carbons are bonded to this FG atom
              const nonRingNeighbors = molecule.bonds.filter((b) => {
                if (b.atom1 === fgAtomId || b.atom2 === fgAtomId) {
                  const neighborId = b.atom1 === fgAtomId ? b.atom2 : b.atom1;
                  return (
                    !ringAtomIds.has(neighborId) &&
                    molecule.atoms[neighborId]?.symbol === "C"
                  );
                }
                return false;
              }).length;

              // If FG atom has non-ring carbon neighbors, it's part of a side chain
              if (nonRingNeighbors > 0) {
                if (process.env.VERBOSE) {
                  console.log(
                    `[ring-selection-complete] Excluding FG ${fg.type} on atom ${fgAtomId} - part of side chain`,
                  );
                }
                return false; // Part of side chain, exclude it
              }

              return true; // Simple substituent directly on ring
            }
          }
        }
      }

      // FG is not connected to ring at all
      if (process.env.VERBOSE) {
        console.log(
          `[ring-selection-complete] Excluding FG ${fg.type} - not attached to ring`,
        );
      }
      return false;
    });

    if (process.env.VERBOSE) {
      console.log(
        `[ring-selection-complete] Filtered FGs from ${functionalGroups.length} to ${filteredFunctionalGroups.length}`,
      );
      console.log(
        `[ring-selection-complete] Kept FG types:`,
        filteredFunctionalGroups.map((fg) => fg.type),
      );
    }

    // Re-select principal group after filtering
    // When a ring is the parent, functional groups on side chains are excluded.
    // We need to promote ALL functional groups with the highest priority to principal.
    // For example, if there are 3 alcohols on the ring, ALL 3 should be marked as principal
    // to generate "-1,3,5-triol" multiplicative suffix.
    if (filteredFunctionalGroups.length > 0) {
      // First, clear all isPrincipal flags
      for (const fg of filteredFunctionalGroups) {
        fg.isPrincipal = false;
      }

      // Find the highest priority value among remaining functional groups
      let maxPriority = -1;
      for (const fg of filteredFunctionalGroups) {
        const priority = fg.priority || 0;
        if (priority > maxPriority) {
          maxPriority = priority;
        }
      }

      // Mark ALL functional groups with the highest priority as principal
      // This ensures that multiple identical groups (e.g., 3 alcohols) all get isPrincipal=true
      const principalGroups = [];
      for (const fg of filteredFunctionalGroups) {
        const priority = fg.priority || 0;
        if (priority === maxPriority) {
          fg.isPrincipal = true;
          principalGroups.push(fg);
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[ring-selection-complete] Re-selected ${principalGroups.length} principal group(s) after filtering:`,
          principalGroups.map((fg) => `${fg.type} (priority ${maxPriority})`),
        );
      }
    }

    return context
      .withParentStructure(
        parentStructure,
        "ring-selection-complete",
        "Ring Selection Complete",
        "P-44.2",
        ExecutionPhase.PARENT_STRUCTURE,
        "Finalized ring system selection",
      )
      .withStateUpdate(
        (state) => ({
          ...state,
          functionalGroups: filteredFunctionalGroups,
        }),
        "ring-selection-complete",
        "Filter Functional Groups for Ring Parent",
        "P-44.2",
        ExecutionPhase.PARENT_STRUCTURE,
        `Filtered functional groups to only include those directly on ring (${filteredFunctionalGroups.length} of ${functionalGroups.length})`,
      );
  },
};
