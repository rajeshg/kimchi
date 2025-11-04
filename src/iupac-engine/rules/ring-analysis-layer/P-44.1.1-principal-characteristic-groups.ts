import type { IUPACRule, Chain } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";
import type { Molecule } from "../../../../types";

/**
 * Rule: P-44.1.1 - Maximum Number of Principal Characteristic Groups
 *
 * When choosing between chains and rings as parent, select the structure with
 * the maximum number of principal characteristic groups (alcohols, ketones, etc.).
 * This rule must run BEFORE ring parent selection rules (P-2.3, P-2.4, P-2.5).
 */

/**
 * Helper function to check if a functional group is attached to a ring system
 * either directly or through a short carbon chain.
 */
function isFunctionalGroupAttachedToRing(
  fgAtomIndices: number[],
  ringAtomIndices: Set<number>,
  molecule: Molecule,
  visited: Set<number> = new Set(),
  depth: number = 0,
  maxDepth: number = 2,
): boolean {
  // Stop if we've gone too deep (prevent infinite recursion)
  if (depth > maxDepth) return false;

  // Check if any FG atom is in the ring
  if (fgAtomIndices.some((atomIdx) => ringAtomIndices.has(atomIdx))) {
    return true;
  }

  // Check if any FG atom is directly bonded to a ring atom
  for (const fgAtomIdx of fgAtomIndices) {
    if (visited.has(fgAtomIdx)) continue;
    visited.add(fgAtomIdx);

    for (const bond of molecule.bonds) {
      const bondedTo =
        bond.atom1 === fgAtomIdx
          ? bond.atom2
          : bond.atom2 === fgAtomIdx
            ? bond.atom1
            : -1;

      if (bondedTo !== -1) {
        // Direct connection to ring
        if (ringAtomIndices.has(bondedTo)) {
          return true;
        }

        // Indirect connection through carbon chain (e.g., -CH2-COOH attached to ring)
        const bondedAtom = molecule.atoms[bondedTo];
        if (bondedAtom && bondedAtom.symbol === "C" && !visited.has(bondedTo)) {
          // Recursively check if this carbon is connected to the ring
          if (
            isFunctionalGroupAttachedToRing(
              [bondedTo],
              ringAtomIndices,
              molecule,
              visited,
              depth + 1,
              maxDepth,
            )
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export const P44_1_1_PRINCIPAL_CHARACTERISTIC_GROUPS_RULE: IUPACRule = {
  id: "P-44.1.1",
  name: "Maximum Number of Principal Characteristic Groups",
  description:
    "Select parent with maximum number of principal characteristic groups",
  blueBookReference: BLUE_BOOK_RULES.P44_1,
  priority: RulePriority.EIGHT, // Higher than P2_3 (75) to run before ring parent selection
  conditions: (context) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      if (process.env.VERBOSE)
        console.log("[P-44.1.1] Skipping - parent already selected");
      return false;
    }
    // Only apply if we have both chains and rings to compare
    const chains = state.candidateChains as Chain[];
    const rings = state.candidateRings;
    const shouldApply = chains.length > 0 && rings && rings.length > 0;
    if (process.env.VERBOSE)
      console.log(
        `[P-44.1.1] Conditions check: chains=${chains.length}, rings=${rings?.length || 0}, shouldApply=${shouldApply}`,
      );
    return shouldApply;
  },
  action: (context) => {
    const state = context.getState();
    const chains = state.candidateChains as Chain[];
    const molecule = state.molecule as Molecule;
    const functionalGroups = state.functionalGroups || [];

    if (!chains || chains.length === 0 || !molecule) return context;

    // Get principal functional groups (already detected in functional-groups-layer)
    // These include: alcohols, ketones, aldehydes, carboxylic acids, amines, etc.
    const principalFGs = functionalGroups.filter((fg) => fg.isPrincipal);

    if (process.env.VERBOSE) {
      console.log(`[P-44.1.1] principalFGs.length=${principalFGs.length}`);
      console.log(
        `[P-44.1.1] principal FG types:`,
        principalFGs.map((fg) => fg.type),
      );
      console.log(
        `[P-44.1.1] principal FGs full:`,
        JSON.stringify(principalFGs, null, 2),
      );
    }

    // Track which functional groups are part of chains
    const fgsOnChains = new Set<any>();

    // Count how many principal functional groups are on each chain
    const chainFGCounts = chains.map((chain) => {
      // Build a set of atom indices in this chain for fast lookup
      const chainAtomIndices = new Set<number>();
      for (const atom of chain.atoms) {
        const atomIdx = molecule.atoms.findIndex((a) => a === atom);
        if (atomIdx !== -1) {
          chainAtomIndices.add(atomIdx);
        }
      }

      // Count how many principal functional groups have atoms in this chain OR attached to this chain
      let fgCount = 0;
      for (const fg of principalFGs) {
        // fg.atoms contains Atom objects, convert to indices for comparison
        const fgAtomIndices = (fg.atoms || [])
          .map((atom) => molecule.atoms.findIndex((a) => a === atom))
          .filter((idx) => idx !== -1);

        // Check if FG atom is in chain
        const hasAtomInChain = fgAtomIndices.some((atomIdx) =>
          chainAtomIndices.has(atomIdx),
        );

        // Check if FG atom is attached to chain (directly or through short carbon bridge)
        const isAttachedToChain =
          !hasAtomInChain &&
          isFunctionalGroupAttachedToRing(
            fgAtomIndices,
            chainAtomIndices,
            molecule,
          );

        if (hasAtomInChain || isAttachedToChain) {
          fgCount++;
          fgsOnChains.add(fg); // Track that this FG is on a chain
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.1.1] Chain with ${chain.atoms.length} atoms: fgCount=${fgCount}`,
        );
      }

      return { chain, fgCount };
    });

    // Also count functional groups on rings (if any)
    const rings = state.candidateRings || [];
    let ringFGCount = 0;

    if (rings.length > 0) {
      // Build a set of all ring atom indices
      const ringAtomIndices = new Set<number>();
      for (const ring of rings) {
        for (const atom of ring.atoms) {
          const atomIdx = molecule.atoms.findIndex((a) => a === atom);
          if (atomIdx !== -1) {
            ringAtomIndices.add(atomIdx);
          }
        }
      }

      // Count how many principal functional groups have atoms in rings OR attached to rings
      // IMPORTANT: Skip FGs already counted as part of chains to avoid double-counting
      for (const fg of principalFGs) {
        // Skip if this FG was already counted as part of a chain
        if (fgsOnChains.has(fg)) {
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.1.1] Skipping FG ${fg.type} - already counted as chain FG`,
            );
          }
          continue;
        }

        // Convert fg.atoms (Atom objects) to atom indices
        const fgAtomIndices = (fg.atoms || [])
          .map((atom) => molecule.atoms.findIndex((a) => a === atom))
          .filter((idx) => idx !== -1);

        // Check if FG is in ring or attached to ring (directly or through short carbon bridge)
        const hasAtomInRing = fgAtomIndices.some((atomIdx) =>
          ringAtomIndices.has(atomIdx),
        );
        const isAttachedToRing =
          !hasAtomInRing &&
          isFunctionalGroupAttachedToRing(
            fgAtomIndices,
            ringAtomIndices,
            molecule,
          );

        if (hasAtomInRing || isAttachedToRing) {
          ringFGCount++;
          if (process.env.VERBOSE) {
            console.log(`[P-44.1.1] Counted ring FG: ${fg.type}`);
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.1.1] Rings have ${ringFGCount} principal functional groups`,
        );
      }
    }

    // Find maximum functional group count among chains
    const maxChainFGCount = Math.max(...chainFGCounts.map((c) => c.fgCount), 0);

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.1.1] maxChainFGCount=${maxChainFGCount}, ringFGCount=${ringFGCount}`,
      );
    }

    // If chains have more principal functional groups than rings, select those chains
    if (maxChainFGCount > ringFGCount) {
      const functionalChains = chainFGCounts
        .filter((c) => c.fgCount === maxChainFGCount)
        .map((c) => c.chain);

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.1.1] Selecting ${functionalChains.length} chains with ${maxChainFGCount} functional groups, clearing rings`,
        );
      }

      return context
        .withUpdatedCandidates(
          functionalChains,
          "P-44.1.1",
          "Maximum Number of Principal Characteristic Groups",
          BLUE_BOOK_RULES.P44_1,
          ExecutionPhase.PARENT_STRUCTURE,
          `Selected chains with ${maxChainFGCount} principal characteristic groups over rings with ${ringFGCount}`,
        )
        .withStateUpdate(
          (state) => ({
            ...state,
            candidateRings: [], // Clear rings since functional chain takes precedence
            p44_1_1_applied: true,
          }),
          "P-44.1.1",
          "Maximum Number of Principal Characteristic Groups",
          BLUE_BOOK_RULES.P44_1,
          ExecutionPhase.PARENT_STRUCTURE,
          "Cleared candidate rings in favor of chains with principal characteristic groups",
        );
    }

    // If rings have equal or more functional groups than chains, let normal rules proceed
    // (rings may win via P-44.2 ring seniority)
    if (process.env.VERBOSE) {
      console.log(
        "[P-44.1.1] Rings have equal or more functional groups, letting other rules proceed",
      );
      console.log(
        "[P-44.1.1] Returning context with candidateRings.length =",
        context.getState().candidateRings?.length,
      );
    }
    return context;
  },
};
