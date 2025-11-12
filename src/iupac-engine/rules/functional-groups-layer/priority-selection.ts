import type { FunctionalGroup } from "../../types";
import type { Molecule, Atom, Bond } from "../../../../types";
import type { OPSINFunctionalGroupDetector } from "../../opsin-functional-group-detector";
import { normalizePriority } from "./utils";

// Type for OPSIN detector return values (atoms are indices)
type DetectedFunctionalGroup = {
  type: string;
  name?: string;
  suffix?: string;
  prefix?: string;
  priority: number;
  atoms: number[];
  bonds?: Bond[];
  pattern?: string;
};

/**
 * Detect all functional groups in the molecule
 */
export function detectAllFunctionalGroups(
  mol: Molecule,
  detector: OPSINFunctionalGroupDetector,
): FunctionalGroup[] {
  const detected = detector.detectFunctionalGroups(mol);

  const normalized: FunctionalGroup[] = detected.map(
    (d: DetectedFunctionalGroup) => {
      const rawName = (d.name || d.type || d.pattern || "")
        .toString()
        .toLowerCase();
      const type = rawName.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const atomIds = d.atoms || [];
      const bonds = d.bonds || [];
      const rawPriority2 =
        typeof d.priority === "number"
          ? d.priority
          : detector.getFunctionalGroupPriority(d.pattern || d.type) || 0;
      const priority = normalizePriority(rawPriority2);

      // Convert atom IDs to Atom objects
      const atoms = atomIds
        .map((id) => mol.atoms.find((a) => a.id === id))
        .filter((a): a is Atom => a !== undefined);

      return {
        type,
        atoms,
        bonds,
        suffix:
          d.suffix ||
          detector.getFunctionalGroupSuffix(d.pattern || d.type) ||
          undefined,
        prefix: d.prefix || undefined,
        priority,
        isPrincipal: false,
        locants: atoms.map((a) => a.id),
      } as FunctionalGroup;
    },
  );

  // Sort descending: higher numeric value means higher priority
  normalized.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return normalized;
}

/**
 * Select the principal functional group
 */
