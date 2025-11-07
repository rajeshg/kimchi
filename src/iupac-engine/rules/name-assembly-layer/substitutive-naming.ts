import type {
  FunctionalGroup,
  ParentStructure,
  StructuralSubstituent,
} from "../../types";
import type { NamingSubstituent } from "../../naming/iupac-types";
import type { Molecule, Atom } from "types";
import {
  nameAlkylSulfanylSubstituent,
  namePhosphorylSubstituent,
  namePhosphanylSubstituent,
} from "../../naming/iupac-chains";
import { getSimpleMultiplierWithVowel } from "../../opsin-adapter";
import type { OPSINService } from "../../opsin-service";
import { getSharedOPSINService } from "../../opsin-service";
import {
  getMultiplicativePrefix,
  collectSubstituentAtoms,
} from "./utils";

type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
  substituents?: (StructuralSubstituent | NamingSubstituent)[];
  size?: number;
};

type FunctionalGroupExtended = FunctionalGroup & {
  locant?: number;
};

/**
 * Detect N-substituents on amine/imine nitrogen atoms
 * Returns a prefix string like "N-methyl" or "N,N-dimethyl" or empty string
 */
export function detectNSubstituents(
  principalGroup: FunctionalGroup,
  parentStructure: ParentStructureExtended,
  molecule: Molecule,
  opsinService?: OPSINService,
): string {
  // For imine groups (e.g., azirine), the principal group atoms contain the C=N carbon
  // We need to find the amine nitrogen bonded to this carbon
  if (!principalGroup.atoms || principalGroup.atoms.length === 0) {
    return "";
  }

  if (!molecule || !molecule.atoms || !molecule.bonds) {
    return "";
  }

  // Find the amine nitrogen attached to the imine carbon
  // For imine: principalGroup.atoms[0] is the C=N carbon
  const imineCarbonId = principalGroup.atoms[0]?.id;
  if (imineCarbonId === undefined) {
    return "";
  }

  // Find nitrogen bonded to the imine carbon with a single bond
  let amineNitrogenId: number | undefined;
  for (const bond of molecule.bonds) {
    if (bond.type !== "single") continue;
    let potentialNitrogenId: number | undefined;
    if (bond.atom1 === imineCarbonId) {
      potentialNitrogenId = bond.atom2;
    } else if (bond.atom2 === imineCarbonId) {
      potentialNitrogenId = bond.atom1;
    }

    if (potentialNitrogenId !== undefined) {
      const potentialNitrogen = molecule.atoms.find(
        (a: Atom) => a.id === potentialNitrogenId,
      );
      if (potentialNitrogen?.symbol === "N" && !potentialNitrogen.isInRing) {
        amineNitrogenId = potentialNitrogenId;
        break;
      }
    }
  }

  if (amineNitrogenId === undefined) {
    return "";
  }

  // Find all carbon substituents on the amine nitrogen
  const nSubstituents: Array<{ name: string; carbon: Atom }> = [];
  for (const bond of molecule.bonds) {
    if (bond.type !== "single") continue;
    let carbonId: number | undefined;
    if (bond.atom1 === amineNitrogenId) {
      carbonId = bond.atom2;
    } else if (bond.atom2 === amineNitrogenId) {
      carbonId = bond.atom1;
    }

    if (carbonId !== undefined) {
      const carbon = molecule.atoms.find((a: Atom) => a.id === carbonId);
      // Check if it's a carbon and not the imine carbon
      if (carbon?.symbol === "C" && carbonId !== imineCarbonId) {
        // For now, assume it's a methyl group (simple alkyl)
        // TODO: Handle longer alkyl chains (ethyl, propyl, etc.)
        nSubstituents.push({ name: "methyl", carbon });
      }
    }
  }

  if (nSubstituents.length === 0) {
    return "";
  }

  // Format N-substituents
  // Single substituent: "N-methyl"
  // Two identical: "N,N-dimethyl"
  // Two different: "N-ethyl-N-methyl" (alphabetical)
  if (nSubstituents.length === 1) {
    return `N-${nSubstituents[0]!.name}`;
  }

  // Check if all substituents are identical
  const firstSubName = nSubstituents[0]!.name;
  const allIdentical = nSubstituents.every((sub) => sub.name === firstSubName);

  if (allIdentical) {
    // Use di-, tri-, etc. prefix from OPSIN
    const multiplier = getSimpleMultiplierWithVowel(
      nSubstituents.length,
      firstSubName.charAt(0),
      opsinService ?? getSharedOPSINService(),
    );
    const nLocants = Array.from(
      { length: nSubstituents.length },
      () => "N",
    ).join(",");
    return `${nLocants}-${multiplier}${firstSubName}`;
  }

  // Different substituents - alphabetize and format as N-sub1-N-sub2
  const sortedNames = nSubstituents
    .map((sub) => sub.name)
    .sort((a, b) => a.localeCompare(b));
  return sortedNames.map((name) => `N-${name}`).join("-");
}

