import type { ParentStructure, FunctionalGroup } from "../../types";
import type { Atom, Bond, Molecule } from "types";
import type { RingSystem } from "../../types";

/**
 * Helper functions for numbering logic
 */

export function normalizeFunctionalGroupLocants(
  functionalGroups: FunctionalGroup[],
  parentStructure: ParentStructure,
): FunctionalGroup[] {
  if (!parentStructure) return functionalGroups;

  // Only handle chain parent structures for now
  if (parentStructure.type !== "chain" || !parentStructure.chain)
    return functionalGroups;

  const atomIndexToLocant = new Map<number, number>();
  const chainAtoms = parentStructure.chain.atoms || [];
  const chainLocants =
    parentStructure.locants || chainAtoms.map((_, i) => i + 1);

  for (let i = 0; i < chainAtoms.length; i++) {
    const atom = chainAtoms[i];
    if (atom && typeof atom.id === "number") {
      atomIndexToLocant.set(atom.id, chainLocants[i] ?? i + 1);
    }
  }

  return functionalGroups.map((group) => {
    // Skip conversion if already converted by P-14.3
    if (group.locantsConverted) {
      return group;
    }

    const originalLocants = group.locants || [];
    const mappedLocants = originalLocants.map((val: number) => {
      // If this value matches an atom id, map to locant, otherwise leave as-is
      return atomIndexToLocant.has(val) ? atomIndexToLocant.get(val)! : val;
    });

    // Check if any locants were actually converted
    const locantsChanged = originalLocants.some(
      (val, i) => val !== mappedLocants[i],
    );

    if (process.env.VERBOSE) {
      console.log(
        `[normalizeFunctionalGroupLocants] ${group.type}: original locants=${JSON.stringify(group.locants)} → mapped=${JSON.stringify(mappedLocants)}`,
      );
    }

    // Only mark as converted if locants actually changed
    return locantsChanged
      ? { ...group, locants: mappedLocants, locantsConverted: true }
      : { ...group, locants: mappedLocants };
  });
}

export function optimizeLocantSet(
  parentStructure: ParentStructure,
  principalGroup: FunctionalGroup,
): number[] {
  // Get all possible locant sets
  const possibleLocants = generatePossibleLocantSets(parentStructure);

  if (process.env.VERBOSE) {
    console.log("[optimizeLocantSet] Possible locant sets:", possibleLocants);
  }

  // Find the set that gives lowest locant to principal group
  let bestLocants = parentStructure.locants;
  let bestScore = calculateLocantScore(
    parentStructure,
    bestLocants,
    principalGroup,
  );

  if (process.env.VERBOSE) {
    console.log("[optimizeLocantSet] Initial best score:", bestScore);
  }

  for (const locantSet of possibleLocants) {
    const score = calculateLocantScore(
      parentStructure,
      locantSet,
      principalGroup,
    );
    if (process.env.VERBOSE) {
      console.log(
        "[optimizeLocantSet] Testing locant set:",
        locantSet,
        "score:",
        score,
      );
    }
    if (score < bestScore) {
      bestScore = score;
      bestLocants = locantSet;
      if (process.env.VERBOSE) {
        console.log(
          "[optimizeLocantSet] New best locants:",
          bestLocants,
          "score:",
          bestScore,
        );
      }
    }
  }

  return bestLocants;
}

export function getPrincipalGroupLocant(
  parentStructure: ParentStructure,
  principalGroup: FunctionalGroup,
): number {
  if (parentStructure.type === "chain") {
    // Find the position of the functional group's first atom in the parent chain
    // The functional group's atoms should have already been set with the carbonyl carbon first
    if (principalGroup.atoms.length === 0) {
      return 1; // Fallback if no atoms
    }

    const functionalGroupAtom = principalGroup.atoms[0]!; // Carbonyl carbon for ketones (checked above)
    const chain = parentStructure.chain;

    if (!chain) {
      return 1; // Fallback if no chain
    }

    if (process.env.VERBOSE) {
      console.log(
        "[getPrincipalGroupLocant] functionalGroupAtom:",
        functionalGroupAtom,
      );
      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocant] functionalGroupAtom type:",
          typeof functionalGroupAtom,
        );
      }
      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocant] functionalGroupAtom.id:",
          functionalGroupAtom.id,
        );
      }
      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocant] chain.atoms:",
          chain.atoms.map((a: Atom) => a.id),
        );
      }
    }

    // Check if functionalGroupAtom is an Atom object or just an ID
    const atomId =
      typeof functionalGroupAtom === "number"
        ? functionalGroupAtom
        : functionalGroupAtom.id;

    // Find where this atom appears in the chain
    let positionInChain = chain.atoms.findIndex(
      (atom: Atom) => atom.id === atomId,
    );

    // If the functional group atom is not in the chain (e.g., alcohol O, ether O),
    // find which chain atom it's bonded to
    if (
      positionInChain === -1 &&
      principalGroup.bonds &&
      principalGroup.bonds.length > 0
    ) {
      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocant] Functional group atom not in chain, checking bonds",
        );
      }
      // Look through the bonds to find the chain atom
      for (const bond of principalGroup.bonds) {
        const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
        const foundPosition = chain.atoms.findIndex(
          (atom: Atom) => atom.id === otherAtomId,
        );
        if (foundPosition !== -1) {
          positionInChain = foundPosition;
          if (process.env.VERBOSE) {
            console.log(
              "[getPrincipalGroupLocant] Found chain atom",
              otherAtomId,
              "at position",
              foundPosition,
            );
          }
          break;
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log("[getPrincipalGroupLocant] atomId:", atomId);
      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocant] positionInChain:",
          positionInChain,
        );
      }
    }

    if (positionInChain === -1) {
      return 1; // Fallback if atom not found
    }

    // Return the locant at that position
    return parentStructure.locants[positionInChain] || 1;
  } else {
    // For rings, principal group gets the lowest available locant
    return Math.min(...parentStructure.locants);
  }
}

export function getPrincipalGroupLocantFromSet(
  parentStructure: ParentStructure,
  principalGroup: FunctionalGroup,
  locantSet: number[],
): number {
  // Calculate the principal group locant based on a specific locant set
  if (parentStructure.type === "chain") {
    if (principalGroup.atoms.length === 0) {
      return 1; // Fallback if no atoms
    }

    const functionalGroupAtom = principalGroup.atoms[0]!;
    const chain = parentStructure.chain;

    if (!chain) {
      return 1; // Fallback if no chain
    }

    // Check if functionalGroupAtom is an Atom object or just an ID
    const atomId =
      typeof functionalGroupAtom === "number"
        ? functionalGroupAtom
        : functionalGroupAtom.id;

    if (process.env.VERBOSE) {
      console.log("[getPrincipalGroupLocantFromSet] atomId:", atomId);
      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocantFromSet] chain atoms:",
          chain.atoms.map((a: Atom) => a.id),
        );
      }
      if (process.env.VERBOSE) {
        console.log("[getPrincipalGroupLocantFromSet] locantSet:", locantSet);
      }
    }

    // Find where this atom appears in the chain
    let positionInChain = chain.atoms.findIndex(
      (atom: Atom) => atom.id === atomId,
    );

    if (process.env.VERBOSE) {
      console.log(
        "[getPrincipalGroupLocantFromSet] initial positionInChain:",
        positionInChain,
      );
    }

    // If the functional group atom is not in the chain (e.g., alcohol O, ether O),
    // find which chain atom it's bonded to
    if (
      positionInChain === -1 &&
      principalGroup.bonds &&
      principalGroup.bonds.length > 0
    ) {
      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocantFromSet] Atom not in chain, checking bonds:",
          principalGroup.bonds,
        );
      }
      // Look through the bonds to find the chain atom
      for (const bond of principalGroup.bonds) {
        const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
        const foundPosition = chain.atoms.findIndex(
          (atom: Atom) => atom.id === otherAtomId,
        );
        if (process.env.VERBOSE) {
          console.log(
            "[getPrincipalGroupLocantFromSet] Checking bond to atom",
            otherAtomId,
            "foundPosition:",
            foundPosition,
          );
        }
        if (foundPosition !== -1) {
          positionInChain = foundPosition;
          if (process.env.VERBOSE) {
            console.log(
              "[getPrincipalGroupLocantFromSet] Found chain atom at position",
              foundPosition,
            );
          }
          break;
        }
      }
    }

    if (positionInChain === -1) {
      return 1; // Fallback if atom not found
    }

    // Return the locant at that position from the given locant set
    const result = locantSet[positionInChain] || 1;
    if (process.env.VERBOSE) {
      console.log(
        "[getPrincipalGroupLocantFromSet] final positionInChain:",
        positionInChain,
        "result:",
        result,
      );
    }
    return result;
  } else {
    // For rings, find the position of the functional group atom in the ring
    // This is important for lactones where the carbonyl must be at position 2
    if (principalGroup.atoms.length === 0) {
      return Math.min(...locantSet); // Fallback if no atoms
    }

    const functionalGroupAtom = principalGroup.atoms[0]!;
    const atomId =
      typeof functionalGroupAtom === "number"
        ? functionalGroupAtom
        : functionalGroupAtom.id;

    // For rings with von Baeyer numbering (bicyclo/tricyclo systems),
    // use the numbering map directly instead of ring.atoms positions
    if (parentStructure.vonBaeyerNumbering) {
      const locant = parentStructure.vonBaeyerNumbering.get(atomId);
      if (locant !== undefined) {
        if (process.env.VERBOSE) {
          console.log(
            "[getPrincipalGroupLocantFromSet] von Baeyer - atomId:",
            atomId,
            "locant:",
            locant,
          );
        }
        return locant;
      }
    }

    // parentStructure.ring should have the atoms in numbered order
    const ring = parentStructure.ring;
    if (ring && ring.atoms) {
      let positionInRing = ring.atoms.findIndex(
        (atom: Atom) => atom.id === atomId,
      );

      if (process.env.VERBOSE) {
        console.log(
          "[getPrincipalGroupLocantFromSet] Ring - atomId:",
          atomId,
          "initial positionInRing:",
          positionInRing,
        );
        console.log(
          "[getPrincipalGroupLocantFromSet] Ring - principalGroup.bonds:",
          principalGroup.bonds,
        );
        console.log(
          "[getPrincipalGroupLocantFromSet] Ring - principalGroup.atoms:",
          principalGroup.atoms,
        );
        console.log(
          "[getPrincipalGroupLocantFromSet] Ring - ring.atoms:",
          ring.atoms.map((a: Atom) => a.id),
        );
      }

      // If the functional group atom is not in the ring (e.g., alcohol O stored as C),
      // find which ring atom it's bonded to
      if (
        positionInRing === -1 &&
        principalGroup.bonds &&
        principalGroup.bonds.length > 0
      ) {
        if (process.env.VERBOSE) {
          console.log(
            "[getPrincipalGroupLocantFromSet] Ring - Atom not in ring, checking bonds:",
            principalGroup.bonds,
          );
        }
        // Look through the bonds to find the ring atom
        for (const bond of principalGroup.bonds) {
          const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
          const foundPosition = ring.atoms.findIndex(
            (atom: Atom) => atom.id === otherAtomId,
          );
          if (process.env.VERBOSE) {
            console.log(
              "[getPrincipalGroupLocantFromSet] Ring - Checking bond to atom",
              otherAtomId,
              "foundPosition:",
              foundPosition,
            );
          }
          if (foundPosition !== -1) {
            positionInRing = foundPosition;
            if (process.env.VERBOSE) {
              console.log(
                "[getPrincipalGroupLocantFromSet] Ring - Found ring atom at position",
                foundPosition,
              );
            }
            break;
          }
        }
      }

      if (positionInRing !== -1 && positionInRing < locantSet.length) {
        const locant = locantSet[positionInRing];
        if (locant !== undefined) {
          if (process.env.VERBOSE) {
            console.log(
              "[getPrincipalGroupLocantFromSet] Ring - final positionInRing:",
              positionInRing,
              "result:",
              locant,
            );
          }
          return locant;
        }
      }
    }

    // Fallback: return lowest locant
    return Math.min(...locantSet);
  }
}

