import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import {
  ExecutionPhase,
  ImmutableNamingContext,
} from "../../immutable-context";
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
    return !!(parentStructure && parentStructure.type === "ring");
  },
  action: (context: ImmutableNamingContext) => {
    const state = context.getState();
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
      }

      const originalNumbering = parentStructure.vonBaeyerNumbering;
      const molecule = state.molecule;
      const functionalGroups = state.functionalGroups || [];
      const ringAtomIds = new Set(Array.from(originalNumbering.keys()));

      // Helper function to get locants for a given numbering scheme
      const getLocants = (atomIdToPosition: Map<number, number>) => {
        const locants: number[] = [];

        // Collect locants from functional groups
        for (const fg of functionalGroups) {
          if (fg.atoms && fg.atoms.length > 0) {
            for (const groupAtom of fg.atoms) {
              const groupAtomId =
                typeof groupAtom === "object" ? groupAtom.id : groupAtom;
              if (atomIdToPosition.has(groupAtomId)) {
                locants.push(atomIdToPosition.get(groupAtomId)!);
              } else {
                const bonds = molecule.bonds.filter(
                  (bond: any) =>
                    bond.atom1 === groupAtomId || bond.atom2 === groupAtomId,
                );
                for (const bond of bonds) {
                  const otherAtomId =
                    bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
                  if (ringAtomIds.has(otherAtomId)) {
                    const position = atomIdToPosition.get(otherAtomId);
                    if (position !== undefined) {
                      locants.push(position);
                      break;
                    }
                  }
                }
              }
            }
          }
        }

        // Collect locants from substituents attached to ring
        for (const atomId of ringAtomIds) {
          const bonds = molecule.bonds.filter(
            (bond: any) => bond.atom1 === atomId || bond.atom2 === atomId,
          );
          for (const bond of bonds) {
            const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
            if (!ringAtomIds.has(otherAtomId)) {
              const otherAtom = molecule.atoms[otherAtomId];
              if (otherAtom && otherAtom.symbol !== "H") {
                const position = atomIdToPosition.get(atomId);
                if (position !== undefined) {
                  locants.push(position);
                }
              }
            }
          }
        }

        locants.sort((a, b) => a - b);
        return locants;
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
          `[Ring Numbering] Original locants: [${originalLocants.join(", ")}]`,
        );
        console.log(
          `[Ring Numbering] Reversed locants: [${reversedLocants.join(", ")}]`,
        );
      }

      // Choose the numbering with the lowest set of locants
      let chosenNumbering = originalNumbering;
      for (
        let i = 0;
        i < Math.min(originalLocants.length, reversedLocants.length);
        i++
      ) {
        if (reversedLocants[i]! < originalLocants[i]!) {
          chosenNumbering = reversedNumbering;
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] Choosing reversed numbering (lower locant at position ${i})`,
            );
          }
          break;
        } else if (originalLocants[i]! < reversedLocants[i]!) {
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] Choosing original numbering (lower locant at position ${i})`,
            );
          }
          break;
        }
      }

      const atomIdToPosition = chosenNumbering;

      // Update functional group locants to use chosen von Baeyer positions
      const updatedFunctionalGroups = functionalGroups.map((fg: any) => {
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering - von Baeyer] Processing functional group ${fg.type}: atoms=${fg.atoms?.map((a: any) => a).join(",")}, old locants=${fg.locants}, old locant=${fg.locant}`,
          );
        }

        // Find which ring atoms this functional group is attached to
        const attachedRingPositions: number[] = [];

        if (fg.atoms && fg.atoms.length > 0) {
          for (const groupAtom of fg.atoms) {
            const groupAtomId =
              typeof groupAtom === "object" ? groupAtom.id : groupAtom;
            // Check if this functional group atom is itself in the ring
            if (atomIdToPosition.has(groupAtomId)) {
              attachedRingPositions.push(atomIdToPosition.get(groupAtomId)!);
            } else {
              // This functional group atom is NOT in the ring, so find which ring atom it's bonded to
              const bonds = molecule.bonds.filter(
                (bond: any) =>
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
      });

      // Update parent structure with chosen numbering
      const updatedParentStructure = {
        ...parentStructure,
        vonBaeyerNumbering: atomIdToPosition,
      };

      return context.withStateUpdate(
        (state: any) => ({
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
        `[Ring Numbering] Before reorderRingAtoms: ring.atoms = [${ring.atoms.map((a: any) => a.id).join(", ")}], startingPosition = ${startingPosition}`,
      );
    }
    const reorderedAtoms = reorderRingAtoms(ring.atoms, startingPosition);
    if (process.env.VERBOSE) {
      console.log(
        `[Ring Numbering] After reorderRingAtoms: reorderedAtoms = [${reorderedAtoms.map((a: any) => a.id).join(", ")}]`,
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
    const ringAtomIds = new Set(reorderedAtoms.map((a: any) => a.id));

    // Update functional group locants to use ring positions instead of atom IDs
    // For functional groups attached to the ring (like -OH), we need to find which ring atom they're bonded to
    const updatedFunctionalGroups = functionalGroups.map((fg: any) => {
      if (process.env.VERBOSE) {
        console.log(
          `[Ring Numbering] Processing functional group ${fg.type}: atoms=${fg.atoms?.map((a: any) => a).join(",")}, old locants=${fg.locants}, old locant=${fg.locant}`,
        );
      }

      // Find which ring atoms this functional group is attached to
      const attachedRingPositions: number[] = [];

      if (fg.atoms && fg.atoms.length > 0) {
        for (const groupAtom of fg.atoms) {
          // Handle both object format (with .id) and direct ID format
          const groupAtomId =
            typeof groupAtom === "object" ? groupAtom.id : groupAtom;

          // Check if this functional group atom is itself in the ring
          if (atomIdToPosition.has(groupAtomId)) {
            attachedRingPositions.push(atomIdToPosition.get(groupAtomId)!);
          } else {
            // This functional group atom is NOT in the ring, so find which ring atom it's bonded to
            const bonds = molecule.bonds.filter(
              (bond: any) =>
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
            `[Ring Numbering] Updated functional group ${fg.type}: new locants=${attachedRingPositions}, new locant=${attachedRingPositions[0]}`,
          );
        }

        return {
          ...fg,
          locants: attachedRingPositions,
          locant: attachedRingPositions[0],
        };
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
    });

    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        functionalGroups: updatedFunctionalGroups,
        parentStructure: {
          ...parentStructure,
          locants: adjustedLocants,
          ring: {
            ...ring,
            atoms: reorderedAtoms,
            bonds: reorderedBonds,
          },
        },
      }),
      "ring-numbering",
      "Ring System Numbering",
      "Ring conventions",
      ExecutionPhase.NUMBERING,
      `Numbered ring starting from position ${startingPosition}: [${adjustedLocants.join(", ")}]`,
    );
  },
};
