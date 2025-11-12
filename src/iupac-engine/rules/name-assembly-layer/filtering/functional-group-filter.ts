import type {
  FunctionalGroup,
  ParentStructure,
  StructuralSubstituent,
} from "../../../types";
import type { NamingSubstituent } from "../../../naming/iupac-types";

type FunctionalGroupExtended = FunctionalGroup & {
  locant?: number;
};

type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
};

/**
 * Filter out functional groups that are already incorporated in the parent
 * structure name or parent substituent names.
 *
 * This prevents duplicates like "2,2-dimethylpropylsulfonylsulfinyl-5-sulfinyl-7-sulfonyl..."
 *
 * EXAMPLE: sulfonyl-sulfinyl (SMILES: CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C)
 *   Structure: Chain with both S=O (sulfinyl) and S(=O)(=O) (sulfonyl) groups
 *   Problem: Without this filtering, "sulfonyl" and "sulfinyl" appear twice:
 *            - Once in parent substituent "2,2-dimethylpropylsulfonylsulfinyl"
 *            - Again as standalone FG substituents "5-sulfinyl" and "7-sulfonyl"
 *   Solution: Check both parent structure name AND parent substituent names
 *
 * IMPORTANT: This must run AFTER atom-based filtering but BEFORE building
 *            the fgLocantTypeMap for deduplication
 *
 * FRAGILITY WARNING:
 *   - Relies on string matching (fgType/fgPrefix appearing in names)
 *   - Length threshold (> 10) prevents false positives but is somewhat arbitrary
 *   - If naming conventions change, this may break
 *   - Test cases: test/unit/iupac-engine/regressions/heteroatom-groups.test.ts
 */