export function generatePossibleLocantSets(
  parentStructure: ParentStructure,
): number[][] {
  const baseLocants = parentStructure.locants;
  const variations: number[][] = [];

  // Generate different numbering directions for chains
  if (parentStructure.type === "chain") {
    // Normal direction
    variations.push([...baseLocants]);

    // Reverse direction: reverse the locant array
    // For a chain [0,1,2,4] with locants [1,2,3,4], reverse gives [4,3,2,1]
    const reversed = [...baseLocants].reverse();
    if (JSON.stringify(reversed) !== JSON.stringify(baseLocants)) {
      variations.push(reversed);
    }
  }

  return variations.length > 0 ? variations : [baseLocants];
}

export function calculateLocantScore(
  parentStructure: ParentStructure,
  locants: number[],
  principalGroup: FunctionalGroup,
): number {
  // Lower score = better (more preferred)
  // Find the locant for the principal group based on atom position in the chain

  if (!parentStructure.chain || principalGroup.atoms.length === 0) {
    return 999; // High penalty if no chain or no atoms
  }

  // Get the functional group's first atom (e.g., carbonyl carbon for ketones)
  const functionalGroupAtom = principalGroup.atoms[0]!;
  const atomId =
    typeof functionalGroupAtom === "number"
      ? functionalGroupAtom
      : (functionalGroupAtom as Atom).id;

  // Find where this atom appears in the chain
  let positionInChain = parentStructure.chain.atoms.findIndex(
    (atom: Atom) => atom.id === atomId,
  );

  // If the functional group atom is not in the chain (e.g., alcohol O, ether O),
  // find which chain atom it's bonded to
  if (
    positionInChain === -1 &&
    principalGroup.bonds &&
    principalGroup.bonds.length > 0
  ) {
    // Look through the bonds to find the chain atom
    for (const bond of principalGroup.bonds) {
      const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
      const foundPosition = parentStructure.chain.atoms.findIndex(
        (atom: Atom) => atom.id === otherAtomId,
      );
      if (foundPosition !== -1) {
        positionInChain = foundPosition;
        break;
      }
    }
  }

  if (positionInChain === -1) {
    return 999; // High penalty if atom not found
  }

  // Return the locant at that position (lower is better)
  return locants[positionInChain] || 999;
}

export function hasFixedLocants(parentStructure: ParentStructure): boolean {
  // Check if this parent structure has fixed locant requirements
  const retainedNamesWithFixedLocants = [
    "toluene",
    "ethylbenzene",
    "isopropylbenzene",
    "tert-butylbenzene",
    "styrene",
    "acetophenone",
    "benzophenone",
  ];

  return retainedNamesWithFixedLocants.some((name) =>
    parentStructure.name.toLowerCase().includes(name),
  );
}

export function getFixedLocants(parentStructure: ParentStructure): number[] {
  // Return fixed locants for specific parent structures
  // This is a simplified implementation
  const fixedLocantMap: { [key: string]: number[] } = {
    toluene: [1], // Methyl group at position 1
    ethylbenzene: [1], // Ethyl group at position 1
    styrene: [1], // Vinyl group at position 1
    acetophenone: [1], // Carbonyl at position 1
  };

  const name = parentStructure.name.toLowerCase();
  for (const [key, locants] of Object.entries(fixedLocantMap)) {
    if (name.includes(key)) {
      return locants;
    }
  }

  // Default: use existing locants
  return parentStructure.locants;
}

export function generateRingLocants(ring: RingSystem): number[] {
  // Generate locants for ring atoms
  const locants: number[] = [];
  for (let i = 0; i < ring.atoms.length; i++) {
    locants.push(i + 1); // 1-based indexing
  }
  return locants;
}

export function findOptimalRingNumbering(
  ring: RingSystem,
  molecule: Molecule,
  functionalGroups?: FunctionalGroup[],
): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return 1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return 1;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[Ring Numbering] Functional groups available:`,
      functionalGroups
        ?.map((g) => `${g.type} at atoms [${g.atoms?.join(",")}]`)
        .join(", ") || "none",
    );
  }

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: Atom) => a.id));

  // Identify which ring positions have principal functional groups
  const principalGroupPositions = new Set<number>();
  if (functionalGroups && functionalGroups.length > 0) {
    // Find principal functional groups (alcohol, ketone, aldehyde, etc.)
    const principalGroups = functionalGroups.filter(
      (g: FunctionalGroup) =>
        g.isPrincipal ||
        g.priority <= 5 ||
        g.type === "alcohol" ||
        g.type === "ketone" ||
        g.type === "aldehyde",
    );

    if (process.env.VERBOSE) {
      console.log(
        `[Ring Numbering] Principal groups found:`,
        principalGroups.map(
          (g) =>
            `${g.type}(isPrincipal:${g.isPrincipal}, priority:${g.priority})`,
        ),
      );
    }

    for (const group of principalGroups) {
      if (group.atoms && group.atoms.length > 0) {
        // For each principal functional group, find the specific ring position where it's located
        let foundGroupPosition = false;

        // First pass: Check if any group atoms are ring atoms themselves
        for (const groupAtom of group.atoms) {
          const groupAtomId =
            typeof groupAtom === "object" ? groupAtom.id : groupAtom;

          for (let i = 0; i < ring.atoms.length; i++) {
            if (ring.atoms[i]?.id === groupAtomId) {
              principalGroupPositions.add(i);
              if (process.env.VERBOSE) {
                console.log(
                  `[Ring Numbering] Principal group ${group.type} is ring atom at position ${i} (atom ${groupAtomId})`,
                );
              }
              foundGroupPosition = true;
              break;
            }
          }

          if (foundGroupPosition) break;
        }

        // Second pass: If not found as ring atom, check which ring atom this group is attached to
        if (!foundGroupPosition) {
          for (const groupAtom of group.atoms) {
            const groupAtomId =
              typeof groupAtom === "object" ? groupAtom.id : groupAtom;

            // Find bonds from group atom to ring atoms
            const bonds = molecule.bonds.filter(
              (bond: Bond) =>
                bond.atom1 === groupAtomId || bond.atom2 === groupAtomId,
            );

            for (const bond of bonds) {
              const otherAtomId =
                bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
              // Check if the bonded atom is a ring atom
              for (let i = 0; i < ring.atoms.length; i++) {
                if (ring.atoms[i]?.id === otherAtomId) {
                  principalGroupPositions.add(i);
                  if (process.env.VERBOSE) {
                    console.log(
                      `[Ring Numbering] Principal group ${group.type} attached to ring position ${i} (atom ${otherAtomId})`,
                    );
                  }
                  foundGroupPosition = true;
                  break;
                }
              }

              if (foundGroupPosition) break;
            }

            if (foundGroupPosition) break;
          }
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[Ring Numbering] Principal group positions:`,
      Array.from(principalGroupPositions).sort((a, b) => a - b),
    );
  }

  // Count substituents at each ring position (not just which positions have substituents)
  const substituentCounts: number[] = Array(ring.atoms.length).fill(0);

  for (let i = 0; i < ring.atoms.length; i++) {
    const ringAtom = ring.atoms[i];
    if (!ringAtom) continue;

    // Find bonds from this ring atom to non-ring atoms
    const bonds = molecule.bonds.filter(
      (bond: Bond) => bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id,
    );

    for (const bond of bonds) {
      const otherAtomId = bond.atom1 === ringAtom.id ? bond.atom2 : bond.atom1;
      if (!ringAtomIds.has(otherAtomId)) {
        const substituentAtom = molecule.atoms[otherAtomId];
        if (substituentAtom && substituentAtom.symbol !== "H") {
          // Count this substituent
          const currentCount = substituentCounts[i];
          if (currentCount !== undefined) {
            substituentCounts[i] = currentCount + 1;
          }
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] Found substituent at ring position ${i} (atom ${ringAtom.id})`,
            );
          }
        }
      }
    }
  }

  const totalSubstituents = substituentCounts.reduce(
    (sum, count) => sum + count,
    0,
  );
  if (process.env.VERBOSE) {
    console.log(
      `[Ring Numbering] Substituent counts: [${substituentCounts.join(", ")}], total: ${totalSubstituents}`,
    );
  }

  // If no substituents, default numbering is fine
  if (totalSubstituents === 0) {
    return 1;
  }

  // Try all possible starting positions and directions to find the one with lowest locant set
  let bestStart = 1;
  let bestLocants: number[] = [];
  let bestPrincipalLocants: number[] = []; // Track locants for principal groups separately

  // Try both clockwise (direction = 1) and counter-clockwise (direction = -1)
  for (let start = 0; start < ring.atoms.length; start++) {
    for (const direction of [1, -1]) {
      // Calculate locants for principal functional groups first
      const principalLocants: number[] = [];
      const substituentLocants: number[] = [];

      // First pass: assign locants to principal functional groups
      for (let i = 0; i < ring.atoms.length; i++) {
        if (principalGroupPositions.has(i)) {
          // Calculate the locant for this principal group position
          let locant: number;
          if (direction === 1) {
            // Clockwise: start -> start+1 -> ... -> start+n-1 (wrapping around)
            locant = ((i - start + ring.atoms.length) % ring.atoms.length) + 1;
          } else {
            // Counter-clockwise: start -> start-1 -> ... -> start-n+1 (wrapping around)
            locant = ((start - i + ring.atoms.length) % ring.atoms.length) + 1;
          }
          principalLocants.push(locant);
        }
      }

      // Second pass: assign locants to non-principal substituents
      for (let i = 0; i < ring.atoms.length; i++) {
        const count = substituentCounts[i];
        if (count && count > 0 && !principalGroupPositions.has(i)) {
          // Calculate the locant for this substituent position
          let locant: number;
          if (direction === 1) {
            // Clockwise: start -> start+1 -> ... -> start+n-1 (wrapping around)
            locant = ((i - start + ring.atoms.length) % ring.atoms.length) + 1;
          } else {
            // Counter-clockwise: start -> start-1 -> ... -> start-n+1 (wrapping around)
            locant = ((start - i + ring.atoms.length) % ring.atoms.length) + 1;
          }

          // Add one locant for each substituent at this position
          for (let j = 0; j < count; j++) {
            substituentLocants.push(locant);
          }
        }
      }

      // Combine principal and substituent locants for final comparison
      const allLocants = [...principalLocants, ...substituentLocants];

      // Sort locants for comparison
      principalLocants.sort((a, b) => a - b);
      substituentLocants.sort((a, b) => a - b);
      allLocants.sort((a, b) => a - b);

      const directionStr = direction === 1 ? "CW" : "CCW";
      if (process.env.VERBOSE) {
        console.log(
          `[Ring Numbering] Starting at position ${start} (${directionStr}): principal = [${principalLocants.join(", ")}], substituent = [${substituentLocants.join(", ")}], all = [${allLocants.join(", ")}]`,
        );
      }

      // Compare with best so far
      // IUPAC Rule P-14.3: Principal groups receive lowest locants first, then all substituents
      if (bestLocants.length === 0) {
        // First candidate
        bestLocants = allLocants;
        bestPrincipalLocants = principalLocants;
        bestStart = direction === 1 ? start + 1 : -(start + 1); // 1-based, signed for direction
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] New best! Start at ${Math.abs(bestStart)} (${directionStr})`,
          );
        }
      } else {
        let shouldUpdate = false;
        let updateReason = "";

        // If we have principal groups, compare those FIRST
        if (principalLocants.length > 0 && bestPrincipalLocants.length > 0) {
          const principalComparison = compareLocantSets(
            principalLocants,
            bestPrincipalLocants,
          );
          if (principalComparison < 0) {
            shouldUpdate = true;
            updateReason = " (by principal group priority)";
          } else if (principalComparison === 0) {
            // Principal group locants are equal, check all substituent locants
            const locantComparison = compareLocantSets(
              substituentLocants,
              bestLocants.filter(
                (locant) => !bestPrincipalLocants.includes(locant),
              ),
            );
            if (locantComparison < 0) {
              shouldUpdate = true;
              updateReason = " (by substituent locants, principal groups tied)";
            }
          }
        } else {
          // No principal groups, just compare all locants
          const locantComparison = compareLocantSets(allLocants, bestLocants);
          if (locantComparison < 0) {
            shouldUpdate = true;
            updateReason = "";
          }
        }

        if (shouldUpdate) {
          bestLocants = allLocants;
          bestPrincipalLocants = principalLocants;
          bestStart = direction === 1 ? start + 1 : -(start + 1); // 1-based, signed for direction
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] New best${updateReason}! Start at ${Math.abs(bestStart)} (${directionStr})`,
            );
          }
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[Ring Numbering] Final decision: start at position ${Math.abs(bestStart)} (${bestStart > 0 ? "CW" : "CCW"}), locants = [${bestLocants.join(", ")}]`,
    );
  }

  return bestStart;
}

