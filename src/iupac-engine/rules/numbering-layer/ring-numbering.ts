import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import type { Bond, Atom } from "types";
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
        console.log(`[Ring Numbering - ENTRY] Functional groups on entry:`);
        for (const fg of state.functionalGroups || []) {
          console.log(
            `  FG "${fg.type}": atoms.length=${fg.atoms?.length}, atoms=[${fg.atoms?.map((a: Atom) => a.id).join(", ")}]`,
          );
        }
      }

      const originalNumbering = parentStructure.vonBaeyerNumbering;
      const molecule = state.molecule;
      const functionalGroups = state.functionalGroups || [];
      const ringAtomIds = new Set(Array.from(originalNumbering.keys()));

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
        console.log(
          `[Ring Numbering] Reversed principal locants: [${reversedLocants.principal.join(", ")}]`,
        );
        console.log(
          `[Ring Numbering] Original substituent locants: [${originalLocants.substituent.join(", ")}]`,
        );
        console.log(
          `[Ring Numbering] Reversed substituent locants: [${reversedLocants.substituent.join(", ")}]`,
        );
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
                    console.log(
                      `[Ring Numbering] Functional group ${fg.type} attached to ring position ${position} (atom ${otherAtomId})`,
                    );
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
      // For NamingSubstituent, position is the original atom ID (as a string)
      // For StructuralSubstituent, locant is the original atom ID (as number)
      const atomId = "position" in sub ? Number(sub.position) : sub.locant;
      const newPosition = atomIdToPosition.get(atomId);
      if (newPosition !== undefined) {
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
        console.log(
          `[Ring Numbering] Are locants arrays the same object? ${fg0_locants === fg1_locants}`,
        );
        if (fg0_locants)
          console.log(
            `[Ring Numbering] FG0 locants value: ${JSON.stringify(fg0_locants)}`,
          );
        if (fg1_locants)
          console.log(
            `[Ring Numbering] FG1 locants value: ${JSON.stringify(fg1_locants)}`,
          );
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
