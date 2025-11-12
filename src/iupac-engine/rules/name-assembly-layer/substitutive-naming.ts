import type {
  FunctionalGroup,
  ParentStructure,
  StructuralSubstituent,
} from "../../types";
import type { NamingSubstituent } from "../../naming/iupac-types";
import type { Molecule, Atom } from "types";
import type { OPSINService } from "../../opsin-service";
import { getMultiplicativePrefix } from "./utils";
import { filterFunctionalGroupsByRingAtoms } from "./filtering/ring-atom-filter";
import { filterFunctionalGroupsByName } from "./filtering/functional-group-filter";
import { deduplicateSubstituents } from "./filtering/locant-deduplicator";
import { filterAcylKetones } from "./filtering/acyl-ketone-filter";
import { nameSpecialSubstituent } from "./naming/special-substituent-namer";
import { assembleHeteroatomSubstituents } from "./assembly/heteroatom-substituent-assembler";
import { sortSubstituentsAlphabetically } from "./sorting/alphabetical-sorter";
import {
  filterSubstituents,
  joinSubstituents,
} from "./assembly/substituent-filter";
import { transformPartiallySaturatedHeterocycle } from "./assembly/heterocycle-transformer";
import { detectNSubstituents } from "./detection/n-substituent-detector";
import {
  parseNSubstituentsMultiplicative,
  parseNSubstituentsSingle,
} from "./parsing/n-substituent-parser";
import { mergeNSubstituentsWithName } from "./assembly/n-substituent-merger";

type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
  substituents?: (StructuralSubstituent | NamingSubstituent)[];
  size?: number;
};