export function findOptimalRingNumberingFromHeteroatom(
  ring: RingSystem,
  molecule: Molecule,
  heteroatomIndex: number,
  functionalGroups?: FunctionalGroup[],
): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return -1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return -1;
  }

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: Atom) => a.id));

  // Build set of functional group atom IDs to exclude from substituent counting
  const functionalGroupAtomIds = new Set<number>();
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.atoms) {
        for (const fgAtom of fg.atoms) {
          // Handle both atom objects and atom IDs
          const atomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;
          if (atomId !== undefined) {
            functionalGroupAtomIds.add(atomId);

            // Also add all atoms bonded to this functional group atom
            // (e.g., C=O oxygen should be excluded if C is in the functional group)
            const bonds = molecule.bonds.filter(
              (bond: Bond) => bond.atom1 === atomId || bond.atom2 === atomId,
            );
            for (const bond of bonds) {
              const otherAtomId =
                bond.atom1 === atomId ? bond.atom2 : bond.atom1;
              // Only add if it's not a ring atom (we don't want to exclude ring substituents)
              if (!ringAtomIds.has(otherAtomId)) {
                functionalGroupAtomIds.add(otherAtomId);
              }
            }
          }
        }
      }
    }
  }
  if (process.env.VERBOSE && functionalGroupAtomIds.size > 0) {
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Functional group atom IDs to exclude: [${Array.from(functionalGroupAtomIds).join(", ")}]`,
      );
    }
  }

  // Find attachment points of PRINCIPAL functional groups in the ring
  // These take priority over substituents when determining ring numbering direction
  const principalFGAttachmentIndices: number[] = [];
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      // Only consider principal functional groups (suffix groups like ester, ketone, etc.)
      if (!fg.isPrincipal) {
        continue;
      }

      if (fg.atoms && fg.atoms.length > 0) {
        // For each atom in the functional group, find which ring atom it's bonded to
        for (const groupAtom of fg.atoms) {
          const groupAtomId =
            typeof groupAtom === "object" ? groupAtom.id : groupAtom;

          // Check if this functional group atom is itself in the ring
          const ringIndex = ring.atoms.findIndex((a) => a.id === groupAtomId);
          if (ringIndex >= 0) {
            if (!principalFGAttachmentIndices.includes(ringIndex)) {
              principalFGAttachmentIndices.push(ringIndex);
            }
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
                // Found a ring atom bonded to this principal functional group
                const ringIndex = ring.atoms.findIndex(
                  (a) => a.id === otherAtomId,
                );
                if (
                  ringIndex >= 0 &&
                  !principalFGAttachmentIndices.includes(ringIndex)
                ) {
                  principalFGAttachmentIndices.push(ringIndex);
                  if (process.env.VERBOSE) {
                    console.log(
                      `[Heteroatom Ring Numbering] Principal FG ${fg.type} attached to ring index ${ringIndex} (atom ${otherAtomId})`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Count substituents at each ring position (not just which atoms have substituents)
  const substituentCounts: number[] = Array(ring.atoms.length).fill(0);

  for (let i = 0; i < ring.atoms.length; i++) {
    const ringAtom = ring.atoms[i];
    if (!ringAtom) continue;

    // Find bonds from this ring atom to non-ring atoms
    const bonds = molecule.bonds.filter(
      (bond: Bond) => bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id,
    );

    for (const bond of bonds) {
      const otherAtomId = bond.atom1 === ringAtom.id ? bond.atom2 : bond.atom1;
      if (!ringAtomIds.has(otherAtomId)) {
        const substituentAtom = molecule.atoms[otherAtomId];
        if (substituentAtom && substituentAtom.symbol !== "H") {
          // Skip functional group atoms - they're not substituents
          if (functionalGroupAtomIds.has(otherAtomId)) {
            if (process.env.VERBOSE) {
              console.log(
                `[Heteroatom Ring Numbering] Skipping functional group atom ${otherAtomId} at position ${i}`,
              );
            }
            continue;
          }
          // Count this substituent
          const currentCount = substituentCounts[i];
          if (currentCount !== undefined) {
            substituentCounts[i] = currentCount + 1;
          }
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[Heteroatom Ring Numbering] Substituent counts at each position: [${substituentCounts.join(", ")}]`,
    );
  }
  const heteroAtom = ring.atoms[heteroatomIndex];
  if (!heteroAtom) {
    return -1;
  }
  if (process.env.VERBOSE) {
    console.log(
      `[Heteroatom Ring Numbering] Heteroatom at index ${heteroatomIndex} (atom ${heteroAtom.id})`,
    );
  }
  // Build a map of ring atom ID → index in ring.atoms
  const ringAtomIdToIndex = new Map<number, number>();
  for (let i = 0; i < ring.atoms.length; i++) {
    const atom = ring.atoms[i];
    if (atom && atom.id !== undefined) {
      ringAtomIdToIndex.set(atom.id, i);
    }
  }

  // Find functional group atoms that are part of the ring
  const functionalGroupRingPositions: number[] = [];
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.atoms) {
        for (const fgAtom of fg.atoms) {
          const atomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;
          if (atomId !== undefined && ringAtomIdToIndex.has(atomId)) {
            const idx = ringAtomIdToIndex.get(atomId);
            if (idx !== undefined) {
              functionalGroupRingPositions.push(idx);
            }
          }
        }
      }
    }
  }

  const ringSize = ring.atoms.length;

  // IUPAC Priority Order:
  // 1. Heteroatom at position 1 (already ensured)
  // 2. Principal functional groups (suffix groups) at lowest locants (HIGHEST PRIORITY for direction)
  // 3. Other functional groups at lowest locants
  // 4. Substituents at lowest locants (tiebreaker if functional group locants are equal)

  // PRIORITY 1: If there are PRINCIPAL functional groups attached to the ring,
  // they take highest priority for direction selection
  if (principalFGAttachmentIndices.length > 0) {
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Principal FG attachment indices: [${principalFGAttachmentIndices.join(", ")}]`,
      );
    }

    // Direction 1 (clockwise): calculate principal FG attachment locants
    const principalLocants1 = principalFGAttachmentIndices
      .map((pos) => {
        const offset = (pos - heteroatomIndex + ringSize) % ringSize;
        return offset + 1; // 1-based locant
      })
      .sort((a, b) => a - b);

    // Direction 2 (counterclockwise): calculate principal FG attachment locants
    const principalLocants2 = principalFGAttachmentIndices
      .map((pos) => {
        const offset = (heteroatomIndex - pos + ringSize) % ringSize;
        return offset + 1; // 1-based locant
      })
      .sort((a, b) => a - b);

    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Direction 1 (CW) principal FG attachment locants: [${principalLocants1.join(", ")}]`,
      );
      if (process.env.VERBOSE) {
        console.log(
          `[Heteroatom Ring Numbering] Direction 2 (CCW) principal FG attachment locants: [${principalLocants2.join(", ")}]`,
        );
      }
    }

    // Compare principal FG attachment locants first
    const principalComparison = compareLocantSets(
      principalLocants1,
      principalLocants2,
    );

    if (principalComparison < 0) {
      // Direction 1 has better principal FG attachment locants
      if (process.env.VERBOSE) {
        console.log(
          `[Heteroatom Ring Numbering] Choosing direction 1 (clockwise) based on principal FG attachment locants`,
        );
      }
      return heteroatomIndex + 1;
    } else if (principalComparison > 0) {
      // Direction 2 has better principal FG attachment locants
      if (process.env.VERBOSE) {
        console.log(
          `[Heteroatom Ring Numbering] Choosing direction 2 (counterclockwise) based on principal FG attachment locants`,
        );
      }
      return -1;
    }

    // Principal FG attachment locants are equal, fall through to check other criteria
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Principal FG attachment locants are equal, checking other functional groups`,
      );
    }
  }

  // If there are functional groups in the ring, they take priority for direction selection
  if (functionalGroupRingPositions.length > 0) {
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Functional groups at ring positions: [${functionalGroupRingPositions.join(", ")}]`,
      );
    }

    // Direction 1 (clockwise): calculate functional group locants
    const fgLocants1 = functionalGroupRingPositions
      .map((pos) => {
        const offset = (pos - heteroatomIndex + ringSize) % ringSize;
        return offset + 1; // 1-based locant
      })
      .sort((a, b) => a - b);

    // Direction 2 (counterclockwise): calculate functional group locants
    const fgLocants2 = functionalGroupRingPositions
      .map((pos) => {
        const offset = (heteroatomIndex - pos + ringSize) % ringSize;
        return offset + 1; // 1-based locant
      })
      .sort((a, b) => a - b);

    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Direction 1 (CW) functional group locants: [${fgLocants1.join(", ")}]`,
      );
      if (process.env.VERBOSE) {
        console.log(
          `[Heteroatom Ring Numbering] Direction 2 (CCW) functional group locants: [${fgLocants2.join(", ")}]`,
        );
      }
    }

    // Compare functional group locants first
    const fgComparison = compareLocantSets(fgLocants1, fgLocants2);

    if (fgComparison < 0) {
      // Direction 1 has better functional group locants
      if (process.env.VERBOSE) {
        console.log(
          `[Heteroatom Ring Numbering] Choosing direction 1 (clockwise) based on functional group locants`,
        );
      }
      return heteroatomIndex + 1;
    } else if (fgComparison > 0) {
      // Direction 2 has better functional group locants
      if (process.env.VERBOSE) {
        console.log(
          `[Heteroatom Ring Numbering] Choosing direction 2 (counterclockwise) based on functional group locants`,
        );
      }
      return -1;
    }

    // Functional group locants are equal, fall through to check substituents as tiebreaker
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Functional group locants are equal, checking substituents as tiebreaker`,
      );
    }
  }

  // Calculate substituent locants for both directions
  const totalSubstituents = substituentCounts.reduce(
    (sum, count) => sum + count,
    0,
  );

  if (totalSubstituents === 0) {
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] No substituents found, using default clockwise direction`,
      );
    }
    return heteroatomIndex + 1; // 1-based
  }

  // Try direction 1: heteroatom → next atom (clockwise)
  const locants1: number[] = [];
  for (let i = 0; i < ringSize; i++) {
    const ringPos = (heteroatomIndex + i) % ringSize;
    const count = substituentCounts[ringPos] ?? 0;
    // Add 'count' copies of locant (i+1) to the list
    for (let j = 0; j < count; j++) {
      locants1.push(i + 1); // i+1 is the locant at this position
    }
  }
  locants1.sort((a, b) => a - b);

  // Try direction 2: heteroatom → previous atom (counterclockwise)
  const locants2: number[] = [];
  for (let i = 0; i < ringSize; i++) {
    const ringPos = (heteroatomIndex - i + ringSize) % ringSize;
    const count = substituentCounts[ringPos] ?? 0;
    // Add 'count' copies of locant (i+1) to the list
    for (let j = 0; j < count; j++) {
      locants2.push(i + 1);
    }
  }
  locants2.sort((a, b) => a - b);

  if (process.env.VERBOSE) {
    console.log(
      `[Heteroatom Ring Numbering] Direction 1 (clockwise) substituent locants: [${locants1.join(", ")}]`,
    );
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Direction 2 (counterclockwise) substituent locants: [${locants2.join(", ")}]`,
      );
    }
  }

  // Compare the substituent locant sets
  const comparison = compareLocantSets(locants1, locants2);

  if (comparison <= 0) {
    // Direction 1 is better or equal (clockwise)
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Choosing direction 1 (clockwise) based on substituent locants`,
      );
    }
    return heteroatomIndex + 1; // 1-based, positive means use as-is
  } else {
    // Direction 2 is better (counterclockwise)
    if (process.env.VERBOSE) {
      console.log(
        `[Heteroatom Ring Numbering] Choosing direction 2 (counterclockwise) based on substituent locants`,
      );
    }
    return -1; // Negative signals to caller to reverse the ring
  }
}

export function compareLocantSets(a: number[], b: number[]): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    const aVal = a[i];
    const bVal = b[i];
    if (aVal !== undefined && bVal !== undefined && aVal !== bVal) {
      return aVal - bVal;
    }
  }
  return a.length - b.length;
}

function countNonRingSubstituents(
  atom: Atom,
  ringAtomSet: Set<number>,
  molecule: Molecule,
): number {
  let count = 0;
  for (const bond of molecule.bonds) {
    let otherAtomId: number | null = null;

    if (bond.atom1 === atom.id && !ringAtomSet.has(bond.atom2)) {
      otherAtomId = bond.atom2;
    } else if (bond.atom2 === atom.id && !ringAtomSet.has(bond.atom1)) {
      otherAtomId = bond.atom1;
    }

    if (otherAtomId !== null) {
      const otherAtom = molecule.atoms.find((a) => a.id === otherAtomId);
      if (otherAtom?.symbol === "O" && bond.type === "double") {
        continue;
      }
      count++;
    }
  }
  return count;
}

function detectAndNumberFiveMemberedHeterocycle(
  ring: RingSystem,
  heteroatomIndices: number[],
  molecule?: Molecule,
): { atoms: Atom[]; start: number } | null {
  if (ring.atoms.length !== 5 || heteroatomIndices.length !== 2) {
    return null;
  }

  const nCount = ring.atoms.filter((a) => a.symbol === "N").length;
  const sCount = ring.atoms.filter((a) => a.symbol === "S").length;
  const oCount = ring.atoms.filter((a) => a.symbol === "O").length;

  if (nCount === 1 && sCount === 1) {
    for (let startIdx = 0; startIdx < ring.atoms.length; startIdx++) {
      const cwAtoms = [
        ...ring.atoms.slice(startIdx),
        ...ring.atoms.slice(0, startIdx),
      ] as Atom[];

      if (
        cwAtoms[0]?.symbol === "N" &&
        cwAtoms[1]?.symbol === "C" &&
        cwAtoms[2]?.symbol === "S" &&
        cwAtoms[3]?.symbol === "C" &&
        cwAtoms[4]?.symbol === "C"
      ) {
        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Found N-C-S-C-C pattern (thiazoline/thiazolidine) starting at index ${startIdx}`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Reordered atoms: [${cwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
        return { atoms: cwAtoms, start: 1 };
      }

      const atom = ring.atoms[startIdx]!;
      const before = ring.atoms.slice(0, startIdx).reverse() as Atom[];
      const after = ring.atoms.slice(startIdx + 1).reverse() as Atom[];
      const ccwAtoms = [atom, ...after, ...before] as Atom[];

      if (
        ccwAtoms[0]?.symbol === "N" &&
        ccwAtoms[1]?.symbol === "C" &&
        ccwAtoms[2]?.symbol === "S" &&
        ccwAtoms[3]?.symbol === "C" &&
        ccwAtoms[4]?.symbol === "C"
      ) {
        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Found N-C-S-C-C pattern (thiazoline/thiazolidine) (CCW) starting at index ${startIdx}`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Reordered atoms: [${ccwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
        return { atoms: ccwAtoms, start: 1 };
      }
    }
  }

  if (nCount === 1 && oCount === 1) {
    for (let startIdx = 0; startIdx < ring.atoms.length; startIdx++) {
      const cwAtoms = [
        ...ring.atoms.slice(startIdx),
        ...ring.atoms.slice(0, startIdx),
      ] as Atom[];

      if (
        cwAtoms[0]?.symbol === "N" &&
        cwAtoms[1]?.symbol === "C" &&
        cwAtoms[2]?.symbol === "O" &&
        cwAtoms[3]?.symbol === "C" &&
        cwAtoms[4]?.symbol === "C"
      ) {
        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Found N-C-O-C-C pattern (oxazoline/oxazolidine) starting at index ${startIdx}`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Reordered atoms: [${cwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
        return { atoms: cwAtoms, start: 1 };
      }

      const atom = ring.atoms[startIdx]!;
      const before = ring.atoms.slice(0, startIdx).reverse() as Atom[];
      const after = ring.atoms.slice(startIdx + 1).reverse() as Atom[];
      const ccwAtoms = [atom, ...after, ...before] as Atom[];

      if (
        ccwAtoms[0]?.symbol === "N" &&
        ccwAtoms[1]?.symbol === "C" &&
        ccwAtoms[2]?.symbol === "O" &&
        ccwAtoms[3]?.symbol === "C" &&
        ccwAtoms[4]?.symbol === "C"
      ) {
        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Found N-C-O-C-C pattern (oxazoline/oxazolidine) (CCW) starting at index ${startIdx}`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Reordered atoms: [${ccwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
        return { atoms: ccwAtoms, start: 1 };
      }
    }
  }

  if (nCount === 2) {
    const candidates: Array<{
      atoms: Atom[];
      start: number;
      n1Subs: number;
      n3Subs: number;
    }> = [];

    for (let startIdx = 0; startIdx < ring.atoms.length; startIdx++) {
      const cwAtoms = [
        ...ring.atoms.slice(startIdx),
        ...ring.atoms.slice(0, startIdx),
      ] as Atom[];

      if (
        cwAtoms[0]?.symbol === "N" &&
        cwAtoms[1]?.symbol === "C" &&
        cwAtoms[2]?.symbol === "N" &&
        cwAtoms[3]?.symbol === "C" &&
        cwAtoms[4]?.symbol === "C"
      ) {
        let n1Subs = 0;
        let n3Subs = 0;

        if (molecule) {
          const ringAtomSet = new Set(cwAtoms.map((a) => a.id));
          n1Subs = countNonRingSubstituents(cwAtoms[0]!, ringAtomSet, molecule);
          n3Subs = countNonRingSubstituents(cwAtoms[2]!, ringAtomSet, molecule);
        }

        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Found N-C-N-C-C pattern (CW) starting at index ${startIdx}`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Reordered atoms: [${cwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] N1 substituents: ${n1Subs}, N3 substituents: ${n3Subs}`,
          );
        }

        candidates.push({ atoms: cwAtoms, start: 1, n1Subs, n3Subs });
      }

      const atom = ring.atoms[startIdx]!;
      const before = ring.atoms.slice(0, startIdx).reverse() as Atom[];
      const after = ring.atoms.slice(startIdx + 1).reverse() as Atom[];
      const ccwAtoms = [atom, ...after, ...before] as Atom[];

      if (
        ccwAtoms[0]?.symbol === "N" &&
        ccwAtoms[1]?.symbol === "C" &&
        ccwAtoms[2]?.symbol === "N" &&
        ccwAtoms[3]?.symbol === "C" &&
        ccwAtoms[4]?.symbol === "C"
      ) {
        let n1Subs = 0;
        let n3Subs = 0;

        if (molecule) {
          const ringAtomSet = new Set(ccwAtoms.map((a) => a.id));
          n1Subs = countNonRingSubstituents(
            ccwAtoms[0]!,
            ringAtomSet,
            molecule,
          );
          n3Subs = countNonRingSubstituents(
            ccwAtoms[2]!,
            ringAtomSet,
            molecule,
          );
        }

        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Found N-C-N-C-C pattern (CCW) starting at index ${startIdx}`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Reordered atoms: [${ccwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] N1 substituents: ${n1Subs}, N3 substituents: ${n3Subs}`,
          );
        }

        candidates.push({ atoms: ccwAtoms, start: 1, n1Subs, n3Subs });
      }
    }

    if (candidates.length > 0) {
      let carbonylCarbonId: number | null = null;
      if (molecule) {
        const ringAtomSet = new Set(ring.atoms.map((a) => a.id));
        for (const bond of molecule.bonds) {
          if (bond.type === "double") {
            const atom1 = molecule.atoms.find((a) => a.id === bond.atom1);
            const atom2 = molecule.atoms.find((a) => a.id === bond.atom2);
            if (
              atom1?.symbol === "C" &&
              atom2?.symbol === "O" &&
              ringAtomSet.has(bond.atom1)
            ) {
              carbonylCarbonId = bond.atom1;
              break;
            } else if (
              atom1?.symbol === "O" &&
              atom2?.symbol === "C" &&
              ringAtomSet.has(bond.atom2)
            ) {
              carbonylCarbonId = bond.atom2;
              break;
            }
          }
        }
      }

      let validCandidates = candidates;
      if (carbonylCarbonId !== null) {
        validCandidates = candidates.filter((candidate) => {
          const position = candidate.atoms.findIndex(
            (a) => a.id === carbonylCarbonId,
          );
          const isValid = position === 3;
          if (process.env.VERBOSE && !isValid) {
            console.log(
              `[detectAndNumberFiveMemberedHeterocycle] Rejecting arrangement: carbonyl at position ${position + 1}, expected 4`,
            );
          }
          return isValid;
        });

        if (validCandidates.length === 0) {
          if (process.env.VERBOSE) {
            console.log(
              `[detectAndNumberFiveMemberedHeterocycle] No valid arrangements found with carbonyl at position 4, using all candidates`,
            );
          }
          validCandidates = candidates;
        }
      }

      let best = validCandidates[0]!;
      let bestLocants: number[] = [];

      if (molecule) {
        const ringAtomSet = new Set(best.atoms.map((a) => a.id));
        bestLocants = [];
        for (let i = 0; i < best.atoms.length; i++) {
          const atom = best.atoms[i]!;
          const subs = countNonRingSubstituents(atom, ringAtomSet, molecule);
          for (let j = 0; j < subs; j++) {
            bestLocants.push(i + 1);
          }
        }
        bestLocants.sort((a, b) => a - b);
      }

      for (const candidate of validCandidates) {
        let currentLocants: number[] = [];

        if (molecule) {
          const ringAtomSet = new Set(candidate.atoms.map((a) => a.id));
          currentLocants = [];
          for (let i = 0; i < candidate.atoms.length; i++) {
            const atom = candidate.atoms[i]!;
            const subs = countNonRingSubstituents(atom, ringAtomSet, molecule);
            for (let j = 0; j < subs; j++) {
              currentLocants.push(i + 1);
            }
          }
          currentLocants.sort((a, b) => a - b);
        }

        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberFiveMemberedHeterocycle] Candidate arrangement locants: ${JSON.stringify(currentLocants)}`,
          );
        }

        if (compareLocantSets(currentLocants, bestLocants) < 0) {
          best = candidate;
          bestLocants = currentLocants;
          if (process.env.VERBOSE) {
            console.log(
              `[detectAndNumberFiveMemberedHeterocycle] New best arrangement with locants: ${JSON.stringify(currentLocants)}`,
            );
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[detectAndNumberFiveMemberedHeterocycle] Selected best arrangement with locants: ${JSON.stringify(bestLocants)}`,
        );
      }

      return { atoms: best.atoms, start: best.start };
    }
  }

  return null;
}

function detectAndNumberTriazine(
  ring: RingSystem,
  heteroatomIndices: number[],
): { atoms: Atom[]; start: number } | null {
  if (ring.atoms.length !== 6 || heteroatomIndices.length !== 3) {
    return null;
  }

  const nCount = ring.atoms.filter((a) => a.symbol === "N").length;
  const cCount = ring.atoms.filter((a) => a.symbol === "C").length;

  if (nCount !== 3 || cCount !== 3) {
    return null;
  }

  // Triazine has 3 nitrogens and 3 carbons in a 6-membered ring
  // We need to determine if it's 1,2,4-triazine based on connectivity
  // In 1,2,4-triazine: positions 1,2,4 are N; positions 3,5,6 are C
  // Pattern: N-N-C-N-C-C

  // Try all starting positions and both directions to find the 1,2,4-triazine pattern
  for (let startIdx = 0; startIdx < ring.atoms.length; startIdx++) {
    // Try clockwise
    const cwAtoms = [
      ...ring.atoms.slice(startIdx),
      ...ring.atoms.slice(0, startIdx),
    ] as Atom[];

    if (
      cwAtoms[0]?.symbol === "N" &&
      cwAtoms[1]?.symbol === "N" &&
      cwAtoms[2]?.symbol === "C" &&
      cwAtoms[3]?.symbol === "N" &&
      cwAtoms[4]?.symbol === "C" &&
      cwAtoms[5]?.symbol === "C"
    ) {
      if (process.env.VERBOSE) {
        console.log(
          `[detectAndNumberTriazine] Found 1,2,4-triazine pattern (CW) starting at index ${startIdx}`,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberTriazine] Reordered atoms: [${cwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
      }
      return { atoms: cwAtoms, start: 1 };
    }

    // Try counterclockwise
    const atom = ring.atoms[startIdx]!;
    const before = ring.atoms.slice(0, startIdx).reverse() as Atom[];
    const after = ring.atoms.slice(startIdx + 1).reverse() as Atom[];
    const ccwAtoms = [atom, ...after, ...before] as Atom[];

    if (
      ccwAtoms[0]?.symbol === "N" &&
      ccwAtoms[1]?.symbol === "N" &&
      ccwAtoms[2]?.symbol === "C" &&
      ccwAtoms[3]?.symbol === "N" &&
      ccwAtoms[4]?.symbol === "C" &&
      ccwAtoms[5]?.symbol === "C"
    ) {
      if (process.env.VERBOSE) {
        console.log(
          `[detectAndNumberTriazine] Found 1,2,4-triazine pattern (CCW) starting at index ${startIdx}`,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[detectAndNumberTriazine] Reordered atoms: [${ccwAtoms.map((a) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
      }
      return { atoms: ccwAtoms, start: 1 };
    }
  }

  return null;
}

function detectAndNumberLactam(
  ring: RingSystem,
  molecule: Molecule,
): { atoms: Atom[]; start: number } | null {
  const ringSize = ring.atoms.length;

  if (process.env.VERBOSE) {
    console.log(
      `[detectAndNumberLactam] Called with ring of size ${ringSize}:`,
      ring.atoms.map((a, i) => `${i}:${a.symbol}(id=${a.id})`),
    );
  }

  if (ringSize !== 5 && ringSize !== 6) {
    return null;
  }

  const nCount = ring.atoms.filter((a) => a.symbol === "N").length;

  if (nCount === 0) {
    return null;
  }

  const ringAtomSet = new Set(ring.atoms.map((a) => a.id));
  let carbonylCarbonId: number | null = null;

  for (const bond of molecule.bonds) {
    if (bond.type === "double") {
      const atom1 = molecule.atoms.find((a) => a.id === bond.atom1);
      const atom2 = molecule.atoms.find((a) => a.id === bond.atom2);
      if (
        atom1?.symbol === "C" &&
        atom2?.symbol === "O" &&
        ringAtomSet.has(bond.atom1) &&
        !ringAtomSet.has(bond.atom2)
      ) {
        carbonylCarbonId = bond.atom1;
        break;
      } else if (
        atom1?.symbol === "O" &&
        atom2?.symbol === "C" &&
        ringAtomSet.has(bond.atom2) &&
        !ringAtomSet.has(bond.atom1)
      ) {
        carbonylCarbonId = bond.atom2;
        break;
      }
    }
  }

  if (carbonylCarbonId === null) {
    return null;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectAndNumberLactam] Found lactam ring (size=${ringSize}, N=${nCount}, carbonyl at atom ${carbonylCarbonId})`,
    );
  }

  if (ringSize === 5 && nCount === 1) {
    return handleFiveMemberedSingleNitrogenLactam(
      ring,
      carbonylCarbonId,
      molecule,
    );
  } else if (ringSize === 6 && nCount === 1) {
    return handleSixMemberedSingleNitrogenLactam(
      ring,
      carbonylCarbonId,
      molecule,
    );
  } else if (ringSize === 6 && nCount === 2) {
    return handleSixMemberedDualNitrogenLactam(
      ring,
      carbonylCarbonId,
      molecule,
    );
  }

  return null;
}

function handleFiveMemberedSingleNitrogenLactam(
  ring: RingSystem,
  carbonylCarbonId: number,
  molecule: Molecule,
): { atoms: Atom[]; start: number } | null {
  const candidates: Array<{ atoms: Atom[]; locants: number[] }> = [];

  // Find nitrogen atom
  const nitrogenAtom = ring.atoms.find((a) => a.symbol === "N");
  if (!nitrogenAtom) return null;

  const nitrogenIdx = ring.atoms.findIndex((a) => a.id === nitrogenAtom.id);

  // Generate two candidate sequences: forward and backward from N
  // Direction 1: Follow ring.atoms order
  const dir1Atoms = [
    ...ring.atoms.slice(nitrogenIdx),
    ...ring.atoms.slice(0, nitrogenIdx),
  ] as Atom[];

  // Direction 2: Reverse ring.atoms order from N
  const dir2Atoms = [
    nitrogenAtom,
    ...ring.atoms.slice(0, nitrogenIdx).reverse(),
    ...ring.atoms.slice(nitrogenIdx + 1).reverse(),
  ] as Atom[];

  if (process.env.VERBOSE) {
    console.log(
      `[handleFiveMemberedSingleNitrogenLactam] Nitrogen at index ${nitrogenIdx} (atom ${nitrogenAtom.id})`,
    );
    console.log(
      `[handleFiveMemberedSingleNitrogenLactam] Dir1: ${dir1Atoms.map((a) => `${a.id}:${a.symbol}`).join(",")}`,
    );
    console.log(
      `[handleFiveMemberedSingleNitrogenLactam] Dir2: ${dir2Atoms.map((a) => `${a.id}:${a.symbol}`).join(",")}`,
    );
  }

  // Check both directions
  for (const [dirName, atoms] of [
    ["Dir1", dir1Atoms],
    ["Dir2", dir2Atoms],
  ] as const) {
    const carbonylPos = atoms.findIndex((a) => a.id === carbonylCarbonId);
    if (process.env.VERBOSE) {
      console.log(
        `[handleFiveMemberedSingleNitrogenLactam] ${dirName}: carbonylPos=${carbonylPos}`,
      );
    }

    if (carbonylPos === 1) {
      const ringAtomSet = new Set(atoms.map((a) => a.id));
      const locants: number[] = [];
      for (let i = 0; i < atoms.length; i++) {
        const subs = countNonRingSubstituents(atoms[i]!, ringAtomSet, molecule);
        for (let j = 0; j < subs; j++) {
          locants.push(i + 1);
        }
      }
      locants.sort((a, b) => a - b);
      if (process.env.VERBOSE) {
        console.log(
          `[handleFiveMemberedSingleNitrogenLactam] ${dirName} candidate: locants=${JSON.stringify(locants)}`,
        );
      }
      candidates.push({ atoms: atoms as Atom[], locants });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectAndNumberLactam] 5-membered: Found ${candidates.length} candidates:`,
    );
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      console.log(
        `  Candidate ${i}: atoms=${c.atoms.map((a) => `${a.id}:${a.symbol}`).join(",")}, locants=${JSON.stringify(c.locants)}`,
      );
    }
  }

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (compareLocantSets(candidate.locants, best.locants) < 0) {
      best = candidate;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectAndNumberLactam] 5-membered single-N lactam: selected arrangement with locants ${JSON.stringify(best.locants)}`,
    );
  }

  return { atoms: best.atoms, start: 1 };
}

function handleSixMemberedSingleNitrogenLactam(
  ring: RingSystem,
  carbonylCarbonId: number,
  molecule: Molecule,
): { atoms: Atom[]; start: number } | null {
  const candidates: Array<{ atoms: Atom[]; locants: number[] }> = [];

  for (let startIdx = 0; startIdx < ring.atoms.length; startIdx++) {
    const cwAtoms = [
      ...ring.atoms.slice(startIdx),
      ...ring.atoms.slice(0, startIdx),
    ] as Atom[];

    if (cwAtoms[0]?.symbol === "N") {
      const carbonylPos = cwAtoms.findIndex((a) => a.id === carbonylCarbonId);
      if (carbonylPos === 1) {
        const ringAtomSet = new Set(cwAtoms.map((a) => a.id));
        const locants: number[] = [];
        for (let i = 0; i < cwAtoms.length; i++) {
          const subs = countNonRingSubstituents(
            cwAtoms[i]!,
            ringAtomSet,
            molecule,
          );
          for (let j = 0; j < subs; j++) {
            locants.push(i + 1);
          }
        }
        locants.sort((a, b) => a - b);
        candidates.push({ atoms: cwAtoms, locants });
      }
    }

    const atom = ring.atoms[startIdx]!;
    const before = ring.atoms.slice(0, startIdx).reverse() as Atom[];
    const after = ring.atoms.slice(startIdx + 1).reverse() as Atom[];
    const ccwAtoms = [atom, ...after, ...before] as Atom[];

    if (ccwAtoms[0]?.symbol === "N") {
      const carbonylPos = ccwAtoms.findIndex((a) => a.id === carbonylCarbonId);
      if (carbonylPos === 1) {
        const ringAtomSet = new Set(ccwAtoms.map((a) => a.id));
        const locants: number[] = [];
        for (let i = 0; i < ccwAtoms.length; i++) {
          const subs = countNonRingSubstituents(
            ccwAtoms[i]!,
            ringAtomSet,
            molecule,
          );
          for (let j = 0; j < subs; j++) {
            locants.push(i + 1);
          }
        }
        locants.sort((a, b) => a - b);
        candidates.push({ atoms: ccwAtoms, locants });
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (compareLocantSets(candidate.locants, best.locants) < 0) {
      best = candidate;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectAndNumberLactam] 6-membered single-N lactam: selected arrangement with locants ${JSON.stringify(best.locants)}`,
    );
  }

  return { atoms: best.atoms, start: 1 };
}

function handleSixMemberedDualNitrogenLactam(
  ring: RingSystem,
  carbonylCarbonId: number,
  molecule: Molecule,
): { atoms: Atom[]; start: number } | null {
  const candidates: Array<{ atoms: Atom[]; locants: number[] }> = [];
  const nitrogenIndices = ring.atoms
    .map((a, i) => (a.symbol === "N" ? i : -1))
    .filter((i) => i >= 0);

  if (nitrogenIndices.length !== 2) {
    return null;
  }

  if (process.env.VERBOSE) {
    console.log(
      "[handleSixMemberedDualNitrogenLactam] Ring atoms:",
      ring.atoms.map((a, i) => `${i}:${a.symbol}(id=${a.id})`),
    );
    console.log(
      "[handleSixMemberedDualNitrogenLactam] Nitrogen indices:",
      nitrogenIndices,
    );
    console.log(
      "[handleSixMemberedDualNitrogenLactam] Carbonyl carbon ID:",
      carbonylCarbonId,
    );
  }

  for (const startIdx of nitrogenIndices) {
    const cwAtoms = [
      ...ring.atoms.slice(startIdx),
      ...ring.atoms.slice(0, startIdx),
    ] as Atom[];

    if (process.env.VERBOSE) {
      console.log(
        `[handleSixMemberedDualNitrogenLactam] CW from startIdx=${startIdx}:`,
        cwAtoms.map((a, i) => `${i}:${a.symbol}(id=${a.id})`),
      );
    }

    if (cwAtoms[0]?.symbol === "N") {
      const carbonylPos = cwAtoms.findIndex((a) => a.id === carbonylCarbonId);
      if (process.env.VERBOSE) {
        console.log(
          `[handleSixMemberedDualNitrogenLactam] CW carbonylPos=${carbonylPos}`,
        );
      }
      if (carbonylPos === 1) {
        const ringAtomSet = new Set(cwAtoms.map((a) => a.id));
        const locants: number[] = [];
        for (let i = 0; i < cwAtoms.length; i++) {
          const subs = countNonRingSubstituents(
            cwAtoms[i]!,
            ringAtomSet,
            molecule,
          );
          for (let j = 0; j < subs; j++) {
            locants.push(i + 1);
          }
        }
        locants.sort((a, b) => a - b);
        if (process.env.VERBOSE) {
          console.log(
            `[handleSixMemberedDualNitrogenLactam] Added CW candidate with locants:`,
            locants,
          );
        }
        candidates.push({ atoms: cwAtoms, locants });
      }
    }

    const atom = ring.atoms[startIdx]!;
    const before = ring.atoms.slice(0, startIdx).reverse() as Atom[];
    const after = ring.atoms.slice(startIdx + 1) as Atom[];
    const ccwAtoms = [atom, ...before, ...after.reverse()] as Atom[];

    if (process.env.VERBOSE) {
      console.log(
        `[handleSixMemberedDualNitrogenLactam] CCW from startIdx=${startIdx}:`,
        ccwAtoms.map((a, i) => `${i}:${a.symbol}(id=${a.id})`),
      );
    }

    if (ccwAtoms[0]?.symbol === "N") {
      const carbonylPos = ccwAtoms.findIndex((a) => a.id === carbonylCarbonId);
      if (process.env.VERBOSE) {
        console.log(
          `[handleSixMemberedDualNitrogenLactam] CCW carbonylPos=${carbonylPos}`,
        );
      }
      if (carbonylPos === 1) {
        const ringAtomSet = new Set(ccwAtoms.map((a) => a.id));
        const locants: number[] = [];
        for (let i = 0; i < ccwAtoms.length; i++) {
          const subs = countNonRingSubstituents(
            ccwAtoms[i]!,
            ringAtomSet,
            molecule,
          );
          for (let j = 0; j < subs; j++) {
            locants.push(i + 1);
          }
        }
        locants.sort((a, b) => a - b);
        if (process.env.VERBOSE) {
          console.log(
            `[handleSixMemberedDualNitrogenLactam] Added CCW candidate with locants:`,
            locants,
          );
        }
        candidates.push({ atoms: ccwAtoms, locants });
      }
    }
  }

  if (candidates.length === 0) {
    if (process.env.VERBOSE) {
      console.log("[handleSixMemberedDualNitrogenLactam] No candidates found!");
    }
    return null;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[handleSixMemberedDualNitrogenLactam] Total candidates: ${candidates.length}`,
    );
    candidates.forEach((c, i) => {
      console.log(
        `  Candidate ${i}: locants=${JSON.stringify(c.locants)}, atoms=${c.atoms.map((a) => `${a.symbol}${a.id}`).join(",")}`,
      );
    });
  }

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (compareLocantSets(candidate.locants, best.locants) < 0) {
      best = candidate;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectAndNumberLactam] 6-membered dual-N lactam: selected arrangement with locants ${JSON.stringify(best.locants)}`,
    );
  }

  return { atoms: best.atoms, start: 1 };
}

export function findRingStartingPosition(
  ring: RingSystem,
  molecule?: Molecule,
  functionalGroups?: FunctionalGroup[],
): number {
  // Find all heteroatoms in the ring
  const heteroatomIndices: number[] = [];
  for (let i = 0; i < ring.atoms.length; i++) {
    const atom = ring.atoms[i]!;
    if (atom.symbol !== "C") {
      heteroatomIndices.push(i);
    }
  }

  // If multiple heteroatoms, first check for named heterocycles with canonical numbering
  if (heteroatomIndices.length > 1 && molecule) {
    // Special case: Five-membered heterocycles with 2 heteroatoms (thiazoline, oxazoline, imidazoline)
    const fiveMemberedArrangement = detectAndNumberFiveMemberedHeterocycle(
      ring,
      heteroatomIndices,
      molecule,
    );
    if (fiveMemberedArrangement) {
      const oldAtoms = ring.atoms.map((a: Atom) => a.id);
      ring.atoms = fiveMemberedArrangement.atoms;
      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] BEFORE five-membered heterocycle numbering: ring.atoms = [${oldAtoms.join(", ")}]`,
        );
        console.log(
          `[findRingStartingPosition] AFTER five-membered heterocycle numbering: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
        );
        console.log(
          `[Ring Numbering] Applied canonical five-membered heterocycle numbering: [${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}]`,
        );
      }
      return fiveMemberedArrangement.start;
    }

    // Special case: Triazines have fixed numbering (1,2,4-triazine, etc.)
    const triazineArrangement = detectAndNumberTriazine(
      ring,
      heteroatomIndices,
    );
    if (triazineArrangement) {
      const oldAtoms = ring.atoms.map((a: Atom) => a.id);
      ring.atoms = triazineArrangement.atoms;
      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] BEFORE triazine numbering: ring.atoms = [${oldAtoms.join(", ")}]`,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[findRingStartingPosition] AFTER triazine numbering: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
          );
        }
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Applied canonical 1,2,4-triazine numbering: [${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
      }
      return triazineArrangement.start;
    }

    // Special case: Lactams (cyclic amides) - check for 6-membered dual-nitrogen lactams
    if (molecule) {
      const lactamArrangement = detectAndNumberLactam(ring, molecule);
      if (lactamArrangement) {
        const oldAtoms = ring.atoms.map((a: Atom) => a.id);
        ring.atoms = lactamArrangement.atoms;
        if (process.env.VERBOSE) {
          console.log(
            `[findRingStartingPosition] BEFORE lactam numbering: ring.atoms = [${oldAtoms.join(", ")}]`,
          );
          console.log(
            `[findRingStartingPosition] AFTER lactam numbering: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
          );
          console.log(
            `[Ring Numbering] Applied lactam numbering: [${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}]`,
          );
        }
        return lactamArrangement.start;
      }
    }

    // Special case: 3-membered rings with multiple heteroatoms (e.g., diaziridine: N-N-C)
    // For diaziridines, the two nitrogens should be at positions 1 and 2, carbon at position 3
    if (ring.atoms.length === 3 && heteroatomIndices.length === 2) {
      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] 3-membered ring with 2 heteroatoms detected: [${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}]`,
        );
      }

      // Find the carbon atom (position 3)
      let carbonIndex = -1;
      for (let i = 0; i < ring.atoms.length; i++) {
        if (ring.atoms[i]!.symbol === "C") {
          carbonIndex = i;
          break;
        }
      }

      if (carbonIndex >= 0) {
        // Reorder: [hetero1, hetero2, carbon]
        const firstHeteroIdx = heteroatomIndices[0]!;
        const secondHeteroIdx = heteroatomIndices[1]!;
        const hetero1 = ring.atoms[firstHeteroIdx]!;
        const hetero2 = ring.atoms[secondHeteroIdx]!;
        const carbon = ring.atoms[carbonIndex]!;

        // Arrange as [hetero1, hetero2, carbon]
        ring.atoms = [hetero1, hetero2, carbon] as Atom[];

        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] 3-membered ring with 2 heteroatoms: reordered to [${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}] (positions 1, 2, 3)`,
          );
        }

        return 1;
      }
    }

    // General case: find arrangement that gives lowest heteroatom locants
    let bestArrangement: { atoms: Atom[]; start: number } | null = null;
    let bestHeteroatomLocants: number[] = [];

    // Try each heteroatom as starting position, both clockwise and counterclockwise
    for (const startIdx of heteroatomIndices) {
      // Try clockwise from this heteroatom
      const cwAtoms = [
        ...ring.atoms.slice(startIdx),
        ...ring.atoms.slice(0, startIdx),
      ] as Atom[];
      const cwHeteroLocants = heteroatomIndices
        .map((idx) => {
          const offset =
            (idx - startIdx + ring.atoms.length) % ring.atoms.length;
          return offset + 1; // 1-based locant
        })
        .sort((a, b) => a - b);

      // Try counterclockwise from this heteroatom
      const heteroAtom = ring.atoms[startIdx]!;
      const before = ring.atoms.slice(0, startIdx).reverse() as Atom[];
      const after = ring.atoms.slice(startIdx + 1).reverse() as Atom[];
      const ccwAtoms = [heteroAtom, ...after, ...before] as Atom[];
      const ccwHeteroLocants = heteroatomIndices
        .map((idx) => {
          // Find where this heteroatom ended up in the new arrangement
          const atom = ring.atoms[idx];
          if (!atom) return -1;
          const atomId = atom.id;
          const newIdx = ccwAtoms.findIndex((a) => a.id === atomId);
          return newIdx + 1; // 1-based locant
        })
        .filter((locant) => locant > 0)
        .sort((a, b) => a - b);

      // Compare with current best
      if (
        !bestArrangement ||
        compareLocantSets(cwHeteroLocants, bestHeteroatomLocants) < 0
      ) {
        bestArrangement = { atoms: cwAtoms, start: 1 };
        bestHeteroatomLocants = cwHeteroLocants;
      }

      if (compareLocantSets(ccwHeteroLocants, bestHeteroatomLocants) < 0) {
        bestArrangement = { atoms: ccwAtoms, start: 1 };
        bestHeteroatomLocants = ccwHeteroLocants;
      }
    }

    if (bestArrangement) {
      const oldAtoms = ring.atoms.map((a: Atom) => a.id);
      ring.atoms = bestArrangement.atoms;
      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] BEFORE mutation: ring.atoms = [${oldAtoms.join(", ")}]`,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[findRingStartingPosition] AFTER mutation: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
          );
        }
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Multiple heteroatoms - reordered to [${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}] for lowest heteroatom locants [${bestHeteroatomLocants.join(", ")}]`,
          );
        }
      }

      // NOTE: We already optimized for lowest heteroatom locants above.
      // The Blue Book rule for multiple heteroatoms (P-14.3.5) states that heteroatoms
      // should get the lowest locants, which we've already done.
      // Substituent-based optimization should NOT override this, as heteroatom locants
      // have higher priority than substituent locants.
      // Therefore, we do NOT call findOptimalRingNumberingFromHeteroatom here.

      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] About to return 1, ring.atoms is now: [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
        );
      }
      return 1;
    }
  }

  // Single heteroatom or no heteroatoms - use original logic
  let heteroatomIndex = -1;
  for (let i = 0; i < ring.atoms.length; i++) {
    const atom = ring.atoms[i]!;
    if (atom.symbol !== "C") {
      heteroatomIndex = i;
      break;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[findRingStartingPosition] Single heteroatom check: heteroatomIndex=${heteroatomIndex}, ring.atoms.length=${ring.atoms.length}, ring.atoms=[${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}]`,
    );
  }

  if (heteroatomIndex >= 0 && molecule) {
    // Special case: Lactams (cyclic amides) - check for 5- and 6-membered single-nitrogen lactams
    const lactamArrangement = detectAndNumberLactam(ring, molecule);
    if (lactamArrangement) {
      const oldAtoms = ring.atoms.map((a: Atom) => a.id);
      ring.atoms = lactamArrangement.atoms;
      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] BEFORE lactam numbering: ring.atoms = [${oldAtoms.join(", ")}]`,
        );
        console.log(
          `[findRingStartingPosition] AFTER lactam numbering: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
        );
        console.log(
          `[Ring Numbering] Applied lactam numbering: [${ring.atoms.map((a: Atom) => `${a.id}:${a.symbol}`).join(", ")}]`,
        );
      }
      return lactamArrangement.start;
    }

    // Special case: For 3-membered rings with one heteroatom
    // IUPAC rules place the heteroatom at position 1 (lowest locant)
    // This applies to azirines, oxiranes, etc.
    if (ring.atoms.length === 3) {
      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] 3-membered ring detected with heteroatom at index ${heteroatomIndex}`,
        );
      }
      // Reorder so heteroatom is FIRST (position 1)
      if (heteroatomIndex === 1) {
        // Heteroatom is in middle, rotate to make it first
        ring.atoms = [ring.atoms[1]!, ring.atoms[2]!, ring.atoms[0]!] as Atom[];
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] 3-membered ring: rotated to place heteroatom at position 1: [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
          );
        }
      } else if (heteroatomIndex === 2) {
        // Heteroatom is last, rotate to make it first
        ring.atoms = [ring.atoms[2]!, ring.atoms[0]!, ring.atoms[1]!] as Atom[];
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] 3-membered ring: rotated to place heteroatom at position 1: [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
          );
        }
      }
      // If heteroatomIndex === 0, it's already at position 1

      // Now determine direction (CW or CCW) based on double bonds and substituents
      // Position 1 is ring.atoms[0] (heteroatom), position 2 is ring.atoms[1], position 3 is ring.atoms[2]
      const heteroAtom = ring.atoms[0]!; // Heteroatom at position 1
      const pos2Atom = ring.atoms[1]!;
      const pos3Atom = ring.atoms[2]!;

      // For azirines: check if there's a C=N double bond to determine numbering direction
      // The double bond should have the lowest possible locants (e.g., 2-3 for 2H-azirine)
      let hasDoubleAt2_3 = false;
      let hasDoubleAt1_2 = false;
      let hasDoubleAt1_3 = false;

      for (const bond of molecule.bonds) {
        if (bond.type === "double") {
          if (
            (bond.atom1 === pos2Atom.id && bond.atom2 === pos3Atom.id) ||
            (bond.atom2 === pos2Atom.id && bond.atom1 === pos3Atom.id)
          ) {
            hasDoubleAt2_3 = true;
          }
          if (
            (bond.atom1 === heteroAtom.id && bond.atom2 === pos2Atom.id) ||
            (bond.atom2 === heteroAtom.id && bond.atom1 === pos2Atom.id)
          ) {
            hasDoubleAt1_2 = true;
          }
          if (
            (bond.atom1 === heteroAtom.id && bond.atom2 === pos3Atom.id) ||
            (bond.atom2 === heteroAtom.id && bond.atom1 === pos3Atom.id)
          ) {
            hasDoubleAt1_3 = true;
          }
        }
      }

      // If we need to reverse to get the double bond at 2-3 instead of 1-2, do it
      // But for now, let's check substituent positions to determine direction
      // Count substituents at each carbon position (excluding heteroatom)
      const ringAtomIds = new Set(ring.atoms.map((a) => a.id));
      let pos2SubCount = 0;
      let pos3SubCount = 0;

      for (const bond of molecule.bonds) {
        if (bond.atom1 === pos2Atom.id && !ringAtomIds.has(bond.atom2)) {
          pos2SubCount++;
        } else if (bond.atom2 === pos2Atom.id && !ringAtomIds.has(bond.atom1)) {
          pos2SubCount++;
        } else if (bond.atom1 === pos3Atom.id && !ringAtomIds.has(bond.atom2)) {
          pos3SubCount++;
        } else if (bond.atom2 === pos3Atom.id && !ringAtomIds.has(bond.atom1)) {
          pos3SubCount++;
        }
      }

      // If position 2 has more substituents than position 3, we might need to reverse
      // to give the substituted carbon the lower locant (position 2 vs position 3)
      // However, for azirines, we want the imine carbon at position 2
      // So we should reverse if the double bond is at 1-2 or 1-3 instead of 2-3
      if ((hasDoubleAt1_2 || hasDoubleAt1_3) && !hasDoubleAt2_3) {
        // Reverse to move double bond to 2-3 position
        ring.atoms = [heteroAtom, pos3Atom, pos2Atom] as Atom[];
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] 3-membered ring: reversed to place double bond at positions 2-3: [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
          );
        }
      } else if (
        !hasDoubleAt2_3 &&
        !hasDoubleAt1_2 &&
        !hasDoubleAt1_3 &&
        pos2SubCount < pos3SubCount
      ) {
        // For saturated 3-membered rings (e.g., oxirane), reverse if position 3 has MORE substituents
        // IUPAC Rule: Give substituents the lowest locants (lexicographical order)
        // If pos3 has more substituents, reversing places them at position 2 instead
        // This gives a lower locant set: e.g., 2,2,3 instead of 2,3,3
        ring.atoms = [heteroAtom, pos3Atom, pos2Atom] as Atom[];
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] 3-membered ring: reversed to minimize substituent locants (pos2: ${pos2SubCount} subs, pos3: ${pos3SubCount} subs): [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
          );
        }
      }

      return 1; // Start numbering from position 1
    }

    // For larger rings, use the standard heteroatom-first numbering
    // Found heteroatom - now determine best numbering direction
    const result = findOptimalRingNumberingFromHeteroatom(
      ring,
      molecule,
      heteroatomIndex,
      functionalGroups,
    );

    // If result is negative, it means we need to reverse the ring (counterclockwise)
    if (result < 0) {
      // Reverse the ring atoms for counterclockwise numbering
      // For original ring [a, b, c, d, e] with heteroatom at index 4 (atom e):
      // - Clockwise from e: e → a → b → c → d
      // - Counterclockwise from e: e → d → c → b → a
      // So we need: [e, ...atoms_before_e_reversed, ...atoms_after_e_reversed]
      // atoms_before_e = [a,b,c,d] → reversed = [d,c,b,a]
      // atoms_after_e = [] → reversed = []
      // Result: [e, d, c, b, a]
      if (process.env.VERBOSE) {
        console.log(
          `[Ring Numbering] BEFORE reversal: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}], heteroatomIndex = ${heteroatomIndex}`,
        );
      }
      const heteroAtom = ring.atoms[heteroatomIndex]!;

      // To go counterclockwise, we reverse the entire ring and put heteroatom first
      // Original ring order represents clockwise connectivity
      // Reversing gives counterclockwise connectivity
      const allOtherAtoms = [
        ...ring.atoms.slice(0, heteroatomIndex),
        ...ring.atoms.slice(heteroatomIndex + 1),
      ].reverse() as Atom[];

      const newAtoms = [heteroAtom, ...allOtherAtoms];

      if (process.env.VERBOSE) {
        console.log(
          `[Ring Numbering] AFTER reversal calculation: newAtoms = [${newAtoms.map((a: Atom) => a.id).join(", ")}]`,
        );
      }
      ring.atoms = newAtoms;
      if (process.env.VERBOSE) {
        console.log(
          `[Ring Numbering] AFTER assignment: ring.atoms = [${ring.atoms.map((a: Atom) => a.id).join(", ")}]`,
        );
      }
      return 1; // Heteroatom is now at position 1
    }

    if (result > 0) {
      return result;
    }
    return heteroatomIndex + 1; // 1-based indexing
  } else if (heteroatomIndex >= 0) {
    return heteroatomIndex + 1; // 1-based indexing
  }

  // Handle unsaturation (double/triple bonds) if present
  // IUPAC Rule: Unsaturation gets lowest locants, then substituents get lowest locants
  const unsaturatedBonds: { bond: Bond; pos1: number; pos2: number }[] = [];
  for (const bond of ring.bonds) {
    if (bond.type === "double" || bond.type === "triple") {
      // Find ring positions for this bond
      const pos1 = ring.atoms.findIndex((a) => a.id === bond.atom1);
      const pos2 = ring.atoms.findIndex((a) => a.id === bond.atom2);
      if (pos1 >= 0 && pos2 >= 0) {
        unsaturatedBonds.push({ bond, pos1, pos2 });
      }
    }
  }

  if (unsaturatedBonds.length > 0 && molecule) {
    // For each unsaturated bond, try numbering schemes where it gets lowest locants
    // Valid schemes: bond at positions (1,2) or (2,3)
    let bestStart = 0;
    let bestLocants: number[] = [];

    for (const { pos1, pos2 } of unsaturatedBonds) {
      // Ensure pos1 < pos2 for consistent processing
      const [minPos, maxPos] = pos1 < pos2 ? [pos1, pos2] : [pos2, pos1];

      // Check if adjacent positions (required for valid ring bond)
      const isAdjacent =
        maxPos - minPos === 1 ||
        (minPos === 0 && maxPos === ring.atoms.length - 1);

      if (!isAdjacent) {
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] WARNING: Double bond at positions ${minPos},${maxPos} is not adjacent`,
          );
        }
        continue;
      }

      // Try both CW and CCW to give the bond positions (1,2) or (2,3)
      const candidates: Array<{ start: number; direction: number }> = [];

      // Scheme 1: Bond at positions (1,2) - CW from minPos
      candidates.push({ start: minPos, direction: 1 });

      // Scheme 2: Bond at positions (1,2) - CCW from maxPos
      candidates.push({ start: maxPos, direction: -1 });

      // Scheme 3: Bond at positions (2,3) - CW from position before minPos
      const beforeMin = (minPos - 1 + ring.atoms.length) % ring.atoms.length;
      candidates.push({ start: beforeMin, direction: 1 });

      // Scheme 4: Bond at positions (2,3) - CCW from position after maxPos
      const afterMax = (maxPos + 1) % ring.atoms.length;
      candidates.push({ start: afterMax, direction: -1 });

      // Evaluate each candidate
      for (const { start, direction } of candidates) {
        const substituentLocants: number[] = [];

        // Count substituents at each position (excluding functional groups)
        const ringAtomIds = new Set<number>(ring.atoms.map((a) => a.id));
        const functionalGroupAtomIds = new Set<number>();
        if (functionalGroups) {
          for (const fg of functionalGroups) {
            if (fg.atoms) {
              for (const fgAtom of fg.atoms) {
                const atomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;
                functionalGroupAtomIds.add(atomId);
              }
            }
          }
        }

        for (let i = 0; i < ring.atoms.length; i++) {
          const ringAtom = ring.atoms[i];
          if (!ringAtom) continue;

          // Find non-ring substituents
          const bonds = molecule.bonds.filter(
            (b: Bond) => b.atom1 === ringAtom.id || b.atom2 === ringAtom.id,
          );

          for (const b of bonds) {
            const otherAtomId = b.atom1 === ringAtom.id ? b.atom2 : b.atom1;
            if (
              !ringAtomIds.has(otherAtomId) &&
              !functionalGroupAtomIds.has(otherAtomId)
            ) {
              const substituentAtom = molecule.atoms[otherAtomId];
              if (substituentAtom && substituentAtom.symbol !== "H") {
                // Calculate locant for this position
                let locant: number;
                if (direction === 1) {
                  locant =
                    ((i - start + ring.atoms.length) % ring.atoms.length) + 1;
                } else {
                  locant =
                    ((start - i + ring.atoms.length) % ring.atoms.length) + 1;
                }
                substituentLocants.push(locant);
              }
            }
          }
        }

        substituentLocants.sort((a, b) => a - b);
        const directionStr = direction === 1 ? "CW" : "CCW";
        if (process.env.VERBOSE) {
          console.log(
            `[Ring Numbering] Unsaturation scheme: start=${start + 1} ${directionStr}, substituent locants=[${substituentLocants.join(", ")}]`,
          );
        }

        // Compare with best so far
        if (
          bestLocants.length === 0 ||
          compareLocantSets(substituentLocants, bestLocants) < 0
        ) {
          bestLocants = substituentLocants;
          bestStart = direction === 1 ? start + 1 : -(start + 1);
          if (process.env.VERBOSE) {
            console.log(
              `[Ring Numbering] New best for unsaturation! Start at ${Math.abs(bestStart)} (${directionStr})`,
            );
          }
        }
      }
    }

    if (bestStart !== 0) {
      return bestStart;
    }
  }

  // If molecule is provided, find the numbering that gives lowest locant set for substituents
  if (molecule) {
    const optimalStart = findOptimalRingNumbering(
      ring,
      molecule,
      functionalGroups,
    );
    if (optimalStart !== 0) {
      return optimalStart; // Can be positive (CW) or negative (CCW)
    }
  }

  // Default: start at position 1
  return 1;
}

