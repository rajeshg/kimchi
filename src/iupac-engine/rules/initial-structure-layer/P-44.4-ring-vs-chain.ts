import type { IUPACRule, StructuralSubstituent, RingSystem } from "../../types";
import { BLUE_BOOK_RULES, RulePriority, RingSystemType } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";
import type { Atom, Bond } from "types";
import type { NamingSubstituent } from "../../naming/iupac-types";
import {
  generateBaseCyclicName,
  findSubstituentsOnMonocyclicRing,
} from "../../naming/iupac-rings/index";
import { generateRingLocants } from "../ring-analysis-layer/helpers";
import { analyzeRings } from "../../../utils/ring-analysis";

/**
 * Helper: Create a filtered ringInfo containing only rings from the specified ring system
 * For fused systems, this includes ALL rings in the system (e.g., naphthalene has 2 rings)
 */
function createFilteredRingInfo(
  parentRing: RingSystem,
  fullRingInfo: ReturnType<typeof analyzeRings>,
) {
  const parentRingAtomIds = new Set(parentRing.atoms.map((a) => a.id));

  // For fused/bridged/spiro systems, the parentRing.rings property contains all SSSR rings in the system
  // At runtime, parentRing.rings is actually number[][], not Ring[] (due to type casting in detectRingSystems)
  if (parentRing.rings && parentRing.rings.length > 1) {
    // Multi-ring system (fused, bridged, or spiro)
    // Return ringInfo with all rings from this system
    const systemRings = parentRing.rings as unknown as number[][];
    const systemRingAtomSet = new Set<number>();

    for (const ring of systemRings) {
      for (const atomId of ring) {
        systemRingAtomSet.add(atomId);
      }
    }

    return {
      rings: systemRings,
      ringAtomSet: systemRingAtomSet,
      ringBondSet: fullRingInfo.ringBondSet,
      isAtomInRing: (atomId: number) => systemRingAtomSet.has(atomId),
      isBondInRing: fullRingInfo.isBondInRing,
      getRingsContainingAtom: (atomId: number) =>
        systemRings.filter((ring) => ring.includes(atomId)),
      areBothAtomsInSameRing: (atom1: number, atom2: number) =>
        systemRings.some(
          (ring) => ring.includes(atom1) && ring.includes(atom2),
        ),
    };
  }

  // Single ring system - find the matching ring in fullRingInfo
  const parentRingIndex = fullRingInfo.rings.findIndex(
    (ring: number[]) =>
      ring.length === parentRingAtomIds.size &&
      ring.every((atomId: number) => parentRingAtomIds.has(atomId)),
  );

  if (parentRingIndex === -1) {
    // Parent ring not found in ringInfo, return original
    return fullRingInfo;
  }

  const filteredRingAtomSet = new Set<number>();
  const parentRingArray = fullRingInfo.rings[parentRingIndex]!;
  for (const atomId of parentRingArray) {
    filteredRingAtomSet.add(atomId);
  }

  // Create a filtered ringInfo with only the parent ring
  return {
    rings: [parentRingArray],
    ringAtomSet: filteredRingAtomSet,
    ringBondSet: fullRingInfo.ringBondSet,
    isAtomInRing: (atomId: number) => filteredRingAtomSet.has(atomId),
    isBondInRing: fullRingInfo.isBondInRing,
    getRingsContainingAtom: (atomId: number) =>
      filteredRingAtomSet.has(atomId) ? [parentRingArray] : [],
    areBothAtomsInSameRing: (atom1: number, atom2: number) =>
      filteredRingAtomSet.has(atom1) && filteredRingAtomSet.has(atom2),
  };
}

/**
 * Helper: Check if a chain includes a ring followed by N-aryl substituent
 * Returns true if the chain pattern is: [exocyclic-N, aryl-ring-carbons]
 * where the nitrogen is bonded to a heterocyclic ring
 */