export function filterFunctionalGroupsByName(
  fgStructuralSubstituents: FunctionalGroupExtended[],
  parentStructure: ParentStructureExtended,
  parentStructuralSubstituents: (StructuralSubstituent | NamingSubstituent)[],
): FunctionalGroupExtended[] {
  const parentStructureName = parentStructure.assembledName || "";

  // GUARD: Validate parent substituents structure
  const parentStructuralSubstituentNames: string[] = [];
  if (Array.isArray(parentStructuralSubstituents)) {
    for (const sub of parentStructuralSubstituents) {
      if (sub && typeof sub === "object") {
        const subName = sub.name || sub.type || "";
        if (typeof subName === "string") {
          parentStructuralSubstituentNames.push(subName);
        }
      }
    }
  }

  const fgTypesToFilter = new Set<string>();

  // Check parent structure name for FG type inclusion
  if (parentStructureName && typeof parentStructureName === "string") {
    for (const fgSub of fgStructuralSubstituents) {
      // GUARD: Validate fgSub structure
      if (!fgSub || typeof fgSub !== "object") continue;

      const fgType = fgSub.type;
      const fgPrefix = fgSub.prefix || fgType;

      // GUARD: Validate fgType is a string
      if (typeof fgType !== "string") continue;

      if (
        parentStructureName.includes(fgType) ||
        (fgPrefix && parentStructureName.includes(fgPrefix))
      ) {
        fgTypesToFilter.add(fgType);
        if (process.env.VERBOSE) {
          console.log(
            `[filterFunctionalGroupsByName] FG type "${fgType}" already in parent structure name "${parentStructureName}"`,
          );
        }
      }
    }
  }

  // Check parent substituent names for complex substituents
  // CRITICAL: Only filter if FG name appears in a COMPLEX substituent (length > 10)
  // This avoids false positives like filtering "oxy" from "hydroxy"
  if (process.env.VERBOSE) {
    console.log(
      `[filterFunctionalGroupsByName] parentStructuralSubstituentNames for FG filtering:`,
      parentStructuralSubstituentNames,
    );
  }
  for (const fgSub of fgStructuralSubstituents) {
    // GUARD: Validate fgSub structure
    if (!fgSub || typeof fgSub !== "object") continue;

    const fgType = fgSub.type;
    const fgPrefix = fgSub.prefix || fgType;

    // GUARD: Validate fgType is a string
    if (typeof fgType !== "string") continue;

    if (process.env.VERBOSE) {
      console.log(
        `[filterFunctionalGroupsByName] Checking FG type="${fgType}", prefix="${fgPrefix}" against parent subs`,
      );
    }

    // Special handling for alkoxy groups: check by atom overlap instead of name matching
    // because alkoxy FG name is generic "alkoxy" but parent substituent name is specific (e.g., "methoxy", "ethoxy", "2,2-dimethylpropoxy")
    if (
      fgType === "alkoxy" &&
      fgSub.atoms &&
      Array.isArray(fgSub.atoms) &&
      fgSub.atoms.length > 0
    ) {
      // Extract oxygen atom ID from functional group
      const fgAtomIds = new Set<number>();
      for (const atom of fgSub.atoms) {
        const atomId =
          atom && typeof atom === "object" && "id" in atom ? atom.id : atom;
        if (typeof atomId === "number") {
          fgAtomIds.add(atomId);
        }
      }

      // Check if any parent substituent contains this oxygen atom
      for (const parentSub of parentStructuralSubstituents) {
        if (parentSub.atoms && Array.isArray(parentSub.atoms)) {
          const parentSubAtomIds = new Set<number>(
            parentSub.atoms.map((a) =>
              typeof a === "object" && a !== null ? a.id : a,
            ),
          );
          const hasOverlap = Array.from(fgAtomIds).some((atomId) =>
            parentSubAtomIds.has(atomId),
          );
          if (hasOverlap) {
            fgTypesToFilter.add(fgType);
            if (process.env.VERBOSE) {
              console.log(
                `[filterFunctionalGroupsByName] FG type "${fgType}" (atoms: ${Array.from(fgAtomIds)}) overlaps with parent substituent "${parentSub.name || parentSub.type}" (atoms: ${Array.from(parentSubAtomIds)})`,
              );
            }
            break;
          }
        }
      }
      continue; // Skip name-based matching for alkoxy groups
    }

    for (const parentSubName of parentStructuralSubstituentNames) {
      if (process.env.VERBOSE) {
        console.log(
          `[filterFunctionalGroupsByName]   Comparing "${fgType}" with parentSubName="${parentSubName}" (length=${parentSubName.length})`,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[filterFunctionalGroupsByName]   includes check: ${parentSubName.includes(fgType)}, length check: ${parentSubName.length > 10}`,
          );
        }
      }
      // CRITICAL: Length threshold (> 10) prevents simple false positive matches
      // e.g., "oxy" in "hydroxy" vs "oxy" in "2,2-dimethylpropylsulfonylsulfinyl"
      if (
        parentSubName.length > 10 &&
        (parentSubName.includes(fgType) ||
          (fgPrefix && parentSubName.includes(fgPrefix)))
      ) {
        fgTypesToFilter.add(fgType);
        if (process.env.VERBOSE) {
          console.log(
            `[filterFunctionalGroupsByName] FG type "${fgType}" already in parent substituent "${parentSubName}"`,
          );
        }
        break; // No need to check other parent substituents for this FG
      }
    }
  }

  // Apply the filter: remove FGs that are already incorporated in names
  return fgStructuralSubstituents.filter((fgSub: FunctionalGroupExtended) => {
    // GUARD: Validate fgSub structure
    if (!fgSub || typeof fgSub !== "object" || typeof fgSub.type !== "string") {
      if (process.env.VERBOSE) {
        console.warn(
          `[filterFunctionalGroupsByName] WARNING: Invalid fgSub structure, keeping it:`,
          fgSub,
        );
      }
      return true; // Keep invalid entries to avoid silent data loss
    }
    return !fgTypesToFilter.has(fgSub.type);
  });
}