export function adjustRingLocants(
  locants: number[],
  _startingPosition: number,
): number[] {
  // After reorderRingAtoms(), the atoms array is already in the correct order
  // where atoms[0] corresponds to the starting position (e.g., heteroatom).
  // Therefore, locants should just be [1, 2, 3, 4, ...] to match the positions.
  // The old logic tried to rotate locants, but that's wrong because the atoms
  // are already reordered.
  return locants.map((_, i) => i + 1);
}

export function reorderRingAtoms(
  atoms: Atom[],
  startingPosition: number,
): Atom[] {
  if (Math.abs(startingPosition) === 1 && startingPosition > 0) {
    // Already starting at position 1 clockwise
    return atoms;
  }

  // Convert to 0-based index
  const startIndex = Math.abs(startingPosition) - 1;
  const isCounterClockwise = startingPosition < 0;

  // Rotate the array so that startIndex becomes index 0
  let reordered = [...atoms.slice(startIndex), ...atoms.slice(0, startIndex)];

  // If counter-clockwise, reverse the order (except the first element)
  if (isCounterClockwise) {
    const first = reordered[0]!;
    const rest = reordered.slice(1).reverse() as Atom[];
    reordered = [first, ...rest];
  }

  if (process.env.VERBOSE) {
    console.log(
      `[Ring Reordering] Original atom IDs: [${atoms.map((a: Atom) => a.id).join(", ")}]`,
    );
  }
  if (process.env.VERBOSE) {
    console.log(
      `[Ring Reordering] Reordered atom IDs: [${reordered.map((a: Atom) => a.id).join(", ")}] (starting from position ${Math.abs(startingPosition)}, ${isCounterClockwise ? "CCW" : "CW"})`,
    );
  }

  return reordered;
}