export function buildSubstitutiveName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
  molecule: Molecule,
  opsinService?: OPSINService,
): string {
  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] parentStructure.type:",
      parentStructure.type,
    );
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] parentStructure.substituents:",
      JSON.stringify(
        parentStructure.substituents?.map((s) => ({
          type: s.type,
          locant: "locant" in s ? s.locant : undefined,
        })),
      ),
    );
    }
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] functionalGroups:",
      JSON.stringify(
        functionalGroups.map((g) => ({
          type: g.type,
          atoms: g.atoms,
          isPrincipal: g.isPrincipal,
          prefix: g.prefix,
          suffix: g.suffix,
        })),
      ),
    );
    }
  }

  let name = "";

  // Add substituents from functional groups (excluding principal group)
  // Also filter out ketones that are already represented as acyl substituents
  // in the parent structure (e.g., "acetyl", "2-methylpropanoyl")
  const fgStructuralSubstituents: FunctionalGroupExtended[] =
    functionalGroups.filter((group) => {
      // Exclude principal groups
      if (group.isPrincipal) {
        return false;
      }

      // For non-principal ketones, check if they're already represented as acyl substituents
      if (group.type === "ketone" && !group.isPrincipal) {
        // Get the ketone's carbonyl carbon atom
        const carbonylCarbon = group.atoms?.find((atom) => atom.symbol === "C");
        
        if (!carbonylCarbon) {
          return true; // Keep if we can't determine the carbon
        }

        // Determine the ketone's attachment point to the main chain
        // If the carbonyl carbon is NOT on the chain, find which chain atom it's bonded to
        const chainAtoms = parentStructure.chain?.atoms || [];
        const chainAtomIds = chainAtoms.map((a) => a.id);
        
        let attachmentLocant: number | undefined;
        
        // Check if carbonyl carbon is on the chain
        const chainPosition = chainAtomIds.indexOf(carbonylCarbon.id);
        if (chainPosition !== -1) {
          // Carbonyl is on chain - use its position
          const locantSet = parentStructure.locants || [];
          attachmentLocant = locantSet[chainPosition] ?? chainPosition + 1;
        } else {
          // Carbonyl is NOT on chain - find which chain atom it's bonded to
          if (molecule?.bonds) {
            for (const bond of molecule.bonds) {
              let chainAtomId: number | undefined;
              if (bond.atom1 === carbonylCarbon.id && chainAtomIds.includes(bond.atom2)) {
                chainAtomId = bond.atom2;
              } else if (bond.atom2 === carbonylCarbon.id && chainAtomIds.includes(bond.atom1)) {
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
          return true; // Keep if we can't determine the attachment point
        }

        // Check if this ketone is already in parent substituents as an acyl group
        const parentSubs = parentStructure.substituents || [];

        if (process.env.VERBOSE) {
          console.log(
            `[ACYL FILTER] Checking ${parentSubs.length} parent substituents`,
          );
        }

        const isAlreadyAcyl = parentSubs.some((sub) => {
          // Check if substituent is an acyl group (ends with "yl" and contains acyl patterns)
          // Examples: "acetyl", "propanoyl", "2-methylpropanoyl", "benzoyl"
          const subType = sub.type || "";
          const subName = sub.name || "";

          if (process.env.VERBOSE) {
            console.log(
              `[ACYL FILTER]   sub: type=${subType}, name=${subName}, locant=${"locant" in sub ? sub.locant : "N/A"}`,
            );
          }

          // Acyl groups end with "yl" but NOT simple alkyl groups
          // Check for common acyl patterns: "acetyl", "propanoyl", "butanoyl", "benzoyl", etc.
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

          // Check if the locant matches the ketone's attachment point
          const subLocant = "locant" in sub ? sub.locant : undefined;

          if (process.env.VERBOSE) {
            console.log(
              `[ACYL FILTER]     Acyl sub "${subType || subName}" at locant ${subLocant}, ketone attachment at ${attachmentLocant}, match=${subLocant === attachmentLocant}`,
            );
          }

          if (subLocant === attachmentLocant) {
            if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Filtering out ketone with attachment at locant ${attachmentLocant} - already represented as acyl substituent "${subType || subName}"`,
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

        // Filter out if already represented as acyl
        return !isAlreadyAcyl;
      }

      return true;
    });

  // Find principal functional group atoms to exclude from substituents
  const principalFG = functionalGroups.find((group) => group.isPrincipal);
  const principalGroupAtomIds = principalFG
    ? new Set(principalFG.atoms || [])
    : new Set();
  const principalFGPrefix = principalFG?.prefix; // e.g., "hydroxy" for alcohol

  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] principalGroupAtomIds:",
      Array.from(principalGroupAtomIds),
    );
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] principalFGPrefix:",
      principalFGPrefix,
    );
    }
  }

  // Collect all functional group atoms (both principal and non-principal)
  const allFGAtomIds = new Set<number>();
  for (const fg of functionalGroups) {
    if (fg.atoms) {
      for (const atom of fg.atoms) {
        allFGAtomIds.add(atom.id);
      }
    }
  }

  // For chain parent structures, use parent substituents if they exist
  // Only add functional groups that are NOT already represented in parent substituents
  // This prevents double-counting ethers that are already named as alkoxy substituents
  const parentStructuralSubstituents = (
    parentStructure.substituents || []
  ).filter((sub) => {
    // Exclude if this substituent matches the principal functional group prefix
    // E.g., "hydroxy" substituent matches "alcohol" FG with prefix="hydroxy"
    if (principalFGPrefix && sub.type === principalFGPrefix) {
      if (process.env.VERBOSE) {
        const locant = "locant" in sub ? sub.locant : undefined;
        if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] excluding substituent ${sub.type} (locant=${locant}) - matches principal FG prefix`,
        );
        }
      }
      return false;
    }

    // Also check by atoms if available
    const subAtoms = sub.atoms || [];
    if (subAtoms.length > 0) {
      // Handle union type: StructuralSubstituent has Atom[], NamingSubstituent has number[]
      const isPrincipal = subAtoms.some((atom) => {
        const atomId = typeof atom === "number" ? atom : atom.id;
        return principalGroupAtomIds.has(atomId);
      });
      if (isPrincipal && process.env.VERBOSE) {
        if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] excluding substituent ${sub.type} - atoms overlap with principal FG`,
        );
        }
      }
      return !isPrincipal;
    }

    return true;
  });

  // ============================================================================
  // CRITICAL SECTION: Ring Atom Filtering for Heterocycles
  // ============================================================================
  // This section prevents heteroatoms in ring structures from being incorrectly
  // classified as functional group substituents.
  //
  // EXAMPLE: diaziridin-3-one (SMILES: CCC(C)(C)N1C(=O)N1C(C)(C)CC)
  //   Structure: N-C(=O)-N three-membered ring with two tert-butyl substituents
  //   Problem: Without this filtering, N atoms (part of ring) would be
  //            incorrectly identified as "azetidide" or other N-containing FGs
  //   Solution: Collect all ring atom IDs and filter out FGs that overlap
  //
  // IMPORTANT: This logic must run BEFORE name-based filtering because we need
  //            to filter by atom topology (which atoms are IN the ring) before
  //            checking if FG names appear in the parent structure name.
  //
  // FRAGILITY WARNING:
  //   - parentStructure.ring.atoms MUST contain Atom objects with .id property
  //   - fgSub.atoms MUST contain Atom objects with .id property
  //   - If either structure changes to use plain IDs instead of objects,
  //     you MUST update the .id extraction below
  //   - Test case: test/unit/iupac-engine/regressions/heteroatom-groups.test.ts
  // ============================================================================

  const parentRingAtomIds = new Set<number>();
  if (parentStructure.type === "ring" && parentStructure.ring?.atoms) {
    // GUARD: Validate that ring.atoms is an array
    if (!Array.isArray(parentStructure.ring.atoms)) {
      if (process.env.VERBOSE) {
        console.warn(
          `[buildSubstitutiveName] WARNING: parentStructure.ring.atoms is not an array`,
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
              `[buildSubstitutiveName] WARNING: Unexpected atom structure in ring.atoms:`,
              atom,
            );
          }
        }
      }
      if (process.env.VERBOSE && parentRingAtomIds.size > 0) {
        if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] Parent ring atom IDs:`,
          Array.from(parentRingAtomIds),
        );
        }
      }
    }
  }

  // Filter out functional groups whose atoms are part of the parent ring structure
  // This prevents ring heteroatoms from being misidentified as substituents
  const fgStructuralSubstituentFilteredByAtoms =
    fgStructuralSubstituents.filter((fgSub: FunctionalGroupExtended) => {
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
              `[buildSubstitutiveName] WARNING: Unexpected atom structure in fgSub.atoms:`,
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
              `[buildSubstitutiveName] KEEPING principal FG "${fgSub.type}" despite overlap - unsaturated heterocycle "${parentRingName}" requires suffix`,
            );
          }
          return true; // Keep this functional group for suffix
        }

        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Filtering out FG "${fgSub.type}" (atoms: ${fgAtomIds}) - overlaps with parent ring atoms (ring: ${Array.from(parentRingAtomIds)})`,
          );
        }
        return false; // Exclude this functional group
      }

      return true; // Keep this functional group
    });

  // ============================================================================
  // CRITICAL SECTION: Name-Based Filtering to Prevent Duplicate FG Names
  // ============================================================================
  // Filter out functional groups that are already incorporated in the parent
  // structure name or parent substituent names. This prevents duplicates like:
  //   - "2,2-dimethylpropylsulfonylsulfinyl-5-sulfinyl-7-sulfonyl..."
  //
  // EXAMPLE: sulfonyl-sulfinyl (SMILES: CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C)
  //   Structure: Chain with both S=O (sulfinyl) and S(=O)(=O) (sulfonyl) groups
  //   Problem: Without this filtering, "sulfonyl" and "sulfinyl" appear twice:
  //            - Once in parent substituent "2,2-dimethylpropylsulfonylsulfinyl"
  //            - Again as standalone FG substituents "5-sulfinyl" and "7-sulfonyl"
  //   Solution: Check both parent structure name AND parent substituent names
  //
  // IMPORTANT: This must run AFTER atom-based filtering but BEFORE building
  //            the fgLocantTypeMap for deduplication
  //
  // FRAGILITY WARNING:
  //   - Relies on string matching (fgType/fgPrefix appearing in names)
  //   - Length threshold (> 10) prevents false positives but is somewhat arbitrary
  //   - If naming conventions change, this may break
  //   - Test cases: test/unit/iupac-engine/regressions/heteroatom-groups.test.ts
  // ============================================================================

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
    for (const fgSub of fgStructuralSubstituentFilteredByAtoms) {
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
            `[buildSubstitutiveName] FG type "${fgType}" already in parent structure name "${parentStructureName}"`,
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
      `[buildSubstitutiveName] parentStructuralSubstituentNames for FG filtering:`,
      parentStructuralSubstituentNames,
    );
  }
  for (const fgSub of fgStructuralSubstituentFilteredByAtoms) {
    // GUARD: Validate fgSub structure
    if (!fgSub || typeof fgSub !== "object") continue;

    const fgType = fgSub.type;
    const fgPrefix = fgSub.prefix || fgType;

    // GUARD: Validate fgType is a string
    if (typeof fgType !== "string") continue;

    if (process.env.VERBOSE) {
      console.log(
        `[buildSubstitutiveName] Checking FG type="${fgType}", prefix="${fgPrefix}" against parent subs`,
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
                `[buildSubstitutiveName] FG type "${fgType}" (atoms: ${Array.from(fgAtomIds)}) overlaps with parent substituent "${parentSub.name || parentSub.type}" (atoms: ${Array.from(parentSubAtomIds)})`,
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
          `[buildSubstitutiveName]   Comparing "${fgType}" with parentSubName="${parentSubName}" (length=${parentSubName.length})`,
        );
        if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName]   includes check: ${parentSubName.includes(fgType)}, length check: ${parentSubName.length > 10}`,
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
            `[buildSubstitutiveName] FG type "${fgType}" already in parent substituent "${parentSubName}"`,
          );
        }
        break; // No need to check other parent substituents for this FG
      }
    }
  }

  // Apply the filter: remove FGs that are already incorporated in names
  const fgStructuralSubstituentsFinal: FunctionalGroupExtended[] =
    fgStructuralSubstituentFilteredByAtoms.filter(
      (fgSub: FunctionalGroupExtended) => {
        // GUARD: Validate fgSub structure
        if (
          !fgSub ||
          typeof fgSub !== "object" ||
          typeof fgSub.type !== "string"
        ) {
          if (process.env.VERBOSE) {
            console.warn(
              `[buildSubstitutiveName] WARNING: Invalid fgSub structure, keeping it:`,
              fgSub,
            );
          }
          return true; // Keep invalid entries to avoid silent data loss
        }
        return !fgTypesToFilter.has(fgSub.type);
      },
    );

  // ============================================================================
  // CRITICAL SECTION: Locant-Based Deduplication Map
  // ============================================================================
  // Build a map of FG locants and types for deduplication (AFTER filtering)
  // This ensures we only deduplicate against FGs that are actually included in the final name
  //
  // EXAMPLE: bicyclo compound (SMILES: CC1CC2C(=O)CCC(C1O)O2)
  //   Expected: 6-hydroxy-7-methyl-9-oxabicyclo[3.3.1]nonan-2-one
  //   Problem: If we build this map BEFORE filtering, parent substituents get
  //            deduplicated against FGs that are later filtered out, causing
  //            substituents like "6-hydroxy" to be missing from the final name
  //   Solution: Build fgLocantTypeMap from fgStructuralSubstituentsFinal (after filtering)
  //
  // IMPORTANT: This map MUST be built from fgStructuralSubstituentsFinal, NOT fgStructuralSubstituents
  //            Building from the unfiltered list causes incorrect deduplication
  //
  // FRAGILITY WARNING:
  //   - Order matters: this MUST come after all FG filtering steps
  //   - Changing the order of operations will break bicyclo and similar cases
  //   - Test case: test/unit/iupac-engine/regressions/duplicated-substituent.test.ts
  // ============================================================================
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
  const deduplicatedParentSubs = parentStructuralSubstituents.filter((pSub) => {
    // Handle both StructuralSubstituent and NamingSubstituent
    const locant = "locant" in pSub ? pSub.locant : undefined;
    const type = pSub.type;
    if (locant !== undefined && type) {
      const normalizedType = type === "hydroxy" ? "hydroxy" : type;
      const key = `${locant}-${normalizedType}`;
      if (fgLocantTypeMap.has(key)) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] deduplicating parent substituent ${type} at locant ${locant} - already in FG substituents`,
          );
        }
        return false;
      }
    }
    return true;
  });

  const allStructuralSubstituents = [
    ...fgStructuralSubstituentsFinal,
    ...deduplicatedParentSubs,
  ];

  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] fgStructuralSubstituents:",
      JSON.stringify(
        fgStructuralSubstituents.map((s) => ({
          type: s.type,
          name: s.name,
          locant: s.locant ?? s.locants?.[0],
        })),
      ),
    );
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] fgStructuralSubstituentsFinal:",
      JSON.stringify(
        fgStructuralSubstituentsFinal.map((s: FunctionalGroupExtended) => ({
          type: s.type,
          name: s.name,
          locant: s.locant ?? s.locants?.[0],
        })),
      ),
    );
    }
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] parentStructuralSubstituents:",
      JSON.stringify(
        parentStructuralSubstituents.map((s) => ({
          type: s.type,
          name: s.name,
          locant: "locant" in s ? s.locant : undefined,
        })),
      ),
    );
    }
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] deduplicatedParentSubs:",
      JSON.stringify(
        deduplicatedParentSubs.map((s) => ({
          type: s.type,
          name: s.name,
          locant: "locant" in s ? s.locant : undefined,
        })),
      ),
    );
    }
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] allStructuralSubstituents:",
      JSON.stringify(
        allStructuralSubstituents.map((s) => ({
          type: s.type,
          name: s.name,
          locant:
            "locant" in s
              ? s.locant
              : "locants" in s
                ? s.locants?.[0]
                : undefined,
        })),
      ),
    );
    }
  }

  if (allStructuralSubstituents.length > 0) {
    // Build substituent names with locants and multiplicative prefixes
    const substituentParts: string[] = [];
    const _size =
      parentStructure.type === "ring" ? parentStructure.size || 0 : 0;
    const isHeteroatomParent = parentStructure.type === "heteroatom";

    if (isHeteroatomParent) {
      // For heteroatom parents, group identical substituents and add multiplicative prefixes
      const groupedSubs = new Map<string, number>();
      for (const sub of allStructuralSubstituents) {
        // Skip the principal functional group - it will be handled as a suffix
        // But non-principal functional groups should be included as substituents even if they have a suffix property
        const hasSuffix = "suffix" in sub && sub.suffix;
        if (hasSuffix && sub.isPrincipal) continue;

        const assembledName =
          "assembledName" in sub ? sub.assembledName : undefined;
        let subName = assembledName || sub.name || sub.type;

        // Convert thioether to sulfanyl when used as substituent
        if (subName === "thioether") {
          // Extract locant prefix if present (e.g., "10-" from "10-thioether")
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          // For thioethers, use proper naming function to detect phenyl groups
          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            // Check if atoms is Atom[] (StructuralSubstituent/FunctionalGroup)
            // vs number[] (NamingSubstituent)
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              // This is an array of Atom objects
              const atoms = sub.atoms as Atom[];
              // Find the sulfur atom
              const sulfurAtom = atoms.find(
                (atom: Atom) => atom.symbol === "S",
              );
              if (sulfurAtom) {
                const sulfurIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === sulfurAtom.id,
                );
                if (sulfurIdx !== -1) {
                  // Collect main chain atoms to exclude from traversal
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  // Convert to indices
                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  // Traverse from sulfur to collect all substituent atoms
                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    sulfurIdx,
                    mainChainAtomIndices,
                  );

                  // Call the proper naming function
                  const baseName = nameAlkylSulfanylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    sulfurIdx,
                  );
                  // Preserve locant prefix if it was present
                  subName = locantPrefix + baseName;
                  named = true;
                }
              }
            } else if (typeof firstAtom === "number") {
              // This is an array of atom indices (NamingSubstituent)
              const atomIndices = sub.atoms as number[];
              // Find the sulfur atom
              const sulfurIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "S",
              );
              if (sulfurIdx !== undefined) {
                // Collect main chain atoms to exclude from traversal
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                // Traverse from sulfur to collect all substituent atoms
                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  sulfurIdx,
                  mainChainAtomIndices,
                );

                const baseName = nameAlkylSulfanylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  sulfurIdx,
                );
                // Preserve locant prefix if it was present
                subName = locantPrefix + baseName;
                named = true;
              }
            }
          }

          // Fallback to simple replacement if we couldn't use the proper naming function
          if (!named) {
            subName = "sulfanyl";
          }
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
    } else {
      // For chain/ring parents, group by name and add locants
      const substituentGroups = new Map<string, number[]>();
      for (const sub of allStructuralSubstituents) {
        // Skip the principal functional group - it will be handled as a suffix
        // But non-principal functional groups should be included as substituents even if they have a suffix property
        const hasSuffix = "suffix" in sub && sub.suffix;
        if (hasSuffix && sub.isPrincipal) continue;

        // For alkoxy groups, use the prefix (e.g., 'methoxy') instead of type ('alkoxy')
        const assembledName =
          "assembledName" in sub ? sub.assembledName : undefined;
        const prefix = "prefix" in sub ? sub.prefix : undefined;
        let subName =
          assembledName ||
          sub.name ||
          (sub.type === "alkoxy" ? prefix : sub.type);

        if (process.env.VERBOSE) {
          console.log(
            `[SUBNAME DEBUG] sub.type=${sub.type}, sub.assembledName=${assembledName}, sub.name=${sub.name}, sub.prefix=${prefix}, final subName=${subName}`,
          );
        }

        // Convert thioether to sulfanyl when used as substituent
        // Handle both "thioether" and "3-thioether" (with locant prefix)
        if (
          subName &&
          (subName === "thioether" || subName.includes("-thioether"))
        ) {
          // Extract locant prefix if present (e.g., "10-" from "10-thioether")
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          // For thioethers, use proper naming function to detect phenyl groups
          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            // Check if atoms is Atom[] (StructuralSubstituent/FunctionalGroup)
            // vs number[] (NamingSubstituent)
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              // This is an array of Atom objects
              const atoms = sub.atoms as Atom[];
              // Find the sulfur atom
              const sulfurAtom = atoms.find(
                (atom: Atom) => atom.symbol === "S",
              );
              if (sulfurAtom) {
                const sulfurIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === sulfurAtom.id,
                );
                if (sulfurIdx !== -1) {
                  // Collect main chain atoms to exclude from traversal
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  // Convert to indices
                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  // Traverse from sulfur to collect all substituent atoms
                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    sulfurIdx,
                    mainChainAtomIndices,
                  );

                  // Call the proper naming function
                  const baseName = nameAlkylSulfanylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    sulfurIdx,
                  );
                  // Preserve locant prefix if it was present
                  subName = locantPrefix + baseName;
                  named = true;

                  if (process.env.VERBOSE) {
                    console.log(
                      `[THIOETHER NAMING] Named thioether as: ${subName} (sulfur at ${sulfurIdx})`,
                    );
                  }
                }
              }
            } else if (typeof firstAtom === "number") {
              // This is an array of atom indices (NamingSubstituent)
              const atomIndices = sub.atoms as number[];
              // Find the sulfur atom
              const sulfurIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "S",
              );
              if (sulfurIdx !== undefined) {
                // Collect main chain atoms to exclude from traversal
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                // Traverse from sulfur to collect all substituent atoms
                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  sulfurIdx,
                  mainChainAtomIndices,
                );

                const baseName = nameAlkylSulfanylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  sulfurIdx,
                );
                // Preserve locant prefix if it was present
                subName = locantPrefix + baseName;
                named = true;

                if (process.env.VERBOSE) {
                  console.log(
                    `[THIOETHER NAMING] Named thioether as: ${subName} (sulfur at ${sulfurIdx})`,
                  );
                }
              }
            }
          }

          // Fallback to simple replacement if we couldn't use the proper naming function
          if (!named) {
            subName = subName.replace("thioether", "sulfanyl");
          }
        }

        // Convert phosphoryl to proper phosphoryl substituent name
        if (
          subName &&
          (subName === "phosphoryl" || subName.includes("-phosphoryl"))
        ) {
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              const atoms = sub.atoms as Atom[];
              const phosphorusAtom = atoms.find(
                (atom: Atom) => atom.symbol === "P",
              );
              if (phosphorusAtom) {
                const phosphorusIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === phosphorusAtom.id,
                );
                if (phosphorusIdx !== -1) {
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    phosphorusIdx,
                    mainChainAtomIndices,
                  );

                  const baseName = namePhosphorylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    phosphorusIdx,
                  );
                  subName = locantPrefix + baseName;
                  named = true;

                  if (process.env.VERBOSE) {
                    console.log(
                      `[PHOSPHORYL NAMING] Named phosphoryl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                    );
                  }
                }
              }
            } else if (typeof firstAtom === "number") {
              const atomIndices = sub.atoms as number[];
              const phosphorusIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "P",
              );
              if (phosphorusIdx !== undefined) {
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  phosphorusIdx,
                  mainChainAtomIndices,
                );

                const baseName = namePhosphorylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  phosphorusIdx,
                );
                subName = locantPrefix + baseName;
                named = true;

                if (process.env.VERBOSE) {
                  console.log(
                    `[PHOSPHORYL NAMING] Named phosphoryl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                  );
                }
              }
            }
          }

          if (!named) {
            subName = "phosphoryl";
          }
        }

        // Convert phosphanyl to proper phosphanyl substituent name
        if (
          subName &&
          (subName === "phosphanyl" || subName.includes("-phosphanyl"))
        ) {
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              const atoms = sub.atoms as Atom[];
              const phosphorusAtom = atoms.find(
                (atom: Atom) => atom.symbol === "P",
              );
              if (phosphorusAtom) {
                const phosphorusIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === phosphorusAtom.id,
                );
                if (phosphorusIdx !== -1) {
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    phosphorusIdx,
                    mainChainAtomIndices,
                  );

                  const baseName = namePhosphanylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    phosphorusIdx,
                  );
                  subName = locantPrefix + baseName;
                  named = true;

                  if (process.env.VERBOSE) {
                    console.log(
                      `[PHOSPHANYL NAMING] Named phosphanyl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                    );
                  }
                }
              }
            } else if (typeof firstAtom === "number") {
              const atomIndices = sub.atoms as number[];
              const phosphorusIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "P",
              );
              if (phosphorusIdx !== undefined) {
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  phosphorusIdx,
                  mainChainAtomIndices,
                );

                const baseName = namePhosphanylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  phosphorusIdx,
                );
                subName = locantPrefix + baseName;
                named = true;

                if (process.env.VERBOSE) {
                  console.log(
                    `[PHOSPHANYL NAMING] Named phosphanyl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                  );
                }
              }
            }
          }

          if (!named) {
            subName = "phosphanyl";
          }
        }

        if (subName) {
          // Check if assembledName already includes locants (e.g., "4-methoxy")
          const alreadyHasLocants =
            assembledName && /^\d+-/.test(assembledName);

          if (alreadyHasLocants) {
            // If assembledName already has locants, use it as-is without grouping
            substituentParts.push(subName);
          } else {
            // Otherwise, collect locants and group by name
            if (!substituentGroups.has(subName)) {
              substituentGroups.set(subName, []);
            }
            // Get locant from substituent - handle both IUPACStructuralSubstituent (position) and StructuralSubstituent (locant/locants)
            let locant: number | undefined;
            if ("locant" in sub && sub.locant !== undefined) {
              locant = sub.locant;
            } else if ("locants" in sub && sub.locants?.[0] !== undefined) {
              locant = sub.locants[0];
            } else if ("position" in sub && sub.position !== undefined) {
              // IUPACStructuralSubstituent uses 'position' field (string) - convert to number
              locant = Number.parseInt(sub.position as string, 10);
            }
            if (process.env.VERBOSE) {
              const subLocant = "locant" in sub ? sub.locant : undefined;
              const subLocants = "locants" in sub ? sub.locants : undefined;
              const subPosition =
                "position" in sub
                  ? (sub as { position: string }).position
                  : undefined;
              if (process.env.VERBOSE) {
              console.log(
                `[LOCANT DEBUG] sub.type=${sub.type}, sub.name=${sub.name}, sub.locant=${subLocant}, sub.locants=${JSON.stringify(subLocants)}, sub.position=${subPosition}, calculated locant=${locant}`,
              );
              }
            }
            if (locant && !Number.isNaN(locant)) {
              substituentGroups.get(subName)!.push(locant);
            }
          }
        }
      }
      // Check if there are multiple substituent types or multiple positions
      const _hasMultipleStructuralSubstituentTypes = substituentGroups.size > 1;
      const totalStructuralSubstituents = Array.from(
        substituentGroups.values(),
      ).reduce((sum, locs) => sum + locs.length, 0);

      for (const [subName, locants] of substituentGroups.entries()) {
        locants.sort((a, b) => a - b);
        // For single substituent at position 1 on symmetric rings, omit locant
        // This applies to benzene, cyclohexane, cyclopentane, and other symmetric rings
        // BUT only if it's the ONLY substituent on the ring
        const parentName =
          parentStructure.assembledName || parentStructure.name || "";
        const isSymmetricRing =
          parentName.includes("benzene") || parentName.includes("cyclo");
        const isSingleStructuralSubstituentOnly =
          locants.length === 1 &&
          locants[0] === 1 &&
          isSymmetricRing &&
          totalStructuralSubstituents === 1;

        // IUPAC terminal halogen rule: Omit position 1 locant for terminal halogens
        // on simple unbranched saturated chains with no heteroatoms
        // Example: CCCl -> "chloroethane" not "1-chloroethane"
        const isChainParent = parentStructure.type === "chain";
        const isTerminalPosition = locants.length === 1 && locants[0] === 1;
        const isSingleSubstituent = totalStructuralSubstituents === 1;
        const isHalogen = ["chloro", "bromo", "fluoro", "iodo"].includes(
          subName,
        );
        const isSaturated =
          isChainParent &&
          (parentStructure.chain?.multipleBonds?.length ?? 0) === 0;
        const hasNoHeteroatoms =
          isChainParent &&
          (parentStructure.chain?.atoms?.every((atom) => atom.symbol === "C") ??
            true);
        const isSimpleTerminalHalogen =
          isChainParent &&
          isTerminalPosition &&
          isSingleSubstituent &&
          isHalogen &&
          isSaturated &&
          hasNoHeteroatoms;

        const needsLocant =
          !isSingleStructuralSubstituentOnly && !isSimpleTerminalHalogen;

        // For amines, replace numeric position "1" with "N" if position 1 is nitrogen
        const isAmine = principalFG?.type === "amine";
        const firstAtomIsNitrogen =
          isAmine && parentStructure.chain?.atoms?.[0]?.symbol === "N";
        const locantList = needsLocant
          ? locants.map((loc) =>
              firstAtomIsNitrogen && loc === 1 ? "N" : String(loc),
            )
          : [];
        const locantStr = needsLocant ? locantList.join(",") + "-" : "";

        // Check if substituent name contains nested parentheses
        // Per IUPAC P-14.4: square brackets are used for complex substituents with nested structure
        // that require clarification for alphabetization (e.g., "[1-(2-methylbutoxy)ethoxy]")
        //
        // Pattern to detect:
        // - Contains parentheses AND additional locants: "1-(2-methylbutoxy)ethoxy"
        // - This indicates nested substituents that need square brackets for clarity
        //
        // Do NOT use square brackets for:
        // - Simple locants: "2,2-dimethylpropyl" (just use parentheses)
        // - Linear chains: "2,2-dimethylpropylsulfonyl" (no nesting, use parentheses)
        const hasNestedParentheses =
          subName.includes("(") && subName.includes(")");

        // Also check for complex yl groups that need wrapping
        const hasComplexYlGroup = /\d+-\w+an-\d+-yl/.test(subName); // Pattern: 2-methylbutan-2-yl

        // Check for ring substituents that need wrapping: oxolan-2-yl, thiolane-3-yl, phenyl derivatives, etc.
        // Pattern matches: heterocycle names ending in -an-N-yl or -ol-N-yl
        const hasRingYlGroup =
          /\w+(olan|olane|etane|irane|azol|thiazol)-\d+-yl/.test(subName);

        // Check for compound substituents that contain another substituent within them
        // Examples: methylsulfanyl, ethylthio, phenylsulfanyl, methylsulfonyl, trimethylsilyloxy
        // These need bis/tris because they're composed of two parts (e.g., methyl + sulfanyl)
        // Pattern: any substituent ending in sulfanyl/sulfonyl/sulfinyl/thio/oxy/amino/phosphanyl
        // that has more than just the suffix (e.g., not just "oxy" alone, but "methyloxy")
        const hasCompoundSubstituent =
          /(sulfanyl|sulfonyl|sulfinyl|phosphanyl)$/.test(subName) ||
          /^(methyl|ethyl|propyl|butyl|pentyl|hexyl|heptyl|octyl|phenyl|benzyl|trimethylsilyl|triethylsilyl|dimethyl|diethyl)(oxy|thio|amino)$/.test(
            subName,
          );

        // Determine if this substituent needs ANY wrapping (brackets or parentheses)
        const hasAcylWithInternalLocants =
          /\d+-\w+oyl$/.test(subName) && subName.split("-").length > 1;
        const needsWrapping =
          hasNestedParentheses ||
          hasComplexYlGroup ||
          hasRingYlGroup ||
          hasCompoundSubstituent ||
          /\d+,\d+/.test(subName) ||
          // Acyl groups with internal locants (e.g., "2-methylpropanoyl")
          hasAcylWithInternalLocants;

        if (subName.includes("oyl")) {
          if (process.env.VERBOSE) {
          console.log(
            `[WRAP DEBUG acyl] subName="${subName}", hasAcylWithInternalLocants=${hasAcylWithInternalLocants}, needsWrapping=${needsWrapping}`,
          );
          }
        }

        // Add multiplicative prefix if there are multiple identical substituents
        // Use bis/tris for complex substituents (those that need wrapping)

        // Check if already wrapped in brackets or parentheses
        const alreadyWrapped =
          (subName.startsWith("(") && subName.endsWith(")")) ||
          (subName.startsWith("[") && subName.endsWith("]"));

        // Use square brackets ONLY for nested substituents with parentheses
        // Use regular parentheses for simple complex substituents
        // Per IUPAC P-14.4: square brackets distinguish nested complex substituents for alphabetization
        if (
          process.env.VERBOSE &&
          (subName.includes("methyl") || subName.includes("propyl"))
        ) {
          if (process.env.VERBOSE) {
          console.log(
            `[WRAP DEBUG] subName="${subName}", hasNestedParentheses=${hasNestedParentheses}, needsWrapping=${needsWrapping}, alreadyWrapped=${alreadyWrapped}`,
          );
          }
        }

        const wrappedSubName = alreadyWrapped
          ? subName
          : hasNestedParentheses
            ? `[${subName}]`
            : needsWrapping
              ? `(${subName})`
              : subName;

        const multiplicativePrefix =
          locants.length > 1
            ? getMultiplicativePrefix(
                locants.length,
                needsWrapping,
                opsinService,
                wrappedSubName.charAt(0),
              )
            : "";

        const fullSubName = `${locantStr}${multiplicativePrefix}${wrappedSubName}`;
        substituentParts.push(fullSubName);
      }
    }

    // Sort alphabetically by substituent name
    // Per IUPAC P-14.3: ignore multiplicative prefixes (di-, tri-, tetra-, etc.) when alphabetizing
    substituentParts.sort((a, b) => {
      // Extract name after locants: "2,2-dichloro" → "dichloro" or "2-[1-(2-methylbutoxy)ethoxy]" → "[1-(2-methylbutoxy)ethoxy]"
      const aName = a.split("-").slice(1).join("-");
      const bName = b.split("-").slice(1).join("-");

      // Strip multiplicative prefixes for comparison: "dichloro" → "chloro", "bis(methyl)" → "(methyl)"
      const stripMultiplicativePrefix = (name: string): string => {
        const prefixes = [
          "bis",
          "tris",
          "tetrakis",
          "pentakis",
          "hexakis",
          "heptakis",
          "octakis",
          "nonakis",
          "decakis",
          "di",
          "tri",
          "tetra",
          "penta",
          "hexa",
          "hepta",
          "octa",
          "nona",
          "deca",
        ];
        for (const prefix of prefixes) {
          if (name.startsWith(prefix)) {
            return name.slice(prefix.length);
          }
        }
        return name;
      };

      // Extract the principal substituent name for complex substituents for alphabetization
      // Per IUPAC P-14.4: For complex substituents, alphabetize by the first letter of the complex name
      // ignoring locants, multiplicative prefixes, and opening delimiters
      // Example: "[1-(2-methylbutoxy)ethoxy]" → alphabetize by first letter inside: "m" (from methylbutoxy)
      // Example: "bis(1,1-dimethylethyl)" → alphabetize by "d" (from dimethylethyl)
      const extractPrincipalName = (name: string): string => {
        let result = name;

        // Remove leading brackets/parentheses and locants recursively
        // "[1-(2-methylbutoxy)ethoxy]" → "1-(2-methylbutoxy)ethoxy" → "(2-methylbutoxy)ethoxy"
        while (true) {
          const before = result;

          // Remove leading brackets/parentheses
          if (result.startsWith("(") || result.startsWith("[")) {
            result = result.slice(1);
          }
          // Remove trailing brackets/parentheses
          if (result.endsWith(")") || result.endsWith("]")) {
            result = result.slice(0, -1);
          }
          // Remove leading locants (number followed by hyphen)
          result = result.replace(/^\d+-/, "");

          // If nothing changed, we're done
          if (result === before) break;
        }

        // Now for complex substituents with nested parentheses/brackets,
        // we need to find the first alphabetic character
        // "(2-methylbutoxy)ethoxy" → look inside the first parenthetical → "methylbutoxy"
        if (result.startsWith("(") || result.startsWith("[")) {
          // Find the matching closing delimiter
          const openDelim = result[0];
          const closeDelim = openDelim === "(" ? ")" : "]";
          let depth = 1;
          let i = 1;
          while (i < result.length && depth > 0) {
            if (result[i] === openDelim) depth++;
            else if (result[i] === closeDelim) depth--;
            i++;
          }
          // Extract content inside the first parenthetical
          const insideFirst = result.substring(1, i - 1);
          // Recursively extract from inside, removing any locants
          result = extractPrincipalName(insideFirst);
        }

        return result;
      };

      let aBase = stripMultiplicativePrefix(aName);
      let bBase = stripMultiplicativePrefix(bName);

      // Extract principal names for alphabetization
      aBase = extractPrincipalName(aBase);
      bBase = extractPrincipalName(bBase);

      return aBase.localeCompare(bBase);
    });

    // IUPAC hyphenation rules:
    // 1. If single substituent with no locant (e.g., "methyl"): join directly to parent → "methylcyclohexane"
    // 2. If single substituent with locant (e.g., "2-methyl"): already has hyphen, join directly → "2-methylcyclohexane"
    // 3. If multiple substituents on chain/ring: join with hyphens between them → "2,2-dichloro-1-methylcyclohexane"
    // 4. If multiple substituents on heteroatom (no locants): join directly → "ethylmethylsilane"

    if (process.env.VERBOSE) {
      console.log(
        "[DEBUG] substituentParts before join:",
        JSON.stringify(substituentParts),
      );
      if (process.env.VERBOSE) {
      console.log("[DEBUG] isHeteroatomParent:", isHeteroatomParent);
      }
    }

    if (substituentParts.length > 0) {
      // Avoid duplicating substituent text if the parent name already includes it.
      // Normalize strings for a more robust contains check (ignore locants, hyphens and multiplicative prefixes)
      const normalize = (s: string) => {
        return s
          .toString()
          .toLowerCase()
          .replace(/\b(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)\b/g, "") // remove multiplicative prefixes
          .replace(/[\d,[\]()-]/g, "") // remove digits, commas, hyphens and brackets
          .replace(/\s+/g, "")
          .trim();
      };

      const parentAssembled = (
        parentStructure.assembledName ||
        parentStructure.name ||
        ""
      ).toString();
      const normalizedParent = normalize(parentAssembled);

      // If principal functional group exists (e.g., alcohol with prefix 'hydroxy'),
      // remove any substituent entries that are the same as the principal prefix
      const principalPrefix =
        principalFG && principalFG.prefix
          ? principalFG.prefix.toString().toLowerCase()
          : null;

      const extractBaseName = (s: string) => {
        // Remove locants, multiplicative prefixes and delimiters, then return first alpha token
        let t = s.toString().toLowerCase();
        t = t.replace(
          /\b(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)\b/g,
          "",
        );
        t = t.replace(/[\d,[\]()-]/g, "");
        t = t.replace(/\s+/g, "");
        // Return only leading letters
        const m = t.match(/^[a-z]+/);
        return m ? m[0] : t;
      };

      // Filter out parts that duplicate the principal functional-group prefix
      let filteredStructuralSubstituentParts = substituentParts.filter((p) => {
        if (!principalPrefix) return true;
        const base = extractBaseName(p);
        if (!base) return true;
        // Treat 'hydroxy' as duplicate when principal prefix is 'hydroxy'
        if (base === principalPrefix) return false;
        return true;
      });

      // If principal suffix is an alcohol (ol), also filter out any 'hydroxy' substituents
      const principalSuffix =
        principalFG && principalFG.suffix
          ? (principalFG.suffix as string).toLowerCase()
          : "";
      if (principalSuffix.includes("ol")) {
        const beforeFilter = [...filteredStructuralSubstituentParts];
        filteredStructuralSubstituentParts =
          filteredStructuralSubstituentParts.filter((p) => {
            // Keep complex substituents that contain hydroxy as part of their internal structure
            // Complex substituents are identified by having parentheses (e.g., "2-(2-hydroxypropan-2-yl)")
            const isComplexStructuralSubstituent =
              p.includes("(") && p.includes(")");
            const containsHydroxy = /hydroxy/i.test(p);

            // Only filter out simple "hydroxy" substituents, not complex ones
            if (isComplexStructuralSubstituent) {
              return true; // Keep all complex substituents
            }
            return !containsHydroxy; // Filter out simple hydroxy substituents
          });
        if (
          process.env.VERBOSE &&
          beforeFilter.length !== filteredStructuralSubstituentParts.length
        ) {
          if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Hydroxy filter removed: ${beforeFilter.filter((p) => !filteredStructuralSubstituentParts.includes(p)).join(", ")}`,
          );
          }
          if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Remaining after hydroxy filter: ${filteredStructuralSubstituentParts.join(", ")}`,
          );
          }
        }
      }

      // Find substituentParts that are not (approximately) present in parent
      const missingParts = filteredStructuralSubstituentParts.filter((part) => {
        const normalizedPart = normalize(part);
        const isMissing =
          normalizedPart.length > 0 &&
          !normalizedParent.includes(normalizedPart);
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Checking part "${part}": normalized="${normalizedPart}", parent="${parentAssembled}", normalizedParent="${normalizedParent}", isMissing=${isMissing}`,
          );
        }
        return isMissing;
      });

      if (missingParts.length === 0) {
        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] Skipping adding substituentParts because parent already contains them (approx match)",
          );
          if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] filteredStructuralSubstituentParts: ${JSON.stringify(filteredStructuralSubstituentParts)}`,
          );
          }
          if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] normalizedParent: "${normalizedParent}"`,
          );
          }
        }
      } else {
        // Normalize individual missing parts to ensure locant hyphens exist (e.g., "6hydroxy" -> "6-hydroxy")
        const fixPart = (p: string) => {
          let s = p.toString();
          // Ensure leading locant has a hyphen: "6hydroxy" -> "6-hydroxy"
          // Match: digit(s) followed by a letter (not another digit or hyphen)
          s = s.replace(/^(\d+)(?=[A-Za-z])/, "$1-");
          return s;
        };

        const fixedParts = missingParts.map(fixPart);

        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] fixedParts:",
            JSON.stringify(fixedParts),
          );
        }

        if (fixedParts.length === 1) {
          name += fixedParts[0];
        } else if (fixedParts.length > 1) {
          if (isHeteroatomParent) {
            name += fixedParts.join("");
          } else {
            const joined = fixedParts.join("-");
            if (process.env.VERBOSE) {
              console.log(
                "[buildSubstitutiveName] joining with hyphen:",
                joined,
              );
            }
            name += joined;
          }
        }

        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] name after adding substituents:",
            name,
          );
        }
      }
    }
  }

  // Add parent structure
  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] parentStructure.assembledName:",
      parentStructure.assembledName,
    );
    if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] parentStructure.substituents:",
      JSON.stringify(parentStructure.substituents),
    );
    }
  }

  const parentName =
    parentStructure.assembledName || parentStructure.name || "unknown";

  // If we have substituents and the parent name starts with a digit (locant), add hyphen
  // Example: "5-methoxy" + "2-hexyl-2-methylbutane" → "5-methoxy-2-hexyl-2-methylbutane"
  if (
    allStructuralSubstituents.length > 0 &&
    name.length > 0 &&
    /^\d/.test(parentName)
  ) {
    name += "-";
  }

  name += parentName;

  // Add principal functional group suffix
  // Aggregate multiple principal groups of the same type into a single multiplicative group
  const allPrincipalGroups = functionalGroups.filter(
    (group) => group.isPrincipal,
  );

  let principalGroup: FunctionalGroup | undefined;
  if (allPrincipalGroups.length > 1) {
    // Multiple principal groups of same type → create multiplicative group
    const firstGroup = allPrincipalGroups[0];
    if (!firstGroup) {
      throw new Error("Expected at least one principal group");
    }
    const locants = allPrincipalGroups
      .map((g) => g.locant)
      .filter((loc): loc is number => loc !== undefined)
      .sort((a, b) => a - b);

    principalGroup = {
      ...firstGroup,
      multiplicity: allPrincipalGroups.length,
      isMultiplicative: true,
      locantString: locants.join(","),
      locants: locants,
    };

    if (process.env.VERBOSE) {
      console.log(
        `[buildSubstitutiveName] Aggregated ${allPrincipalGroups.length} principal groups into multiplicative group:`,
        JSON.stringify(principalGroup),
      );
    }
  } else {
    principalGroup = allPrincipalGroups[0];
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] principalGroup:",
      JSON.stringify(principalGroup),
    );
  }
  if (principalGroup && principalGroup.suffix) {
    // PREFERRED NAMES: Use retained names for simple carboxylic acids (C1-C3)
    // According to IUPAC Blue Book:
    // - formic acid (C1): HCOOH - no substituents (nowhere to put them)
    // - acetic acid (C2): CH3COOH - retained name can be used WITH substituents
    // - propionic acid (C3): CH3CH2COOH - retained name can be used WITH substituents
    const chainLength = parentStructure.chain?.length || 0;
    if (process.env.VERBOSE) {
      console.log(
        `[PREFERRED NAME CHECK] principalGroup.type=${principalGroup.type}`,
      );
      if (process.env.VERBOSE) {
      console.log(
        `[PREFERRED NAME CHECK] principalGroup.suffix=${principalGroup.suffix}`,
      );
      }
      if (process.env.VERBOSE) {
      console.log(
        `[PREFERRED NAME CHECK] parentStructure.type=${parentStructure.type}`,
      );
      }
      if (process.env.VERBOSE) {
      console.log(
        `[PREFERRED NAME CHECK] parentStructure.chain?.multipleBonds?.length=${parentStructure.chain?.multipleBonds?.length}`,
      );
      }
      if (process.env.VERBOSE) {
      console.log(
        `[PREFERRED NAME CHECK] allStructuralSubstituents.length=${allStructuralSubstituents.length}`,
      );
      }
      if (process.env.VERBOSE) {
      console.log(`[PREFERRED NAME CHECK] chainLength=${chainLength}`);
      }
    }
    if (
      principalGroup.type === "carboxylic_acid" &&
      principalGroup.suffix === "oic acid" &&
      parentStructure.type === "chain" &&
      !parentStructure.chain?.multipleBonds?.length && // no double/triple bonds in parent chain
      ((chainLength === 1 && allStructuralSubstituents.length === 0) || // formic acid: no substituents
        (chainLength >= 2 && chainLength <= 3)) // acetic/propionic acid: substituents allowed
    ) {
      const preferredAcidNames: { [key: number]: string } = {
        1: "formic acid",
        2: "acetic acid",
        3: "propionic acid",
      };

      if (preferredAcidNames[chainLength]) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Using retained name for C${chainLength} carboxylic acid: ${preferredAcidNames[chainLength]}`,
          );
        }
        // The retained name replaces both the parent name (e.g., "ethane") and suffix (e.g., "oic acid")
        // At this point, `name` contains: substituents + parentName
        // We need to remove the parentName and replace with the retained name
        // e.g., "2-[thiazol-4-yl]ethane" → "2-[thiazol-4-yl]acetic acid"
        const nameWithoutParent = name.slice(
          0,
          name.length - parentName.length,
        );
        return nameWithoutParent + preferredAcidNames[chainLength];
      }
    }

    // Override suffix for ring carboxylic acids
    // IUPAC rule: rings use "carboxylic acid" suffix, chains use "oic acid"
    // Example: cyclohexane-1,2-dicarboxylic acid (not cyclohexane-1,2-dioic acid)
    if (
      principalGroup.type === "carboxylic_acid" &&
      principalGroup.suffix === "oic acid" &&
      parentStructure.type === "ring" &&
      (principalGroup.multiplicity ?? 1) >= 1
    ) {
      if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] Overriding carboxylic acid suffix for ring structure: "oic acid" → "carboxylic acid"`,
        );
      }
      principalGroup.suffix = "carboxylic acid";
      // Mark as multiplicative to ensure proper handling with multiplicity prefix
      principalGroup.isMultiplicative = true;
    }

    // Handle multiplicative suffix (e.g., dione, trione)
    if (
      principalGroup.isMultiplicative &&
      (principalGroup.multiplicity ?? 0) > 1
    ) {
      // For multiplicative suffixes starting with a consonant, keep the terminal 'e'
      // This follows IUPAC rule P-16.3.1: hexane-2,4-dione (not hexan-2,4-dione)
      // Build suffix: "dione", "trione", etc.
      const baseSuffix = principalGroup.suffix;
      const multiplicityPrefix = getMultiplicativePrefix(
        principalGroup.multiplicity ?? 1,
        false,
        opsinService,
        baseSuffix.charAt(0),
      );
      const multipliedSuffix = `${multiplicityPrefix}${baseSuffix}`;

      // Get locants from locantString (e.g., "2,4")
      const locants = principalGroup.locantString || "";

      if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] multiplicative suffix: ${locants}-${multipliedSuffix}`,
        );
      }

      if (locants) {
        name += `-${locants}-${multipliedSuffix}`;
      } else {
        name += multipliedSuffix;
      }
    } else {
      // Single functional group - replace terminal 'e' if suffix starts with vowel
      // Replace ending with "an" for saturated systems, "en" for unsaturated
      // This applies to both carbocycles (alkane, alkene) and heterocycles (oxolane, thiolane, etc.)
      if (name.endsWith("ane")) {
        name = name.replace(/ane$/, "an");
      } else if (name.endsWith("ene")) {
        name = name.replace(/ene$/, "en");
      } else if (name.endsWith("yne")) {
        name = name.replace(/yne$/, "yn");
      } else if (name.endsWith("olane")) {
        // Heterocycles ending in "olane" (oxolane, thiolane, etc.) → "olan"
        name = name.replace(/olane$/, "olan");
      } else if (name.endsWith("etane")) {
        // 4-membered heterocycles (oxetane, thietane) → "etan"
        name = name.replace(/etane$/, "etan");
      } else if (name.endsWith("irane")) {
        // 3-membered heterocycles (oxirane, azirane, thiirane) → "iran"
        name = name.replace(/irane$/, "iran");
      } else if (name.endsWith("irine")) {
        // 3-membered unsaturated heterocycles (azirine, oxirene) → "irin"
        name = name.replace(/irine$/, "irin");
      } else if (name.endsWith("idine")) {
        // N-heterocycles (pyrrolidine, azetidine, piperidine) → "idin"
        name = name.replace(/idine$/, "idin");
      }

      // Get locant for the principal functional group
      // Try to find it from parentStructure.substituents first
      // by matching the prefix (e.g., "hydroxy" for alcohol)
      let fgLocant: number | undefined;
      if (principalGroup.prefix && parentStructure.substituents) {
        const matchingStructuralSubstituent = parentStructure.substituents.find(
          (sub) => sub.type === principalGroup.prefix,
        );
        if (
          matchingStructuralSubstituent &&
          "locant" in matchingStructuralSubstituent
        ) {
          fgLocant = matchingStructuralSubstituent.locant;
          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] mapped principal FG locant from substituent: ${fgLocant}`,
            );
          }
        }
      }

      // Fallback to locant/locants from the principal group if not found
      if (!fgLocant) {
        // Prefer principalGroup.locant (computed by numbering rules) over locants[0]
        fgLocant = principalGroup.locant ?? principalGroup.locants?.[0];
        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] using fallback fgLocant:",
            fgLocant,
            "(from principalGroup.locant or locants[0])",
          );
        }
      }

      // Add locant if present and not position 1 on a chain
      // For chain structures: amide, carboxylic acid, aldehyde, nitrile at position 1 never need locant
      // (e.g., "butanamide" not "butan-1-amide", "hexanal" not "hexan-1-al", "heptanenitrile" not "heptan-1-nitrile")
      // According to IUPAC nomenclature, locants should always be included for principal functional groups
      // including alcohols at position 1 (e.g., "pentan-1-ol" not "pentanol")
      // Exception: very simple cases like "ethanol" may omit the locant by common usage
      const _parentName =
        parentStructure.assembledName || parentStructure.name || "";

      // For amines, count only carbons in the chain (nitrogen is not counted)
      const isAmine = principalGroup.type === "amine";
      const chainLength =
        isAmine && parentStructure.chain?.atoms
          ? parentStructure.chain.atoms.filter((a) => a.symbol === "C").length
          : parentStructure.chain?.length || parentStructure.size || 0;
      const needsLocant = fgLocant !== undefined && fgLocant !== null;

      // Functional groups that never need locant when at position 1 on a chain (terminal groups)
      const terminalGroups = [
        "amide",
        "carboxylic_acid",
        "aldehyde",
        "nitrile",
      ];
      const isTerminalGroup = terminalGroups.includes(principalGroup.type);

      // Omit locant for:
      // 1. C1 and C2 chains with functional groups at position 1
      //    C1: methanol (not methan-1-ol), methanamine (not methan-1-amine)
      //    C2: ethanol (not ethan-1-ol), ethanamine (not ethan-1-amine), ethene (not eth-1-ene)
      //    C3+: propan-1-ol, propan-1-amine, prop-1-ene (locant required)
      // 2. Terminal groups (amide, carboxylic acid, aldehyde, nitrile) at position 1, regardless of chain length
      //    e.g., "hexanal" not "hexan-1-al", "heptanoic acid" not "heptan-1-oic acid"
      const shouldOmitLocant =
        (chainLength <= 2 &&
          fgLocant === 1 &&
          parentStructure.type === "chain") ||
        (isTerminalGroup && fgLocant === 1 && parentStructure.type === "chain");

      if (process.env.VERBOSE) {
        console.log(
          `[needsLocant calc] principalGroup.type="${principalGroup.type}", fgLocant=${fgLocant}, type=${parentStructure.type}, chainLength=${chainLength}, needsLocant=${needsLocant}, isTerminalGroup=${isTerminalGroup}, shouldOmitLocant=${shouldOmitLocant}`,
        );
      }

      // Check for N-substituents on amine groups (for imine/amine)
      // These will be merged with other substituents for alphabetization
      let nSubstituentsPrefix = "";
      const nSubstituentEntries: Array<{ locant: string; name: string }> = [];

      if (
        (principalGroup.type === "imine" || principalGroup.type === "amine") &&
        principalGroup.suffix === "amine"
      ) {
        nSubstituentsPrefix = detectNSubstituents(
          principalGroup,
          parentStructure,
          molecule,
          opsinService,
        );
        if (process.env.VERBOSE && nSubstituentsPrefix) {
          if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] N-substituents detected: ${nSubstituentsPrefix}`,
          );
          }
        }

        // Parse N-substituent string to extract locants and base name
        // Examples: "N-methyl", "N,N-dimethyl", "N-ethyl-N-methyl"
        if (nSubstituentsPrefix) {
          // Match patterns like "N-methyl", "N,N-dimethyl", etc.
          // Pattern 1: N,N-dimethyl → locants ["N", "N"], name "dimethyl"
          const multipleIdenticalMatch =
            nSubstituentsPrefix.match(/^(N(?:,N)+)-(.+)$/);
          if (
            multipleIdenticalMatch &&
            multipleIdenticalMatch[1] &&
            multipleIdenticalMatch[2]
          ) {
            const locantsPart = multipleIdenticalMatch[1]; // "N,N"
            const namePart = multipleIdenticalMatch[2]; // "dimethyl"
            const locants = locantsPart.split(","); // ["N", "N"]
            nSubstituentEntries.push({
              locant: locants.join(","),
              name: namePart,
            });
          } else {
            // Pattern 2: N-methyl or N-ethyl-N-methyl (different substituents)
            // Split by "-N-" to get individual N-substituents
            const parts = nSubstituentsPrefix.split(/-N-/);
            for (const part of parts) {
              // Remove leading "N-" if present
              const cleanPart = part.startsWith("N-")
                ? part.substring(2)
                : part;
              if (cleanPart) {
                nSubstituentEntries.push({
                  locant: "N",
                  name: cleanPart,
                });
              }
            }
          }

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Parsed N-substituents:`,
              JSON.stringify(nSubstituentEntries),
            );
          }
        }
      }

      // Merge N-substituents with existing substituents and re-sort alphabetically
      if (nSubstituentEntries.length > 0) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Merging N-substituents with existing name: "${name}"`,
          );
        }

        // Extract parent name and suffix from current name
        // The name structure is: [substituents][parent]
        // At this point, the suffix has NOT been added yet (that happens later)
        // Note: The parent name might have lost its trailing 'e' when joined (e.g., "azirine" → "azirin")

        // Find where the parent name starts in the assembled name
        // Try both the full parent name and without trailing 'e'
        const fullParentName =
          parentStructure.assembledName || parentStructure.name || "";
        let parentName = fullParentName;
        let parentIndex = name.indexOf(parentName);

        // If not found, try without trailing 'e' (common when joining)
        if (parentIndex === -1 && parentName.endsWith("e")) {
          const parentWithoutE = parentName.slice(0, -1);
          parentIndex = name.indexOf(parentWithoutE);
          if (parentIndex !== -1) {
            parentName = parentWithoutE;
          }
        }

        if (parentIndex !== -1) {
          // Extract the substituent portion (everything before parent)
          const substituentPortion = name.substring(0, parentIndex);
          const parentPortion = name.substring(parentIndex);

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] substituentPortion: "${substituentPortion}", parentPortion: "${parentPortion}"`,
            );
          }

          // Parse existing substituent parts from the substituent portion
          // Strategy: split on hyphens that come BEFORE a locant (digit or letter at start)
          // BUT preserve parts within parentheses/brackets
          // Example: "3-methyl-3-(propan-2-ylsulfanyl)" → ["3-methyl", "3-(propan-2-ylsulfanyl)"]
          const existingParts: string[] = [];
          if (substituentPortion) {
            // Remove trailing hyphen if present
            let remaining = substituentPortion.replace(/-$/, "");

            // Parse parts by finding split points:
            // A split point is a hyphen that is:
            // 1. NOT inside parentheses/brackets (depth = 0)
            // 2. Followed by a digit or capital letter (indicating start of new locant)
            // 3. NOT followed by another hyphen
            const splitPoints: number[] = [];
            let depth = 0;
            for (let i = 0; i < remaining.length; i++) {
              const char = remaining[i];
              if (char === "(" || char === "[") {
                depth++;
              } else if (char === ")" || char === "]") {
                depth--;
              } else if (
                char === "-" &&
                depth === 0 &&
                i + 1 < remaining.length
              ) {
                const nextChar = remaining[i + 1];
                // Check if next char is a digit (for locants like "3-") or letter (for "N-")
                // But NOT if it's a lowercase letter right after a digit-hyphen (that's part of the name)
                if (nextChar) {
                  const isStartOfNewPart =
                    /\d/.test(nextChar) ||
                    (nextChar === "N" && (i === 0 || remaining[i - 1] === "-"));
                  if (isStartOfNewPart) {
                    splitPoints.push(i);
                  }
                }
              }
            }

            // Extract parts based on split points
            let lastIdx = 0;
            for (const splitIdx of splitPoints) {
              existingParts.push(remaining.substring(lastIdx, splitIdx));
              lastIdx = splitIdx + 1; // Skip the hyphen
            }
            // Add the last part
            if (lastIdx < remaining.length) {
              existingParts.push(remaining.substring(lastIdx));
            }

            // If no split points found, treat entire string as one part
            if (splitPoints.length === 0 && remaining.length > 0) {
              existingParts.push(remaining);
            }
          }

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Existing substituent parts:`,
              JSON.stringify(existingParts),
            );
          }

          // Add N-substituent parts
          for (const entry of nSubstituentEntries) {
            const nPart = `${entry.locant}-${entry.name}`;
            existingParts.push(nPart);
          }

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] All parts before grouping:`,
              JSON.stringify(existingParts),
            );
          }

          // Group substituents with the same base name
          // E.g., "3-methyl" and "N,N-dimethyl" should combine to "N,N,3-trimethyl"
          const substituentGroups = new Map<string, string[]>();
          for (const part of existingParts) {
            // Parse part into locants and name
            // Format: "locants-name" e.g. "3-methyl" or "N,N-dimethyl" or "3-(propan-2-ylsulfanyl)"
            const hyphenIdx = part.indexOf("-");
            if (hyphenIdx === -1) continue;

            const locantsStr = part.substring(0, hyphenIdx);
            let name = part.substring(hyphenIdx + 1);

            // Strip multiplicative prefix from name to get base name
            const stripMultiplicativePrefix = (n: string): string => {
              const prefixes = [
                "nona", // Check longer prefixes first
                "octa",
                "hepta",
                "hexa",
                "penta",
                "tetra",
                "tri",
                "di",
              ];
              for (const prefix of prefixes) {
                if (n.startsWith(prefix)) {
                  return n.slice(prefix.length);
                }
              }
              return n;
            };

            let baseName = stripMultiplicativePrefix(name);

            // Strip outer parentheses from base name if present
            // E.g., "(propan-2-ylsulfanyl)" becomes "propan-2-ylsulfanyl"
            while (baseName.startsWith("(") && baseName.endsWith(")")) {
              baseName = baseName.slice(1, -1);
            }

            // Split locants by comma
            const locants = locantsStr.split(",");

            if (!substituentGroups.has(baseName)) {
              substituentGroups.set(baseName, []);
            }
            substituentGroups.get(baseName)!.push(...locants);
          }

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Substituent groups:`,
              JSON.stringify(Array.from(substituentGroups.entries())),
            );
          }

          // Rebuild parts from groups
          const groupedParts: string[] = [];
          for (const [baseName, locants] of substituentGroups.entries()) {
            // Sort locants: N comes first, then numbers
            locants.sort((a, b) => {
              if (a === "N" && b !== "N") return -1;
              if (a !== "N" && b === "N") return 1;
              if (a === "N" && b === "N") return 0;
              return Number.parseInt(a, 10) - Number.parseInt(b, 10);
            });

            const locantsStr = locants.join(",");
            const count = locants.length;

            // Add multiplicative prefix if count > 1
            const prefix =
              count > 1
                ? getMultiplicativePrefix(
                    count,
                    false,
                    opsinService,
                    baseName.charAt(0),
                  )
                : "";
            const fullName = prefix + baseName;

            groupedParts.push(`${locantsStr}-${fullName}`);
          }

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Grouped parts before sorting:`,
              JSON.stringify(groupedParts),
            );
          }

          // Sort alphabetically (same logic as substituent sorting)
          groupedParts.sort((a, b) => {
            // Extract name after locants: "2,2-dichloro" → "dichloro" or "N,N-dimethyl" → "dimethyl"
            const extractAfterLocants = (part: string): string => {
              // Split by hyphen and take everything after first part (which is the locant)
              const parts = part.split("-");
              return parts.length > 1 ? parts.slice(1).join("-") : part;
            };

            const aName = extractAfterLocants(a);
            const bName = extractAfterLocants(b);

            // Strip multiplicative prefixes for comparison
            const stripMultiplicativePrefix = (name: string): string => {
              const prefixes = [
                "di",
                "tri",
                "tetra",
                "penta",
                "hexa",
                "hepta",
                "octa",
                "nona",
                "deca",
              ];
              for (const prefix of prefixes) {
                if (name.startsWith(prefix)) {
                  return name.slice(prefix.length);
                }
              }
              return name;
            };

            // Strip leading/trailing parentheses and brackets for alphabetization
            const stripDelimiters = (name: string): string => {
              let result = name;
              while (
                (result.startsWith("(") && result.endsWith(")")) ||
                (result.startsWith("[") && result.endsWith("]"))
              ) {
                result = result.slice(1, -1);
              }
              return result;
            };

            let aBase = stripMultiplicativePrefix(aName);
            let bBase = stripMultiplicativePrefix(bName);

            // Strip delimiters for alphabetization
            aBase = stripDelimiters(aBase);
            bBase = stripDelimiters(bBase);

            return aBase.localeCompare(bBase);
          });

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Grouped parts after sorting:`,
              JSON.stringify(groupedParts),
            );
          }

          // Rebuild name with sorted and grouped substituents
          // Check if the last substituent ends with a connector (like -yl) that should attach directly to parent
          if (groupedParts.length > 0) {
            // Extract the last substituent's name (after locants)
            const lastPart = groupedParts[groupedParts.length - 1]!;
            const lastHyphenIdx = lastPart.lastIndexOf("-");
            const lastSubstName =
              lastHyphenIdx >= 0
                ? lastPart.substring(lastHyphenIdx + 1)
                : lastPart;

            // If last substituent ends with a connector suffix, attach directly without hyphen
            const connectorSuffixes = ["yl", "ylidene", "ylidyne", "ylium"];
            const endsWithConnector = connectorSuffixes.some((suffix) =>
              lastSubstName.endsWith(suffix),
            );

            if (endsWithConnector && groupedParts.length === 1) {
              // Single substituent ending with connector: attach directly
              name = lastPart + parentPortion;
            } else if (endsWithConnector && groupedParts.length > 1) {
              // Multiple substituents, last one ending with connector
              const allButLast = groupedParts.slice(0, -1).join("-");
              name = allButLast + "-" + lastPart + parentPortion;
            } else {
              // Normal case: all substituents joined with hyphens
              name = groupedParts.join("-") + "-" + parentPortion;
            }
          } else {
            name = parentPortion;
          }

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Rebuilt name with N-substituents: "${name}"`,
            );
          }
        }
      }

      if (needsLocant && fgLocant && !shouldOmitLocant) {
        name += `-${fgLocant}-${principalGroup.suffix}`;
      } else {
        // For nitrile suffix, we need to add 'e' before it (hexane + nitrile = hexanenitrile)
        // For other suffixes starting with vowels, the 'e' is already dropped (hexan + al = hexanal)
        if (principalGroup.suffix === "nitrile") {
          name += "e" + principalGroup.suffix;
        } else {
          name += principalGroup.suffix;
        }
      }
    }
  }

  return name;
}
