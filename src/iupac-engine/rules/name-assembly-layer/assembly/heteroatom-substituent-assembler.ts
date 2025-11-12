import type { Molecule } from "types";
import type {
  FunctionalGroup,
  ParentStructure,
  StructuralSubstituent,
} from "../../../types";
import type { NamingSubstituent } from "../../../naming/iupac-types";
import type { OPSINService } from "../../../opsin-service";
import { getMultiplicativePrefix } from "../utils";
import { nameSpecialSubstituent } from "../naming/special-substituent-namer";

type UnifiedSubstituent =
  | StructuralSubstituent
  | NamingSubstituent
  | FunctionalGroup;

export function assembleHeteroatomSubstituents(
  allStructuralSubstituents: UnifiedSubstituent[],
  molecule: Molecule,
  parentStructure: ParentStructure,
  opsinService?: OPSINService,
): string[] {
  const substituentParts: string[] = [];
  const groupedSubs = new Map<string, number>();

  for (const sub of allStructuralSubstituents) {
    // Skip the principal functional group - it will be handled as a suffix
    // But non-principal functional groups should be included as substituents even if they have a suffix property
    const hasSuffix = "suffix" in sub && sub.suffix;
    if (hasSuffix && sub.isPrincipal) continue;

    const assembledName =
      "assembledName" in sub && typeof sub.assembledName === "string"
        ? sub.assembledName
        : undefined;
    let subName = assembledName || sub.name || sub.type || "";

    // Try special naming for thioether, phosphoryl, phosphanyl, amide
    const specialName = nameSpecialSubstituent({
      molecule,
      parentStructure,
      sub,
      subName,
    });
    if (specialName) {
      subName = specialName;
    }

    if (subName) {
      groupedSubs.set(subName, (groupedSubs.get(subName) || 0) + 1);
    }
  }

  for (const [subName, count] of groupedSubs.entries()) {
    const prefix =
      count > 1
        ? getMultiplicativePrefix(
            count,
            false,
            opsinService,
            subName.charAt(0),
          )
        : "";
    substituentParts.push(`${prefix}${subName}`);
  }

  // Sort alphabetically
  substituentParts.sort();

  return substituentParts;
}
