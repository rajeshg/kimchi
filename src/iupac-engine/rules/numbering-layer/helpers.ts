import type { ParentStructure, FunctionalGroup } from "../../types";
import type { Atom } from "types";

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
    const mappedLocants = (group.locants || []).map((val: number) => {
      // If this value matches an atom id, map to locant, otherwise leave as-is
      return atomIndexToLocant.has(val) ? atomIndexToLocant.get(val)! : val;
    });

    return { ...group, locants: mappedLocants };
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
      console.log(
        "[getPrincipalGroupLocant] functionalGroupAtom type:",
        typeof functionalGroupAtom,
      );
      console.log(
        "[getPrincipalGroupLocant] functionalGroupAtom.id:",
        (functionalGroupAtom as any).id,
      );
      console.log(
        "[getPrincipalGroupLocant] chain.atoms:",
        chain.atoms.map((a: Atom) => a.id),
      );
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
      console.log(
        "[getPrincipalGroupLocant] positionInChain:",
        positionInChain,
      );
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
      console.log(
        "[getPrincipalGroupLocantFromSet] chain atoms:",
        chain.atoms.map((a: Atom) => a.id),
      );
      console.log("[getPrincipalGroupLocantFromSet] locantSet:", locantSet);
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

    // parentStructure.ring should have the atoms in numbered order
    const ring = parentStructure.ring;
    if (ring && ring.atoms) {
      const positionInRing = ring.atoms.findIndex(
        (atom: Atom) => atom.id === atomId,
      );
      if (positionInRing !== -1 && positionInRing < locantSet.length) {
        return locantSet[positionInRing]!;
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

export function generateRingLocants(ring: any): number[] {
  // Generate locants for ring atoms
  const locants: number[] = [];
  for (let i = 0; i < ring.atoms.length; i++) {
    locants.push(i + 1); // 1-based indexing
  }
  return locants;
}

export function findOptimalRingNumbering(
  ring: any,
  molecule: any,
  functionalGroups?: any[],
): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return 1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return 1;
  }

  console.log(
    `[Ring Numbering] Functional groups available:`,
    functionalGroups
      ?.map((g) => `${g.type} at atoms [${g.atoms?.join(",")}]`)
      .join(", ") || "none",
  );

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: any) => a.id));

  // Identify which ring positions have principal functional groups
  const principalGroupPositions = new Set<number>();
  if (functionalGroups && functionalGroups.length > 0) {
    // Find principal functional groups (alcohol, ketone, aldehyde, etc.)
    const principalGroups = functionalGroups.filter(
      (g: any) =>
        g.isPrincipal ||
        g.priority <= 5 ||
        g.type === "alcohol" ||
        g.type === "ketone" ||
        g.type === "aldehyde",
    );

    console.log(
      `[Ring Numbering] Principal groups found:`,
      principalGroups.map(
        (g) =>
          `${g.type}(isPrincipal:${g.isPrincipal}, priority:${g.priority})`,
      ),
    );

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
              console.log(
                `[Ring Numbering] Principal group ${group.type} is ring atom at position ${i} (atom ${groupAtomId})`,
              );
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
              (bond: any) =>
                bond.atom1 === groupAtomId || bond.atom2 === groupAtomId,
            );

            for (const bond of bonds) {
              const otherAtomId =
                bond.atom1 === groupAtomId ? bond.atom2 : bond.atom1;
              // Check if the bonded atom is a ring atom
              for (let i = 0; i < ring.atoms.length; i++) {
                if (ring.atoms[i]?.id === otherAtomId) {
                  principalGroupPositions.add(i);
                  console.log(
                    `[Ring Numbering] Principal group ${group.type} attached to ring position ${i} (atom ${otherAtomId})`,
                  );
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

  console.log(
    `[Ring Numbering] Principal group positions:`,
    Array.from(principalGroupPositions).sort((a, b) => a - b),
  );

  // Count substituents at each ring position (not just which positions have substituents)
  const substituentCounts: number[] = new Array(ring.atoms.length).fill(0);

  for (let i = 0; i < ring.atoms.length; i++) {
    const ringAtom = ring.atoms[i];
    if (!ringAtom) continue;

    // Find bonds from this ring atom to non-ring atoms
    const bonds = molecule.bonds.filter(
      (bond: any) => bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id,
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
          console.log(
            `[Ring Numbering] Found substituent at ring position ${i} (atom ${ringAtom.id})`,
          );
        }
      }
    }
  }

  const totalSubstituents = substituentCounts.reduce(
    (sum, count) => sum + count,
    0,
  );
  console.log(
    `[Ring Numbering] Substituent counts: [${substituentCounts.join(", ")}], total: ${totalSubstituents}`,
  );

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
      console.log(
        `[Ring Numbering] Starting at position ${start} (${directionStr}): principal = [${principalLocants.join(", ")}], substituent = [${substituentLocants.join(", ")}], all = [${allLocants.join(", ")}]`,
      );

      // Compare with best so far
      // IUPAC Rule P-14.3: Principal groups receive lowest locants first, then all substituents
      if (bestLocants.length === 0) {
        // First candidate
        bestLocants = allLocants;
        bestPrincipalLocants = principalLocants;
        bestStart = direction === 1 ? start + 1 : -(start + 1); // 1-based, signed for direction
        console.log(
          `[Ring Numbering] New best! Start at ${Math.abs(bestStart)} (${directionStr})`,
        );
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
          console.log(
            `[Ring Numbering] New best${updateReason}! Start at ${Math.abs(bestStart)} (${directionStr})`,
          );
        }
      }
    }
  }

  console.log(
    `[Ring Numbering] Final decision: start at position ${Math.abs(bestStart)} (${bestStart > 0 ? "CW" : "CCW"}), locants = [${bestLocants.join(", ")}]`,
  );

  return bestStart;
}

