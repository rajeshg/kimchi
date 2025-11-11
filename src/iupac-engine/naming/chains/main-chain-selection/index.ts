import type { Molecule } from "types";
import type { OPSINFunctionalGroupDetector } from "../../../opsin-functional-group-detector";
import { getSharedDetector } from "../../../opsin-functional-group-detector";
import { findSubstituents } from "../substituent-naming";
import {
  shouldExcludeAtomFromChain,
  countDirectFunctionalGroupAttachments,
  isHydrocarbonChain,
  containsHalogen,
  requiresHeteroatomChains,
} from "./chain-validation";
import {
  findAllAtomChains,
  findAllCarbonChains,
  findAllCarbonChainsFromStart,
} from "./chain-finding";
import {
  getPriorityLocants,
  getFunctionalGroupPositions,
  renumberPriorityLocants,
} from "./chain-orientation";
import {
  compareChains,
  isBetterLocants,
  isBetterPriorityLocants,
  isBetterByOpsinHeuristics,
} from "./chain-comparison";
import { getChainFunctionalGroupPriority } from "./functional-group-priority";

/**
 * Helper function to find shortest path between two atoms using BFS.
 * Used for constructing diamine chains (N-C-...-C-N paths).
 *
 * @param molecule - The molecule to search
 * @param startAtomId - Starting atom ID
 * @param endAtomId - Ending atom ID
 * @param excludedAtomIds - Set of atom IDs to exclude from path
 * @returns Array of atom IDs representing the path, or null if no path exists
 */
function findShortestPath(
  molecule: Molecule,
  startAtomId: number,
  endAtomId: number,
  excludedAtomIds: Set<number>,
): number[] | null {
  if (startAtomId === endAtomId) return [startAtomId];

  const visited = new Set<number>();
  const queue: Array<{ atomId: number; path: number[] }> = [
    { atomId: startAtomId, path: [startAtomId] },
  ];
  visited.add(startAtomId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const { atomId, path } = current;
    const atom = molecule.atoms[atomId];
    if (!atom) continue;

    // Check all neighbors
    for (const bond of molecule.bonds) {
      if (bond.atom1 !== atomId && bond.atom2 !== atomId) continue;

      const neighborId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;

      // Skip if already visited or excluded
      if (visited.has(neighborId) || excludedAtomIds.has(neighborId)) continue;

      const newPath = [...path, neighborId];

      // Found the target!
      if (neighborId === endAtomId) {
        return newPath;
      }

      visited.add(neighborId);
      queue.push({ atomId: neighborId, path: newPath });
    }
  }

  return null; // No path found
}

function isDiamineBackbone(
  chain: number[],
  molecule: Molecule,
  amineNitrogens: Set<number>,
): boolean {
  if (chain.length < 2 || amineNitrogens.size < 2) return false;

  const firstAtom = chain[0];
  const lastAtom = chain[chain.length - 1];

  if (firstAtom === undefined || lastAtom === undefined) return false;
  if (firstAtom === lastAtom) return false;

  let firstAmineId: number | null = null;
  let lastAmineId: number | null = null;

  for (const bond of molecule.bonds) {
    const n1 = bond.atom1;
    const n2 = bond.atom2;

    if (n1 === firstAtom && amineNitrogens.has(n2)) firstAmineId = n2;
    if (n2 === firstAtom && amineNitrogens.has(n1)) firstAmineId = n1;

    if (n1 === lastAtom && amineNitrogens.has(n2)) lastAmineId = n2;
    if (n2 === lastAtom && amineNitrogens.has(n1)) lastAmineId = n1;
  }

  return (
    firstAmineId !== null &&
    lastAmineId !== null &&
    firstAmineId !== lastAmineId
  );
}

