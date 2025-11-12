import type { FunctionalGroup, ParentStructure } from "../../../types";

type FunctionalGroupExtended = FunctionalGroup & {
  locant?: number;
};

type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
};

/**
 * Filter out functional groups whose atoms are part of the parent ring structure.
 * This prevents ring heteroatoms from being misidentified as substituents.
 *
 * EXAMPLE: diaziridin-3-one (SMILES: CCC(C)(C)N1C(=O)N1C(C)(C)CC)
 *   Structure: N-C(=O)-N three-membered ring with two tert-butyl substituents
 *   Problem: Without this filtering, N atoms (part of ring) would be
 *            incorrectly identified as "azetidide" or other N-containing FGs
 *   Solution: Collect all ring atom IDs and filter out FGs that overlap
 */
export function filterFunctionalGroupsByRingAtoms(
  fgStructuralSubstituents: FunctionalGroupExtended[],
  parentStructure: ParentStructureExtended,
): FunctionalGroupExtended[] {
  const parentRingAtomIds = new Set<number>();

  if (parentStructure.type === "ring" && parentStructure.ring?.atoms) {
    // GUARD: Validate that ring.atoms is an array
    if (!Array.isArray(parentStructure.ring.atoms)) {
      if (process.env.VERBOSE) {
        console.warn(
          `[filterFunctionalGroupsByRingAtoms] WARNING: parentStructure.ring.atoms is not an array`,
        );
      }
    } else {
      for (const atom of parentStructure.ring.atoms) {
        // CRITICAL: parentStructure.ring.atoms contains Atom objects, not plain IDs
        // We must extract atom.id (Number) from each Atom object
        if (atom && typeof atom === "object" && "id" in atom) {
          parentRingAtomIds.add(atom.id);
        } else {
          // GUARD: Log warning if atom structure is unexpected
          if (process.env.VERBOSE) {
            console.warn(
              `[filterFunctionalGroupsByRingAtoms] WARNING: Unexpected atom structure in ring.atoms:`,
              atom,
            );
          }
        }
      }
      if (process.env.VERBOSE && parentRingAtomIds.size > 0) {
        if (process.env.VERBOSE) {
          console.log(
            `[filterFunctionalGroupsByRingAtoms] Parent ring atom IDs:`,
            Array.from(parentRingAtomIds),
          );
        }
      }
    }
  }

  // Filter out functional groups whose atoms are part of the parent ring structure
  return fgStructuralSubstituents.filter((fgSub: FunctionalGroupExtended) => {
    // GUARD: Validate fgSub.atoms structure
    if (!fgSub.atoms || !Array.isArray(fgSub.atoms)) {
      // If no atoms array, we can't filter by atom overlap - keep the FG
      return true;
    }

    // Skip filtering if there are no ring atoms to check against
    if (parentRingAtomIds.size === 0) {
      return true;
    }

    // CRITICAL: Extract atom IDs from Atom objects
    // fgSub.atoms contains Atom objects with .id property, not plain numbers
    const fgAtomIds: number[] = [];
    for (const atom of fgSub.atoms) {
      if (atom && typeof atom === "object" && "id" in atom) {
        fgAtomIds.push(atom.id);
      } else {
        // GUARD: Log warning if atom structure is unexpected
        if (process.env.VERBOSE) {
          console.warn(
            `[filterFunctionalGroupsByRingAtoms] WARNING: Unexpected atom structure in fgSub.atoms:`,
            atom,
          );
        }
      }
    }

    // Check for overlap: if ANY atom in this FG is part of the ring, filter it out
    const hasOverlap = fgAtomIds.some((atomId: number) =>
      parentRingAtomIds.has(atomId),
    );
    if (hasOverlap) {
      // EXCEPTION: For unsaturated heterocycles (azirine, oxirene), the imine/enol
      // functional group IS part of the ring but should NOT be filtered out
      // because it contributes the suffix (e.g., "azirin-2-amine")
      const parentRingName = parentStructure.assembledName || "";
      const isUnsaturatedHeterocycle =
        parentRingName.endsWith("irine") || parentRingName.endsWith("irene");
      const isImineOrEnol = fgSub.type === "imine" || fgSub.type === "enol";

      if (isUnsaturatedHeterocycle && isImineOrEnol && fgSub.isPrincipal) {
        if (process.env.VERBOSE) {
          console.log(
            `[filterFunctionalGroupsByRingAtoms] KEEPING principal FG "${fgSub.type}" despite overlap - unsaturated heterocycle "${parentRingName}" requires suffix`,
          );
        }
        return true; // Keep this functional group for suffix
      }

      if (process.env.VERBOSE) {
        console.log(
          `[filterFunctionalGroupsByRingAtoms] Filtering out FG "${fgSub.type}" (atoms: ${fgAtomIds}) - overlaps with parent ring atoms (ring: ${Array.from(parentRingAtomIds)})`,
        );
      }
      return false; // Exclude this functional group
    }

    return true; // Keep this functional group
  });
}