export function findOptimalRingNumberingFromHeteroatom(
  ring: any,
  molecule: any,
  heteroatomIndex: number,
  functionalGroups?: any[],
): number {
  if (!ring || !ring.atoms || ring.atoms.length === 0) {
    return -1;
  }

  if (!molecule || !molecule.bonds || !molecule.atoms) {
    return -1;
  }

  // Build set of ring atom IDs
  const ringAtomIds = new Set<number>(ring.atoms.map((a: any) => a.id));

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
              (bond: any) => bond.atom1 === atomId || bond.atom2 === atomId,
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
    console.log(
      `[Heteroatom Ring Numbering] Functional group atom IDs to exclude: [${Array.from(functionalGroupAtomIds).join(", ")}]`,
    );
  }

  // Count substituents at each ring position (not just which atoms have substituents)
  const substituentCounts: number[] = new Array(ring.atoms.length).fill(0);

  for (let i = 0; i < ring.atoms.length; i++) {
    const ringAtom = ring.atoms[i];
    if (!ringAtom) continue;

    // Find bonds from this ring atom to non-ring atoms
    const bonds = molecule.bonds.filter(
      (bond: any) => bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id,
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
  // 2. Functional groups at lowest locants (HIGHEST PRIORITY for direction)
  // 3. Substituents at lowest locants (tiebreaker if functional group locants are equal)

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
      console.log(
        `[Heteroatom Ring Numbering] Direction 2 (CCW) functional group locants: [${fgLocants2.join(", ")}]`,
      );
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
    console.log(
      `[Heteroatom Ring Numbering] Direction 2 (counterclockwise) substituent locants: [${locants2.join(", ")}]`,
    );
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

export function findRingStartingPosition(
  ring: any,
  molecule?: any,
  functionalGroups?: any[],
): number {
  // Find all heteroatoms in the ring
  const heteroatomIndices: number[] = [];
  for (let i = 0; i < ring.atoms.length; i++) {
    const atom = ring.atoms[i];
    if (atom.symbol !== "C") {
      heteroatomIndices.push(i);
    }
  }

  // If multiple heteroatoms, find arrangement that gives lowest heteroatom locants
  if (heteroatomIndices.length > 1 && molecule) {
    let bestArrangement: { atoms: any[]; start: number } | null = null;
    let bestHeteroatomLocants: number[] = [];

    // Try each heteroatom as starting position, both clockwise and counterclockwise
    for (const startIdx of heteroatomIndices) {
      // Try clockwise from this heteroatom
      const cwAtoms = [
        ...ring.atoms.slice(startIdx),
        ...ring.atoms.slice(0, startIdx),
      ];
      const cwHeteroLocants = heteroatomIndices
        .map((idx) => {
          const offset =
            (idx - startIdx + ring.atoms.length) % ring.atoms.length;
          return offset + 1; // 1-based locant
        })
        .sort((a, b) => a - b);

      // Try counterclockwise from this heteroatom
      const heteroAtom = ring.atoms[startIdx];
      const before = ring.atoms.slice(0, startIdx).reverse();
      const after = ring.atoms.slice(startIdx + 1).reverse();
      const ccwAtoms = [heteroAtom, ...after, ...before];
      const ccwHeteroLocants = heteroatomIndices
        .map((idx) => {
          // Find where this heteroatom ended up in the new arrangement
          const atomId = ring.atoms[idx].id;
          const newIdx = ccwAtoms.findIndex((a: any) => a.id === atomId);
          return newIdx + 1; // 1-based locant
        })
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
      const oldAtoms = ring.atoms.map((a: any) => a.id);
      ring.atoms = bestArrangement.atoms;
      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] BEFORE mutation: ring.atoms = [${oldAtoms.join(", ")}]`,
        );
        console.log(
          `[findRingStartingPosition] AFTER mutation: ring.atoms = [${ring.atoms.map((a: any) => a.id).join(", ")}]`,
        );
        console.log(
          `[Ring Numbering] Multiple heteroatoms - reordered to [${ring.atoms.map((a: any) => `${a.id}:${a.symbol}`).join(", ")}] for lowest heteroatom locants [${bestHeteroatomLocants.join(", ")}]`,
        );
      }

      // NOTE: We already optimized for lowest heteroatom locants above.
      // The Blue Book rule for multiple heteroatoms (P-14.3.5) states that heteroatoms
      // should get the lowest locants, which we've already done.
      // Substituent-based optimization should NOT override this, as heteroatom locants
      // have higher priority than substituent locants.
      // Therefore, we do NOT call findOptimalRingNumberingFromHeteroatom here.

      if (process.env.VERBOSE) {
        console.log(
          `[findRingStartingPosition] About to return 1, ring.atoms is now: [${ring.atoms.map((a: any) => a.id).join(", ")}]`,
        );
      }
      return 1;
    }
  }

  // Single heteroatom or no heteroatoms - use original logic
  let heteroatomIndex = -1;
  for (let i = 0; i < ring.atoms.length; i++) {
    const atom = ring.atoms[i];
    if (atom.symbol !== "C") {
      heteroatomIndex = i;
      break;
    }
  }

  if (heteroatomIndex >= 0 && molecule) {
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
      // CCW from heteroatomIndex means: heteroatom, then previous atoms in reverse, then following atoms in reverse
      const heteroAtom = ring.atoms[heteroatomIndex];
      const before = ring.atoms.slice(0, heteroatomIndex).reverse(); // atoms before heteroatom, reversed
      const after = ring.atoms.slice(heteroatomIndex + 1).reverse(); // atoms after heteroatom, reversed
      ring.atoms = [heteroAtom, ...before, ...after];
      console.log(
        `[Ring Numbering] Reversed ring for counterclockwise numbering: [${ring.atoms.map((a: any) => a.id).join(", ")}]`,
      );
      return 1; // Heteroatom is now at position 1
    }

    if (result > 0) {
      return result;
    }
    return heteroatomIndex + 1; // 1-based indexing
  } else if (heteroatomIndex >= 0) {
    return heteroatomIndex + 1; // 1-based indexing
  }

  // Start at unsaturation if present
  for (let i = 0; i < ring.bonds.length; i++) {
    const bond = ring.bonds[i];
    if (bond.type === "double" || bond.type === "triple") {
      const atom1 = ring.atoms[bond.atom1];
      const atom2 = ring.atoms[bond.atom2];
      return Math.min(atom1.id, atom2.id) + 1;
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
  atoms: any[],
  startingPosition: number,
): any[] {
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
    const first = reordered[0];
    const rest = reordered.slice(1).reverse();
    reordered = [first, ...rest];
  }

  console.log(
    `[Ring Reordering] Original atom IDs: [${atoms.map((a: any) => a.id).join(", ")}]`,
  );
  console.log(
    `[Ring Reordering] Reordered atom IDs: [${reordered.map((a: any) => a.id).join(", ")}] (starting from position ${Math.abs(startingPosition)}, ${isCounterClockwise ? "CCW" : "CW"})`,
  );

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
  _index: number,
): number[] {
  // If the group already has valid locants assigned (e.g., from ring numbering), keep them
  if (
    group.locants &&
    group.locants.length > 0 &&
    group.locants.every((l: number) => l > 0)
  ) {
    return group.locants;
  }

  // Simple implementation - assign consecutive locants
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