export function selectPrincipalGroup(
  functionalGroups: FunctionalGroup[],
  molecule: Molecule | undefined,
  detector: OPSINFunctionalGroupDetector,
): FunctionalGroup | undefined {
  if (process.env.VERBOSE) {
    console.log(
      "[selectPrincipalGroup] Called with",
      functionalGroups.length,
      "groups:",
      functionalGroups.map((g) => ({
        type: g.type,
        priority: g.priority,
        locants: g.locants,
      })),
    );
  }

  if (functionalGroups.length === 0) {
    return undefined;
  }

  // Filter out groups that can NEVER be principal (ethers, thioethers, halides, nitro, etc.)
  // These should always be named as substituents
  const NON_PRINCIPAL_TYPES = [
    "ether", // ROR - always named as alkoxy
    "thioether", // RSR - always named as alkylsulfanyl
    "RSR", // Same as thioether (pattern name)
    "ROR", // Same as ether (pattern name)
    "halide", // F, Cl, Br, I
    "nitro", // NO2
    "nitroso", // NO
    "alkoxy", // -OR substituent form
    "phosphanyl", // P - treat phosphanyl substituents as non-principal here
    "P", // pattern name for phosphanyl
  ];

  const principalEligibleGroups = functionalGroups.filter(
    (fg) => !NON_PRINCIPAL_TYPES.includes(fg.type),
  );

  // If all groups are non-principal types, return undefined (no principal group)
  if (principalEligibleGroups.length === 0) {
    if (process.env.VERBOSE) {
      console.log(
        "[selectPrincipalGroup] All functional groups are non-principal types (thioethers, ethers, halides, etc.) - no principal group selected",
      );
    }
    return undefined;
  }

  // Continue with only principal-eligible groups
  const groupsToConsider = principalEligibleGroups;

  // Special-case: when both sulfinyl and sulfonyl are present, check if they form a sulfur bridge
  // If they're directly bonded (S-S bond), they should be treated as a substituent, not principal groups
  const hasSulfinyl = groupsToConsider.some((g) => g.type === "sulfinyl");
  const hasSulfonyl = groupsToConsider.some((g) => g.type === "sulfonyl");
  if (hasSulfinyl && hasSulfonyl && molecule) {
    const sulfinylGroup = groupsToConsider.find((g) => g.type === "sulfinyl");
    const sulfonylGroup = groupsToConsider.find((g) => g.type === "sulfonyl");

    if (
      sulfinylGroup &&
      sulfonylGroup &&
      sulfinylGroup.locants &&
      sulfonylGroup.locants
    ) {
      const sulfinylAtom = sulfinylGroup.locants[0];
      const sulfonylAtom = sulfonylGroup.locants[0];

      // Check if these sulfur atoms are directly bonded (S-S bond)
      const areBonded = molecule.bonds?.some(
        (bond) =>
          (bond.atom1 === sulfinylAtom && bond.atom2 === sulfonylAtom) ||
          (bond.atom1 === sulfonylAtom && bond.atom2 === sulfinylAtom),
      );

      if (areBonded) {
        if (process.env.VERBOSE) {
          console.log(
            "[selectPrincipalGroup] Detected S-S bond between sulfinyl and sulfonyl - treating as sulfur bridge substituent, excluding from principal group selection",
          );
        }
        // Filter out sulfinyl and sulfonyl from consideration as principal groups
        const filteredGroups = groupsToConsider.filter(
          (g) => g.type !== "sulfinyl" && g.type !== "sulfonyl",
        );
        if (filteredGroups.length === 0) {
          return undefined; // No principal group - all groups are part of substituents
        }
        // Continue with the filtered groups
        return selectPrincipalGroup(filteredGroups, molecule, detector);
      }

      // Not bonded - sulfinyl is preferred as principal (original logic)
      return sulfinylGroup;
    }
  }

  // Sort by the assigned priority on the FunctionalGroup object first.
  // After normalization, priorities use the engine scale (HIGHER numeric value = HIGHER priority).
  // Fall back to OPSIN detector lookup or 0 when missing.
  const sortedGroups = groupsToConsider.sort((a, b) => {
    const priorityA =
      typeof a.priority === "number"
        ? a.priority
        : detector.getFunctionalGroupPriority(a.type) || 0;
    const priorityB =
      typeof b.priority === "number"
        ? b.priority
        : detector.getFunctionalGroupPriority(b.type) || 0;
    return priorityB - priorityA; // Higher priority number = higher priority (engine convention after normalization)
  });

  // Special-case: Diamine detection - when 2+ amine atoms are present, amine should be principal
  // This check happens AFTER sorting but BEFORE returning the highest priority group
  // This applies when competing with alcohols OR when the amines form a diamine backbone
  const amineGroups = groupsToConsider.filter((g) => g.type === "amine");
  if (amineGroups.length > 0) {
    // Count total amine nitrogen atoms across all amine groups
    const totalAmineNitrogens = amineGroups.reduce((sum, g) => {
      return sum + (g.locants?.length || 0);
    }, 0);

    if (totalAmineNitrogens >= 2) {
      // Diamine detected - check if it should override other functional groups
      const alcoholGroups = groupsToConsider.filter(
        (g) => g.type === "alcohol",
      );
      const amideGroups = groupsToConsider.filter((g) => g.type === "amide");

      // Diamine takes precedence over alcohols or when amides are present
      // (amides attached to diamine nitrogens should be N-substituents, not principal)
      if (alcoholGroups.length > 0 || amideGroups.length > 0) {
        if (process.env.VERBOSE) {
          const topGroup = sortedGroups[0];
          console.log(
            `[selectPrincipalGroup] Diamine detected (${totalAmineNitrogens} nitrogen atoms) - amine takes precedence${topGroup ? ` over ${topGroup.type}` : ""}`,
          );
        }
        // Return the first amine group (they have the same priority)
        return amineGroups[0];
      }
    }
  }

  // Special-case: For ring systems, ketones should take precedence over ethers
  // Ethers attached to rings should be named as alkoxy substituents (e.g., "methoxy")
  // while ketones should be the principal functional group (e.g., "cycloheptan-1-one")
  const hasKetone = groupsToConsider.some((g) => g.type === "ketone");
  const hasEther = groupsToConsider.some((g) => g.type === "ether");

  if (hasKetone && hasEther && molecule) {
    // Check if any ketone is in a ring (most ketones in rings should be principal)
    const ketoneInRing = groupsToConsider.find(
      (g) =>
        g.type === "ketone" &&
        g.atoms &&
        g.atoms.some((atom) => {
          const a = typeof atom === "number" ? molecule.atoms[atom] : atom;
          return a?.isInRing;
        }),
    );

    if (ketoneInRing) {
      if (process.env.VERBOSE) {
        console.log(
          "[selectPrincipalGroup] Ring system detected: ketone takes precedence over ether",
        );
      }
      return ketoneInRing;
    }
  }

  return sortedGroups[0];
}

