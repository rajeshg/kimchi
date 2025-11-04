import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";
import type { RingSystem, FunctionalGroup } from "../../types";
import type { Atom, Bond } from "types";

/**
 * Rule: P-44.2.3 - Ring Size Seniority
 *
 * Choose the smallest ring system when heteroatom seniority doesn't distinguish.
 */
export const P44_2_3_RING_SIZE_SENIORITY_RULE: IUPACRule = {
  id: "P-44.2.3",
  name: "Ring Size Seniority",
  description: "Select smallest ring system (P-44.2.3)",
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.EIGHT,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    const shouldApply = candidateRings && candidateRings.length > 1;

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.2.3 conditions] candidateRings: ${candidateRings?.length}, shouldApply: ${shouldApply}`,
      );
    }

    return shouldApply;
  },
  action: (context) => {
    const state = context.getState();
    const candidateRings = state.candidateRings;
    const molecule = state.molecule;

    if (process.env.VERBOSE) {
      console.log("[P-44.2.3] Starting ring size seniority rule");
      console.log("[P-44.2.3] candidateRings:", candidateRings?.length);
    }

    if (!candidateRings || candidateRings.length <= 1) {
      if (process.env.VERBOSE)
        console.log("[P-44.2.3] Skipping - not enough rings");
      return context;
    }

    // Check if rings are connected (bonded to each other but not sharing atoms)
    // If rings are connected, they form a polycyclic parent and should NOT be filtered by ring size
    const areRingsConnected = (
      ring1: RingSystem,
      ring2: RingSystem,
    ): boolean => {
      const ring1AtomIds = new Set(ring1.atoms.map((a: Atom) => a.id));
      const ring2AtomIds = new Set(ring2.atoms.map((a: Atom) => a.id));

      // Check if any atom in ring1 is bonded to any atom in ring2
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

    // If any two rings are connected, keep all rings (they form a polycyclic parent)
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
          `[P-44.2.3] Rings are connected - keeping all ${candidateRings.length} rings as polycyclic parent`,
        );
      }
      return context;
    }

    const functionalGroups = state.functionalGroups || [];

    // Get principal functional groups (P-44.1 takes precedence over P-44.2)
    const principalFGs = functionalGroups.filter(
      (fg: FunctionalGroup) => fg.isPrincipal,
    );

    if (process.env.VERBOSE) {
      console.log("[P-44.2.3] Principal FGs:", principalFGs.length);
      console.log(
        "[P-44.2.3] FG types:",
        principalFGs.map((fg: FunctionalGroup) => fg.type),
      );
    }

    // For each ring, check if it has principal functional groups attached
    const ringFGScores = candidateRings.map((ring: RingSystem) => {
      const ringAtomIds = new Set((ring.atoms || []).map((a: Atom) => a.id));

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.2.3] Checking ring with ${ring.size} atoms, IDs:`,
          Array.from(ringAtomIds),
        );
      }

      let fgCount = 0;
      let highestPriority = Infinity;

      for (const fg of principalFGs) {
        // Check if any FG atom is in the ring
        const fgInRing = (fg.atoms || []).some((atom: Atom) =>
          ringAtomIds.has(atom.id),
        );

        // Check if any FG atom is bonded to a ring atom
        let fgAttachedToRing = false;
        if (!fgInRing && molecule) {
          for (const fgAtom of fg.atoms || []) {
            const bonds = molecule.bonds.filter(
              (b: Bond) => b.atom1 === fgAtom.id || b.atom2 === fgAtom.id,
            );

            for (const bond of bonds) {
              const neighborId =
                bond.atom1 === fgAtom.id ? bond.atom2 : bond.atom1;
              if (ringAtomIds.has(neighborId)) {
                fgAttachedToRing = true;
                break;
              }
            }
            if (fgAttachedToRing) break;
          }
        }

        if (fgInRing || fgAttachedToRing) {
          fgCount++;
          // Track highest priority (lowest number = highest priority)
          if (fg.priority < highestPriority) {
            highestPriority = fg.priority;
          }
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.2.3]   FG ${fg.type} attached (priority ${fg.priority})`,
            );
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.2.3]   Ring score: fgCount=${fgCount}, highestPriority=${highestPriority}, size=${ring.size}`,
        );
      }

      return { ring, fgCount, highestPriority, size: ring.size };
    });

    // P-44.1 precedence: prefer rings with principal functional groups
    const maxFGCount = Math.max(...ringFGScores.map((r) => r.fgCount));

    if (process.env.VERBOSE) {
      console.log("[P-44.2.3] maxFGCount:", maxFGCount);
    }

    if (maxFGCount > 0) {
      // Filter to rings with maximum functional groups
      const ringsWithFGs = ringFGScores.filter((r) => r.fgCount === maxFGCount);

      // If there's a tie, use highest priority functional group
      const highestPriority = Math.min(
        ...ringsWithFGs.map((r) => r.highestPriority),
      );
      const ringsWithHighestPriorityFG = ringsWithFGs.filter(
        (r) => r.highestPriority === highestPriority,
      );

      // If still tied, use smallest ring size
      const smallestSize = Math.min(
        ...ringsWithHighestPriorityFG.map((r) => r.size),
      );
      const selectedRings = ringsWithHighestPriorityFG
        .filter((r) => r.size === smallestSize)
        .map((r) => r.ring);

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.2.3] Selected ${selectedRings.length} ring(s) with FG count=${maxFGCount}, priority=${highestPriority}, size=${smallestSize}`,
        );
      }

      return context.withUpdatedRings(
        selectedRings,
        "P-44.2.3",
        "Ring Size Seniority",
        "P-44.2",
        ExecutionPhase.PARENT_STRUCTURE,
        `Selected ring(s) with ${maxFGCount} principal FG(s), priority ${highestPriority}, size ${smallestSize}`,
      );
    }

    // No functional groups attached - use original logic (smallest ring size)
    const smallestSize = Math.min(
      ...candidateRings.map((ring: RingSystem) => ring.size),
    );
    const smallestRings = candidateRings.filter(
      (ring: RingSystem) => ring.size === smallestSize,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.2.3] No FGs attached - selecting smallest ring size: ${smallestSize}`,
      );
    }

    return context.withUpdatedRings(
      smallestRings,
      "P-44.2.3",
      "Ring Size Seniority",
      "P-44.2",
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected smallest ring(s) (size: ${smallestSize})`,
    );
  },
};