type FunctionalGroupExtended = FunctionalGroup & {
  locant?: number;
};

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
  const fgStructuralSubstituents: FunctionalGroupExtended[] = filterAcylKetones(
    functionalGroups,
    parentStructure,
    molecule,
  );

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

  // Filter out functional groups whose atoms are part of the parent ring structure
  const fgStructuralSubstituentFilteredByAtoms =
    filterFunctionalGroupsByRingAtoms(
      fgStructuralSubstituents,
      parentStructure,
    );

  // Filter out functional groups that are already incorporated in parent names
  const fgStructuralSubstituentsFinal: FunctionalGroupExtended[] =
    filterFunctionalGroupsByName(
      fgStructuralSubstituentFilteredByAtoms,
      parentStructure,
      parentStructuralSubstituents,
    );

  // Deduplicate parent substituents against functional group substituents
  const deduplicatedParentSubs = deduplicateSubstituents(
    fgStructuralSubstituentsFinal,
    parentStructuralSubstituents,
  );

  let allStructuralSubstituents = [
    ...fgStructuralSubstituentsFinal,
    ...deduplicatedParentSubs,
  ];

  // ============================================================================
  // EARLY N-SUBSTITUENT DETECTION AND FILTERING
  // ============================================================================
  // For amines/imines, detect N-substituents early to filter out functional
  // groups that are part of N-substituents before they're added to the name.
  // This prevents incorrect substituents like "5-acyl-3-hydroxy" from appearing
  // when they should be handled as N-substituents (e.g., "N-formyl-N-hydroxymethyl").
  // ============================================================================
  const principalAmineGroups = functionalGroups.filter(
    (fg) =>
      fg.isPrincipal &&
      (fg.type === "amine" || fg.type === "imine") &&
      fg.suffix === "amine",
  );

  if (principalAmineGroups.length > 0) {
    // Build a temporary principalGroup for N-substituent detection
    let tempPrincipalGroup: FunctionalGroup | undefined;
    if (principalAmineGroups.length > 1) {
      // Multiple amines → aggregate into multiplicative group
      const firstGroup = principalAmineGroups[0];
      if (!firstGroup) {
        throw new Error(
          "[buildSubstitutiveName] Expected at least one principal amine group",
        );
      }
      const allAtoms: Atom[] = [];
      const locants: number[] = [];
      for (const group of principalAmineGroups) {
        if (group.atoms) {
          allAtoms.push(...group.atoms);
        }
        if (group.locant !== undefined) {
          locants.push(group.locant);
        }
      }
      tempPrincipalGroup = {
        ...firstGroup,
        atoms: allAtoms,
        multiplicity: principalAmineGroups.length,
        isMultiplicative: true,
        locantString: locants.sort((a, b) => a - b).join(","),
        locants: locants,
      };
    } else {
      tempPrincipalGroup = principalAmineGroups[0];
    }

    if (!tempPrincipalGroup) {
      throw new Error(
        "[buildSubstitutiveName] tempPrincipalGroup should not be undefined",
      );
    }

    // Detect N-substituents early to get atom IDs
    const earlyNSubstResult = detectNSubstituents(
      tempPrincipalGroup,
      parentStructure,
      molecule,
      opsinService,
    );
    const earlyNSubstituentAtomIds = earlyNSubstResult.atomIds;

    if (process.env.VERBOSE) {
      console.log(
        `[buildSubstitutiveName] Early N-substituent detection: found ${earlyNSubstituentAtomIds.size} atoms in N-substituents`,
      );
      console.log(
        `[buildSubstitutiveName] Early N-substituent atom IDs: ${Array.from(earlyNSubstituentAtomIds).join(",")}`,
      );
    }

    // Filter allStructuralSubstituents to exclude functional groups whose atoms
    // are part of N-substituents
    if (earlyNSubstituentAtomIds.size > 0) {
      const beforeFilterCount = allStructuralSubstituents.length;
      allStructuralSubstituents = allStructuralSubstituents.filter((sub) => {
        // Check if this substituent has atoms
        if (!("atoms" in sub) || !sub.atoms || sub.atoms.length === 0) {
          return true; // Keep substituents without atom info
        }

        // Check if any atom of this substituent is in N-substituent atoms
        const atoms = sub.atoms as (Atom | number)[];
        const hasNSubstituentAtom = atoms.some((atom) => {
          const atomId = typeof atom === "number" ? atom : atom.id;
          return earlyNSubstituentAtomIds.has(atomId);
        });

        if (hasNSubstituentAtom && process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Filtering out substituent "${sub.type}" at locant ${("locant" in sub && sub.locant) || ("locants" in sub && sub.locants?.[0])} - part of N-substituent`,
          );
        }

        return !hasNSubstituentAtom;
      });

      if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] Filtered allStructuralSubstituents: ${beforeFilterCount} → ${allStructuralSubstituents.length} (removed ${beforeFilterCount - allStructuralSubstituents.length} N-substituent atoms)`,
        );
      }
    }
  }

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
      const heteroatomParts = assembleHeteroatomSubstituents(
        allStructuralSubstituents,
        molecule,
        parentStructure,
        opsinService,
      );
      substituentParts.push(...heteroatomParts);
    } else {
      // For chain/ring parents, group by name and add locants
      const substituentGroups = new Map<string, number[]>();
      for (const sub of allStructuralSubstituents) {
        // Skip the principal functional group - it will be handled as a suffix
        // But non-principal functional groups should be included as substituents even if they have a suffix property
        const hasSuffix = "suffix" in sub && sub.suffix;
        if (hasSuffix && sub.isPrincipal) continue;

        // Skip N-substituents on amines/imines - they will be detected and handled separately
        // by detectNSubstituents() later in the process
        if (
          principalFG &&
          (principalFG.type === "amine" || principalFG.type === "imine")
        ) {
          const subLocant = "locant" in sub ? sub.locant : undefined;

          // For amine chains, check if this is attached to the nitrogen
          // Amine chains have nitrogen as first atom, and substituents at position 0 are N-substituents
          if (
            subLocant === 0 &&
            parentStructure.chain?.atoms &&
            parentStructure.chain.atoms.length > 0
          ) {
            const firstChainAtomId = parentStructure.chain.atoms[0]?.id;
            const firstChainAtom = molecule.atoms.find(
              (a) => a.id === firstChainAtomId,
            );
            if (firstChainAtom?.symbol === "N") {
              if (process.env.VERBOSE) {
                console.log(
                  `[buildSubstitutiveName] Skipping N-substituent ${sub.type} at locant ${subLocant} (attached to N) - will be handled by N-substituent detection`,
                );
              }
              continue;
            }
          }
        }

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

        // Try special naming for thioether, phosphoryl, phosphanyl, amide
        if (subName) {
          const specialName = nameSpecialSubstituent({
            molecule,
            parentStructure,
            sub,
            subName,
          });
          if (specialName) {
            subName = specialName;
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

            // Special handling for multiplicative groups (e.g., dinitro with locants=[1,3])
            // These groups have already been aggregated and have all locants in the array
            const isMultiplicative =
              "isMultiplicative" in sub && sub.isMultiplicative;

            if (
              isMultiplicative &&
              "locants" in sub &&
              sub.locants &&
              sub.locants.length > 1
            ) {
              // Push all locants for multiplicative groups
              substituentGroups.get(subName)!.push(...sub.locants);
            } else {
              // Get single locant from substituent - handle both IUPACStructuralSubstituent (position) and StructuralSubstituent (locant/locants)
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
                    `[LOCANT DEBUG] sub.type=${sub.type}, sub.name=${sub.name}, sub.locant=${subLocant}, sub.locants=${JSON.stringify(subLocants)}, sub.position=${subPosition}, calculated locant=${locant}, isMultiplicative=${isMultiplicative}`,
                  );
                }
              }
              if (locant && !Number.isNaN(locant)) {
                substituentGroups.get(subName)!.push(locant);
              }
            }
          }
        }
      }
      // Check if there are multiple substituent types or multiple positions
      const _hasMultipleStructuralSubstituentTypes = substituentGroups.size > 1;
      const totalStructuralSubstituents = Array.from(
        substituentGroups.values(),
      ).reduce((sum, locs) => sum + locs.length, 0);

      // Count substituents that already have locants in their assembledName (e.g., "4-nitro")
      // These are not in substituentGroups but will be added directly to substituentParts
      const preAssembledSubstituentsCount = allStructuralSubstituents.filter(
        (sub) => {
          const assembledName =
            "assembledName" in sub ? sub.assembledName : undefined;
          return assembledName && /^\d+-/.test(assembledName);
        },
      ).length;

      // Total count including both grouped and pre-assembled substituents
      const totalAllSubstituentsCount =
        totalStructuralSubstituents + preAssembledSubstituentsCount;

      if (process.env.VERBOSE) {
        console.log(
          `[LOCANT OMISSION DEBUG] totalStructuralSubstituents=${totalStructuralSubstituents}, ` +
            `preAssembledCount=${preAssembledSubstituentsCount}, totalAll=${totalAllSubstituentsCount}, ` +
            `substituentGroups.size=${substituentGroups.size}`,
        );
      }

      for (const [subName, locants] of substituentGroups.entries()) {
        locants.sort((a, b) => a - b);
        // For single substituent at position 1 on symmetric rings, omit locant
        // This applies to benzene, cyclohexane, cyclopentane, and other symmetric rings
        // BUT only if it's the ONLY substituent on the ring
        // Note: totalStructuralSubstituents includes ALL substituents (both structural like "methyl"
        // and functional groups like "nitro"), so we can use it to check if this is the only one
        const parentName =
          parentStructure.assembledName || parentStructure.name || "";
        const isSymmetricRing =
          parentName.includes("benzene") || parentName.includes("cyclo");
        const isSingleStructuralSubstituentOnly =
          locants.length === 1 &&
          locants[0] === 1 &&
          isSymmetricRing &&
          totalAllSubstituentsCount === 1;

        // IUPAC terminal halogen rule: Omit position 1 locant for terminal halogens
        // on simple unbranched saturated chains with no heteroatoms
        // Example: CCCl -> "chloroethane" not "1-chloroethane"
        const isChainParent = parentStructure.type === "chain";
        const isTerminalPosition = locants.length === 1 && locants[0] === 1;
        const isSingleSubstituent = totalAllSubstituentsCount === 1;
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

        // For C1 chains (methane), always omit position 1 locant
        const isC1Chain =
          isChainParent && (parentStructure.chain?.length ?? 0) === 1;
        const shouldOmitC1Locant = isC1Chain && isTerminalPosition;

        const needsLocant =
          !isSingleStructuralSubstituentOnly &&
          !isSimpleTerminalHalogen &&
          !shouldOmitC1Locant;

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

        // Check for ring substituents that need wrapping: oxolan-2-yl, thiolane-3-yl, furan-3-yl, phenyl derivatives, etc.
        // Pattern matches: heterocycle names ending in -an-N-yl or -ol-N-yl
        // Also matches standalone heterocycle names: furan, pyran, pyrrole, thiophene
        const hasRingYlGroup =
          /\w+(olan|olane|etane|irane|azol|thiazol)-\d+-yl/.test(subName) ||
          /(furan|pyran|pyrrole|thiophene)-\d+-yl/.test(subName);

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
        // For C1 chains with single substituent and no locant, don't wrap
        // Example: CS(=O)C -> "methylsulfinylmethane" not "(methylsulfinyl)methane"
        const isC1ChainSingleSub =
          isC1Chain && isSingleSubstituent && isTerminalPosition;

        const needsWrapping =
          !isC1ChainSingleSub &&
          (hasNestedParentheses ||
            hasComplexYlGroup ||
            hasRingYlGroup ||
            hasCompoundSubstituent ||
            /\d+,\d+/.test(subName) ||
            // Acyl groups with internal locants (e.g., "2-methylpropanoyl")
            hasAcylWithInternalLocants);

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
        // Also check for [phosphoryl]sulfanyl pattern where brackets wrap part of the name
        const alreadyWrapped =
          (subName.startsWith("(") && subName.endsWith(")")) ||
          (subName.startsWith("[") && subName.endsWith("]")) ||
          (subName.startsWith("[") && subName.includes("]sulfanyl"));

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

        // Check if substituent name already has a multiplicative prefix (e.g., "dinitro")
        // This happens when groups are pre-aggregated in the name assembly layer
        const alreadyHasMultiplicativePrefix =
          /^(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)/.test(subName);

        const multiplicativePrefix =
          locants.length > 1 && !alreadyHasMultiplicativePrefix
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

    // Sort alphabetically by substituent name (per IUPAC P-14.3/P-14.4)
    sortSubstituentsAlphabetically(substituentParts);

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
      console.log("[DEBUG] isHeteroatomParent:", isHeteroatomParent);
    }

    if (substituentParts.length > 0) {
      // Filter out duplicates and join with proper hyphenation (per IUPAC P-15.1)
      const parentAssembled = (
        parentStructure.assembledName ||
        parentStructure.name ||
        ""
      ).toString();

      const missingParts = filterSubstituents(
        substituentParts,
        parentAssembled,
        principalFG ?? null,
      );

      const joined = joinSubstituents(missingParts, isHeteroatomParent);
      name += joined;

      if (process.env.VERBOSE) {
        console.log(
          "[buildSubstitutiveName] name after adding substituents:",
          name,
        );
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

  // Transform partially saturated heterocycles (per IUPAC P-25.2)
  name = transformPartiallySaturatedHeterocycle(name, parentStructure);

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

    // Aggregate all atoms from all principal groups
    const allAtoms: Atom[] = [];
    for (const group of allPrincipalGroups) {
      if (group.atoms) {
        allAtoms.push(...group.atoms);
      }
    }

    principalGroup = {
      ...firstGroup,
      atoms: allAtoms,
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

  // Check if the principal group is already incorporated into a substituent
  // For symmetric molecules like CS(=O)C, the sulfinyl functional group is part of
  // the "methylsulfinyl" substituent, so we shouldn't add the suffix again
  let principalGroupIsInSubstituent = false;
  if (principalGroup && principalGroup.prefix && parentStructure.substituents) {
    const fgPrefix = principalGroup.prefix; // e.g., "sulfinyl" for sulfinyl group
    for (const sub of parentStructure.substituents) {
      // Check if substituent name contains the functional group prefix
      // e.g., "methylsulfinyl" contains "sulfinyl"
      if (sub.type && sub.type.includes(fgPrefix)) {
        principalGroupIsInSubstituent = true;
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Principal group "${fgPrefix}" is already in substituent "${sub.type}" - will not add suffix`,
          );
        }
        break;
      }
    }
  }

  if (
    principalGroup &&
    principalGroup.suffix &&
    !principalGroupIsInSubstituent
  ) {
    // PREFERRED NAMES: Use systematic names for simple carboxylic acids (C1-C3)
    // According to IUPAC Blue Book:
    // - methanoic acid (C1): HCOOH - no substituents (nowhere to put them)
    // - ethanoic acid (C2): CH3COOH - systematic name can be used WITH substituents
    // - propanoic acid (C3): CH3CH2COOH - systematic name can be used WITH substituents
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
      ((chainLength === 1 && allStructuralSubstituents.length === 0) || // methanoic acid: no substituents
        (chainLength >= 2 && chainLength <= 3)) // ethanoic/propanoic acid: substituents allowed
    ) {
      const preferredAcidNames: { [key: number]: string } = {
        1: "methanoic acid",
        2: "ethanoic acid",
        3: "propanoic acid",
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
        // e.g., "2-[thiazol-4-yl]ethane" → "2-[thiazol-4-yl]ethanoic acid"
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

    // Check for N-substituents on amine groups (for imine/amine)
    // Declare these variables before the if-else block so they're available in both branches
    let nSubstituentsPrefix = "";
    let nSubstituentAtomIds = new Set<number>();
    let nSubstituentEntries: Array<{ locant: string; name: string }> = [];

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

      // For multiplicative amines (e.g., "diamine"), detect N-substituents
      if (
        (principalGroup.type === "imine" || principalGroup.type === "amine") &&
        principalGroup.suffix === "amine"
      ) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Calling detectNSubstituents for multiplicative amine`,
          );
        }
        const nSubstResult = detectNSubstituents(
          principalGroup,
          parentStructure,
          molecule,
          opsinService,
        );
        nSubstituentsPrefix = nSubstResult.prefix;
        nSubstituentAtomIds = nSubstResult.atomIds;
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] N-substituents detected: "${nSubstituentsPrefix}"`,
          );
          console.log(
            `[buildSubstitutiveName] N-substituent atom IDs: ${Array.from(nSubstituentAtomIds).join(",")}`,
          );
        }

        // Parse N-substituent string to extract locants and base name
        // Input format: "N,N'-diformyl-N,N'-dihydroxymethyl" or "N-methyl-N'-ethyl"
        if (nSubstituentsPrefix) {
          nSubstituentEntries =
            parseNSubstituentsMultiplicative(nSubstituentsPrefix);

          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] Parsed N-substituents for multiplicative amine:`,
              JSON.stringify(nSubstituentEntries),
            );
          }
        }
      }

      // Prepend N-substituents to the name for multiplicative amines
      if (nSubstituentEntries.length > 0) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Prepending N-substituents to multiplicative amine name: "${name}"`,
          );
        }

        // Build the N-substituent prefix
        // Join N-substituents with hyphens
        const nSubstParts = nSubstituentEntries.map(
          (entry) => `${entry.locant}-${entry.name}`,
        );
        const nSubstPrefix = nSubstParts.join("-");

        // For multiplicative amines, N-substituents attach directly to parent name without hyphen
        // Example: N,N'-diformyl-N,N'-bis(hydroxymethyl)ethane-1,2-diamine (not ...)-ethane-...)
        name = `${nSubstPrefix}${name}`;

        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Name after prepending N-substituents: "${name}"`,
          );
        }
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

      // Check if this is an unsubstituted monocyclic ketone with a single carbonyl at position 1
      // IUPAC 2013 Blue Book allows omitting the "-1-" locant for unsubstituted cyclic ketones:
      //   - "cyclopentanone" (not "cyclopentan-1-one")
      //   - "cyclohexanone" (not "cyclohexan-1-one")
      // IMPORTANT: Only the "-1-" locant is optional; "-2-", "-3-", etc. must always be included.
      // If there are substituents, the "-1-" locant must be kept for clarity:
      //   - "4-methoxycycloheptan-1-one" (not "4-methoxycycloheptanone")
      // This prevents ambiguity about which carbon bears the ketone vs. the substituent.
      const isSingleCyclicKetone =
        principalGroup.type === "ketone" &&
        principalGroup.suffix === "one" &&
        parentStructure.type === "ring" &&
        fgLocant === 1 &&
        (principalGroup.multiplicity ?? 1) === 1 &&
        allStructuralSubstituents.length === 0;

      // Omit locant for:
      // 1. C1 and C2 chains with functional groups at position 1
      //    C1: methanol (not methan-1-ol), methanamine (not methan-1-amine)
      //    C2: ethanol (not ethan-1-ol), ethanamine (not ethan-1-amine), ethene (not eth-1-ene)
      //    C3+: propan-1-ol, propan-1-amine, prop-1-ene (locant required)
      // 2. Terminal groups (amide, carboxylic acid, aldehyde, nitrile) at position 1, regardless of chain length
      //    e.g., "hexanal" not "hexan-1-al", "heptanoic acid" not "heptan-1-oic acid"
      // 3. Unsubstituted monocyclic ketones with single carbonyl at position 1 (IUPAC 2013 Blue Book)
      //    e.g., "cyclopentanone" not "cyclopentan-1-one", "cyclohexanone" not "cyclohexan-1-one"
      //    NOTE: Only "-1-" is optional; other locants like "-2-", "-3-" must always be included.
      //    If substituents are present, "-1-" must be kept: "4-methoxycycloheptan-1-one"
      const shouldOmitLocant =
        (chainLength <= 2 &&
          fgLocant === 1 &&
          parentStructure.type === "chain") ||
        (isTerminalGroup &&
          fgLocant === 1 &&
          parentStructure.type === "chain") ||
        isSingleCyclicKetone;

      if (process.env.VERBOSE) {
        console.log(
          `[needsLocant calc] principalGroup.type="${principalGroup.type}", fgLocant=${fgLocant}, type=${parentStructure.type}, chainLength=${chainLength}, needsLocant=${needsLocant}, isTerminalGroup=${isTerminalGroup}, shouldOmitLocant=${shouldOmitLocant}`,
        );
      }

      if (
        (principalGroup.type === "imine" || principalGroup.type === "amine") &&
        principalGroup.suffix === "amine"
      ) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Calling detectNSubstituents for principalGroup.type="${principalGroup.type}", suffix="${principalGroup.suffix}"`,
          );
        }
        const nSubstResult = detectNSubstituents(
          principalGroup,
          parentStructure,
          molecule,
          opsinService,
        );
        nSubstituentsPrefix = nSubstResult.prefix;
        nSubstituentAtomIds = nSubstResult.atomIds;
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] N-substituents detected: "${nSubstituentsPrefix}"`,
          );
          console.log(
            `[buildSubstitutiveName] N-substituent atom IDs: ${Array.from(nSubstituentAtomIds).join(",")}`,
          );
        }

        // Parse N-substituent string to extract locants and base name
        // Examples: "N-methyl", "N,N-dimethyl", "N-ethyl-N-methyl"
        if (nSubstituentsPrefix) {
          nSubstituentEntries = parseNSubstituentsSingle(nSubstituentsPrefix);

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
        name = mergeNSubstituentsWithName(
          name,
          nSubstituentEntries,
          parentStructure,
          opsinService,
        );
      }

      if (needsLocant && fgLocant && !shouldOmitLocant) {
        // When adding a suffix with locant, check for vowel elision
        // IUPAC rule: Drop final "e" from parent name before adding suffix starting with vowel
        // Example: "thiazole" + "-2-amine" → "thiazol-2-amine" (not "thiazole-2-amine")
        let parentForSuffix = name;
        if (
          name.endsWith("e") &&
          principalGroup.suffix &&
          /^[aeiou]/i.test(principalGroup.suffix)
        ) {
          parentForSuffix = name.slice(0, -1);
        }
        name = `${parentForSuffix}-${fgLocant}-${principalGroup.suffix}`;
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
