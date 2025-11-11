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
 * Helper function to check if a functional group is on a ring.
 * For alcohols/ethers/etc., the FG atoms are heteroatoms (O, N, S),
 * but we need to check if the CARBON bearing the FG is in the ring.
 */
function isFunctionalGroupOnRing(
  fg: { type?: string; atoms?: unknown[] },
  molecule: Molecule,
  ringAtomIndices: Set<number>,
): boolean {
  const fgAtoms = fg.atoms || [];

  // Convert FG atoms to indices
  const fgAtomIndices = fgAtoms
    .map((atom) => molecule.atoms.findIndex((a) => a === atom))
    .filter((idx) => idx !== -1);

  // Check each FG atom
  for (const fgAtomIdx of fgAtomIndices) {
    const fgAtom = molecule.atoms[fgAtomIdx];
    if (!fgAtom) continue;

    // If the FG atom itself is in the ring (e.g., nitrogen in pyridine)
    if (ringAtomIndices.has(fgAtomIdx)) {
      return true;
    }

    // For heteroatoms (O, N, S in alcohols, ethers, amines, etc.),
    // check if the bonded carbon is in the ring
    if (fgAtom.symbol !== "C") {
      for (const bond of molecule.bonds) {
        const bondedIdx =
          bond.atom1 === fgAtomIdx
            ? bond.atom2
            : bond.atom2 === fgAtomIdx
              ? bond.atom1
              : -1;

        if (bondedIdx !== -1 && ringAtomIndices.has(bondedIdx)) {
          // The carbon bonded to this heteroatom is in the ring
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Helper function to check if a functional group is attached to a ring system
 * either directly or through a short carbon chain.
 */
function isFunctionalGroupAttachedToRing(
  fgAtomIndices: number[],
  ringAtomIndices: Set<number>,
  molecule: Molecule,
): boolean {
  // Check if any FG atom is in the ring
  if (fgAtomIndices.some((atomIdx) => ringAtomIndices.has(atomIdx))) {
    return true;
  }

  // Check if any FG atom is DIRECTLY bonded to a ring atom (no intermediaries)
  // This counts exocyclic FGs like N-aryl amines on thiazoline
  // but excludes benzyl substituents (-CH2-phenyl)
  for (const fgAtomIdx of fgAtomIndices) {
    for (const bond of molecule.bonds) {
      const bondedTo =
        bond.atom1 === fgAtomIdx
          ? bond.atom2
          : bond.atom2 === fgAtomIdx
            ? bond.atom1
            : -1;

      if (bondedTo !== -1 && ringAtomIndices.has(bondedTo)) {
        // FG atom is directly bonded to a ring atom
        return true;
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
    // Apply if we have both chains and rings, OR if we have rings and might be able to find chains
    const chains = state.candidateChains as Chain[];
    const rings = state.candidateRings;
    const shouldApply =
      (chains && chains.length > 0 && rings && rings.length > 0) ||
      ((!chains || chains.length === 0) && rings && rings.length > 0);
    if (process.env.VERBOSE)
      console.log(
        `[P-44.1.1] Conditions check: chains=${chains?.length || 0}, rings=${rings?.length || 0}, shouldApply=${shouldApply}`,
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
    // EXCLUDE groups that can NEVER be principal (ethers, thioethers, halides, nitro, etc.)
    // NOTE: We count all FGs that CAN be principal, regardless of isPrincipal flag.
    // The isPrincipal flag is used for chain selection (only highest-priority type).
    // But P-44.1.1 needs to count ALL principal-eligible FG types to determine
    // whether chains or rings should be the parent structure.
    const NON_PRINCIPAL_TYPES = [
      "ether", // ROR - always named as alkoxy
      "thioether", // RSR - always named as alkylsulfanyl
      "RSR", // Same as thioether (pattern name)
      "ROR", // Same as ether (pattern name)
      "halide", // F, Cl, Br, I
      "nitro", // NO2
      "nitroso", // NO
      "alkoxy", // -OR substituent form
      "phosphanyl", // P - treat phosphanyl substituents as non-principal here
      "P", // pattern name for phosphanyl
    ];
    const principalFGs = functionalGroups.filter(
      (fg) => !NON_PRINCIPAL_TYPES.includes(fg.type),
    );

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
    const fgsOnChains = new Set<unknown>();

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

        // IMPORTANT: Check if FG is on a ring structure FIRST
        // Build ring atom indices set
        const allRingAtomIndices = new Set<number>();
        const rings = state.candidateRings || [];
        for (const ring of rings) {
          for (const atom of ring.atoms) {
            const atomIdx = molecule.atoms.findIndex((a) => a === atom);
            if (atomIdx !== -1) {
              allRingAtomIndices.add(atomIdx);
            }
          }
        }

        // Check if this FG is on a ring (considering carbon bearing the FG for alcohols/ethers)
        const isOnRing = isFunctionalGroupOnRing(
          fg,
          molecule,
          allRingAtomIndices,
        );

        // Check if FG atom is in chain
        const hasAtomInChain = fgAtomIndices.some((atomIdx) =>
          chainAtomIndices.has(atomIdx),
        );

        // Check if FG atom is attached to chain (directly or through short carbon bridge)
        // BUT only if it's not already part of a ring
        const isAttachedToChain =
          !isOnRing &&
          !hasAtomInChain &&
          isFunctionalGroupAttachedToRing(
            fgAtomIndices,
            chainAtomIndices,
            molecule,
          );

        if (process.env.VERBOSE) {
          console.log(
            `[P-44.1.1]   FG ${fg.type} atoms ${fgAtomIndices}: isOnRing=${isOnRing}, hasAtomInChain=${hasAtomInChain}, isAttachedToChain=${isAttachedToChain}`,
          );
        }

        if (hasAtomInChain || isAttachedToChain) {
          fgCount++;
          fgsOnChains.add(fg); // Track that this FG is on a chain
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.1.1] Chain with ${chain.atoms.length} atoms (IDs: ${Array.from(chainAtomIndices).join(",")}): fgCount=${fgCount}`,
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
      // IMPORTANT: Skip FGs that were already counted as part of chains UNLESS they're also on a ring
      // A functional group that is truly part of a ring should count for the ring, even if also found by chain algorithm
      // But a functional group that is only on a chain (not on ring) should not count for rings
      for (const fg of principalFGs) {
        // Check if FG is on a ring FIRST (considering carbon bearing the FG for alcohols/ethers)
        const isOnRing = isFunctionalGroupOnRing(fg, molecule, ringAtomIndices);

        // Skip FGs that are on a chain but NOT on a ring
        // These belong to the chain only, not the ring
        if (fgsOnChains.has(fg) && !isOnRing) {
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.1.1] Skipping ring FG count for ${fg.type} - on chain but not on ring`,
            );
          }
          continue;
        }

        // Convert fg.atoms (Atom objects) to atom indices for attachment checking
        const fgAtomIndices = (fg.atoms || [])
          .map((atom) => molecule.atoms.findIndex((a) => a === atom))
          .filter((idx) => idx !== -1);

        // Check if FG is attached to ring (directly or through short carbon bridge)
        const isAttachedToRing =
          !isOnRing &&
          isFunctionalGroupAttachedToRing(
            fgAtomIndices,
            ringAtomIndices,
            molecule,
          );

        if (isOnRing || isAttachedToRing) {
          ringFGCount++;
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.1.1] Counted ring FG: ${fg.type} (isOnRing=${isOnRing}, isAttachedToRing=${isAttachedToRing})`,
            );
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
    // UNLESS the rings are heterocyclic AND chains don't have high-priority FGs
    // (heterocyclic rings are senior to amines/alcohols but junior to carboxylic acids/esters per IUPAC P-44.1)
    if (maxChainFGCount > ringFGCount) {
      // Check if any ring is heterocyclic (contains non-carbon atoms)
      const hasHeterocyclicRing = rings.some((ring) =>
        ring.atoms.some((atom) => atom.symbol !== "C" && atom.symbol !== "H"),
      );

      // IUPAC P-44.1 seniority order: carboxylic_acid (100) > ester (97) > heterocycles > alcohol (90) > amine (89)
      // Find functional groups on the chains that have more FGs than rings
      const chainsWithMaxFGs = chainFGCounts.filter(
        (c) => c.fgCount === maxChainFGCount,
      );
      const chainAtomIndicesSet = new Set<number>();
      for (const c of chainsWithMaxFGs) {
        for (const atom of c.chain.atoms) {
          const idx = molecule.atoms.findIndex((a) => a === atom);
          if (idx !== -1) chainAtomIndicesSet.add(idx);
        }
      }

      // Check if any FG on these chains is carboxylic acid or ester (priority >= 97)
      const hasHighPriorityFGOnChain = principalFGs.some((fg) => {
        // Check if FG is on one of the chains with max FG count
        const fgAtomIndices = (fg.atoms || [])
          .map((atom) => molecule.atoms.findIndex((a) => a === atom))
          .filter((idx) => idx !== -1);

        const hasAtomInChain = fgAtomIndices.some((idx) =>
          chainAtomIndicesSet.has(idx),
        );
        const isAttachedToChain = fgAtomIndices.some((atomIdx) => {
          // Find bonds containing this FG atom
          const neighbors = molecule.bonds
            .filter((b) => b.atom1 === atomIdx || b.atom2 === atomIdx)
            .map((b) => (b.atom1 === atomIdx ? b.atom2 : b.atom1));
          // Check if any neighbor is in the chain
          return neighbors.some((neighborIdx) =>
            chainAtomIndicesSet.has(neighborIdx),
          );
        });

        const isOnChain = hasAtomInChain || isAttachedToChain;
        const isHighPriority =
          fg.type === "carboxylic_acid" || fg.type === "ester";

        return isOnChain && isHighPriority;
      });

      // Heterocycle priority logic:
      // IMPORTANT: This seniority check should ONLY apply when ring also has functional groups.
      // If chain has MORE functional groups than ring (maxChainFGCount > ringFGCount),
      // chain should always win regardless of heterocycle status.
      //
      // Heterocycle seniority only applies when FG counts are EQUAL:
      // - If chain has carboxylic acid or ester: chain wins (these are senior to heterocycles)
      // - If chain has only amines/alcohols AND ring has FGs: heterocycle wins (heterocycles are senior)
      if (
        hasHeterocyclicRing &&
        ringFGCount > 0 &&
        maxChainFGCount === ringFGCount
      ) {
        if (hasHighPriorityFGOnChain) {
          if (process.env.VERBOSE) {
            console.log(
              "[P-44.1.1] Chain has carboxylic acid or ester - chain wins per IUPAC seniority (carboxylic acid/ester > heterocycles)",
            );
          }
          // Let chain win - fall through to chain selection logic below
        } else {
          if (process.env.VERBOSE) {
            console.log(
              "[P-44.1.1] Equal FG count: Rings are heterocyclic with FGs, chain has only low-priority FGs - preserving rings per IUPAC seniority (heterocycles > amines/alcohols)",
            );
          }
          // Don't clear rings - heterocycles are senior to amines/alcohols when FG counts are equal
          return context;
        }
      } else if (process.env.VERBOSE && hasHeterocyclicRing) {
        console.log(
          `[P-44.1.1] Chain has MORE FGs than ring (${maxChainFGCount} > ${ringFGCount}) - chain wins regardless of heterocycle status`,
        );
      }

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
