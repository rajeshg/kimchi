import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import type { Bond, Atom, Molecule } from "types";
import {
  ExecutionPhase,
  ImmutableNamingContext,
} from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import {
  generateRingLocants,
  findRingStartingPosition,
  adjustRingLocants,
  reorderRingAtoms,
} from "./helpers";
import { getSimpleMultiplier } from "../../opsin-adapter";
import { getSharedOPSINService } from "../../opsin-service";

/**
 * Helper function to rebuild the von Baeyer parent structure name with updated heteroatom locants.
 * This is needed because the initial name is built before numbering optimization occurs.
 */
function rebuildVonBaeyerNameWithUpdatedLocants(
  oldName: string,
  molecule: Molecule,
  vonBaeyerNumbering: Map<number, number>,
  ringAtomIds: Set<number>,
): string {
  const opsinService = getSharedOPSINService();

  // Map heteroatom symbols to IUPAC replacement prefixes
  const heteroMap: Record<string, string> = {
    N: "aza",
    O: "oxa",
    S: "thia",
    P: "phospha",
    Si: "sila",
  };

  // Find all heteroatoms in the ring system
  const heteroatoms = molecule.atoms.filter(
    (atom) =>
      ringAtomIds.has(atom.id) &&
      atom.symbol !== "C" &&
      atom.symbol !== "H" &&
      heteroMap[atom.symbol],
  );

  // Build heteroatom prefix using updated numbering
  let heteroPrefix = "";
  if (heteroatoms.length > 0) {
    const heteroPositions = heteroatoms
      .map((ha) => {
        const pos = vonBaeyerNumbering.get(ha.id);
        const heteroName = heteroMap[ha.symbol];
        if (pos && heteroName) {
          return { pos, symbol: heteroName };
        }
        return null;
      })
      .filter((x): x is { pos: number; symbol: string } => x !== null)
      .sort((a, b) => a.pos - b.pos);

    if (heteroPositions.length > 0) {
      // Group by element type
      const groupedByElement = new Map<string, number[]>();
      for (const hp of heteroPositions) {
        const existing = groupedByElement.get(hp.symbol) ?? [];
        existing.push(hp.pos);
        groupedByElement.set(hp.symbol, existing);
      }

      // Build consolidated prefix for each element type
      const heteroGroups: string[] = [];
      for (const [symbol, positions] of groupedByElement) {
        const positionStr = positions.join(",");
        const count = positions.length;
        const multiplier =
          count > 1 ? getSimpleMultiplier(count, opsinService) : "";
        heteroGroups.push(`${positionStr}-${multiplier}${symbol}`);
      }
      heteroPrefix = heteroGroups.join("-");
    }
  }

  // Parse the old name to extract the base structure
  // Expected format: "N,N-dioxa...tricyclo[...]alkaneName" or "tricyclo[...]alkaneName"
  // We need to replace just the heteroatom prefix part

  // Find the position where "tricyclo" or "bicyclo" starts
  const cycloMatch = oldName.match(/(tricyclo|bicyclo)\[/);
  if (!cycloMatch) {
    // No von Baeyer descriptor found, return original name
    return oldName;
  }

  const cycloStart = cycloMatch.index!;
  const baseStructure = oldName.substring(cycloStart);

  // Rebuild the name with updated heteroatom prefix
  if (heteroPrefix) {
    return `${heteroPrefix}${baseStructure}`;
  } else {
    return baseStructure;
  }
}

/**
 * Rule: Ring Numbering
 *
 * Special numbering rules for ring systems, starting at a heteroatom
 * if present, or at a point of unsaturation.
 */
export const RING_NUMBERING_RULE: IUPACRule = {
  id: "ring-numbering",
  name: "Ring System Numbering",
  description: "Number ring systems starting from heteroatom or unsaturation",
  blueBookReference: "Ring numbering conventions",
  priority: RulePriority.TEN, // 100 - Must run first (was 160, highest priority)
  conditions: (context: ImmutableNamingContext) => {
    const state = context.getState();
    const parentStructure = state.parentStructure;
    // Only apply ring numbering if it hasn't been applied yet
    return !!(
      parentStructure &&
      parentStructure.type === "ring" &&
      !parentStructure.ringNumberingApplied
    );
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState() as ContextState;
    const parentStructure = state.parentStructure;

    if (!parentStructure || parentStructure.type !== "ring") {
      return context;
    }

    const ring = parentStructure.ring;
    if (!ring) {
      return context;
    }

    // If von Baeyer numbering is present (for bicyclo/tricyclo systems), optimize direction
    if (parentStructure.vonBaeyerNumbering) {
      if (process.env.VERBOSE) {
        console.log(
          `[Ring Numbering] Using von Baeyer numbering:`,
          Array.from(parentStructure.vonBaeyerNumbering.entries()),
        );
        if (process.env.VERBOSE) {
          console.log(`[Ring Numbering - ENTRY] Functional groups on entry:`);
        }
        for (const fg of state.functionalGroups || []) {
          if (process.env.VERBOSE) {
            console.log(
              `  FG "${fg.type}": atoms.length=${fg.atoms?.length}, atoms=[${fg.atoms?.map((a: Atom) => a.id).join(", ")}]`,
            );
          }
        }
      }

      let originalNumbering = parentStructure.vonBaeyerNumbering;
      const molecule = state.molecule;
      const functionalGroups = state.functionalGroups || [];
      const ringAtomIds = new Set(Array.from(originalNumbering.keys()));

      // Apply cyclic shifting for tricyclic systems to satisfy P-14.4
      const ringCount = state.parentStructure?.ring?.rings?.length || 0;
      const isTricyclic = ringCount >= 3;

      if (process.env.VERBOSE) {
        console.log(
          `[TRICYCLO SHIFT] Ring count: ${ringCount}, isTricyclic: ${isTricyclic}`,
        );
        console.log(
          `[TRICYCLO SHIFT] ENTRY - Original vonBaeyer mapping:`,
          Array.from(originalNumbering.entries())
            .map(([atom, pos]) => `${atom}→${pos}`)
            .join(", "),
        );
      }

      if (isTricyclic) {
        const maxPos = Math.max(...Array.from(originalNumbering.values()));

        // Extract secondary bridge atom IDs from parent structure name
        // Format: "tricyclo[6.4.0.0^{2,7}]dodecane" -> secondary bridge between positions 2 and 7
        // We need to find which atom IDs these correspond to in the ORIGINAL numbering
        const secondaryBridgeAtoms: Array<{ from: number; to: number }> = [];
        const nameMatch = parentStructure.name.match(
          /tricyclo\[[\d.]+\.0\^?\{?(\d+),(\d+)\}?\]/,
        );
        if (nameMatch) {
          const pos1 = Number.parseInt(nameMatch[1]!, 10);
          const pos2 = Number.parseInt(nameMatch[2]!, 10);

          // Find atom IDs that have these positions in the ORIGINAL numbering
          let atom1: number | undefined;
          let atom2: number | undefined;
          for (const [atomId, position] of originalNumbering.entries()) {
            if (position === pos1) atom1 = atomId;
            if (position === pos2) atom2 = atomId;
          }

          if (atom1 !== undefined && atom2 !== undefined) {
            secondaryBridgeAtoms.push({ from: atom1, to: atom2 });
            if (process.env.VERBOSE) {
              console.log(
                `[TRICYCLO SHIFT] Secondary bridge: atoms ${atom1}-${atom2} (original positions ${pos1},${pos2})`,
              );
            }
          }
        }

        // Helper to compute locants for a given numbering
        const computeLocants = (numbering: Map<number, number>) => {
          const heteroLocs: number[] = [];
          const principalLocs: number[] = [];
          const substituentLocs: number[] = [];
          const secondaryBridgeLocs: number[] = [];

          for (const fg of functionalGroups) {
            const positions: number[] = [];
            const atomsToProcess =
              fg.type === "ketone" && fg.atoms?.[0]
                ? [fg.atoms[0]]
                : fg.atoms || [];

            if (process.env.VERBOSE) {
              console.log(
                `[COMPUTE LOCANTS] FG "${fg.type}": atoms=[${atomsToProcess.map((a) => (typeof a === "object" ? a.id : a)).join(",")}]`,
              );
            }

            for (const groupAtom of atomsToProcess) {
              const groupAtomId =
                typeof groupAtom === "object" ? groupAtom.id : groupAtom;
              if (numbering.has(groupAtomId)) {
                positions.push(numbering.get(groupAtomId)!);
              } else {
                const bonds = molecule.bonds.filter(
                  (b: Bond) =>
                    b.atom1 === groupAtomId || b.atom2 === groupAtomId,
                );
                for (const bond of bonds) {
                  const otherAtomId =
                    bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
                  if (numbering.has(otherAtomId)) {
                    positions.push(numbering.get(otherAtomId)!);
                    break;
                  }
                }
              }
            }

            if (fg.type === "alcohol" || fg.type === "ether") {
              heteroLocs.push(...positions);
            } else if (fg.type === "ketone" || fg.type === "aldehyde") {
              principalLocs.push(...positions);
            } else {
              substituentLocs.push(...positions);
            }
          }

          // Add ALL oxygen atoms in von Baeyer numbering as heteroatom locants
          for (const [atomIdx, position] of numbering.entries()) {
            const atom = molecule.atoms[atomIdx];
            if (atom && atom.symbol === "O") {
              heteroLocs.push(position);
            }
          }

          // Also check for substituents (methyl groups) attached to ring atoms
          for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
            const atom = molecule.atoms[atomIdx];
            if (atom && atom.symbol === "C" && !numbering.has(atomIdx)) {
              // This is a non-ring carbon, check if it's attached to a ring atom
              const bonds = molecule.bonds.filter(
                (b: Bond) => b.atom1 === atom.id || b.atom2 === atom.id,
              );
              for (const bond of bonds) {
                const otherAtomId =
                  bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
                const otherAtomIdx = molecule.atoms.findIndex(
                  (a) => a.id === otherAtomId,
                );
                if (otherAtomIdx >= 0 && numbering.has(otherAtomIdx)) {
                  substituentLocs.push(numbering.get(otherAtomIdx)!);

                  break;
                }
              }
            }
          }

          // Compute secondary bridge locants (P-23 von Baeyer numbering)
          for (const bridge of secondaryBridgeAtoms) {
            const pos1 = numbering.get(bridge.from);
            const pos2 = numbering.get(bridge.to);
            if (pos1 !== undefined && pos2 !== undefined) {
              secondaryBridgeLocs.push(Math.min(pos1, pos2));
              secondaryBridgeLocs.push(Math.max(pos1, pos2));
            }
          }

          heteroLocs.sort((a, b) => a - b);
          principalLocs.sort((a, b) => a - b);
          substituentLocs.sort((a, b) => a - b);
          secondaryBridgeLocs.sort((a, b) => a - b);

          if (process.env.VERBOSE) {
            console.log(
              `[COMPUTE LOCANTS] Results: hetero=[${heteroLocs.join(",")}], principal=[${principalLocs.join(",")}], substituent=[${substituentLocs.join(",")}], secondaryBridge=[${secondaryBridgeLocs.join(",")}]`,
            );
          }

          return {
            heteroLocs,
            principalLocs,
            substituentLocs,
            secondaryBridgeLocs,
          };
        };

        // Helper to apply cyclic shift to numbering
        const applyShift = (
          numbering: Map<number, number>,
          shift: number,
        ): Map<number, number> => {
          const shifted = new Map<number, number>();
          for (const [atomIdx, pos] of numbering.entries()) {
            const newPos = ((pos - 1 + shift) % maxPos) + 1;
            shifted.set(atomIdx, newPos);
          }
          return shifted;
        };

        // Compare locants according to IUPAC priority P-14.4
        // Find the first point of difference and choose the lower locant
        const compareArrays = (arr1: number[], arr2: number[]): number => {
          const len = Math.min(arr1.length, arr2.length);
          for (let i = 0; i < len; i++) {
            if (arr1[i]! < arr2[i]!) return -1;
            if (arr1[i]! > arr2[i]!) return 1;
          }
          return arr1.length - arr2.length;
        };

        // Try all cyclic shifts to find optimal numbering
        // Compare ALL shifts against the original to find the true optimum per P-14.4
        const originalLocants = computeLocants(originalNumbering);
        const originalCompleteSet = [
          ...originalLocants.heteroLocs,
          ...originalLocants.principalLocs,
          ...originalLocants.substituentLocs,
        ].sort((a, b) => a - b);

        if (process.env.VERBOSE) {
          console.log(`[TRICYCLO SHIFT] Original baseline:`);
          console.log(
            `  Secondary bridge: [${originalLocants.secondaryBridgeLocs.join(",")}]`,
          );
          console.log(`  Hetero: [${originalLocants.heteroLocs.join(",")}]`);
          console.log(
            `  Principal: [${originalLocants.principalLocs.join(",")}]`,
          );
          console.log(
            `  Substituent: [${originalLocants.substituentLocs.join(",")}]`,
          );
          console.log(`  Complete: [${originalCompleteSet.join(",")}]`);
        }

        // IMPORTANT: For polycyclic von Baeyer systems with heteroatoms, the numbering
        // is determined by the bridge structure and should NOT be changed by cyclic shifts.
        // The heteroatom positions (e.g., 8,15,19-trioxa) are structural features of the
        // parent hydride, not optimization targets.
        let bestNumbering = originalNumbering;
        let bestLabel = "original";
        let bestLocants = originalLocants;
        let bestCompleteSet = originalCompleteSet;

        const hasHeteroatoms = originalLocants.heteroLocs.length > 0;
        if (hasHeteroatoms) {
          if (process.env.VERBOSE) {
            console.log(
              `[TRICYCLO SHIFT] Heteroatoms present - skipping cyclic shift optimization`,
            );
          }
          // Keep original numbering - no cyclic shift optimization needed
        } else {
          // Only apply cyclic shift optimization when no heteroatoms are present

          // Test all shifts against the ORIGINAL baseline, not incremental best
          // IMPORTANT: Per IUPAC P-23.2.6.2.4, secondary bridge locants "define the overall
          // numbering system" and must remain fixed. Only consider shifts that maintain the
          // original secondary bridge locants established during initial von Baeyer selection.
          for (let shift = 1; shift < maxPos; shift++) {
            const shiftedNumbering = applyShift(originalNumbering, shift);
            const locants = computeLocants(shiftedNumbering);
            const completeSet = [
              ...locants.heteroLocs,
              ...locants.principalLocs,
              ...locants.substituentLocs,
            ].sort((a, b) => a - b);

            if (process.env.VERBOSE) {
              console.log(`[TRICYCLO SHIFT] Evaluating shift${shift}:`);
              console.log(
                `  Secondary bridge: [${locants.secondaryBridgeLocs.join(",")}]`,
              );
              console.log(`  Hetero: [${locants.heteroLocs.join(",")}]`);
              console.log(`  Principal: [${locants.principalLocs.join(",")}]`);
              console.log(
                `  Substituent: [${locants.substituentLocs.join(",")}]`,
              );
              console.log(`  Complete set: [${completeSet.join(",")}]`);
            }

            // FILTER: Only consider shifts that maintain the original secondary bridge locants
            // Per IUPAC P-23.2.6.2.4, the secondary bridge locants define the numbering system
            const secondaryBridgeComp = compareArrays(
              locants.secondaryBridgeLocs,
              originalLocants.secondaryBridgeLocs,
            );
            if (secondaryBridgeComp !== 0) {
              if (process.env.VERBOSE) {
                console.log(
                  `[TRICYCLO SHIFT] shift${shift} SKIPPED - secondary bridge changed from [${originalLocants.secondaryBridgeLocs.join(",")}] to [${locants.secondaryBridgeLocs.join(",")}]`,
                );
              }
              continue; // Skip this shift - it changes the secondary bridge locants
            }

            // Compare according to IUPAC priority hierarchy for von Baeyer nomenclature:
            // Note: Heteroatom positions are structural features determined by the parent
            // hydride and should NOT be minimized during cyclic shift optimization.
            // 1. Principal functional group locants (P-14.3)
            // 2. Complete locant set (P-14.4)
            const principalComp = compareArrays(
              locants.principalLocs,
              bestLocants.principalLocs,
            );
            const completeSetComp = compareArrays(completeSet, bestCompleteSet);

            if (
              principalComp < 0 ||
              (principalComp === 0 && completeSetComp < 0)
            ) {
              bestNumbering = shiftedNumbering;
              bestLabel = `shift${shift}`;
              bestLocants = locants;
              bestCompleteSet = completeSet;
              if (process.env.VERBOSE) {
                console.log(
                  `[TRICYCLO SHIFT] shift${shift} is BETTER - updating best`,
                );
              }
            }
          }

          // Update originalNumbering with optimized version
          originalNumbering = bestNumbering;

          if (process.env.VERBOSE) {
            console.log(`[TRICYCLO SHIFT] Selected ${bestLabel} (best locants)`);
            console.log(`  Hetero: [${bestLocants.heteroLocs.join(",")}]`);
            console.log(`  Principal: [${bestLocants.principalLocs.join(",")}]`);
            console.log(`  Substituent: [${bestLocants.substituentLocs.join(",")}]`);
            console.log(`  Complete set: [${bestCompleteSet.join(",")}]`);
          }
        }

        // Update the parent structure's von Baeyer numbering
        if (parentStructure.vonBaeyerNumbering) {
          parentStructure.vonBaeyerNumbering = originalNumbering;

          // DEBUG: Check if this is the final call
          if (process.env.VERBOSE) {
            console.log(
              `[TRICYCLO SHIFT] FINAL: Updated parentStructure.vonBaeyerNumbering with ${bestLabel}`,
            );
            console.log(
              `[TRICYCLO SHIFT] FINAL: New numbering:`,
              Array.from(originalNumbering.entries())
                .map(([atom, pos]) => `${atom}→${pos}`)
                .join(", "),
            );
            console.log(
              `[TRICYCLO SHIFT] FINAL: Oxygen positions - atom9→${originalNumbering.get(9)}, atom10→${originalNumbering.get(10)}`,
            );
          }
        }

        // Generate reversed numbering for tricyclic systems (n -> maxPos - n + 1)
        const reversedNumbering = new Map<number, number>();
        for (const [atomId, pos] of originalNumbering.entries()) {
          reversedNumbering.set(atomId, maxPos - pos + 1);
        }

        // Compare locant sets between original and reversed
        const reversedLocants = computeLocants(reversedNumbering);
        const reversedCompleteSet = [
          ...reversedLocants.heteroLocs,
          ...reversedLocants.principalLocs,
          ...reversedLocants.substituentLocs,
        ].sort((a, b) => a - b);

        if (process.env.VERBOSE) {
          console.log(`[TRICYCLO REVERSE] Reversed locants:`);
          console.log(
            `  Secondary bridge: [${reversedLocants.secondaryBridgeLocs.join(",")}]`,
          );
          console.log(`  Hetero: [${reversedLocants.heteroLocs.join(",")}]`);
          console.log(
            `  Principal: [${reversedLocants.principalLocs.join(",")}]`,
          );
          console.log(
            `  Substituent: [${reversedLocants.substituentLocs.join(",")}]`,
          );
          console.log(`  Complete set: [${reversedCompleteSet.join(",")}]`);
        }

        // Choose the numbering with the lowest set of locants
        // IMPORTANT: For systems with heteroatoms, skip reversed comparison entirely.
        // The numbering is already determined by the bridge structure.
        if (!hasHeteroatoms) {
          // Only compare reversed numbering when no heteroatoms are present
          // First check if secondary bridge locants are maintained
          const secondaryBridgeComp = compareArrays(
            reversedLocants.secondaryBridgeLocs,
            bestLocants.secondaryBridgeLocs,
          );
          if (secondaryBridgeComp === 0) {
            // Secondary bridge is maintained, now compare other locants
            // Priority: principal groups > substituents
            const principalComp = compareArrays(
              reversedLocants.principalLocs,
              bestLocants.principalLocs,
            );
            const substituentComp = compareArrays(
              reversedLocants.substituentLocs,
              bestLocants.substituentLocs,
            );

            if (
              principalComp < 0 ||
              (principalComp === 0 && substituentComp < 0)
            ) {
              bestNumbering = reversedNumbering;
              bestLabel = "reversed";
              bestLocants = reversedLocants;
              bestCompleteSet = reversedCompleteSet;

              if (process.env.VERBOSE) {
                console.log(
                  `[TRICYCLO REVERSE] Choosing reversed numbering - better locants`,
                );
              }
            } else {
              if (process.env.VERBOSE) {
                console.log(
                  `[TRICYCLO REVERSE] Keeping original numbering - already optimal`,
                );
              }
            }
          } else {
            if (process.env.VERBOSE) {
              console.log(
                `[TRICYCLO REVERSE] Reversed numbering SKIPPED - secondary bridge changed`,
              );
            }
          }
        } else {
          if (process.env.VERBOSE) {
            console.log(
              `[TRICYCLO REVERSE] Heteroatoms present - skipping reversed numbering comparison`,
            );
          }
        }

        const atomIdToPosition = bestNumbering;

        // Update functional group locants to use chosen von Baeyer positions
        const updatedFunctionalGroups = functionalGroups.map(
          (fg: FunctionalGroup) => {
            if (process.env.VERBOSE) {
              console.log(
                `[Ring Numbering - von Baeyer] Processing functional group ${fg.type}: atoms=${fg.atoms?.map((a: Atom) => a.id).join(",")}, old locants=${fg.locants}, old locant=${fg.locant}`,
              );
            }

            // Find which ring atoms this functional group is attached to
            const attachedRingPositions: number[] = [];

            if (fg.atoms && fg.atoms.length > 0) {
              // For ketones, only use the carbonyl carbon (first atom) for locant calculation
              // to avoid counting the oxygen which would create duplicate locants
              const atomsToProcess =
                fg.type === "ketone" && fg.atoms[0] !== undefined
                  ? [fg.atoms[0]]
                  : fg.atoms;

              for (const groupAtom of atomsToProcess) {
                const groupAtomId =
                  typeof groupAtom === "object" ? groupAtom.id : groupAtom;
                // Check if this functional group atom is itself in the ring
                if (atomIdToPosition.has(groupAtomId)) {
                  attachedRingPositions.push(
                    atomIdToPosition.get(groupAtomId)!,
                  );
                } else {
                  // This functional group atom is NOT in the ring, so find which ring atom it's bonded to
                  const bonds = molecule.bonds.filter(
                    (bond: Bond) =>
                      bond.atom1 === groupAtomId || bond.atom2 === groupAtomId,
                  );

                  for (const bond of bonds) {
                    const otherAtomId =
                      bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
                    if (ringAtomIds.has(otherAtomId)) {
                      // Found a ring atom bonded to this functional group
                      const position = atomIdToPosition.get(otherAtomId);
                      if (
                        position !== undefined &&
                        !attachedRingPositions.includes(position)
                      ) {
                        attachedRingPositions.push(position);
                      }
                    }
                  }
                }
              }
            }

            // If we found ring positions, use those as locants
            if (attachedRingPositions.length > 0) {
              attachedRingPositions.sort((a, b) => a - b);

              if (process.env.VERBOSE) {
                console.log(
                  `[Ring Numbering - von Baeyer] Updated functional group ${fg.type}: new locants=${attachedRingPositions}, new locant=${attachedRingPositions[0]}`,
                );
              }

              return {
                ...fg,
                locants: attachedRingPositions,
                locant: attachedRingPositions[0],
              };
            }

            return fg;
          },
        );

        // Rebuild parent structure name with updated heteroatom locants
        const updatedName = rebuildVonBaeyerNameWithUpdatedLocants(
          parentStructure.name,
          molecule,
          atomIdToPosition,
          ringAtomIds,
        );

        // Update parent structure with chosen numbering and rebuilt name
        const updatedParentStructure = {
          ...parentStructure,
          vonBaeyerNumbering: atomIdToPosition,
          name: updatedName,
        };

        if (process.env.VERBOSE) {
          console.log(`[TRICYCLO SHIFT] Parent structure name updated:`);
          console.log(`  Old name: ${parentStructure.name}`);
          console.log(`  New name: ${updatedName}`);
        }

        return context.withStateUpdate(
          (state: ContextState) => ({
            ...state,
            functionalGroups: updatedFunctionalGroups,
            parentStructure: updatedParentStructure,
          }),
          "ring-numbering",
          "Ring System Numbering",
          "Ring numbering conventions",
          ExecutionPhase.NUMBERING,
          `Applied optimized von Baeyer numbering for tricyclic system: hetero=[${bestLocants.heteroLocs.join(",")}], principal=[${bestLocants.principalLocs.join(",")}]`,
        );
      }

      // Helper function to get locants for a given numbering scheme
      // Returns { principal, substituent, all } locant sets
      const getLocants = (atomIdToPosition: Map<number, number>) => {
        const principalLocants: number[] = [];
        const substituentLocants: number[] = [];

        // Collect locants from functional groups
        for (const fg of functionalGroups) {
          const fgLocants: number[] = [];

          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering - DEBUG ENTRY] FG "${fg.type}": atoms.length=${fg.atoms?.length}, atoms=[${fg.atoms?.map((a: Atom) => a.id).join(", ")}]`,
            );
          }

          if (fg.atoms && fg.atoms.length > 0) {
            // For ketones, only use the carbonyl carbon (first atom) for locant calculation
            // to avoid counting the oxygen which would create duplicate locants
            const atomsToProcess =
              fg.type === "ketone" && fg.atoms[0] !== undefined
                ? [fg.atoms[0]]
                : fg.atoms;

            for (const groupAtom of atomsToProcess) {
              const groupAtomId =
                typeof groupAtom === "object" ? groupAtom.id : groupAtom;
              if (atomIdToPosition.has(groupAtomId)) {
                fgLocants.push(atomIdToPosition.get(groupAtomId)!);
              } else {
                const bonds = molecule.bonds.filter(
                  (bond: Bond) =>
                    bond.atom1 === groupAtomId || bond.atom2 === groupAtomId,
                );
                for (const bond of bonds) {
                  const otherAtomId =
                    bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
                  if (ringAtomIds.has(otherAtomId)) {
                    const position = atomIdToPosition.get(otherAtomId);
                    if (position !== undefined) {
                      fgLocants.push(position);
                      break;
                    }
                  }
                }
              }
            }
          }

          // For ring systems, use only the minimum locant for each functional group
          // to avoid inflating the locant set with all ring atoms
          let fgRepresentativeLocant: number | undefined;
          if (fgLocants.length > 0) {
            fgRepresentativeLocant = Math.min(...fgLocants);
            if (process.env.VERBOSE) {
              console.log(
                `[Ring Numbering - DEBUG] FG "${fg.type}" (isPrincipal=${fg.isPrincipal}): fgLocants=[${fgLocants.join(", ")}], representative=${fgRepresentativeLocant}`,
              );
            }
          }

          // Separate principal and non-principal functional group locants
          if (fgRepresentativeLocant !== undefined) {
            if (fg.isPrincipal) {
              principalLocants.push(fgRepresentativeLocant);
            } else {
              substituentLocants.push(fgRepresentativeLocant);
            }
          }
        }

        // Collect locants from substituents attached to ring
        for (const atomId of ringAtomIds) {
          const bonds = molecule.bonds.filter(
            (bond: Bond) => bond.atom1 === atomId || bond.atom2 === atomId,
          );
          for (const bond of bonds) {
            const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
            if (!ringAtomIds.has(otherAtomId)) {
              const otherAtom = molecule.atoms[otherAtomId];
              if (otherAtom && otherAtom.symbol !== "H") {
                const position = atomIdToPosition.get(atomId);
                if (position !== undefined) {
                  substituentLocants.push(position);
                }
              }
            }
          }
        }

        principalLocants.sort((a, b) => a - b);
        substituentLocants.sort((a, b) => a - b);
        const allLocants = [...principalLocants, ...substituentLocants].sort(
          (a, b) => a - b,
        );

        return {
          principal: principalLocants,
          substituent: substituentLocants,
          all: allLocants,
        };
      };

      // Generate reversed numbering (n -> maxPos - n + 1)
      const maxPosition = Math.max(...Array.from(originalNumbering.values()));
      const reversedNumbering = new Map<number, number>();
      for (const [atomId, pos] of originalNumbering.entries()) {
        reversedNumbering.set(atomId, maxPosition - pos + 1);
      }

      // Compare locant sets
      const originalLocants = getLocants(originalNumbering);
      const reversedLocants = getLocants(reversedNumbering);

      if (process.env.VERBOSE) {
        console.log(
          `[Ring Numbering] Original principal locants: [${originalLocants.principal.join(", ")}]`,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Reversed principal locants: [${reversedLocants.principal.join(", ")}]`,
          );
        }
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Original substituent locants: [${originalLocants.substituent.join(", ")}]`,
          );
        }
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Reversed substituent locants: [${reversedLocants.substituent.join(", ")}]`,
          );
        }
      }

      // Choose the numbering with the lowest set of locants
      // Priority 1: Principal group locants
      // Priority 2: Substituent locants
      let chosenNumbering = originalNumbering;
      let decision = "";

      // First compare principal group locants
      const maxPrincipalLen = Math.max(
        originalLocants.principal.length,
        reversedLocants.principal.length,
      );
      let principalDecided = false;

      for (let i = 0; i < maxPrincipalLen; i++) {
        const origLoc = originalLocants.principal[i] ?? Infinity;
        const revLoc = reversedLocants.principal[i] ?? Infinity;

        if (revLoc < origLoc) {
          chosenNumbering = reversedNumbering;
          decision = `reversed numbering (lower principal locant at position ${i}: ${revLoc} < ${origLoc})`;
          principalDecided = true;
          break;
        } else if (origLoc < revLoc) {
          decision = `original numbering (lower principal locant at position ${i}: ${origLoc} < ${revLoc})`;
          principalDecided = true;
          break;
        }
      }

      // If principal groups are tied, compare substituent locants
      if (!principalDecided) {
        const maxSubLen = Math.max(
          originalLocants.substituent.length,
          reversedLocants.substituent.length,
        );

        for (let i = 0; i < maxSubLen; i++) {
          const origLoc = originalLocants.substituent[i] ?? Infinity;
          const revLoc = reversedLocants.substituent[i] ?? Infinity;

          if (revLoc < origLoc) {
            chosenNumbering = reversedNumbering;
            decision = `reversed numbering (lower substituent locant at position ${i}: ${revLoc} < ${origLoc})`;
            break;
          } else if (origLoc < revLoc) {
            decision = `original numbering (lower substituent locant at position ${i}: ${origLoc} < ${revLoc})`;
            break;
          }
        }

        if (!decision) {
          decision = "original numbering (all locants tied)";
        }
      }

      if (process.env.VERBOSE) {
        console.log(`[Ring Numbering] Choosing ${decision}`);
      }

      const atomIdToPosition = chosenNumbering;

      // Update functional group locants to use chosen von Baeyer positions
      const updatedFunctionalGroups = functionalGroups.map(
        (fg: FunctionalGroup) => {
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering - von Baeyer] Processing functional group ${fg.type}: atoms=${fg.atoms?.map((a: Atom) => a.id).join(",")}, old locants=${fg.locants}, old locant=${fg.locant}`,
            );
          }

          // Find which ring atoms this functional group is attached to
          const attachedRingPositions: number[] = [];

          if (fg.atoms && fg.atoms.length > 0) {
            // For ketones, only use the carbonyl carbon (first atom) for locant calculation
            // to avoid counting the oxygen which would create duplicate locants
            const atomsToProcess =
              fg.type === "ketone" && fg.atoms[0] !== undefined
                ? [fg.atoms[0]]
                : fg.atoms;

            for (const groupAtom of atomsToProcess) {
              const groupAtomId =
                typeof groupAtom === "object" ? groupAtom.id : groupAtom;
              // Check if this functional group atom is itself in the ring
              if (atomIdToPosition.has(groupAtomId)) {
                attachedRingPositions.push(atomIdToPosition.get(groupAtomId)!);
              } else {
                // This functional group atom is NOT in the ring, so find which ring atom it's bonded to
                const bonds = molecule.bonds.filter(
                  (bond: Bond) =>
                    bond.atom1 === groupAtomId || bond.atom2 === groupAtomId,
                );

                for (const bond of bonds) {
                  const otherAtomId =
                    bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
                  if (ringAtomIds.has(otherAtomId)) {
                    // Found a ring atom bonded to this functional group
                    const position = atomIdToPosition.get(otherAtomId);
                    if (
                      position !== undefined &&
                      !attachedRingPositions.includes(position)
                    ) {
                      attachedRingPositions.push(position);
                    }
                  }
                }
              }
            }
          }

          // If we found ring positions, use those as locants
          if (attachedRingPositions.length > 0) {
            attachedRingPositions.sort((a, b) => a - b);

            if (process.env.VERBOSE) {
              console.log(
                `[Ring Numbering - von Baeyer] Updated functional group ${fg.type}: new locants=${attachedRingPositions}, new locant=${attachedRingPositions[0]}`,
              );
            }

            return {
              ...fg,
              locants: attachedRingPositions,
              locant: attachedRingPositions[0],
            };
          }

          return fg;
        },
      );

      // Update parent structure with chosen numbering
      const updatedParentStructure = {
        ...parentStructure,
        vonBaeyerNumbering: atomIdToPosition,
      };

      return context.withStateUpdate(
        (state: ContextState) => ({
          ...state,
          functionalGroups: updatedFunctionalGroups,
          parentStructure: updatedParentStructure,
        }),
        "ring-numbering",
        "Ring System Numbering",
        "Ring numbering conventions",
        ExecutionPhase.NUMBERING,
        `Applied von Baeyer numbering for bicyclo/tricyclo system with locant optimization`,
      );
    }

    // Otherwise, use standard ring numbering
    // Number ring starting from heteroatom or unsaturation
    const ringLocants = generateRingLocants(ring);

    // Apply numbering starting from preferred position (considering substituents for lowest locants)
    const molecule = state.molecule;
    const functionalGroups = state.functionalGroups || [];
    const startingPosition = findRingStartingPosition(
      ring,
      molecule,
      functionalGroups,
    );
    const adjustedLocants = adjustRingLocants(ringLocants, startingPosition);

    // Reorder ring.atoms array to match the optimized numbering
    // This ensures that ring.atoms[0] corresponds to locant 1, ring.atoms[1] to locant 2, etc.
    if (process.env.VERBOSE) {
      console.log(
        `[Ring Numbering] Before reorderRingAtoms: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}], startingPosition = ${startingPosition}`,
      );
    }
    const reorderedAtoms = reorderRingAtoms(ring.atoms, startingPosition);
    if (process.env.VERBOSE) {
      console.log(
        `[Ring Numbering] After reorderRingAtoms: reorderedAtoms = [${reorderedAtoms.map((a: Atom) => a.id).join(", ")}]`,
      );
    }
    const reorderedBonds = ring.bonds; // Bonds don't need reordering as they reference atom IDs

    // Create mapping from atom ID to new ring position (1-based)
    // This is needed because functional groups store atom IDs in locants[], but we need ring positions
    const atomIdToPosition = new Map<number, number>();
    for (let i = 0; i < reorderedAtoms.length; i++) {
      const atom = reorderedAtoms[i];
      if (atom && typeof atom.id === "number") {
        atomIdToPosition.set(atom.id, i + 1); // 1-based position
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[Ring Numbering] Atom ID to position mapping:`,
        Array.from(atomIdToPosition.entries()),
      );
    }

    // Build set of ring atom IDs
    const ringAtomIds = new Set(reorderedAtoms.map((a: Atom) => a.id));

    // Update functional group locants to use ring positions instead of atom IDs
    // For functional groups attached to the ring (like -OH), we need to find which ring atom they're bonded to
    const updatedFunctionalGroups = functionalGroups.map(
      (fg: FunctionalGroup) => {
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Processing functional group ${fg.type}: atoms=${fg.atoms?.map((a: Atom) => a.id).join(",")}, old locants=${fg.locants}, old locant=${fg.locant}`,
          );
        }

        // Find which ring atoms this functional group is attached to
        const attachedRingPositions: number[] = [];

        if (fg.atoms && fg.atoms.length > 0) {
          // For ketones, only use the carbonyl carbon (first atom) for locant calculation
          // to avoid counting the oxygen which would create duplicate locants
          const atomsToProcess =
            fg.type === "ketone" && fg.atoms[0] !== undefined
              ? [fg.atoms[0]]
              : fg.atoms;

          for (const groupAtom of atomsToProcess) {
            // Handle both object format (with .id) and direct ID format
            const groupAtomId =
              typeof groupAtom === "object" ? groupAtom.id : groupAtom;

            // Check if this functional group atom is itself in the ring
            if (atomIdToPosition.has(groupAtomId)) {
              attachedRingPositions.push(atomIdToPosition.get(groupAtomId)!);
            } else {
              // This functional group atom is NOT in the ring, so find which ring atom it's bonded to
              const bonds = molecule.bonds.filter(
                (bond: Bond) =>
                  bond.atom1 === groupAtomId || bond.atom2 === groupAtomId,
              );

              for (const bond of bonds) {
                const otherAtomId =
                  bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
                if (ringAtomIds.has(otherAtomId)) {
                  // Found a ring atom bonded to this functional group
                  const position = atomIdToPosition.get(otherAtomId);
                  if (
                    position !== undefined &&
                    !attachedRingPositions.includes(position)
                  ) {
                    attachedRingPositions.push(position);
                    if (process.env.VERBOSE) {
                      console.log(
                        `[Ring Numbering] Functional group ${fg.type} attached to ring position ${position} (atom ${otherAtomId})`,
                      );
                    }
                  }
                }
              }
            }
          }
        }

        // If we found ring positions, use those as locants
        if (attachedRingPositions.length > 0) {
          attachedRingPositions.sort((a, b) => a - b);

          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] Updated functional group ${fg.type}: new locants=${JSON.stringify(attachedRingPositions)}, new locant=${attachedRingPositions[0]}`,
            );
          }

          const updatedGroup = {
            ...fg,
            locants: [...attachedRingPositions], // Create a NEW array
            locant: attachedRingPositions[0],
          };

          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] Created updated group with locants=${JSON.stringify(updatedGroup.locants)}`,
            );
          }

          return updatedGroup;
        }

        // Otherwise, try to convert existing locants using the atom ID to position map
        if (fg.locants && fg.locants.length > 0) {
          const newLocants = fg.locants.map((atomId: number) => {
            const position = atomIdToPosition.get(atomId);
            return position !== undefined ? position : atomId; // fallback to atom ID if not in ring
          });

          const newLocant =
            fg.locant !== undefined && atomIdToPosition.has(fg.locant)
              ? atomIdToPosition.get(fg.locant)
              : fg.locant;

          return {
            ...fg,
            locants: newLocants,
            locant: newLocant,
          };
        }

        return fg;
      },
    );

    // Update substituent positions to match the renumbered ring
    if (process.env.VERBOSE) {
      console.log(
        `[ring-numbering] BEFORE remapping - parentStructure.substituents:`,
        parentStructure.substituents?.map((s) => {
          const atomId =
            "position" in s
              ? Number(s.position)
              : "locant" in s
                ? s.locant
                : undefined;
          return `${s.name} at atomId ${atomId}, position/locant ${"position" in s ? s.position : "locant" in s ? s.locant : "N/A"}`;
        }),
      );
    }

    const updatedSubstituents = parentStructure.substituents?.map((sub) => {
      // Check if substituent has attachedToRingAtomId (for ring-attached substituents)
      let atomId: number;
      const hasRingAttachment =
        "attachedToRingAtomId" in sub && sub.attachedToRingAtomId !== undefined;
      if (hasRingAttachment) {
        atomId = sub.attachedToRingAtomId!;
      } else {
        // For NamingSubstituent, position is the original atom ID (as a string)
        // For StructuralSubstituent, locant is the original atom ID (as number)
        atomId = "position" in sub ? Number(sub.position) : sub.locant;
      }

      const newPosition = atomIdToPosition.get(atomId);
      if (newPosition !== undefined) {
        // Only update locant for substituents directly attached to ring atoms
        if (hasRingAttachment) {
          return {
            ...sub,
            position: String(newPosition),
            locant: newPosition, // KEY: Update locant for ring substituents
          };
        }
        return {
          ...sub,
          position: String(newPosition),
        };
      }
      return sub;
    });

    if (process.env.VERBOSE) {
      console.log(
        `[ring-numbering] Updated substituent positions:`,
        updatedSubstituents?.map((s) => `${s.name} at position ${s.position}`),
      );
    }

    const updatedParentStructure = {
      ...parentStructure,
      locants: adjustedLocants,
      ring: {
        ...ring,
        atoms: reorderedAtoms,
        bonds: reorderedBonds,
      },
      ringNumberingApplied: true,
      substituents: updatedSubstituents,
    };

    if (process.env.VERBOSE) {
      console.log(
        `[ring-numbering] updatedParentStructure.substituents AFTER spread:`,
        updatedParentStructure.substituents?.map(
          (s) => `${s.name} at position ${s.position}`,
        ),
      );
    }

    if (process.env.VERBOSE) {
      console.log(
        `[Ring Numbering] SAVING updatedFunctionalGroups to state:`,
        updatedFunctionalGroups.map((fg, idx) => ({
          index: idx,
          type: fg.type,
          locants: fg.locants,
          locant: fg.locant,
          locants_array_identity: fg.locants,
        })),
      );

      // Check if both functional groups share the same locants array reference
      if (updatedFunctionalGroups.length >= 2) {
        const fg0_locants = updatedFunctionalGroups[0]?.locants;
        const fg1_locants = updatedFunctionalGroups[1]?.locants;
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Are locants arrays the same object? ${fg0_locants === fg1_locants}`,
          );
        }
        if (fg0_locants)
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] FG0 locants value: ${JSON.stringify(fg0_locants)}`,
            );
          }
        if (fg1_locants)
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] FG1 locants value: ${JSON.stringify(fg1_locants)}`,
            );
          }
      }
    }

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        functionalGroups: updatedFunctionalGroups,
        parentStructure: updatedParentStructure,
      }),
      "ring-numbering",
      "Ring System Numbering",
      "Ring conventions",
      ExecutionPhase.NUMBERING,
      `Numbered ring starting from position ${startingPosition}: [${adjustedLocants.join(", ")}]`,
    );
  },
};