/**
 * Main chain selection orchestrator - implements IUPAC rules for selecting
 * the principal chain in a molecule.
 *
 * Strategy:
 * 1. Detect and normalize functional groups
 * 2. Exclude functional group atoms from chain search
 * 3. Find all candidate chains (carbon-only and heteroatom-containing)
 * 4. Apply functional group priority filtering
 * 5. Apply carbon count preference
 * 6. Apply IUPAC tie-breaking rules (locants, heteroatom positions, etc.)
 *
 * Note: Ring atoms are NOT excluded from chain finding. The comparison
 * between ring systems and chains happens at the rule level (P-44.4).
 *
 * @param molecule - The molecule to analyze
 * @param predetectedFunctionalGroups - Optional pre-detected functional groups
 * @param detector - Optional OPSIN functional group detector instance
 * @returns Array of atom indices representing the main chain
 */
export function findMainChain(
  molecule: Molecule,
  predetectedFunctionalGroups?: Array<{
    name?: string;
    type?: string;
    atoms?: (number | { id: number })[];
  }>,
  detector?: OPSINFunctionalGroupDetector,
): number[] {
  // Use pre-detected functional groups if available (they may have expanded atoms for acyl groups)
  // Otherwise detect them fresh from the molecule
  const rawFunctionalGroups =
    predetectedFunctionalGroups ||
    (detector || getSharedDetector()).detectFunctionalGroups(molecule);

  // Normalize functional groups to ensure atoms are number arrays
  const functionalGroups = rawFunctionalGroups.map(
    (fg: {
      name?: string;
      type?: string;
      atoms?: (number | { id: number })[];
    }) => ({
      name: fg.name || fg.type || "",
      type: fg.type || fg.name || "",
      atoms: (fg.atoms || []).map((a: number | { id: number }) =>
        typeof a === "number" ? a : a.id,
      ),
    }),
  );

  const excludedAtomIds = new Set<number>();

  // Collect atom IDs that should be excluded from the parent chain
  // For most functional groups, only heteroatoms (O, N, S, etc.) are excluded
  // The carbon atoms bearing the functional groups should remain in the parent chain
  if (process.env.VERBOSE) {
    console.log(
      `[findMainChain] Detected ${functionalGroups.length} functional groups`,
    );
  }
  for (const fg of functionalGroups) {
    if (process.env.VERBOSE) {
      console.log(
        `[findMainChain] FG: name="${fg.name}", type="${fg.type}", atoms=${fg.atoms}`,
      );
    }
    if (fg.atoms && Array.isArray(fg.atoms)) {
      for (const atomId of fg.atoms) {
        if (typeof atomId === "number") {
          const atom = molecule.atoms[atomId];
          if (!atom) continue;

          // Apply selective exclusion based on functional group type
          const shouldExclude = shouldExcludeAtomFromChain(
            atom,
            fg.name,
            fg.type,
          );
          if (process.env.VERBOSE) {
            console.log(
              `[findMainChain]   Atom ${atomId} (${atom.symbol}): shouldExclude=${shouldExclude}`,
            );
          }
          if (shouldExclude) {
            excludedAtomIds.add(atomId);
          }
        }
      }
    }
  }
  if (process.env.VERBOSE) {
    console.log(
      `[findMainChain] Excluded FG atoms: ${Array.from(excludedAtomIds).join(",")}`,
    );
  }

  // CRITICAL CHECK: Before chain finding, check if molecule has significant ring systems.
  // If ring systems are much larger than any possible acyclic chains, defer to ring selection.
  // This prevents catastrophic failures where tiny ester/ketone chains (2-3 atoms) are selected
  // as parent structures for massive polycyclic molecules (e.g., 66-atom ring systems).
  //
  // Implementation: Count atoms in ring systems. If ring atoms significantly outnumber
  // non-ring carbons, return empty array to let ring-based nomenclature handle it.
  const rings = molecule.rings || [];
  if (rings.length > 0) {
    // Count unique atoms in all rings
    const ringAtomIds = new Set<number>();
    for (const ring of rings) {
      for (const atomId of ring) {
        ringAtomIds.add(atomId);
      }
    }
    
    // Count non-excluded carbon atoms NOT in rings (potential acyclic chain atoms)
    const acyclicCarbons = molecule.atoms.filter(
      (a) =>
        a.symbol === "C" &&
        !excludedAtomIds.has(a.id) &&
        !ringAtomIds.has(a.id),
    ).length;
    
    if (process.env.VERBOSE) {
      console.log(
        `[findMainChain] Ring system analysis: ${ringAtomIds.size} ring atoms, ${acyclicCarbons} acyclic carbons`,
      );
    }
    
    // Heuristic: If ring system has 20+ atoms and acyclic carbons <= 3,
    // this is almost certainly a ring-based parent structure, not a chain.
    // Alternative: if ring system dominates by large ratio (15:1 or more),
    // also defer to ring-based nomenclature.
    // Examples:
    // - 66-atom polycyclic with ester (57 ring atoms, 2 ester carbons) → ring parent
    // - Large bicyclic system with ketone (30+ ring atoms, 1-2 chain carbons) → ring parent
    // - Naphthalene with ester (10 ring atoms, 2 ester carbons) → let normal logic decide
    // - Ethyl benzoate (6 ring atoms, 3 chain carbons) → let normal logic decide
    const ringToAcyclicRatio = acyclicCarbons > 0 ? ringAtomIds.size / acyclicCarbons : Infinity;
    
    if (
      (ringAtomIds.size >= 20 && acyclicCarbons <= 3) ||
      ringToAcyclicRatio >= 15
    ) {
      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain] Large ring system detected (${ringAtomIds.size} atoms, ratio=${ringToAcyclicRatio.toFixed(1)}) with few acyclic carbons (${acyclicCarbons}). Deferring to ring-based nomenclature.`,
        );
      }
      return [];
    }
  }

  // NOTE: We do NOT exclude ring atoms from chain finding here.
  // The P-44.4 rule will compare rings vs chains at the rule level.
  // Excluding ring atoms here would bias the comparison and prevent
  // fair evaluation of ring systems vs acyclic chains.
  //
  // EXCEPTION: When functional groups are present, we DO exclude ring atoms
  // from carbon chain finding. This ensures aromatic rings attached to functional
  // group chains are treated as substituents (e.g., benzyl groups), not part of
  // the main chain. Ring-based parent structures (cycloalkanes, etc.) are handled
  // separately by the ring-finding logic.

  // Consider both carbon-only parent candidates and hetero-containing parent candidates.
  // Find all longest carbon-only chains and all longest heavy-atom chains (non-hydrogen).
  const skipRingAtomsForCarbonChains = functionalGroups.length > 0;
  const carbonChains = findAllCarbonChains(
    molecule,
    excludedAtomIds,
    skipRingAtomsForCarbonChains,
  );
  let atomChains = findAllAtomChains(molecule, excludedAtomIds);

  // Special handling for amines: construct parent chains as [nitrogen] + [longest carbon chain]
  // Example: CN(C)CC should give chain [1,3,4] (N-C-C = ethanamine), not [0,1,3,4] or [2,1,3,4]
  const amineGroups = functionalGroups.filter(
    (fg: { name: string; type: string; atoms: number[] }) =>
      fg.name === "amine",
  );
  if (process.env.VERBOSE) {
    console.log(
      `[findMainChain] Found ${amineGroups.length} amine groups, atomChains.length=${atomChains.length}`,
    );
  }
  if (amineGroups.length > 0) {
    const amineNitrogens = new Set<number>(
      amineGroups.flatMap((fg: { atoms: number[] }) => fg.atoms || []),
    );
    if (process.env.VERBOSE) {
      console.log(
        `[findMainChain] Amine nitrogen atoms: ${Array.from(amineNitrogens).join(",")}`,
      );
    }

    // For each amine nitrogen, construct chains as [N] + [carbon-only chain from N]
    const amineChains: number[][] = [];
    for (const nIdx of amineNitrogens) {
      // Get all carbon neighbors of this nitrogen (excluding hydrogens and excluded atoms)
      const carbonNeighbors = molecule.bonds
        .filter((b) => b.atom1 === nIdx || b.atom2 === nIdx)
        .map((b) => (b.atom1 === nIdx ? b.atom2 : b.atom1))
        .filter(
          (idx) =>
            molecule.atoms[idx]?.symbol === "C" && !excludedAtomIds.has(idx),
        );

      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain] Nitrogen ${nIdx} has ${carbonNeighbors.length} carbon neighbors: ${carbonNeighbors.join(",")}`,
        );
      }

      if (carbonNeighbors.length === 0) {
        // Just nitrogen, no carbon chain (e.g., methylamine = NH2-CH3 where N has no carbon chain)
        // Actually, wait - for methylamine, the carbon IS attached. But if we had just NH3, we'd have no chain.
        // For now, if there are no carbon neighbors, just use [N] as the chain
        amineChains.push([nIdx]);
        continue;
      }

      // For each carbon neighbor, find the longest carbon-only chain starting from that carbon
      // (excluding the nitrogen itself from the chain search)
      const excludeWithN = new Set([...excludedAtomIds, nIdx]);

      for (const carbonStart of carbonNeighbors) {
        // Find all carbon-only chains starting from this carbon
        const chainsFromCarbon = findAllCarbonChainsFromStart(
          molecule,
          carbonStart,
          excludeWithN,
        );

        if (process.env.VERBOSE) {
          console.log(
            `[findMainChain]   From carbon ${carbonStart}: found ${chainsFromCarbon.length} carbon chains`,
          );
        }

        // Prepend nitrogen to each carbon chain to form [N, C, C, ...]
        for (const carbonChain of chainsFromCarbon) {
          const fullChain = [nIdx, ...carbonChain];
          amineChains.push(fullChain);
          if (process.env.VERBOSE) {
            console.log(
              `[findMainChain]     Amine chain: [${fullChain.join(",")}]`,
            );
          }
        }
      }
    }

    // NOTE: Removed incorrect diamine special handling
    // For IUPAC naming, primary/secondary amines are functional groups, NOT part of the parent chain
    // Example: ethane-1,2-diamine has parent "ethane" (C-C) with -NH2 groups at positions 1,2
    // Nitrogen should only be in the parent chain for heterocyclic compounds (azines, azoles, etc.)

    // Convert amine chains [N, C, C, ...] to carbon-only chains [C, C, ...]
    // These carbon chains will be given amine priority during chain selection
    if (amineChains.length > 0) {
      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain] Found ${amineChains.length} amine-specific chains`,
        );
      }
      // Extract carbon-only portions from amine chains and add to carbon chain pool
      for (const amineChain of amineChains) {
        // Skip the nitrogen (first atom) and get the carbon chain
        if (amineChain.length > 1) {
          const carbonOnlyChain = amineChain.slice(1); // Remove N, keep [C, C, ...]
          carbonChains.push(carbonOnlyChain);
          if (process.env.VERBOSE) {
            console.log(
              `[findMainChain]   Added carbon chain from amine: [${carbonOnlyChain.join(",")}]`,
            );
          }
        }
      }
    }
  }

  // Special handling for carbon-based functional groups (amides, ketones, carboxylic acids, esters, etc.)
  // These functional groups should prioritize chains containing their carbonyl carbon,
  // even if those chains are shorter than other carbon chains in the molecule.
  const carbonFunctionalGroups = functionalGroups.filter(
    (fg: { name: string; type: string; atoms: number[] }) =>
      fg.name === "amide" ||
      fg.name === "carboxylic acid" ||
      fg.name === "ester" ||
      fg.name === "ketone" ||
      fg.name === "aldehyde" ||
      fg.name === "acyl halide",
  );

  if (carbonFunctionalGroups.length > 0) {
    // Find the carbon atoms in these functional groups (typically the carbonyl carbon)
    const functionalCarbons = new Set<number>();
    for (const fg of carbonFunctionalGroups) {
      for (const atomId of fg.atoms) {
        const atom = molecule.atoms[atomId];
        if (atom && atom.symbol === "C" && !excludedAtomIds.has(atomId)) {
          functionalCarbons.add(atomId);
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[findMainChain] Found ${carbonFunctionalGroups.length} carbon-based functional groups with carbon atoms: ${Array.from(functionalCarbons).join(",")}`,
      );
    }

    // For each functional carbon, find chains containing it
    const additionalCarbonChains: number[][] = [];
    for (const fcIdx of functionalCarbons) {
      // Find all carbon-only chains starting from this functional carbon
      // Skip ring atoms to prevent traversing into aromatic rings (treat as substituents)
      const chainsFromFC = findAllCarbonChainsFromStart(
        molecule,
        fcIdx,
        excludedAtomIds,
        true, // skipRingAtoms
      );

      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain]   From functional carbon ${fcIdx}: found ${chainsFromFC.length} carbon chains`,
        );
      }

      for (const chain of chainsFromFC) {
        additionalCarbonChains.push(chain);
      }
    }

    // Add these chains to carbonChains if they're not already there
    // (avoid duplicates by checking if chain is already in carbonChains)
    for (const newChain of additionalCarbonChains) {
      const chainStr = newChain.join(",");
      const reverseStr = [...newChain].reverse().join(",");
      const isDuplicate = carbonChains.some(
        (existingChain) =>
          existingChain.join(",") === chainStr ||
          existingChain.join(",") === reverseStr,
      );
      if (!isDuplicate) {
        carbonChains.push(newChain);
        if (process.env.VERBOSE) {
          console.log(
            `[findMainChain]     Added functional group chain: [${newChain.join(",")}]`,
          );
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[findMainChain] carbonChains: ${JSON.stringify(carbonChains)}, atomChains: ${JSON.stringify(atomChains)}`,
    );
  }

  // Primary preference is by number of carbons in the parent chain. Compute the
  // longest carbon-only chain length; consider hetero-containing chains only if
  // they have the same number of carbons.
  const maxCarbonLen = carbonChains.length
    ? Math.max(...carbonChains.map((c) => c.length))
    : 0;

  // STRATEGY: First evaluate all chains (carbon and hetero) for functional group priority.
  // Then select candidates based on priority + carbon count.
  // This ensures chains with high-priority functional groups (like amines) are not
  // excluded just because they have different carbon counts than pure carbon chains.
  //
  // IMPORTANT: Only include heteroatom chains for functional groups that require them
  // (like amines where N is part of the parent). For esters, ketones, alcohols, etc.,
  // heteroatoms should be treated as substituents, not part of the main chain.

  // Step 1: Compute functional group priorities for ALL chains
  const allChains: number[][] = [];
  const allPriorities: number[] = [];

  // Add all carbon-only chains
  for (const c of carbonChains) {
    allChains.push(c);
    allPriorities.push(getChainFunctionalGroupPriority(c, molecule));
  }

  // Add all hetero chains ONLY if a functional group requires heteroatom chains
  // NOTE: Primary/secondary amines do NOT require nitrogen in parent chain - they are functional groups
  // Heterocyclic nitrogen compounds (azines, azoles) would be handled differently
  if (requiresHeteroatomChains(functionalGroups)) {
    for (const c of atomChains) {
      if (!containsHalogen(c, molecule)) {
        allChains.push(c);
        const priority = getChainFunctionalGroupPriority(c, molecule);
        allPriorities.push(priority);
      }
    }
  }

  if (allChains.length === 0) return [];

  if (process.env.VERBOSE) {
    console.log("[findMainChain] All chain priorities:");
    allChains.forEach((c, i) => {
      const carbonCount = c.filter(
        (idx) => molecule.atoms[idx] && molecule.atoms[idx].symbol === "C",
      ).length;
      console.log(
        `  Chain [${c}]: priority=${allPriorities[i]}, carbons=${carbonCount}, length=${c.length}`,
      );
    });
  }

  // Step 2: Find the highest functional group priority (lowest number = highest priority)
  let minPriority = Math.min(...allPriorities);

  // Step 2.5: Check for diamine backbone override
  const amineNitrogens = new Set<number>(
    amineGroups.flatMap((fg: { atoms: number[] }) => fg.atoms || []),
  );

  if (process.env.VERBOSE) {
    console.log(
      `[findMainChain] Diamine check: amineNitrogens.size=${amineNitrogens.size}, minPriority=${minPriority}`,
    );
  }

  if (amineNitrogens.size >= 2 && minPriority === 10) {
    const diamineBackbones: number[][] = [];
    const diamineBackbonePriorities: number[] = [];

    for (let i = 0; i < allChains.length; i++) {
      const chain = allChains[i];
      if (chain && isDiamineBackbone(chain, molecule, amineNitrogens)) {
        diamineBackbones.push(chain);
        diamineBackbonePriorities.push(allPriorities[i] || 999);
        if (process.env.VERBOSE) {
          console.log(
            `[findMainChain] Found diamine backbone: [${chain}] with priority=${allPriorities[i]}`,
          );
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[findMainChain] Found ${diamineBackbones.length} diamine backbone(s)`,
      );
    }

    if (diamineBackbones.length > 0) {
      const bestDiaminePriority = Math.min(...diamineBackbonePriorities);

      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain] Best diamine priority: ${bestDiaminePriority}`,
        );
      }

      if (bestDiaminePriority === 13) {
        const hasSingleCarbonAlcohols = allChains.some(
          (c, i) =>
            allPriorities[i] === 10 &&
            c.length === 1 &&
            c[0] !== undefined &&
            molecule.atoms[c[0]]?.symbol === "C",
        );

        if (process.env.VERBOSE) {
          console.log(
            `[findMainChain] Has single-carbon alcohols: ${hasSingleCarbonAlcohols}`,
          );
        }

        if (hasSingleCarbonAlcohols) {
          if (process.env.VERBOSE) {
            console.log(
              `[findMainChain] Diamine backbone override: using priority=13 instead of priority=10`,
            );
          }
          minPriority = 13;
        }
      }
    }
  }

  // Step 3: Filter to chains with best priority
  const bestPriorityChains: number[][] = [];
  for (let i = 0; i < allChains.length; i++) {
    if (allPriorities[i] === minPriority) {
      const chain = allChains[i];
      if (chain) {
        bestPriorityChains.push(chain);
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[findMainChain] Filtered to ${bestPriorityChains.length} chains with minPriority=${minPriority}`,
    );
  }

  // Step 4: Among chains with highest priority, select by carbon count
  const candidates: number[][] = [];
  if (minPriority < 999) {
    // If we have functional groups, prefer chains with most carbons among best-priority chains
    const maxCarbonInPriority = Math.max(
      ...bestPriorityChains.map(
        (c) =>
          c.filter(
            (idx) => molecule.atoms[idx] && molecule.atoms[idx].symbol === "C",
          ).length,
      ),
    );
    for (const c of bestPriorityChains) {
      const carbonCount = c.filter(
        (idx) => molecule.atoms[idx] && molecule.atoms[idx].symbol === "C",
      ).length;
      if (carbonCount === maxCarbonInPriority) {
        candidates.push(c);
      }
    }
  } else {
    // No functional groups: prefer pure carbon chains if available
    if (maxCarbonLen >= 1) {
      // Take all carbon-only chains with maxCarbonLen
      for (const c of carbonChains) {
        if (c.length === maxCarbonLen) candidates.push(c);
      }
      // If no carbon-only chains at maxCarbonLen, fall back to hetero chains
      if (candidates.length === 0) {
        const maxAtomLen = atomChains.length
          ? Math.max(...atomChains.map((c) => c.length))
          : 0;
        for (const c of atomChains) {
          if (c.length === maxAtomLen && !containsHalogen(c, molecule))
            candidates.push(c);
        }
      }
    } else {
      // No carbon chains at all: use longest hetero chains
      const maxAtomLen = atomChains.length
        ? Math.max(...atomChains.map((c) => c.length))
        : 0;
      if (maxAtomLen < 1) return [];
      for (const c of atomChains) {
        if (c.length === maxAtomLen && !containsHalogen(c, molecule))
          candidates.push(c);
      }
    }
  }

  if (candidates.length === 0) return [];

  // Always evaluate orientation, even for single candidates, to ensure lowest locants
  // (Removed early return that prevented orientation check)

  // Evaluate candidates using IUPAC tie-break rules:
  // 1) Prefer chain that contains a principal functional group (carboxylic acid, sulfonic
  //    acid, amide, aldehyde/ketone, alcohol) if present in only some candidates.
  // 2) If none/ambiguous, prefer hydrocarbon chain (all-C) when lengths equal and no
  //    principal functional group favors a hetero chain.
  // 3) If still tied, fall back to priority locants and OPSIN-like heuristics already
  //    implemented below.

  // Compute functional-group priority for each candidate
  const fgPriorities = candidates.map((c) =>
    getChainFunctionalGroupPriority(c, molecule),
  );
  if (process.env.VERBOSE) {
    console.log("[findMainChain] Functional group priorities for candidates:");
    candidates.forEach((c, i) => {
      console.log(
        `  Chain ${i} [${c.join(",")}]: priority = ${fgPriorities[i]}`,
      );
    });
  }
  const minFG = Math.min(...fgPriorities);
  if (minFG < 999) {
    // Prefer any candidate with the highest functional group priority (lowest number)
    const filtered = candidates.filter((_, i) => fgPriorities[i] === minFG);
    // Always check orientation even for single functional group candidates
    // if (filtered.length === 1) return filtered[0]!;
    // otherwise restrict candidates to filtered set and continue
    candidates.length = 0;
    candidates.push(...filtered);
  } else {
    // No principal functional groups found in any candidate: prefer hydrocarbon chain(s)
    const hydroCandidates = candidates.filter((c) =>
      isHydrocarbonChain(c, molecule),
    );
    // Always check orientation even for single hydrocarbon candidates
    // if (hydroCandidates.length === 1) return hydroCandidates[0]!;
    if (hydroCandidates.length > 0) {
      // restrict to hydrocarbon candidates only
      candidates.length = 0;
      candidates.push(...hydroCandidates);
    }
    // else continue with mixed candidates if no hydrocarbon-only candidate isolated
  }

  // NEW TIE-BREAKER: Prefer chains with more direct functional group attachments
  // This helps when sulfonyl/sulfinyl groups are present - we want chains where
  // the functional groups are directly attached to chain atoms, not buried in substituents
  if (candidates.length > 1) {
    const fgAttachmentCounts = candidates.map((c) =>
      countDirectFunctionalGroupAttachments(c, molecule, functionalGroups),
    );
    const maxAttachments = Math.max(...fgAttachmentCounts);

    if (process.env.VERBOSE) {
      console.log("[findMainChain] Direct FG attachment counts:");
      candidates.forEach((c, i) => {
        console.log(
          `  Chain ${i} [${c.join(",")}]: ${fgAttachmentCounts[i]} direct FG attachments`,
        );
      });
    }

    if (maxAttachments > 0) {
      const filteredByFG = candidates.filter(
        (_, i) => fgAttachmentCounts[i] === maxAttachments,
      );
      if (filteredByFG.length > 0) {
        candidates.length = 0;
        candidates.push(...filteredByFG);
        if (process.env.VERBOSE) {
          console.log(
            `[findMainChain] Filtered to ${filteredByFG.length} chains with max FG attachments (${maxAttachments})`,
          );
        }
      }
    }
  }

  // Now apply existing priority-locant logic and heuristics among remaining candidates
  let bestChain = candidates[0]!;
  let bestPositions: number[] = [];
  let bestCount = 0;
  let bestPriorityLocants: [number[], number[], number[]] | null = null;

  for (const chain of candidates) {
    // Check for functional groups and orient chain to give them lowest numbers
    const fgPositions = getFunctionalGroupPositions(chain, molecule);
    const fgPositionsReversed = getFunctionalGroupPositions(
      [...chain].reverse(),
      molecule,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[findMainChain] Chain [${chain}]: fgPositions=${JSON.stringify(fgPositions)}, reversed fgPositions=${JSON.stringify(fgPositionsReversed)}`,
      );
    }

    let shouldReverse = false;
    if (fgPositions.length > 0 || fgPositionsReversed.length > 0) {
      // If one orientation has functional groups and the other doesn't, prefer the one with FG
      // If both have FG, compare their positions (lower is better)
      shouldReverse = isBetterLocants(fgPositionsReversed, fgPositions);
      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain] Comparing FG locants: reversed ${JSON.stringify(fgPositionsReversed)} vs original ${JSON.stringify(fgPositions)}, shouldReverse=${shouldReverse}`,
        );
      }
    } else {
      let priority = getPriorityLocants(molecule, chain);
      const renum = renumberPriorityLocants(priority, chain.length);
      shouldReverse = isBetterPriorityLocants(renum, priority);
    }

    const chosenChain = shouldReverse ? [...chain].reverse() : chain;
    const chosenPriority = getPriorityLocants(molecule, chosenChain);

    // Calculate positions AFTER orienting the chain
    const substituents = findSubstituents(molecule, chosenChain);
    const positions = substituents
      .map((s) => parseInt(s.position))
      .sort((a, b) => a - b);
    const count = substituents.length;

    if (bestPriorityLocants === null) {
      bestChain = chosenChain;
      bestPositions = positions;
      bestCount = count;
      bestPriorityLocants = chosenPriority;
      continue;
    }

    if (isBetterPriorityLocants(chosenPriority, bestPriorityLocants)) {
      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain] Chain [${chosenChain}] has better priority locants than [${bestChain}]`,
        );
      }
      bestChain = chosenChain;
      bestPositions = positions;
      bestCount = count;
      bestPriorityLocants = chosenPriority;
    } else if (
      JSON.stringify(chosenPriority) === JSON.stringify(bestPriorityLocants)
    ) {
      if (process.env.VERBOSE) {
        console.log(
          `[findMainChain] Chain [${chosenChain}] has equal priority locants to [${bestChain}]`,
        );
      }
      if (isBetterByOpsinHeuristics(molecule, chosenChain, bestChain)) {
        if (process.env.VERBOSE) {
          console.log(
            `[findMainChain] Chain [${chosenChain}] is better by OPSIN heuristics`,
          );
        }
        bestChain = chosenChain;
        bestPositions = positions;
        bestCount = count;
      } else {
        if (process.env.VERBOSE) {
          console.log(
            `[findMainChain] Comparing chains using compareChains(): [${chosenChain}] vs [${bestChain}]`,
          );
        }
        const isBetter = compareChains(
          positions,
          count,
          chosenChain,
          bestPositions,
          bestCount,
          bestChain,
        );
        if (process.env.VERBOSE) {
          console.log(`[findMainChain] compareChains result: ${isBetter}`);
        }
        if (isBetter) {
          bestChain = chosenChain;
          bestPositions = positions;
          bestCount = count;
        }
      }
    }
  }

  return bestChain;
}
