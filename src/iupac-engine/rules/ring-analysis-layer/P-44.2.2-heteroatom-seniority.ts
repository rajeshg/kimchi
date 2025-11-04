import type { IUPACRule, RingSystem } from "../../types";
import type { Atom } from "types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";

/**
 * Rule: P-44.2.2 - Heteroatom Seniority
 *
 * Among ring systems, choose the one with the most senior heteroatoms
 * according to Blue Book Table 5.2.
 */
export const P44_2_2_HETEROATOM_SENIORITY_RULE: IUPACRule = {
  id: "P-44.2.2",
  name: "Heteroatom Seniority in Ring Systems",
  description: "Select ring with most senior heteroatoms (P-44.2.2)",
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.NINE,
  conditions: (context) => {
    const candidateRings = context.getState().candidateRings;
    return candidateRings && candidateRings.length > 1;
  },
  action: (context) => {
    const candidateRings = context.getState().candidateRings;
    const molecule = context.getState().molecule;

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.2.2] Starting heteroatom seniority with ${candidateRings?.length} rings`,
      );
    }

    if (!candidateRings || candidateRings.length <= 1) {
      return context;
    }

    // Check if rings are connected (bonded to each other but not sharing atoms)
    // If rings are connected, they form a polycyclic parent and should NOT be filtered by heteroatom seniority
    const areRingsConnected = (
      ring1: RingSystem,
      ring2: RingSystem,
    ): boolean => {
      const ring1AtomIds = new Set(
        (ring1 as RingSystem).atoms.map((a: Atom) => a.id),
      );
      const ring2AtomIds = new Set(
        (ring2 as RingSystem).atoms.map((a: Atom) => a.id),
      );

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
          `[P-44.2.2] Rings are connected - keeping all ${candidateRings.length} rings as polycyclic parent`,
        );
      }
      return context;
    }

    // Seniority order for heteroatoms in rings
    const heteroatomSeniority = {
      O: 1,
      S: 2,
      Se: 3,
      Te: 4,
      N: 5,
      P: 6,
      As: 7,
      Sb: 8,
      B: 9,
      Si: 10,
      Ge: 11,
    };

    // Calculate seniority score for each ring
    const ringScores = candidateRings.map((ring: RingSystem) => {
      let score = 0;

      for (const atom of ring.atoms) {
        if (atom.symbol !== "C" && atom.symbol !== "H") {
          const atomScore =
            heteroatomSeniority[
              atom.symbol as keyof typeof heteroatomSeniority
            ] || 999;
          score += 1000 - atomScore; // Lower score = higher priority
        }
      }

      if (process.env.VERBOSE) {
        const atomSymbols = ring.atoms.map((a: Atom) => a.symbol).join("");
        console.log(
          `[P-44.2.2]   Ring (${atomSymbols}): heteroatom score=${score}`,
        );
      }

      return score;
    });

    const maxScore = Math.max(...ringScores);
    const bestRings = candidateRings.filter(
      (_ring: RingSystem, index: number) => ringScores[index] === maxScore,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.2.2] Selected ${bestRings.length} ring(s) with max score ${maxScore}`,
      );
    }

    return context.withUpdatedRings(
      bestRings,
      "P-44.2.2",
      "Heteroatom Seniority",
      "P-44.2",
      ExecutionPhase.PARENT_STRUCTURE,
      `Selected ring with highest heteroatom seniority (score: ${maxScore})`,
    );
  },
};