/**
 * Calculate functional group priority score
 */
export function calculateFunctionalGroupPriority(
  functionalGroups: FunctionalGroup[],
  molecule: Molecule | undefined,
  detector: OPSINFunctionalGroupDetector,
): number {
  if (functionalGroups.length === 0) {
    return 0;
  }

  const principal = selectPrincipalGroup(functionalGroups, molecule, detector);
  if (!principal) return 0;
  // Prefer the priority value stored on the principal FunctionalGroup object
  return typeof principal.priority === "number"
    ? principal.priority
    : detector.getFunctionalGroupPriority(principal.type) || 0;
}

/**
 * Determine if functional class nomenclature is preferred
 * NOTE: This is now handled separately for esters in ESTER_DETECTION_RULE
 */
export function isFunctionalClassPreferred(
  principalGroup: FunctionalGroup | undefined,
  molecule?: Molecule,
): boolean {
  if (!principalGroup) {
    return false;
  }

  // Functional class is preferred for certain groups
  // Esters are NOT included here because complexity checking is done in ESTER_DETECTION_RULE
  const functionalClassPreferred = [
    "anhydride",
    "acyl_halide",
    "nitrile",
    "thioester",
    "thiocyanate",
    "amide",
    "borane",
  ];

  // Special case: amides in heterocyclic rings OR attached to heterocyclic rings
  // should NOT use functional class nomenclature.
  // Examples:
  // - "imidazolidin-4-one" not "imidazolidine amide" (carbonyl IN ring)
  // - "quinoline-4-carboxamide" not "N-phenylquinolineamide" (carboxamide ATTACHED TO ring)
  if (principalGroup.type === "amide" && molecule) {
    // Check if the carbonyl carbon (first atom in amide group) is in a ring
    const carbonylCarbon = principalGroup.atoms?.[0];
    if (carbonylCarbon && carbonylCarbon.isInRing) {
      if (process.env.VERBOSE) {
        console.log(
          "[isFunctionalClassPreferred] Amide carbonyl is IN ring - using substitutive nomenclature",
        );
      }
      return false;
    }

    // Check if the carbonyl carbon is attached to a heterocyclic ring
    // This handles cases like quinoline-4-carboxamide where the C=O is attached to
    // a ring carbon but not part of the ring itself
    if (carbonylCarbon && molecule.bonds) {
      for (const bond of molecule.bonds) {
        let neighborAtomId: number | undefined;
        if (bond.atom1 === carbonylCarbon.id) {
          neighborAtomId = bond.atom2;
        } else if (bond.atom2 === carbonylCarbon.id) {
          neighborAtomId = bond.atom1;
        }

        if (neighborAtomId !== undefined) {
          const neighborAtom = molecule.atoms[neighborAtomId];
          // Check if neighbor is in a ring and is a heteroatom or part of a heterocyclic ring
          if (neighborAtom?.isInRing) {
            // Find if this ring atom is part of a heterocyclic ring
            const rings = molecule.rings || [];
            for (const ring of rings) {
              if (ring.includes(neighborAtomId)) {
                // Check if this ring contains any heteroatoms
                const hasHeteroatom = ring.some((atomId) => {
                  const atom = molecule.atoms[atomId];
                  return atom && atom.symbol !== "C" && atom.symbol !== "H";
                });
                if (hasHeteroatom) {
                  if (process.env.VERBOSE) {
                    console.log(
                      "[isFunctionalClassPreferred] Amide carbonyl is ATTACHED TO heterocyclic ring - using substitutive nomenclature",
                    );
                  }
                  return false;
                }
              }
            }
          }
        }
      }
    }
  }

  return functionalClassPreferred.includes(principalGroup.type);
}
