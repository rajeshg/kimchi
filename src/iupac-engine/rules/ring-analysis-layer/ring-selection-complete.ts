import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";

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

    if (process.env.VERBOSE) {
      console.log(
        `[ring-selection-complete conditions] Checking conditions...`,
      );
      console.log(`  - candidateRings: ${candidateRings?.length || 0}`);
      console.log(
        `  - parentStructure: ${state.parentStructure ? "EXISTS" : "NULL"}`,
      );
    }

    if (
      !candidateRings ||
      candidateRings.length === 0 ||
      state.parentStructure
    ) {
      if (process.env.VERBOSE) {
        console.log(
          `[ring-selection-complete conditions] FAIL: Missing rings or parent already set`,
        );
      }
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

    // P-44.1.1 criterion: Check functional group counts BEFORE size comparison
    // If rings have more functional groups than chains, select ring regardless of size
    const candidateChains = state.candidateChains;
    if (process.env.VERBOSE) {
      console.log(
        `[ring-selection-complete conditions] candidateChains count: ${candidateChains?.length || 0}`,
      );
    }
    if (candidateChains && candidateChains.length > 0) {
      const ring = candidateRings[0]!;
      const ringSize = ring.size || (ring.atoms ? ring.atoms.length : 0);

      const longestChain = candidateChains[0]!;
      const chainLength = longestChain.atoms ? longestChain.atoms.length : 0;

      // Count functional groups on rings
      const functionalGroups = state.functionalGroups || [];
      const principalFGs = functionalGroups.filter((fg) => fg.isPrincipal);

      // Build ring atom indices set
      const ringAtomIndices = new Set<number>();
      for (const r of candidateRings) {
        for (const atom of r.atoms) {
          const atomIdx = molecule.atoms.findIndex((a) => a === atom);
          if (atomIdx !== -1) {
            ringAtomIndices.add(atomIdx);
          }
        }
      }

      // Count FGs on ring
      // IMPORTANT: Only count FG as "on ring" if its ATTACHMENT POINT is in the ring
      // The attachment point is the first atom in fg.atoms (e.g., C=O carbon for amides/ketones)
      let ringFGCount = 0;
      for (const fg of principalFGs) {
        // Get FG atom objects and find their indices
        const fgAtoms = fg.atoms || [];
        if (fgAtoms.length === 0) continue;

        // Get the attachment point (first atom in the FG)
        const attachmentAtom = fgAtoms[0];
        if (!attachmentAtom) continue;

        const attachmentAtomIdx =
          attachmentAtom.id !== undefined
            ? attachmentAtom.id
            : molecule.atoms.findIndex((a) => a === attachmentAtom);

        if (attachmentAtomIdx === -1) continue;

        // Check if attachment point is in ring
        const isOnRing = ringAtomIndices.has(attachmentAtomIdx);

        if (isOnRing) {
          ringFGCount++;
        }
      }

      // Count FGs on chain
      const chainAtomIndices = new Set<number>();
      for (const atom of longestChain.atoms) {
        const atomIdx = molecule.atoms.findIndex((a) => a === atom);
        if (atomIdx !== -1) {
          chainAtomIndices.add(atomIdx);
        }
      }

      let chainFGCount = 0;
      for (const fg of principalFGs) {
        // Get FG atom objects and find their indices
        const fgAtoms = fg.atoms || [];
        if (fgAtoms.length === 0) continue;

        // Get the attachment point (first atom in the FG)
        const attachmentAtom = fgAtoms[0];
        if (!attachmentAtom) continue;

        const attachmentAtomIdx =
          attachmentAtom.id !== undefined
            ? attachmentAtom.id
            : molecule.atoms.findIndex((a) => a === attachmentAtom);

        if (attachmentAtomIdx === -1) continue;

        // Check if attachment point is in chain
        const isOnChain = chainAtomIndices.has(attachmentAtomIdx);

        if (isOnChain) {
          chainFGCount++;
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[ring-selection-complete conditions] FG count: ring=${ringFGCount}, chain=${chainFGCount}`,
        );
        console.log(
          `[ring-selection-complete conditions] Comparing: Chain (${chainLength} atoms) vs Ring (${ringSize} atoms)`,
        );
      }

      // P-44.1.1: If ring has more FGs, select ring regardless of size
      if (ringFGCount > chainFGCount) {
        if (process.env.VERBOSE) {
          console.log(
            `[ring-selection-complete conditions] Ring has more FGs (${ringFGCount} > ${chainFGCount}): selecting ring`,
          );
        }
        return true; // Apply this rule to select the ring
      }

      // P-44.1.1: If chain has more FGs, defer to chain selection
      if (chainFGCount > ringFGCount) {
        if (process.env.VERBOSE) {
          console.log(
            `[ring-selection-complete conditions] Chain has more FGs (${chainFGCount} > ${ringFGCount}): deferring to chain selection`,
          );
        }
        return false; // Do not apply this rule - let chain selection happen
      }

      // FG counts are equal. Apply P-44.1.2.2: rings have priority over chains
      // when functional group counts are equal or when no principal groups exist.
      if (chainFGCount === ringFGCount) {
        if (process.env.VERBOSE) {
          console.log(
            `[ring-selection-complete conditions] Equal FG counts (ring=${ringFGCount}, chain=${chainFGCount}): ring system has priority per P-44.1.2.2`,
          );
        }
        return true; // Select ring per P-44.1.2.2
      }

      // IUPAC Blue Book P-44.1.2.2: "Within the same class, a ring or ring system
      // has seniority over a chain."
      if (process.env.VERBOSE) {
        console.log(
          `[ring-selection-complete conditions] Ring system has priority per P-44.1.2.2 (rings > chains)`,
        );
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

    // This rule now only identifies the senior ring(s) but does NOT set parentStructure
    // P-44.4 will handle the final parent structure assignment with proper naming and numbering

    if (process.env.VERBOSE) {
      console.log(
        `[ring-selection-complete] Identified ${candidateRings.length} senior ring(s) - leaving parentStructure for P-44.4`,
      );
    }

    // Simply return context without setting parentStructure
    // The candidateRings are already set by earlier rules (P-44.2.x)
    return context;
  },
};
