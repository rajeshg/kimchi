import type { FunctionalGroup, StructuralSubstituent } from "../../../types";
import type { NamingSubstituent } from "../../../naming/iupac-types";

type FunctionalGroupExtended = FunctionalGroup & {
  locant?: number;
};

/**
 * Build a locant-based deduplication map and filter parent substituents.
 *
 * This ensures we only deduplicate against FGs that are actually included
 * in the final name.
 *
 * EXAMPLE: bicyclo compound (SMILES: CC1CC2C(=O)CCC(C1O)O2)
 *   Expected: 6-hydroxy-7-methyl-9-oxabicyclo[3.3.1]nonan-2-one
 *   Problem: If we build this map BEFORE filtering, parent substituents get
 *            deduplicated against FGs that are later filtered out, causing
 *            substituents like "6-hydroxy" to be missing from the final name
 *   Solution: Build fgLocantTypeMap from fgStructuralSubstituentsFinal (after filtering)
 *
 * IMPORTANT: This map MUST be built from filtered FGs, NOT unfiltered ones.
 *            Building from the unfiltered list causes incorrect deduplication
 *
 * FRAGILITY WARNING:
 *   - Order matters: this MUST come after all FG filtering steps
 *   - Changing the order of operations will break bicyclo and similar cases
 *   - Test case: test/unit/iupac-engine/regressions/duplicated-substituent.test.ts
 */
export function deduplicateSubstituents(
  fgStructuralSubstituentsFinal: FunctionalGroupExtended[],
  parentStructuralSubstituents: (StructuralSubstituent | NamingSubstituent)[],
): (StructuralSubstituent | NamingSubstituent)[] {
  const fgLocantTypeMap = new Map<string, FunctionalGroupExtended>();

  for (const fgSub of fgStructuralSubstituentsFinal) {
    const locant = fgSub.locant ?? fgSub.locants?.[0];
    const type = fgSub.type;
    if (locant !== undefined) {
      // Map alcohol -> hydroxy for comparison
      const normalizedType = type === "alcohol" ? "hydroxy" : type;
      const key = `${locant}-${normalizedType}`;
      fgLocantTypeMap.set(key, fgSub);
    }
  }

  // Filter out parent substituents that duplicate functional group substituents
  return parentStructuralSubstituents.filter((pSub) => {
    // Handle both StructuralSubstituent and NamingSubstituent
    const locant = "locant" in pSub ? pSub.locant : undefined;
    const type = pSub.type;
    if (locant !== undefined && type) {
      const normalizedType = type === "hydroxy" ? "hydroxy" : type;
      const key = `${locant}-${normalizedType}`;
      if (fgLocantTypeMap.has(key)) {
        if (process.env.VERBOSE) {
          console.log(
            `[deduplicateSubstituents] deduplicating parent substituent ${type} at locant ${locant} - already in FG substituents`,
          );
        }
        return false;
      }
    }
    return true;
  });
}
