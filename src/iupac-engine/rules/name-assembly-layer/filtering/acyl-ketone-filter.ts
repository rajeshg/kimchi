import type { FunctionalGroup, ParentStructure } from "../../../types";
import type { Molecule } from "types";

/**
 * Filter out ketones that are already represented as acyl substituents in the parent structure.
 * This prevents double-counting of ketone groups that have been converted to acyl substituents
 * (e.g., "acetyl", "propanoyl") during parent chain analysis.
 *
 * @param functionalGroups All functional groups detected in the molecule
 * @param parentStructure Parent structure with its substituents
 * @param molecule The molecule being analyzed
 * @returns Filtered functional groups (excluding principal and already-represented ketones)
 */
export function filterAcylKetones(
  functionalGroups: FunctionalGroup[],
  parentStructure: ParentStructure,
  molecule: Molecule,
): FunctionalGroup[] {
  return functionalGroups.filter((group) => {
    if (group.isPrincipal) {
      return false;
    }

    if (group.type === "ketone" && !group.isPrincipal) {
      const carbonylCarbon = group.atoms?.find((atom) => atom.symbol === "C");

      if (!carbonylCarbon) {
        return true;
      }

      const chainAtoms = parentStructure.chain?.atoms || [];
      const chainAtomIds = chainAtoms.map((a) => a.id);

      let attachmentLocant: number | undefined;

      const chainPosition = chainAtomIds.indexOf(carbonylCarbon.id);
      if (chainPosition !== -1) {
        const locantSet = parentStructure.locants || [];
        attachmentLocant = locantSet[chainPosition] ?? chainPosition + 1;
      } else {
        if (molecule?.bonds) {
          for (const bond of molecule.bonds) {
            let chainAtomId: number | undefined;
            if (
              bond.atom1 === carbonylCarbon.id &&
              chainAtomIds.includes(bond.atom2)
            ) {
              chainAtomId = bond.atom2;
            } else if (
              bond.atom2 === carbonylCarbon.id &&
              chainAtomIds.includes(bond.atom1)
            ) {
              chainAtomId = bond.atom1;
            }

            if (chainAtomId !== undefined) {
              const chainPos = chainAtomIds.indexOf(chainAtomId);
              if (chainPos !== -1) {
                const locantSet = parentStructure.locants || [];
                attachmentLocant = locantSet[chainPos] ?? chainPos + 1;
                break;
              }
            }
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[ACYL FILTER] Checking ketone: carbonylCarbon=${carbonylCarbon.id}, attachmentLocant=${attachmentLocant}`,
        );
      }

      if (attachmentLocant === undefined) {
        return true;
      }

      const parentSubs = parentStructure.substituents || [];

      if (process.env.VERBOSE) {
        console.log(
          `[ACYL FILTER] Checking ${parentSubs.length} parent substituents`,
        );
      }

      const isAlreadyAcyl = parentSubs.some((sub) => {
        const subType = sub.type || "";
        const subName = sub.name || "";

        if (process.env.VERBOSE) {
          console.log(
            `[ACYL FILTER]   sub: type=${subType}, name=${subName}, locant=${"locant" in sub ? sub.locant : "N/A"}`,
          );
        }

        const isAcylGroup =
          (subType.endsWith("yl") || subName.endsWith("yl")) &&
          (subType.includes("oyl") ||
            subName.includes("oyl") ||
            subType === "acetyl" ||
            subName === "acetyl" ||
            subType === "formyl" ||
            subName === "formyl");

        if (!isAcylGroup) {
          return false;
        }

        const subLocant = "locant" in sub ? sub.locant : undefined;

        if (process.env.VERBOSE) {
          console.log(
            `[ACYL FILTER]     Acyl sub "${subType || subName}" at locant ${subLocant}, ketone attachment at ${attachmentLocant}, match=${subLocant === attachmentLocant}`,
          );
        }

        if (subLocant === attachmentLocant) {
          if (process.env.VERBOSE) {
            console.log(
              `[filterAcylKetones] Filtering out ketone with attachment at locant ${attachmentLocant} - already represented as acyl substituent "${subType || subName}"`,
            );
          }
          return true;
        }

        return false;
      });

      if (process.env.VERBOSE) {
        console.log(
          `[ACYL FILTER] isAlreadyAcyl=${isAlreadyAcyl}, returning ${!isAlreadyAcyl}`,
        );
      }

      return !isAlreadyAcyl;
    }

    return true;
  });
}