function isChainNArylFromRing(
  chain: number[],
  molecule: { atoms: readonly Atom[]; bonds: readonly Bond[] },
  candidateRings: RingSystem[] | undefined,
): boolean {
  if (
    !chain ||
    chain.length < 2 ||
    !candidateRings ||
    candidateRings.length === 0
  ) {
    return false;
  }

  const firstAtom = molecule.atoms[chain[0]!];
  if (!firstAtom || firstAtom.symbol !== "N") {
    if (process.env.VERBOSE) {
      console.log(
        `[isChainNArylFromRing] First atom is not nitrogen: ${firstAtom?.symbol}`,
      );
    }
    return false;
  }

  // Check if the nitrogen is in a ring
  const nitrogenRings = candidateRings.filter((ring) =>
    ring.atoms.some((a) => a.id === chain[0]),
  );
  if (nitrogenRings.length > 0) {
    // Nitrogen is IN a ring, not exocyclic
    if (process.env.VERBOSE) {
      console.log(
        `[isChainNArylFromRing] Nitrogen is in a ring, not exocyclic`,
      );
    }
    return false;
  }

  // Check if nitrogen is bonded to a ring atom
  const nitrogenId = chain[0]!;
  let hasBondToRing = false;
  for (const bond of molecule.bonds) {
    const otherAtomId =
      bond.atom1 === nitrogenId
        ? bond.atom2
        : bond.atom2 === nitrogenId
          ? bond.atom1
          : null;
    if (otherAtomId === null) continue;

    // Check if the other atom is in a candidate ring
    for (const ring of candidateRings) {
      if (ring.atoms.some((a) => a.id === otherAtomId)) {
        hasBondToRing = true;
        break;
      }
    }
    if (hasBondToRing) break;
  }

  if (!hasBondToRing) {
    if (process.env.VERBOSE) {
      console.log(
        `[isChainNArylFromRing] Nitrogen ${nitrogenId} is not bonded to any ring atom`,
      );
    }
    return false;
  }

  // Check if the rest of the chain forms an aromatic ring (benzene)
  const chainRest = chain.slice(1);
  if (chainRest.length !== 6) {
    if (process.env.VERBOSE) {
      console.log(
        `[isChainNArylFromRing] Chain rest length is ${chainRest.length}, not 6`,
      );
    }
    return false;
  }

  // Check if all atoms in chainRest are aromatic carbons
  for (const atomId of chainRest) {
    const atom = molecule.atoms[atomId];
    if (!atom || atom.symbol !== "C" || !atom.aromatic) {
      if (process.env.VERBOSE) {
        console.log(
          `[isChainNArylFromRing] Atom ${atomId} is not aromatic carbon: symbol=${atom?.symbol}, aromatic=${atom?.aromatic}`,
        );
      }
      return false;
    }
  }

  // Check if the rest of the chain (excluding nitrogen) forms a ring
  // We need to check if these atoms form a cycle by verifying ring bonds
  const chainRestSet = new Set(chainRest);
  let ringBondCount = 0;
  for (const bond of molecule.bonds) {
    if (chainRestSet.has(bond.atom1) && chainRestSet.has(bond.atom2)) {
      ringBondCount++;
    }
  }
  
  // A 6-membered ring has exactly 6 bonds
  if (ringBondCount === 6) {
    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4] Detected N-aryl chain pattern: nitrogen ${nitrogenId} bonded to heterocycle, chain contains aromatic 6-membered ring [${chainRest}]`,
      );
    }
    return true;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[isChainNArylFromRing] Chain rest does not form a complete ring (expected 6 ring bonds, got ${ringBondCount})`,
    );
  }
  return false;
}

/**
 * Helper: Check if an amine atom is part of an N-aryl substituent
 * Returns true if the amine nitrogen is bonded to a ring AND to an aromatic benzene ring
 */