export function assignLowestAvailableLocant(
  usedLocants: number[],
  preferredLocant: number,
  index: number,
): number {
  let locant = preferredLocant;
  let counter = 1;

  // Find lowest available locant
  while (
    usedLocants.includes(locant) ||
    (locant === preferredLocant && counter <= index + 1)
  ) {
    locant++;
    counter++;
  }

  return locant;
}

export function isPrincipalGroup(group: FunctionalGroup): boolean {
  return group.isPrincipal || group.priority <= 5; // Top priority groups
}

export function assignSubstituentLocants(
  group: FunctionalGroup,
  parentStructure: ParentStructure,
  molecule: Molecule,
  _index: number,
): number[] {
  // Convert atom IDs in group.locants to chain positions
  if (group.locants && group.locants.length > 0) {
    const convertedLocants: number[] = [];

    for (const atomIdOrLocant of group.locants) {
      // Try to find this atom in the parent chain/ring
      let chainPosition = -1;

      if (parentStructure.type === "chain" && parentStructure.chain) {
        const chain = parentStructure.chain;
        chainPosition = chain.atoms.findIndex(
          (a: Atom) => a.id === atomIdOrLocant,
        );

        if (chainPosition !== -1) {
          // Found the atom in chain, convert to locant
          const locant = parentStructure.locants[chainPosition];
          if (locant !== undefined) {
            convertedLocants.push(locant);
            continue;
          }
        }

        // Atom not in chain - it's a substituent attached to the chain
        // Find which chain atom this substituent is bonded to
        const chainAtomIds = new Set(chain.atoms.map((a: Atom) => a.id));
        for (const bond of molecule.bonds) {
          const atom1InChain = chainAtomIds.has(bond.atom1);
          const atom2InChain = chainAtomIds.has(bond.atom2);

          // Check if this bond connects the substituent atom to a chain atom
          if (bond.atom1 === atomIdOrLocant && atom2InChain) {
            // Substituent is atom1, chain atom is atom2
            const chainAtomPosition = chain.atoms.findIndex(
              (a: Atom) => a.id === bond.atom2,
            );
            if (chainAtomPosition !== -1) {
              const locant = parentStructure.locants[chainAtomPosition];
              if (locant !== undefined) {
                convertedLocants.push(locant);
                break;
              }
            }
          } else if (bond.atom2 === atomIdOrLocant && atom1InChain) {
            // Substituent is atom2, chain atom is atom1
            const chainAtomPosition = chain.atoms.findIndex(
              (a: Atom) => a.id === bond.atom1,
            );
            if (chainAtomPosition !== -1) {
              const locant = parentStructure.locants[chainAtomPosition];
              if (locant !== undefined) {
                convertedLocants.push(locant);
                break;
              }
            }
          }
        }

        // If we found a locant via bond, continue to next atomIdOrLocant
        if (convertedLocants.length > 0) {
          continue;
        }
      } else if (parentStructure.type === "ring" && parentStructure.ring) {
        const ring = parentStructure.ring;
        chainPosition = ring.atoms.findIndex(
          (a: Atom) => a.id === atomIdOrLocant,
        );

        if (chainPosition !== -1) {
          // Found the atom in ring, convert to locant
          const locant = parentStructure.locants[chainPosition];
          if (locant !== undefined) {
            convertedLocants.push(locant);
            continue;
          }
        }

        // Atom not in ring - it's a substituent attached to the ring
        // Find which ring atom this substituent is bonded to
        const ringAtomIds = new Set(ring.atoms.map((a: Atom) => a.id));
        for (const bond of molecule.bonds) {
          const atom1InRing = ringAtomIds.has(bond.atom1);
          const atom2InRing = ringAtomIds.has(bond.atom2);

          // Check if this bond connects the substituent atom to a ring atom
          if (bond.atom1 === atomIdOrLocant && atom2InRing) {
            // Substituent is atom1, ring atom is atom2
            const ringAtomPosition = ring.atoms.findIndex(
              (a: Atom) => a.id === bond.atom2,
            );
            if (ringAtomPosition !== -1) {
              const locant = parentStructure.locants[ringAtomPosition];
              if (locant !== undefined) {
                convertedLocants.push(locant);
                break;
              }
            }
          } else if (bond.atom2 === atomIdOrLocant && atom1InRing) {
            // Substituent is atom2, ring atom is atom1
            const ringAtomPosition = ring.atoms.findIndex(
              (a: Atom) => a.id === bond.atom1,
            );
            if (ringAtomPosition !== -1) {
              const locant = parentStructure.locants[ringAtomPosition];
              if (locant !== undefined) {
                convertedLocants.push(locant);
                break;
              }
            }
          }
        }

        // If we found a locant via bond, continue to next atomIdOrLocant
        if (convertedLocants.length > 0) {
          continue;
        }
      }

      // If we couldn't find the atom, assume it's already a valid locant
      if (atomIdOrLocant > 0) {
        convertedLocants.push(atomIdOrLocant);
      }
    }

    if (convertedLocants.length > 0) {
      return convertedLocants;
    }
  }

  // Fallback: assign consecutive locants
  const usedLocants = parentStructure.locants || [];
  const locants: number[] = [];

  for (let i = 0; i < (group.locants?.length || 1); i++) {
    let locant = i + 1;
    let attempts = 0;

    // Find available locant
    while (usedLocants.includes(locant) && attempts < 100) {
      locant++;
      attempts++;
    }

    locants.push(locant);
  }

  return locants;
}

export function validateNumbering(
  parentStructure: ParentStructure,
  functionalGroups: FunctionalGroup[],
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicate locants
  const allLocants = [
    ...parentStructure.locants,
    ...functionalGroups.flatMap((group) => group.locants || []),
  ];

  const duplicates = findDuplicates(allLocants);
  if (duplicates.length > 0) {
    errors.push(`Duplicate locants found: ${duplicates.join(", ")}`);
  }

  // Check locant range
  const maxLocant = Math.max(...allLocants.filter((n) => !isNaN(n)));
  const expectedMax = parentStructure.locants.length;

  if (maxLocant > expectedMax) {
    errors.push(
      `Locant ${maxLocant} exceeds parent structure size (${expectedMax})`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function findDuplicates(arr: number[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.add(item);
    }
    seen.add(item);
  }

  return Array.from(duplicates);
}