function isNArylSubstituent(
  nitrogenId: number,
  molecule: { atoms: readonly Atom[]; bonds: readonly Bond[] },
  fullRingInfo: ReturnType<typeof analyzeRings>,
  candidateRings: RingSystem[] | undefined,
): boolean {
  if (process.env.VERBOSE) {
    console.log(`[P-44.4 isNArylSubstituent] Checking nitrogen ${nitrogenId}`);
  }

  if (!candidateRings || candidateRings.length === 0) {
    if (process.env.VERBOSE) {
      console.log(`[P-44.4 isNArylSubstituent] No candidate rings`);
    }
    return false;
  }

  const nitrogenAtom = molecule.atoms[nitrogenId];
  if (!nitrogenAtom || nitrogenAtom.symbol !== "N") {
    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4 isNArylSubstituent] Atom ${nitrogenId} is not nitrogen`,
      );
    }
    return false;
  }

  // Check if nitrogen is in a ring (if yes, it's not exocyclic)
  const nitrogenRings = candidateRings.filter((ring) =>
    ring.atoms.some((a) => a.id === nitrogenId),
  );
  if (nitrogenRings.length > 0) {
    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4 isNArylSubstituent] Nitrogen ${nitrogenId} is IN a ring - not exocyclic`,
      );
    }
    return false;
  }

  // Get all neighbors of the nitrogen
  const neighbors: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.atom1 === nitrogenId) {
      neighbors.push(bond.atom2);
    } else if (bond.atom2 === nitrogenId) {
      neighbors.push(bond.atom1);
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[P-44.4 isNArylSubstituent] Nitrogen ${nitrogenId} neighbors: [${neighbors.join(",")}]`,
    );
  }

  // Check if nitrogen is bonded to a ring atom
  let hasBondToRing = false;
  for (const neighborId of neighbors) {
    for (const ring of candidateRings) {
      if (ring.atoms.some((a) => a.id === neighborId)) {
        hasBondToRing = true;
        if (process.env.VERBOSE) {
          console.log(
            `[P-44.4 isNArylSubstituent] Nitrogen ${nitrogenId} is bonded to ring atom ${neighborId}`,
          );
        }
        break;
      }
    }
    if (hasBondToRing) break;
  }

  if (!hasBondToRing) {
    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4 isNArylSubstituent] Nitrogen ${nitrogenId} NOT bonded to any ring atom`,
      );
    }
    return false;
  }

  // Check if nitrogen is bonded to an aromatic carbon (benzene ring)
  // Use fullRingInfo to detect ALL rings in molecule, not just parent ring
  for (const neighborId of neighbors) {
    const neighborAtom = molecule.atoms[neighborId];
    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4 isNArylSubstituent] Checking neighbor ${neighborId}: symbol=${neighborAtom?.symbol}, aromatic=${neighborAtom?.aromatic}`,
      );
    }

    if (neighborAtom && neighborAtom.symbol === "C" && neighborAtom.aromatic) {
      if (process.env.VERBOSE) {
        console.log(
          `[P-44.4 isNArylSubstituent] Found aromatic carbon neighbor ${neighborId}, checking ALL rings...`,
        );
        console.log(
          `[P-44.4 isNArylSubstituent] Total rings in molecule: ${fullRingInfo.rings.length}`,
        );
      }

      // Check if this aromatic carbon is part of a 6-membered ring
      for (let i = 0; i < fullRingInfo.rings.length; i++) {
        const ringAtomIds = fullRingInfo.rings[i]!;
        if (process.env.VERBOSE) {
          console.log(
            `[P-44.4 isNArylSubstituent] Ring ${i}: size=${ringAtomIds.length}, atomIds=[${ringAtomIds.join(",")}]`,
          );
        }

        const hasNeighbor = ringAtomIds.includes(neighborId);
        if (process.env.VERBOSE) {
          console.log(
            `[P-44.4 isNArylSubstituent] Ring ${i} contains neighbor ${neighborId}? ${hasNeighbor}`,
          );
        }

        if (ringAtomIds.length === 6 && hasNeighbor) {
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.4 isNArylSubstituent] Neighbor ${neighborId} is in 6-membered ring: [${ringAtomIds.join(",")}]`,
            );
          }

          // Check if all atoms in this ring are aromatic carbons
          const allAromatic = ringAtomIds.every((atomId) => {
            const atom = molecule.atoms[atomId];
            return atom && atom.symbol === "C" && atom.aromatic;
          });

          if (process.env.VERBOSE) {
            console.log(
              `[P-44.4 isNArylSubstituent] All atoms aromatic carbons? ${allAromatic}`,
            );
          }

          if (allAromatic) {
            if (process.env.VERBOSE) {
              console.log(
                `[P-44.4] Detected N-aryl substituent: nitrogen ${nitrogenId} bonded to heterocycle and benzene ring`,
              );
            }
            return true;
          }
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[P-44.4 isNArylSubstituent] No aromatic benzene ring found - NOT N-aryl`,
    );
  }
  return false;
}

/**
 * Rule: P-44.4 - Ring vs Chain Selection
 *
 * Determine whether to use ring system or chain as parent structure.
 * Ring systems generally have seniority over chains, UNLESS there's a
 * heteroatom parent candidate (P-2.1 takes priority).
 *
 * This rule handles:
 * 1. Ring vs chain comparison (when both exist)
 * 2. Ring-only molecules (no chains)
 * 3. Polycyclic ring system merging
 * 4. Functional group filtering (only FGs on ring)
 * 5. Principal group re-selection after filtering
 * 6. Substituent finding with proper exclusions
 * 7. Ring numbering and naming
 */
export const P44_4_RING_CHAIN_SELECTION_RULE: IUPACRule = {
  id: "P-44.4",
  name: "Ring vs Chain Selection",
  description: "Select ring system over chain when both are present (P-44.4)",
  blueBookReference: BLUE_BOOK_RULES.P44_4,
  priority: RulePriority.SIX, // 60 - Higher priority numbers run EARLIER
  conditions: (context: ImmutableNamingContext) => {
    const candidateRings = context.getState().candidateRings;
    const candidateChains = context.getState().candidateChains;

    if (process.env.VERBOSE) {
      console.log(
        "P-44.4 conditions: candidateRings=",
        candidateRings?.length,
        "candidateChains=",
        candidateChains?.length,
        "parentStructure=",
        !!context.getState().parentStructure,
      );
    }

    // Modified condition: allow execution if we have rings, even without chains
    if (
      !candidateRings ||
      candidateRings.length === 0 ||
      context.getState().parentStructure
    ) {
      return false;
    }

    // P-2.1 has priority: check if there's a heteroatom parent candidate
    const molecule = context.getState().molecule;
    const HETEROATOM_HYDRIDES = ["Si", "Ge", "Sn", "Pb", "P", "As", "Sb", "Bi"];
    const EXPECTED_VALENCE: Record<string, number> = {
      Si: 4,
      Ge: 4,
      Sn: 4,
      Pb: 4,
      P: 3,
      As: 3,
      Sb: 3,
      Bi: 3,
    };

    const heteroatoms = molecule.atoms.filter((atom) =>
      HETEROATOM_HYDRIDES.includes(atom.symbol),
    );

    // If exactly one heteroatom with correct valence exists, P-2.1 should handle it
    if (heteroatoms.length === 1) {
      const heteroatom = heteroatoms[0]!;
      const implicitHydrogens = heteroatom.hydrogens || 0;
      const heteroatomIndex = molecule.atoms.indexOf(heteroatom);
      const bondOrders = molecule.bonds
        .filter(
          (bond) =>
            bond.atom1 === heteroatomIndex || bond.atom2 === heteroatomIndex,
        )
        .reduce((sum, bond) => {
          const order =
            bond.type === "single"
              ? 1
              : bond.type === "double"
                ? 2
                : bond.type === "triple"
                  ? 3
                  : 1;
          return sum + order;
        }, 0);
      const totalValence = bondOrders + implicitHydrogens;
      const expectedValence = EXPECTED_VALENCE[heteroatom.symbol];

      if (totalValence === expectedValence) {
        // Heteroatom parent is present - let P-2.1 handle it
        if (process.env.VERBOSE)
          console.log("P-44.4: deferring to P-2.1 heteroatom parent");
        return false;
      }
    }

    // P-44.1.1: Count principal FGs on rings vs chains
    // Only defer to chain selection if chains have MORE FGs than rings
    const functionalGroups = context.getState().functionalGroups || [];
    const principalGroups = functionalGroups.filter((fg) => fg.isPrincipal);

    if (
      principalGroups.length > 0 &&
      candidateChains &&
      candidateChains.length > 0
    ) {
      // Count FGs on rings
      // IMPORTANT: Count FG as "on ring" if:
      // 1. Its ATTACHMENT POINT is in the ring, OR
      // 2. It's directly bonded to a ring atom (e.g., N-aryl amine on thiazoline)
      let ringFGCount = 0;
      const ringAtomIds = new Set(
        candidateRings.flatMap((ring) => ring.atoms.map((a) => a.id)),
      );

      for (const pg of principalGroups) {
        const pgAtoms = pg.atoms || [];
        if (pgAtoms.length === 0) continue;

        // Get the attachment point (first atom in the FG)
        const attachmentAtom = pgAtoms[0];
        if (!attachmentAtom) continue;

        const attachmentAtomId =
          typeof attachmentAtom === "object"
            ? attachmentAtom.id
            : attachmentAtom;

        // Check if attachment point is in ring
        if (ringAtomIds.has(attachmentAtomId)) {
          ringFGCount++;
          continue;
        }

        // Check if attachment point is directly bonded to a ring atom
        let isBondedToRing = false;
        for (const bond of molecule.bonds) {
          if (
            bond.atom1 === attachmentAtomId ||
            bond.atom2 === attachmentAtomId
          ) {
            const otherAtomId =
              bond.atom1 === attachmentAtomId ? bond.atom2 : bond.atom1;
            if (ringAtomIds.has(otherAtomId)) {
              isBondedToRing = true;
              break;
            }
          }
        }

        if (isBondedToRing) {
          ringFGCount++;
        }
      }

      // Count FGs on chains
      // IMPORTANT: Only count FG as "on chain" if its ATTACHMENT POINT is in the chain
      // The attachment point is the first atom in fg.atoms (e.g., C=O carbon for amides/ketones)
      let chainFGCount = 0;
      for (const chain of candidateChains) {
        const chainAtomIds = new Set(chain.atoms.map((a) => a.id));

        for (const pg of principalGroups) {
          const pgAtoms = pg.atoms || [];
          if (pgAtoms.length === 0) continue;

          // Get the attachment point (first atom in the FG)
          const attachmentAtom = pgAtoms[0];
          if (!attachmentAtom) continue;

          const attachmentAtomId =
            typeof attachmentAtom === "object"
              ? attachmentAtom.id
              : attachmentAtom;

          // Check if attachment point is in chain
          if (chainAtomIds.has(attachmentAtomId)) {
            chainFGCount++;
            break; // Count each FG only once per chain
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.4] FG count: ring=${ringFGCount}, chain=${chainFGCount}`,
        );
      }

      // P-44.1.1: If chains have MORE FGs than rings, defer to chain selection
      if (chainFGCount > ringFGCount) {
        if (process.env.VERBOSE) {
          console.log(
            `[P-44.4] Chains have more FGs (${chainFGCount} > ${ringFGCount}), deferring to chain selection per P-44.1.1`,
          );
        }
        return false;
      }

      // P-44.4.1: When FG counts are equal, check for N-aryl pattern first
      if (chainFGCount === ringFGCount) {
        // Check if any chain is an N-aryl pattern (nitrogen connecting rings)
        // If so, prioritize the ring as parent regardless of size
        let hasNArylPattern = false;
        if (candidateChains && candidateChains.length > 0) {
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.4] Checking ${candidateChains.length} chains for N-aryl pattern`,
            );
            console.log(
              `[P-44.4] candidateRings count: ${candidateRings.length}`,
            );
            candidateRings.forEach((ring, i) => {
              console.log(
                `[P-44.4]   Ring ${i}: [${ring.atoms.map((a) => a.id).join(",")}]`,
              );
            });
          }
          for (const chain of candidateChains) {
            const chainAtomIds = chain.atoms.map((a) => a.id);
            if (process.env.VERBOSE) {
              console.log(
                `[P-44.4] Checking chain with ${chainAtomIds.length} atoms: [${chainAtomIds.join(",")}]`,
              );
            }
            if (
              isChainNArylFromRing(
                chainAtomIds,
                molecule,
                candidateRings,
              )
            ) {
              hasNArylPattern = true;
              if (process.env.VERBOSE) {
                console.log(
                  `[P-44.4] Detected N-aryl chain pattern - prioritizing ring as parent despite size comparison`,
                );
              }
              break;
            }
          }
        }
        
        // If no N-aryl pattern, compare sizes
        if (!hasNArylPattern) {
          const ringSize = candidateRings[0]?.size || candidateRings[0]?.atoms?.length || 0;
          const chainLength = candidateChains[0]?.atoms?.length || 0;
          
          if (chainLength > ringSize) {
            // Chain is longer - defer to chain selection per P-44.4.1
            if (process.env.VERBOSE) {
              console.log(
                `[P-44.4] FG counts equal (${chainFGCount}), but chain is longer (${chainLength} > ${ringSize}), deferring to chain selection per P-44.4.1`,
              );
            }
            return false;
          }
          
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.4] FG counts equal (${chainFGCount}), ring size >= chain length (${ringSize} >= ${chainLength}), ring has priority per P-44.4.1`,
            );
          }
        }
      }

      // P-44.1.2.2: Rings have priority when rings have more FGs
      if (process.env.VERBOSE) {
        console.log(
          `[P-44.4] Ring has priority (ring FGs=${ringFGCount}, chain FGs=${chainFGCount}) per P-44.1.2.2`,
        );
      }
    }

    return true;
  },
  action: (context: ImmutableNamingContext) => {
    const candidateRings = context.getState().candidateRings;
    const candidateChains = context.getState().candidateChains;
    const molecule = context.getState().molecule;
    const ringInfo = context.getState().cachedRingInfo!;

    if (!candidateRings) {
      return context;
    }

    // Special case: If candidate chains include N-aryl pattern (nitrogen bonded to heterocyclic ring + benzene ring),
    // prioritize the heterocyclic ring as parent and treat benzene as N-substituent
    if (candidateChains && candidateChains.length > 0) {
      for (const chain of candidateChains) {
        if (
          isChainNArylFromRing(
            chain.atoms.map((a) => a.id),
            molecule,
            candidateRings,
          )
        ) {
          if (process.env.VERBOSE) {
            console.log(
              `[P-44.4] Detected N-aryl chain from ring - prioritizing heterocyclic ring as parent`,
            );
          }
          // Force ring selection by NOT considering chains
          // Fall through to ring selection logic below
          break;
        }
      }
    }

    // Check if multiple rings are connected (forming a polycyclic system)
    if (candidateRings.length > 1) {
      // Check if any two rings are connected by bonds
      const areRingsConnected = (
        ring1: RingSystem,
        ring2: RingSystem,
      ): boolean => {
        const ring1AtomIds = new Set(ring1.atoms.map((a: Atom) => a.id));
        const ring2AtomIds = new Set(ring2.atoms.map((a: Atom) => a.id));

        for (const bond of molecule.bonds) {
          const a1InRing1 = ring1AtomIds.has(bond.atom1);
          const a2InRing1 = ring1AtomIds.has(bond.atom2);
          const a1InRing2 = ring2AtomIds.has(bond.atom1);
          const a2InRing2 = ring2AtomIds.has(bond.atom2);

          if ((a1InRing1 && a2InRing2) || (a1InRing2 && a2InRing1)) {
            return true;
          }
        }
        return false;
      };

      let hasConnectedRings = false;
      for (let i = 0; i < candidateRings.length && !hasConnectedRings; i++) {
        for (
          let j = i + 1;
          j < candidateRings.length && !hasConnectedRings;
          j++
        ) {
          if (areRingsConnected(candidateRings[i]!, candidateRings[j]!)) {
            hasConnectedRings = true;
          }
        }
      }

      if (hasConnectedRings) {
        if (process.env.VERBOSE) {
          console.log(
            "[P-44.4] Multiple connected rings detected - treating as polycyclic system",
          );
        }

        // Create a merged parent structure that includes all connected rings
        const allAtoms = new Set<Atom>();
        const allBonds = new Set<Bond>();

        for (const ring of candidateRings) {
          for (const atom of ring.atoms) {
            allAtoms.add(atom);
          }
          if (ring.bonds) {
            for (const bond of ring.bonds) {
              allBonds.add(bond);
            }
          }
        }

        const atomsArray = Array.from(allAtoms);
        const bondsArray = Array.from(allBonds);

        // Collect heteroatoms with proper structure
        const heteroatoms = atomsArray
          .filter((a: Atom) => a.symbol !== "C" && a.symbol !== "H")
          .map((a: Atom, idx: number) => ({
            atom: a,
            type: a.symbol,
            locant: idx + 1,
          }));

        const parentRing = {
          atoms: atomsArray,
          bonds: bondsArray,
          rings: candidateRings.flatMap((r: RingSystem) => r.rings || []),
          size: allAtoms.size,
          heteroatoms: heteroatoms,
          type: RingSystemType.AROMATIC, // Will be determined properly by naming logic
          fused: false,
          bridged: false,
          spiro: false,
        };

        // Find substituents on the polycyclic ring system
        const polycyclicRingAtomIds = atomsArray.map((atom) => atom.id);
        const polycyclicSubstituents = findSubstituentsOnMonocyclicRing(
          polycyclicRingAtomIds,
          molecule,
        );

        if (process.env.VERBOSE) {
          console.log(
            `[P-44.4] Found ${polycyclicSubstituents.length} substituents on polycyclic ring`,
          );
        }

        // For polycyclic systems, keep the full ringInfo as all rings are part of the parent
        const parentStructure = {
          type: "ring" as const,
          ring: parentRing,
          name: generateBaseCyclicName(molecule, ringInfo),
          locants: generateRingLocants(parentRing),
          substituents: polycyclicSubstituents,
        };

        return context.withParentStructure(
          parentStructure,
          "P-44.4",
          "Ring vs Chain Selection",
          "P-44.4",
          ExecutionPhase.PARENT_STRUCTURE,
          "Finalized polycyclic ring system selection",
        );
      }
    }

    // Single ring or multiple disconnected rings - select first one
    const parentRing = candidateRings[0];
    if (!parentRing) {
      return context.withConflict(
        {
          ruleId: "P-44.4",
          conflictType: "state_inconsistency",
          description: "No parent ring available",
          context: {},
        },
        "P-44.4",
        "Ring vs Chain Selection",
        "P-44.4",
        ExecutionPhase.PARENT_STRUCTURE,
        "No parent ring available",
      );
    }

    // According to P-44.4, ring systems generally take precedence over chains
    // IUPAC Blue Book P-44.1.2.2: "Within the same class, a ring or ring system
    // has seniority over a chain."
    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4] Ring system detected, selecting as parent per P-44.1.2.2`,
      );
      console.log(`[P-44.4] Ring atoms: ${parentRing.atoms?.length || 0}`);
      if (candidateChains && candidateChains.length > 0) {
        const longestChain = candidateChains[0];
        const chainLength = longestChain?.atoms ? longestChain.atoms.length : 0;
        console.log(`[P-44.4] Chain length: ${chainLength}`);
      }
    }

    // We'll find substituents AFTER filtering and principal group selection
    const ringAtomIdArray = parentRing.atoms.map((atom) => atom.id);

    // Create filtered ringInfo containing only the parent ring
    // This ensures generateBaseCyclicName names only the selected parent ring,
    // not the entire molecule (which may have multiple rings)
    const filteredRingInfo = createFilteredRingInfo(parentRing, ringInfo);

    let parentStructure = {
      type: "ring" as const,
      ring: parentRing,
      name: generateBaseCyclicName(molecule, filteredRingInfo),
      locants: generateRingLocants(parentRing),
      substituents: [] as (StructuralSubstituent | NamingSubstituent)[], // Will be filled in after principal group selection
    };

    const functionalGroups = context.getState().functionalGroups || [];

    // Filter functional groups to only include those directly attached to the ring
    // Functional groups on side chains should NOT be principal groups
    const ringAtomIds = new Set(parentRing.atoms.map((atom) => atom.id));

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4] Starting FG filtering: ${functionalGroups.length} functional groups`,
      );
      functionalGroups.forEach((fg) => {
        console.log(`  - FG: ${fg.type}, atoms: ${fg.atoms?.join(",")}`);
      });
    }

    const filteredFunctionalGroups = functionalGroups.filter((fg) => {
      // Check if the functional group atom is in the ring or directly attached to a ring atom
      if (!fg.atoms || fg.atoms.length === 0) return true; // Keep if no atoms specified

      for (const fgAtom of fg.atoms) {
        const fgAtomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;

        // If FG atom is in ring, check if it's a lactam first
        if (ringAtomIds.has(fgAtomId)) {
          // Special case: lactams (cyclic amides) should be excluded
          // Lactam: both carbonyl C and N are in the ring
          // Example: pyrrolidin-2-one (O=C1CCCN1), imidazolidin-4-one (O=C1CNCN1)
          if (fg.type === "amide" && fg.atoms && fg.atoms.length >= 3) {
            const carbonylC = fg.atoms[0];
            const nitrogen = fg.atoms[2];

            if (carbonylC && nitrogen) {
              const carbonylCId =
                typeof carbonylC === "number" ? carbonylC : carbonylC.id;
              const nitrogenId =
                typeof nitrogen === "number" ? nitrogen : nitrogen.id;

              // If both C and N are in ring → it's a lactam → exclude
              if (ringAtomIds.has(carbonylCId) && ringAtomIds.has(nitrogenId)) {
                if (process.env.VERBOSE) {
                  console.log(
                    `[P-44.4] Excluding lactam (cyclic amide) - both C and N are in ring`,
                  );
                }
                return false; // Exclude lactam
              }
            }
          }

          if (process.env.VERBOSE) {
            console.log(
              `[P-44.4] FG ${fg.type} atom ${fgAtomId} is IN RING - keeping`,
            );
          }
          return true;
        }

        // If FG atom is directly bonded to a ring atom, check if it's a simple substituent
        // (not part of a longer side chain)
        for (const bond of molecule.bonds) {
          if (bond.atom1 === fgAtomId || bond.atom2 === fgAtomId) {
            const otherAtomId =
              bond.atom1 === fgAtomId ? bond.atom2 : bond.atom1;
            if (ringAtomIds.has(otherAtomId)) {
              // FG atom is directly bonded to ring
              // IMPORTANT: Don't exclude terminal functional groups like esters, ketones, aldehydes, carboxylic acids
              // These are principal groups even if they have non-ring carbons
              const TERMINAL_FUNCTIONAL_GROUPS = [
                "ester",
                "carboxylic_acid",
                "aldehyde",
                "ketone",
                "amide",
                "acyl_halide",
                "anhydride",
                "imide",
                "thioester",
                "acyl_cyanide",
              ];

              const isTerminalFG = TERMINAL_FUNCTIONAL_GROUPS.includes(fg.type);

              if (isTerminalFG) {
                // Terminal functional groups are always included, even if they have non-ring carbons
                if (process.env.VERBOSE) {
                  console.log(
                    `[P-44.4] Keeping terminal FG ${fg.type} on atom ${fgAtomId}`,
                  );
                }
                return true;
              }

              // For non-terminal FGs (alcohols, amines, etc.), check if they're part of a side chain
              // Count how many non-ring carbons are bonded to this FG atom
              const nonRingNeighbors = molecule.bonds.filter((b) => {
                if (b.atom1 === fgAtomId || b.atom2 === fgAtomId) {
                  const neighborId = b.atom1 === fgAtomId ? b.atom2 : b.atom1;
                  return (
                    !ringAtomIds.has(neighborId) &&
                    molecule.atoms[neighborId]?.symbol === "C"
                  );
                }
                return false;
              }).length;

              // If non-terminal FG atom has non-ring carbon neighbors, it's part of a side chain
              if (nonRingNeighbors > 0) {
                // Special case: N-aryl substituent (amine bonded to aromatic benzene ring)
                // This should be kept as a principal group, not excluded as a side chain
                if (fg.type === "amine") {
                  if (process.env.VERBOSE) {
                    console.log(
                      `[P-44.4] Checking if amine on atom ${fgAtomId} is N-aryl substituent...`,
                    );
                  }
                  if (
                    isNArylSubstituent(
                      fgAtomId,
                      molecule,
                      ringInfo,
                      candidateRings,
                    )
                  ) {
                    if (process.env.VERBOSE) {
                      console.log(
                        `[P-44.4] Keeping amine FG on atom ${fgAtomId} - detected N-aryl substituent pattern`,
                      );
                    }
                    return true;
                  } else {
                    if (process.env.VERBOSE) {
                      console.log(
                        `[P-44.4] N-aryl check returned false for amine on atom ${fgAtomId}`,
                      );
                    }
                  }
                }

                if (process.env.VERBOSE) {
                  console.log(
                    `[P-44.4] Excluding FG ${fg.type} on atom ${fgAtomId} - part of side chain`,
                  );
                }
                return false; // Part of side chain, exclude it
              }

              return true; // Simple substituent directly on ring
            }
          }
        }
      }

      // FG is not connected to ring at all
      if (process.env.VERBOSE) {
        console.log(`[P-44.4] Excluding FG ${fg.type} - not attached to ring`);
      }
      return false;
    });

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4] Filtered FGs from ${functionalGroups.length} to ${filteredFunctionalGroups.length}`,
      );
      console.log(
        `[P-44.4] Kept FG types:`,
        filteredFunctionalGroups.map((fg) => fg.type),
      );
    }

    // Re-select principal group after filtering
    // When a ring is the parent, functional groups on side chains are excluded.
    // We need to promote ALL functional groups with the highest priority to principal.
    if (filteredFunctionalGroups.length > 0) {
      // First, clear all isPrincipal flags
      for (const fg of filteredFunctionalGroups) {
        fg.isPrincipal = false;
      }

      // Find the highest priority value among remaining functional groups
      let maxPriority = -1;
      for (const fg of filteredFunctionalGroups) {
        const priority = fg.priority || 0;
        if (priority > maxPriority) {
          maxPriority = priority;
        }
      }

      // Mark ALL functional groups with the highest priority as principal
      const principalGroups = [];
      for (const fg of filteredFunctionalGroups) {
        const priority = fg.priority || 0;
        if (priority === maxPriority) {
          fg.isPrincipal = true;
          principalGroups.push(fg);
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.4] Re-selected ${principalGroups.length} principal group(s) after filtering:`,
          principalGroups.map((fg) => `${fg.type} (priority ${maxPriority})`),
        );
      }
    }

    // NOW find substituents on the ring, after principal group selection
    // Extract PRINCIPAL functional group atom IDs to exclude them from substituents
    const fgAtomIds = new Set<number>();
    const principalAtomIds = new Set<number>();

    // Collect atoms that are directly bonded to ring atoms
    // These should NOT be excluded even if they're part of principal FGs
    // because they're the attachment points for substituents
    const ringAttachmentAtoms = new Set<number>();
    for (const ringAtomId of ringAtomIds) {
      for (const bond of molecule.bonds) {
        let attachedAtomId = -1;
        if (bond.atom1 === ringAtomId && !ringAtomIds.has(bond.atom2)) {
          attachedAtomId = bond.atom2;
        } else if (bond.atom2 === ringAtomId && !ringAtomIds.has(bond.atom1)) {
          attachedAtomId = bond.atom1;
        }
        if (attachedAtomId >= 0) {
          ringAttachmentAtoms.add(attachedAtomId);
        }
      }
    }

    // Collect principal group atom IDs, but skip ring attachment atoms
    // Ring attachment atoms are part of substituents and should not be excluded
    for (const fg of filteredFunctionalGroups) {
      if (fg.isPrincipal && fg.atoms) {
        for (const fgAtom of fg.atoms) {
          const fgAtomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;
          principalAtomIds.add(fgAtomId);

          // Only exclude this atom if it's NOT a ring attachment point
          if (!ringAttachmentAtoms.has(fgAtomId)) {
            fgAtomIds.add(fgAtomId);
            if (process.env.VERBOSE) {
              console.log(
                `[P-44.4] Excluding principal FG atom ${fgAtomId} (not ring attachment)`,
              );
            }
          } else {
            if (process.env.VERBOSE) {
              console.log(
                `[P-44.4] NOT excluding principal FG atom ${fgAtomId} (ring attachment point for substituent)`,
              );
            }
          }
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4] Ring attachment atoms: [${Array.from(ringAttachmentAtoms).join(", ")}]`,
      );
      console.log(
        `[P-44.4] Principal FG atom IDs (all): [${Array.from(principalAtomIds).join(", ")}]`,
      );
      console.log(
        `[P-44.4] Principal FG atom IDs (excluded from substituents): [${Array.from(fgAtomIds).join(", ")}]`,
      );
    }

    // Exclude amine atoms that are IN THE RING and bonded to principal group atoms
    // But DO NOT exclude exocyclic amine atoms - those are N-substituents
    for (const fg of functionalGroups) {
      if (fg.type === "amine" && fg.atoms) {
        for (const fgAtom of fg.atoms) {
          const amineAtomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;

          // Check if this amine atom is in the ring
          const isAmineInRing = ringAtomIds.has(amineAtomId);

          if (!isAmineInRing) {
            // Exocyclic amine - do NOT exclude it, it's an N-substituent
            if (process.env.VERBOSE) {
              console.log(
                `[P-44.4] NOT excluding exocyclic amine atom ${amineAtomId} - will be treated as N-substituent`,
              );
            }
            continue;
          }

          // Amine is in the ring - check if bonded to principal group atom
          for (const bond of molecule.bonds) {
            if (bond.atom1 === amineAtomId || bond.atom2 === amineAtomId) {
              const otherAtomId =
                bond.atom1 === amineAtomId ? bond.atom2 : bond.atom1;
              if (principalAtomIds.has(otherAtomId)) {
                fgAtomIds.add(amineAtomId);
                if (process.env.VERBOSE) {
                  console.log(
                    `[P-44.4] Excluding ring amine atom ${amineAtomId} - bonded to principal FG atom ${otherAtomId}`,
                  );
                }
                break;
              }
            }
          }
        }
      }
    }

    // CRITICAL: Expand fgAtomIds to include substituents attached to FG atoms
    // This prevents N-substituents (like N,N-dimethyl on an amine) from being
    // incorrectly counted as ring substituents
    // Example: azirin-2-amine with N,N-dimethyl - the methyl groups should NOT
    // appear as "1-methyl" ring substituents
    const expandedFgAtomIds = new Set(fgAtomIds);

    // Helper function to recursively collect all atoms in a substituent tree
    function collectSubstituentAtoms(
      startAtomId: number,
      excludeAtoms: Set<number>,
    ): Set<number> {
      const collected = new Set<number>();
      const toVisit = [startAtomId];
      const visited = new Set<number>();

      while (toVisit.length > 0) {
        const currentAtomId = toVisit.pop();
        if (currentAtomId === undefined || visited.has(currentAtomId)) {
          continue;
        }
        visited.add(currentAtomId);

        // Don't traverse beyond ring atoms or already-excluded FG atoms
        if (excludeAtoms.has(currentAtomId)) {
          continue;
        }

        collected.add(currentAtomId);

        // Find neighbors and add them to visit queue
        for (const bond of molecule.bonds) {
          if (bond.atom1 === currentAtomId && !visited.has(bond.atom2)) {
            toVisit.push(bond.atom2);
          } else if (bond.atom2 === currentAtomId && !visited.has(bond.atom1)) {
            toVisit.push(bond.atom1);
          }
        }
      }

      return collected;
    }

    // Collect AMINE functional groups that are exocyclic and will become N-substituents
    // These need to be excluded along with their substituents from ring substituent detection
    // Other FG types (thioether, alcohol, etc.) remain as normal ring substituents
    const exocyclicAmineFgAtoms = new Set<number>();

    // Add ONLY amine functional group atoms that are directly attached to ring atoms
    // These will become N-substituents and should be excluded from ring substituents
    // DO NOT include other exocyclic functional groups (phosphorus, sulfur, etc.) here
    // as they should be detected as normal ring substituents
    for (const fg of functionalGroups) {
      // Only process amine functional groups for N-substituent exclusion
      if (fg.type === "amine" && fg.atoms) {
        for (const fgAtom of fg.atoms) {
          const fgAtomId = typeof fgAtom === "object" ? fgAtom.id : fgAtom;

          // Skip if already in ring
          if (ringAtomIds.has(fgAtomId)) {
            continue;
          }

          // Check if this amine atom is directly bonded to a ring atom
          for (const bond of molecule.bonds) {
            if (bond.atom1 === fgAtomId || bond.atom2 === fgAtomId) {
              const otherAtomId =
                bond.atom1 === fgAtomId ? bond.atom2 : bond.atom1;
              if (ringAtomIds.has(otherAtomId)) {
                exocyclicAmineFgAtoms.add(fgAtomId);
                if (process.env.VERBOSE) {
                  console.log(
                    `[P-44.4] Found exocyclic amine FG atom ${fgAtomId} attached to ring atom ${otherAtomId}`,
                  );
                }
                break;
              }
            }
          }
        }
      }
    }

    // For each exocyclic AMINE FG atom, collect all substituents attached to it
    // This expansion is ONLY for amines to handle N-substituents correctly
    for (const fgAtomId of exocyclicAmineFgAtoms) {
      // First, add the FG atom itself to the exclusion set
      // This prevents it from being detected as a ring substituent
      expandedFgAtomIds.add(fgAtomId);

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.4] Added exocyclic FG atom ${fgAtomId} to exclusion set`,
        );
      }

      // Find all neighbors of this FG atom
      for (const bond of molecule.bonds) {
        let neighborAtomId = -1;
        if (bond.atom1 === fgAtomId && !ringAtomIds.has(bond.atom2)) {
          neighborAtomId = bond.atom2;
        } else if (bond.atom2 === fgAtomId && !ringAtomIds.has(bond.atom1)) {
          neighborAtomId = bond.atom1;
        }

        if (neighborAtomId >= 0 && !expandedFgAtomIds.has(neighborAtomId)) {
          // Collect all atoms in this substituent branch
          const excludeSet = new Set([...ringAtomIds, fgAtomId]);
          const substituentAtoms = collectSubstituentAtoms(
            neighborAtomId,
            excludeSet,
          );

          for (const atomId of substituentAtoms) {
            expandedFgAtomIds.add(atomId);
          }

          if (process.env.VERBOSE) {
            console.log(
              `[P-44.4] Expanded FG exclusion: added ${substituentAtoms.size} substituent atoms from FG atom ${fgAtomId}: [${Array.from(substituentAtoms).join(", ")}]`,
            );
          }
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[P-44.4] All excluded FG atom IDs (after expansion): [${Array.from(expandedFgAtomIds).join(", ")}]`,
      );
    }

    // Find substituents on the ring with the proper exclusions
    const substituents = findSubstituentsOnMonocyclicRing(
      ringAtomIdArray,
      molecule,
      expandedFgAtomIds,
    );

    if (process.env.VERBOSE) {
      console.log(`[P-44.4] Found ${substituents.length} substituents on ring`);
      console.log(
        `[P-44.4] Substituents:`,
        substituents.map((s) => `${s.name} at position ${s.position}`),
      );
    }

    // Update parent structure with the substituents
    parentStructure.substituents = substituents;

    return context
      .withParentStructure(
        parentStructure,
        "P-44.4",
        "Ring vs Chain Selection",
        "P-44.4",
        ExecutionPhase.PARENT_STRUCTURE,
        "Selected ring system as parent structure per IUPAC P-44.1.2.2 (rings > chains)",
      )
      .withStateUpdate(
        (state) => ({
          ...state,
          functionalGroups: filteredFunctionalGroups,
        }),
        "P-44.4",
        "Filter Functional Groups for Ring Parent",
        "P-44.4",
        ExecutionPhase.PARENT_STRUCTURE,
        `Filtered functional groups to only include those directly on ring (${filteredFunctionalGroups.length} of ${functionalGroups.length})`,
      );
  },
};
