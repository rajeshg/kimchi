import type { Molecule, Bond } from "types";
import type { FunctionalGroup } from "../../../types";
import { buildRingSubstituentAlkylName } from "../ring-substituent-naming";
import {
  getComplexMultiplier,
  getSimpleMultiplier,
} from "../../../opsin-adapter";
import { getSharedOPSINService } from "../../../opsin-service";
import type { OPSINService } from "../../../opsin-service";

function detectAmideGroup(
  atomId: number,
  molecule: Molecule,
  visited: Set<number> = new Set(),
): { carbonylC: number; nitrogen: number } | null {
  const atom = molecule.atoms[atomId];
  if (!atom) return null;

  // Prevent infinite recursion
  if (visited.has(atomId)) {
    if (process.env.VERBOSE) {
      console.log(
        `[detectAmideGroup] Already visited atom ${atomId}, skipping`,
      );
    }
    return null;
  }
  visited.add(atomId);

  if (process.env.VERBOSE) {
    console.log(`[detectAmideGroup] Checking atom ${atomId} (${atom.symbol})`);
  }

  // If this is already a carbonyl carbon, check for amide pattern
  if (atom.symbol === "C") {
    let hasDoubleBondToO = false;
    for (const bond of molecule.bonds) {
      if (bond.type === "double") {
        if (
          (bond.atom1 === atomId &&
            molecule.atoms[bond.atom2]?.symbol === "O") ||
          (bond.atom2 === atomId && molecule.atoms[bond.atom1]?.symbol === "O")
        ) {
          hasDoubleBondToO = true;
          break;
        }
      }
    }

    if (process.env.VERBOSE && hasDoubleBondToO) {
      if (process.env.VERBOSE) {
        console.log(`[detectAmideGroup] Atom ${atomId} has C=O`);
      }
    }

    // If this carbon has C=O, check if it's an amide (also has C-N)
    if (hasDoubleBondToO) {
      for (const bond of molecule.bonds) {
        if (bond.type === "single") {
          if (
            bond.atom1 === atomId &&
            molecule.atoms[bond.atom2]?.symbol === "N"
          ) {
            if (process.env.VERBOSE) {
              console.log(
                `[detectAmideGroup] Found amide: C=${atomId}, N=${bond.atom2}`,
              );
            }
            return { carbonylC: atomId, nitrogen: bond.atom2 };
          } else if (
            bond.atom2 === atomId &&
            molecule.atoms[bond.atom1]?.symbol === "N"
          ) {
            if (process.env.VERBOSE) {
              console.log(
                `[detectAmideGroup] Found amide: C=${atomId}, N=${bond.atom1}`,
              );
            }
            return { carbonylC: atomId, nitrogen: bond.atom1 };
          }
        }
      }
      // Has C=O but no N, not an amide
      return null;
    }

    // This carbon doesn't have C=O, check neighbors
    const neighbors: number[] = [];
    for (const bond of molecule.bonds) {
      if (bond.type === "single") {
        let neighborId: number | undefined;
        if (bond.atom1 === atomId) neighborId = bond.atom2;
        else if (bond.atom2 === atomId) neighborId = bond.atom1;

        if (neighborId !== undefined) {
          neighbors.push(neighborId);
          const neighbor = molecule.atoms[neighborId];
          if (process.env.VERBOSE) {
            console.log(
              `[detectAmideGroup] Neighbor ${neighborId}: ${neighbor?.symbol || "undefined"}`,
            );
          }
          if (neighbor?.symbol === "C") {
            if (process.env.VERBOSE) {
              console.log(
                `[detectAmideGroup] Recursing to neighbor ${neighborId}`,
              );
            }
            const check = detectAmideGroup(neighborId, molecule, visited);
            if (check) return check;
          }
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[detectAmideGroup] No amide found from atom ${atomId}, checked ${neighbors.length} neighbors`,
      );
    }
  }

  return null;
}

function findAromaticRingAtoms(
  startAtomId: number,
  molecule: Molecule,
): number[] {
  const ringAtoms: number[] = [];
  const visited = new Set<number>();
  const queue = [startAtomId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.aromatic) {
      ringAtoms.push(currentId);

      // Find aromatic neighbors
      for (const bond of molecule.bonds) {
        if (bond.type === "aromatic" || bond.type === "single") {
          let neighborId: number | undefined;
          if (bond.atom1 === currentId) neighborId = bond.atom2;
          else if (bond.atom2 === currentId) neighborId = bond.atom1;

          if (neighborId !== undefined && !visited.has(neighborId)) {
            const neighbor = molecule.atoms[neighborId];
            if (neighbor?.aromatic) {
              queue.push(neighborId);
            }
          }
        }
      }
    }
  }

  return ringAtoms;
}

function findRingSubstituents(
  attachmentAtomId: number,
  nitrogenId: number,
  molecule: Molecule,
): Array<{ position: number; name: string }> {
  // Find all atoms in the aromatic ring
  const ringAtoms = findAromaticRingAtoms(attachmentAtomId, molecule);

  if (process.env.VERBOSE) {
    console.log("[findRingSubstituents] ringAtoms:", ringAtoms);
  }

  // Number the ring positions (1 = attachment point)
  // Walk around the ring sequentially to assign positions
  const positionMap = new Map<number, number>();
  positionMap.set(attachmentAtomId, 1);

  // Build adjacency list for ring atoms
  const adjacency = new Map<number, number[]>();
  for (const atomId of ringAtoms) {
    adjacency.set(atomId, []);
  }

  for (const bond of molecule.bonds) {
    if (
      bond.type === "aromatic" ||
      (bond.type === "single" &&
        molecule.atoms[bond.atom1]?.aromatic &&
        molecule.atoms[bond.atom2]?.aromatic)
    ) {
      if (ringAtoms.includes(bond.atom1) && ringAtoms.includes(bond.atom2)) {
        adjacency.get(bond.atom1)!.push(bond.atom2);
        adjacency.get(bond.atom2)!.push(bond.atom1);
      }
    }
  }

  // Walk around the ring from the attachment point
  const ordered: number[] = [attachmentAtomId];
  const visited = new Set<number>([attachmentAtomId]);
  let current = attachmentAtomId;

  while (ordered.length < ringAtoms.length) {
    const neighbors = adjacency.get(current) || [];
    let nextAtom: number | undefined;

    // Find the first unvisited neighbor
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && ringAtoms.includes(neighbor)) {
        nextAtom = neighbor;
        break;
      }
    }

    if (nextAtom === undefined) break;

    ordered.push(nextAtom);
    visited.add(nextAtom);
    current = nextAtom;
  }

  // Assign positions based on ordered walk
  for (let i = 0; i < ordered.length; i++) {
    positionMap.set(ordered[i]!, i + 1);
  }

  // Find substituents on each ring atom
  const substituents: Array<{ position: number; name: string }> = [];

  for (const atomId of ringAtoms) {
    const position = positionMap.get(atomId);
    if (!position) continue;

    // Check neighbors for substituents
    for (const bond of molecule.bonds) {
      if (bond.type !== "single") continue;

      let neighborId: number | undefined;
      if (bond.atom1 === atomId) neighborId = bond.atom2;
      else if (bond.atom2 === atomId) neighborId = bond.atom1;

      if (neighborId === undefined || neighborId === nitrogenId) continue;

      const neighbor = molecule.atoms[neighborId];
      if (!neighbor || ringAtoms.includes(neighborId)) continue;

      // Identify substituent type
      if (neighbor.symbol === "N" && neighbor.charge === 1) {
        // Nitro group
        substituents.push({ position, name: "nitro" });
      } else if (neighbor.symbol === "C") {
        // Check for trifluoromethyl
        const fluorines: number[] = [];
        for (const b2 of molecule.bonds) {
          if (b2.type === "single") {
            let fId: number | undefined;
            if (
              b2.atom1 === neighborId &&
              molecule.atoms[b2.atom2]?.symbol === "F"
            )
              fId = b2.atom2;
            else if (
              b2.atom2 === neighborId &&
              molecule.atoms[b2.atom1]?.symbol === "F"
            )
              fId = b2.atom1;
            if (fId !== undefined) fluorines.push(fId);
          }
        }

        if (fluorines.length === 3) {
          substituents.push({ position, name: "trifluoromethyl" });
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log("[findRingSubstituents] substituents:", substituents);
  }

  return substituents;
}

function buildAnilinoPart(
  substituents: Array<{ position: number; name: string }>,
): string {
  if (substituents.length === 0) {
    return "anilino";
  }

  // Build parts with positions
  const parts: string[] = [];
  for (const sub of substituents) {
    const name = sub.name;
    // Complex substituents in parentheses
    if (name.includes("trifluoro") || name.includes("dimethyl")) {
      parts.push(`${sub.position}-(${name})`);
    } else {
      parts.push(`${sub.position}-${name}`);
    }
  }

  // Sort alphabetically by substituent name
  parts.sort((a, b) => {
    const aName = a.replace(/^\d+-\(?/, "").replace(/\)?$/, "");
    const bName = b.replace(/^\d+-\(?/, "").replace(/\)?$/, "");
    return aName.localeCompare(bName);
  });

  return `${parts.join("-")}anilino`;
}

function buildComplexAlkoxyWithAmide(
  alkoxyCarbonId: number,
  esterOxygenId: number,
  amideInfo: { carbonylC: number; nitrogen: number },
  molecule: Molecule,
): string | null {
  if (process.env.VERBOSE) {
    console.log(
      "[buildComplexAlkoxyWithAmide] alkoxyCarbonId:",
      alkoxyCarbonId,
    );
    if (process.env.VERBOSE) {
      console.log("[buildComplexAlkoxyWithAmide] amideInfo:", amideInfo);
    }
  }

  // Build the alkoxy chain structure
  // The alkoxyCarbonId is the central carbon (propan-2-yl in the example)
  // Find all substituents on this carbon
  const _substituents: Array<{
    type: string;
    name: string;
    locant: number;
    atomId: number;
  }> = [];

  // Get all neighbors of alkoxy carbon
  const neighbors: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.type === "single") {
      if (bond.atom1 === alkoxyCarbonId && bond.atom2 !== esterOxygenId) {
        neighbors.push(bond.atom2);
      } else if (
        bond.atom2 === alkoxyCarbonId &&
        bond.atom1 !== esterOxygenId
      ) {
        neighbors.push(bond.atom1);
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildComplexAlkoxyWithAmide] neighbors of alkoxyCarbonId:",
      neighbors,
    );
  }

  // Classify neighbors: methyl branches, amide carbonyl, etc.
  let chainLength = 1; // Start with the alkoxy carbon itself
  const methylGroups: number[] = [];
  let amideCarbonylId: number | undefined;

  for (const nId of neighbors) {
    const nAtom = molecule.atoms[nId];
    if (!nAtom) continue;

    if (nAtom.symbol === "C") {
      // Check if this is the amide carbonyl
      if (nId === amideInfo.carbonylC) {
        amideCarbonylId = nId;
        chainLength++; // The amide carbonyl is part of the main chain
      } else {
        // Check if it's a terminal methyl (degree 1 or only connected to alkoxy carbon)
        const degree = molecule.bonds.filter(
          (b) => b.atom1 === nId || b.atom2 === nId,
        ).length;
        if (degree === 1) {
          methylGroups.push(nId);
        } else {
          // Could be part of a longer chain - for now, treat as methyl
          methylGroups.push(nId);
        }
      }
    }
  }

  // If we have multiple methyls, one should be counted as chain extension
  if (methylGroups.length === 2) {
    chainLength++; // One methyl extends the chain to make it propan
    methylGroups.pop(); // Remove one from the methyl groups list
  }

  if (!amideCarbonylId) {
    if (process.env.VERBOSE) {
      console.log(
        "[buildComplexAlkoxyWithAmide] No amide carbonyl found as direct neighbor",
      );
    }
    return null;
  }

  // Now analyze the aromatic ring attached to the amide nitrogen
  const nitrogenId = amideInfo.nitrogen;
  let aromaticRingAtomId: number | undefined;

  for (const bond of molecule.bonds) {
    if (bond.type === "single") {
      if (bond.atom1 === nitrogenId) {
        const neighbor = molecule.atoms[bond.atom2];
        if (neighbor?.symbol === "C" && neighbor.aromatic) {
          aromaticRingAtomId = bond.atom2;
          break;
        }
      } else if (bond.atom2 === nitrogenId) {
        const neighbor = molecule.atoms[bond.atom1];
        if (neighbor?.symbol === "C" && neighbor.aromatic) {
          aromaticRingAtomId = bond.atom1;
          break;
        }
      }
    }
  }

  if (!aromaticRingAtomId) {
    if (process.env.VERBOSE) {
      console.log("[buildComplexAlkoxyWithAmide] No aromatic ring found");
    }
    return null;
  }

  // Find ring substituents
  const ringSubstituents = findRingSubstituents(
    aromaticRingAtomId,
    nitrogenId,
    molecule,
  );

  // Build the anilino part: [4-nitro-3-(trifluoromethyl)anilino]
  const anilinoPart = buildAnilinoPart(ringSubstituents);

  // Build the complete name
  // Pattern: [2-methyl-1-[anilino]-1-oxopropan-2-yl]
  // Numbering: alkoxy carbon is position 2, amide carbonyl is position 1
  const parts: string[] = [];

  // Methyl substituents at position 2
  if (methylGroups.length > 0) {
    if (methylGroups.length === 1) {
      parts.push("2-methyl");
    } else if (methylGroups.length === 2) {
      parts.push("2,2-dimethyl");
    }
  }

  // Anilino substituent at position 1
  parts.push(`1-[${anilinoPart}]`);

  // Oxo group at position 1
  parts.push("1-oxo");

  // Base name: propan-2-yl (3 carbons total: 2 methyls counted as branches + alkoxy C + amide C = but we need to count properly)
  // Actually: alkoxy carbon + amide carbon = 2 carbons in main chain, plus the connection point
  // Wait, let's reconsider: position 1 = amide C, position 2 = alkoxy C
  // So we have a 2-carbon chain + 1 for connection = propan
  const baseName =
    chainLength === 1 ? "methan" : chainLength === 2 ? "ethan" : "propan";

  // Alphabetical order for substituents
  parts.sort((a, b) => {
    const aName = a.replace(/^[0-9,[\]-]+-/, "");
    const bName = b.replace(/^[0-9,[\]-]+-/, "");
    return aName.localeCompare(bName);
  });

  const fullName = `[${parts.join("-")}${baseName}-2-yl]`;

  if (process.env.VERBOSE) {
    console.log("[buildComplexAlkoxyWithAmide] Built name:", fullName);
  }

  return fullName;
}

function getChainDepth(
  startId: number,
  parentId: number,
  molecule: Molecule,
  visited: Set<number>,
): number {
  const newVisited = new Set(visited);
  newVisited.add(startId);

  let maxDepth = 1; // Count the current carbon

  // Find all carbon neighbors except parent
  const neighbors: number[] = [];
  for (const bond of molecule.bonds) {
    const atom1 = molecule.atoms[bond.atom1];
    const atom2 = molecule.atoms[bond.atom2];

    if (
      bond.atom1 === startId &&
      atom2?.symbol === "C" &&
      bond.atom2 !== parentId &&
      !newVisited.has(bond.atom2)
    ) {
      neighbors.push(bond.atom2);
    } else if (
      bond.atom2 === startId &&
      atom1?.symbol === "C" &&
      bond.atom1 !== parentId &&
      !newVisited.has(bond.atom1)
    ) {
      neighbors.push(bond.atom1);
    }
  }

  // Recurse into each neighbor and find max depth
  for (const neighborId of neighbors) {
    const depth = 1 + getChainDepth(neighborId, startId, molecule, newVisited);
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return maxDepth;
}

function addBranchToAlkoxyCarbonIds(
  branchId: number,
  molecule: Molecule,
  alkoxyCarbonIds: Set<number>,
  visited: Set<number>,
): void {
  if (visited.has(branchId)) return;

  visited.add(branchId);
  alkoxyCarbonIds.add(branchId);

  // Find all carbon neighbors
  for (const bond of molecule.bonds) {
    const atom1 = molecule.atoms[bond.atom1];
    const atom2 = molecule.atoms[bond.atom2];

    if (
      bond.atom1 === branchId &&
      atom2?.symbol === "C" &&
      !visited.has(bond.atom2)
    ) {
      addBranchToAlkoxyCarbonIds(
        bond.atom2,
        molecule,
        alkoxyCarbonIds,
        visited,
      );
    } else if (
      bond.atom2 === branchId &&
      atom1?.symbol === "C" &&
      !visited.has(bond.atom1)
    ) {
      addBranchToAlkoxyCarbonIds(
        bond.atom1,
        molecule,
        alkoxyCarbonIds,
        visited,
      );
    }
  }
}

export function getAlkoxyGroupName(
  esterGroup: FunctionalGroup,
  molecule: Molecule,
  functionalGroups?: FunctionalGroup[],
  opsinService?: OPSINService,
): string {
  // Find carbonyl carbon and ester oxygen
  let carbonylCarbonId: number | undefined;
  let esterOxygenId: number | undefined;

  if (esterGroup.atoms && esterGroup.atoms.length >= 2) {
    // Find carbonyl carbon
    // Note: esterGroup.atoms can be either atom IDs (numbers) or atom objects
    for (const atomOrId of esterGroup.atoms) {
      const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
      const atom = molecule.atoms[atomId];
      if (atom?.symbol === "C") {
        const hasDoubleBondToO = molecule.bonds.some(
          (bond: Bond) =>
            bond.type === "double" &&
            ((bond.atom1 === atomId &&
              molecule.atoms[bond.atom2]?.symbol === "O") ||
              (bond.atom2 === atomId &&
                molecule.atoms[bond.atom1]?.symbol === "O")),
        );
        if (hasDoubleBondToO) {
          carbonylCarbonId = atomId;
          break;
        }
      }
    }

    // Find ester oxygen
    if (carbonylCarbonId !== undefined) {
      for (const atomOrId of esterGroup.atoms) {
        const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === "O") {
          const isSingleBonded = molecule.bonds.some(
            (bond: Bond) =>
              bond.type === "single" &&
              ((bond.atom1 === carbonylCarbonId && bond.atom2 === atomId) ||
                (bond.atom2 === carbonylCarbonId && bond.atom1 === atomId)),
          );
          if (isSingleBonded) {
            esterOxygenId = atomId;
            break;
          }
        }
      }
    }
  }

  if (!esterOxygenId) {
    return "alkyl";
  }

  // Find alkoxy carbon (carbon bonded to ester oxygen, not carbonyl carbon)
  let alkoxyCarbonId: number | undefined;
  for (const bond of molecule.bonds) {
    if (bond.type === "single") {
      const atom1 = molecule.atoms[bond.atom1];
      const atom2 = molecule.atoms[bond.atom2];

      if (
        bond.atom1 === esterOxygenId &&
        atom2?.symbol === "C" &&
        bond.atom2 !== carbonylCarbonId
      ) {
        alkoxyCarbonId = bond.atom2;
        break;
      } else if (
        bond.atom2 === esterOxygenId &&
        atom1?.symbol === "C" &&
        bond.atom1 !== carbonylCarbonId
      ) {
        alkoxyCarbonId = bond.atom1;
        break;
      }
    }
  }

  if (alkoxyCarbonId === undefined || esterOxygenId === undefined) {
    return "alkyl";
  }

  // **COMPLEX ESTER CHECK**: Check if alkoxy carbon is connected to an amide group
  // Pattern: R-O-C(R')(R'')(C(=O)N-Ar) where Ar is an aromatic ring
  const amideCheck = detectAmideGroup(alkoxyCarbonId, molecule);

  if (amideCheck) {
    // Found an amide group attached to the alkoxy carbon
    // This requires complex nomenclature: [substituents-anilino-oxo-yl]alkanoate
    if (process.env.VERBOSE) {
      console.log(
        "[getAlkoxyGroupName] Detected amide group at alkoxy carbon:",
        amideCheck,
      );
    }

    const complexName = buildComplexAlkoxyWithAmide(
      alkoxyCarbonId,
      esterOxygenId,
      amideCheck,
      molecule,
    );
    if (complexName) {
      return complexName;
    }
    // Fall through to regular logic if complex naming fails
  }

  // BFS from alkoxy carbon to find chain length and branches
  const visited = new Set<number>();
  const queue: Array<{ id: number; parent: number | null }> = [
    { id: alkoxyCarbonId, parent: esterOxygenId },
  ];
  const carbonChain: number[] = [];
  const branches = new Map<number, number[]>(); // position -> branch carbon IDs
  const alkoxyCarbonIds = new Set<number>();

  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] Starting BFS from alkoxyCarbonId:",
      alkoxyCarbonId,
    );
  }

  while (queue.length > 0) {
    const { id: currentId, parent: parentId } = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === "C") {
      carbonChain.push(currentId);
      alkoxyCarbonIds.add(currentId);

      if (process.env.VERBOSE) {
        console.log(
          `[getAlkoxyGroupName] Visiting carbon ${currentId}, chain position ${carbonChain.length}`,
        );
      }

      // Find neighbors
      const neighbors: number[] = [];
      for (const bond of molecule.bonds) {
        if (bond.type === "single") {
          if (bond.atom1 === currentId) {
            const otherId = bond.atom2;
            if (
              otherId !== parentId &&
              otherId !== esterOxygenId &&
              molecule.atoms[otherId]?.symbol === "C"
            ) {
              neighbors.push(otherId);
            }
          } else if (bond.atom2 === currentId) {
            const otherId = bond.atom1;
            if (
              otherId !== parentId &&
              otherId !== esterOxygenId &&
              molecule.atoms[otherId]?.symbol === "C"
            ) {
              neighbors.push(otherId);
            }
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[getAlkoxyGroupName] Found ${neighbors.length} neighbors:`,
          neighbors,
        );
      }

      // If more than 1 neighbor, we need to choose the longest chain continuation
      if (neighbors.length > 1) {
        // Use DFS to find which neighbor leads to the longest chain
        let longestNeighbor = neighbors[0];
        let maxDepth = 0;

        for (const neighborId of neighbors) {
          if (neighborId !== undefined) {
            const depth = getChainDepth(
              neighborId!,
              currentId,
              molecule,
              visited,
            );
            if (depth > maxDepth) {
              maxDepth = depth;
              longestNeighbor = neighborId;
            }
          }
        }

        // Add longest chain continuation to queue
        if (longestNeighbor !== undefined) {
          queue.push({ id: longestNeighbor, parent: currentId });
        }

        // Record other neighbors as branches (don't add to queue to keep carbonChain accurate)
        for (const branchNeighbor of neighbors) {
          if (
            branchNeighbor !== undefined &&
            branchNeighbor !== longestNeighbor
          ) {
            if (!branches.has(carbonChain.length)) {
              branches.set(carbonChain.length, []);
            }
            branches.get(carbonChain.length)!.push(branchNeighbor);
            // Also add branch carbons to alkoxyCarbonIds for substituent detection
            addBranchToAlkoxyCarbonIds(
              branchNeighbor,
              molecule,
              alkoxyCarbonIds,
              visited,
            );

            if (process.env.VERBOSE) {
              console.log(
                `[getAlkoxyGroupName] Recording branch ${branchNeighbor} at chain position ${carbonChain.length}`,
              );
            }
          }
        }
      } else if (neighbors.length === 1) {
        const neighbor = neighbors[0];
        if (neighbor !== undefined) {
          queue.push({ id: neighbor, parent: currentId });
        }
      }
    }
  }

  // **RING DETECTION INTEGRATION POINT**
  // Check if the alkoxy group contains any rings
  const rings = molecule.rings ? molecule.rings.map((r) => [...r]) : [];
  const ringsInAlkoxy: number[][] = [];

  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] BFS complete. alkoxyCarbonIds:",
      Array.from(alkoxyCarbonIds),
    );
    if (process.env.VERBOSE) {
      console.log(
        "[getAlkoxyGroupName] Total rings in molecule:",
        rings.length,
      );
    }
    for (let i = 0; i < rings.length; i++) {
      if (process.env.VERBOSE) {
        console.log(`[getAlkoxyGroupName] Ring ${i}:`, rings[i]);
      }
    }
  }

  for (const ring of rings) {
    const ringIntersection = ring.filter((atomId) =>
      alkoxyCarbonIds.has(atomId),
    );
    if (process.env.VERBOSE) {
      console.log(
        `[getAlkoxyGroupName] Ring ${rings.indexOf(ring)} intersection:`,
        ringIntersection,
        `(length ${ringIntersection.length})`,
      );
    }
    if (ringIntersection.length >= 3) {
      ringsInAlkoxy.push([...ring]);
    }
  }

  if (process.env.VERBOSE) {
    console.log("[getAlkoxyGroupName] ringsInAlkoxy:", ringsInAlkoxy);
  }

  // If rings detected, use ring-based naming
  if (ringsInAlkoxy.length > 0) {
    const ringName = buildRingSubstituentAlkylName(
      alkoxyCarbonId,
      esterOxygenId,
      molecule,
    );
    if (ringName) {
      if (process.env.VERBOSE) {
        console.log("[getAlkoxyGroupName] Using ring-based name:", ringName);
      }
      return ringName;
    }
  }

  // Fall back to chain-only logic if no rings or ring naming failed
  // Build alkoxy name
  const chainLength = carbonChain.length;

  // **DETECT SUBSTITUENTS ON ALKOXY CHAIN**
  type AlkoxySubstituent = {
    position: number;
    name: string;
    type: string;
  };
  const alkoxySubstituents: AlkoxySubstituent[] = [];

  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] functionalGroups provided:",
      functionalGroups ? functionalGroups.length : "none",
    );
    if (functionalGroups) {
      for (const fg of functionalGroups) {
        if (process.env.VERBOSE) {
          console.log(
            "[getAlkoxyGroupName] FG:",
            fg.type,
            "prefix:",
            fg.prefix,
            "atoms:",
            fg.atoms,
          );
        }
      }
    }
    if (process.env.VERBOSE) {
      console.log(
        "[getAlkoxyGroupName] alkoxyCarbonIds:",
        Array.from(alkoxyCarbonIds),
      );
    }
    if (process.env.VERBOSE) {
      console.log("[getAlkoxyGroupName] carbonChain:", carbonChain);
    }
  }

  // 1. Detect acyloxy substituents (nested esters converted to acyloxy)
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.type === "acyloxy" && fg.atoms && fg.prefix) {
        // Find the attachment point: oxygen atom connected to alkoxy chain
        for (const fgAtomObj of fg.atoms) {
          // Extract atom ID from Atom object or use directly if it's a number
          const fgAtomId =
            typeof fgAtomObj === "number" ? fgAtomObj : fgAtomObj.id;
          const fgAtom = molecule.atoms[fgAtomId];
          if (fgAtom?.symbol === "O") {
            // Check if this oxygen is bonded to any carbon in the alkoxy chain
            for (const bond of molecule.bonds) {
              if (bond.type === "single") {
                let alkoxyChainCarbon: number | undefined;
                if (
                  bond.atom1 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom2)
                ) {
                  alkoxyChainCarbon = bond.atom2;
                } else if (
                  bond.atom2 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom1)
                ) {
                  alkoxyChainCarbon = bond.atom1;
                }

                if (alkoxyChainCarbon !== undefined) {
                  // Found attachment point! Determine position in chain
                  const position = carbonChain.indexOf(alkoxyChainCarbon) + 1;
                  if (position > 0) {
                    alkoxySubstituents.push({
                      position,
                      name: fg.prefix,
                      type: "acyloxy",
                    });
                    if (process.env.VERBOSE) {
                      console.log(
                        `[getAlkoxyGroupName] Found acyloxy substituent "${fg.prefix}" at position ${position}`,
                      );
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Detect alkoxy (ether) substituents
  if (functionalGroups) {
    for (const fg of functionalGroups) {
      if (fg.type === "alkoxy" && fg.atoms && fg.prefix) {
        // Find the attachment point: oxygen atom connected to alkoxy chain
        for (const fgAtomObj of fg.atoms) {
          // Extract atom ID from Atom object or use directly if it's a number
          const fgAtomId =
            typeof fgAtomObj === "number" ? fgAtomObj : fgAtomObj.id;
          const fgAtom = molecule.atoms[fgAtomId];
          if (fgAtom?.symbol === "O") {
            // Check if this oxygen is bonded to any carbon in the alkoxy chain
            for (const bond of molecule.bonds) {
              if (bond.type === "single") {
                let alkoxyChainCarbon: number | undefined;
                if (
                  bond.atom1 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom2)
                ) {
                  alkoxyChainCarbon = bond.atom2;
                } else if (
                  bond.atom2 === fgAtomId &&
                  alkoxyCarbonIds.has(bond.atom1)
                ) {
                  alkoxyChainCarbon = bond.atom1;
                }

                if (alkoxyChainCarbon !== undefined) {
                  // Found attachment point! Determine position in chain
                  const position = carbonChain.indexOf(alkoxyChainCarbon) + 1;
                  if (position > 0) {
                    alkoxySubstituents.push({
                      position,
                      name: fg.prefix,
                      type: "alkoxy",
                    });
                    if (process.env.VERBOSE) {
                      console.log(
                        `[getAlkoxyGroupName] Found alkoxy substituent "${fg.prefix}" at position ${position}`,
                      );
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // 2b. Direct detection of ether (alkoxy) substituents on alkoxy chain
  // This catches cases where the ether group isn't in functionalGroups yet
  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] 2b. Starting direct ether detection, carbonChain length:",
      carbonChain.length,
    );
  }
  for (let i = 0; i < carbonChain.length; i++) {
    const carbonId = carbonChain[i];
    if (carbonId === undefined) continue;

    if (process.env.VERBOSE) {
      console.log(
        `[getAlkoxyGroupName] 2b. Checking carbon ${carbonId} at position ${i + 1}`,
      );
    }

    // Find oxygen atoms connected to this carbon (excluding ester oxygen and already-detected acyloxy)
    for (const bond of molecule.bonds) {
      if (bond.type === "single") {
        let oxygenId: number | undefined;

        if (
          bond.atom1 === carbonId &&
          molecule.atoms[bond.atom2]?.symbol === "O"
        ) {
          oxygenId = bond.atom2;
        } else if (
          bond.atom2 === carbonId &&
          molecule.atoms[bond.atom1]?.symbol === "O"
        ) {
          oxygenId = bond.atom1;
        }

        if (oxygenId !== undefined && oxygenId !== esterOxygenId) {
          if (process.env.VERBOSE) {
            console.log(
              `[getAlkoxyGroupName] 2b. Found oxygen ${oxygenId} at carbon ${carbonId} position ${i + 1}`,
            );
          }
          // Found an oxygen attached to this alkoxy carbon
          // Now find the carbon chain attached to this oxygen to determine the alkoxy name
          let etherCarbonId: number | undefined;

          for (const bond2 of molecule.bonds) {
            if (bond2.type === "single") {
              if (
                bond2.atom1 === oxygenId &&
                molecule.atoms[bond2.atom2]?.symbol === "C" &&
                bond2.atom2 !== carbonId
              ) {
                etherCarbonId = bond2.atom2;
                break;
              } else if (
                bond2.atom2 === oxygenId &&
                molecule.atoms[bond2.atom1]?.symbol === "C" &&
                bond2.atom1 !== carbonId
              ) {
                etherCarbonId = bond2.atom1;
                break;
              }
            }
          }

          if (etherCarbonId !== undefined) {
            // Check if this carbon is part of a C=O group (acyloxy)
            // If so, skip it - it will be handled by acyloxy detection
            let isAcyloxy = false;
            for (const bond3 of molecule.bonds) {
              if (bond3.type === "double") {
                if (
                  (bond3.atom1 === etherCarbonId &&
                    molecule.atoms[bond3.atom2]?.symbol === "O") ||
                  (bond3.atom2 === etherCarbonId &&
                    molecule.atoms[bond3.atom1]?.symbol === "O")
                ) {
                  isAcyloxy = true;
                  if (process.env.VERBOSE) {
                    console.log(
                      `[getAlkoxyGroupName] 2b. Carbon ${etherCarbonId} has C=O, skipping (acyloxy group)`,
                    );
                  }
                  break;
                }
              }
            }

            if (!isAcyloxy) {
              // Determine the size of the ether alkyl group via BFS
              const etherVisited = new Set<number>();
              const etherQueue: number[] = [etherCarbonId];
              const etherCarbons: number[] = [];

              while (etherQueue.length > 0) {
                const currentId = etherQueue.shift()!;
                if (etherVisited.has(currentId)) continue;
                etherVisited.add(currentId);

                const atom = molecule.atoms[currentId];
                if (atom?.symbol === "C") {
                  etherCarbons.push(currentId);

                  // Find neighbors
                  for (const bond3 of molecule.bonds) {
                    if (bond3.type === "single") {
                      let neighborId: number | undefined;

                      if (
                        bond3.atom1 === currentId &&
                        molecule.atoms[bond3.atom2]?.symbol === "C"
                      ) {
                        neighborId = bond3.atom2;
                      } else if (
                        bond3.atom2 === currentId &&
                        molecule.atoms[bond3.atom1]?.symbol === "C"
                      ) {
                        neighborId = bond3.atom1;
                      }

                      if (
                        neighborId !== undefined &&
                        !etherVisited.has(neighborId) &&
                        !alkoxyCarbonIds.has(neighborId)
                      ) {
                        etherQueue.push(neighborId);
                      }
                    }
                  }
                }
              }

              // Build the alkoxy name based on carbon count
              const etherCarbonCount = etherCarbons.length;
              const alkoxyNames = [
                "",
                "methoxy",
                "ethoxy",
                "propoxy",
                "butoxy",
                "pentoxy",
                "hexoxy",
                "heptoxy",
                "octoxy",
              ];

              const alkoxyName =
                etherCarbonCount < alkoxyNames.length &&
                alkoxyNames[etherCarbonCount]
                  ? alkoxyNames[etherCarbonCount]!
                  : `C${etherCarbonCount}-oxy`;

              const position = i + 1;
              alkoxySubstituents.push({
                position,
                name: alkoxyName,
                type: "alkoxy",
              });

              if (process.env.VERBOSE) {
                console.log(
                  `[getAlkoxyGroupName] Direct detection: Found ${alkoxyName} substituent at position ${position}`,
                );
              }
            }
          }
        }
      }
    }
  }

  // 2c. Detect hydroxyl (-OH) groups on alkoxy chain
  if (process.env.VERBOSE) {
    console.log(
      "[getAlkoxyGroupName] 2c. Starting hydroxyl detection, carbonChain length:",
      carbonChain.length,
    );
  }
  for (let i = 0; i < carbonChain.length; i++) {
    const carbonId = carbonChain[i];
    if (carbonId === undefined) continue;

    if (process.env.VERBOSE) {
      console.log(
        `[getAlkoxyGroupName] 2c. Checking carbon ${carbonId} at position ${i + 1}`,
      );
    }

    // Find oxygen atoms connected to this carbon (excluding ester oxygen)
    for (const bond of molecule.bonds) {
      if (bond.type === "single") {
        let oxygenId: number | undefined;

        if (
          bond.atom1 === carbonId &&
          molecule.atoms[bond.atom2]?.symbol === "O"
        ) {
          oxygenId = bond.atom2;
        } else if (
          bond.atom2 === carbonId &&
          molecule.atoms[bond.atom1]?.symbol === "O"
        ) {
          oxygenId = bond.atom1;
        }

        if (oxygenId !== undefined && oxygenId !== esterOxygenId) {
          const oxygenAtom = molecule.atoms[oxygenId];
          if (!oxygenAtom) continue;

          if (process.env.VERBOSE) {
            console.log(
              `[getAlkoxyGroupName] 2c. Found oxygen ${oxygenId} at carbon ${carbonId} position ${i + 1}, hydrogens=${oxygenAtom.hydrogens}`,
            );
          }

          // Check if this is a hydroxyl group (O with 1 hydrogen, not bonded to another C/Si)
          // Need to ensure it's not part of an ether (R-O-R') or silyloxy (R-O-Si)
          let isBondedToCarbon = false;
          let isBondedToSilicon = false;

          for (const bond2 of molecule.bonds) {
            if (bond2.type === "single") {
              let otherAtomId: number | undefined;
              if (bond2.atom1 === oxygenId && bond2.atom2 !== carbonId) {
                otherAtomId = bond2.atom2;
              } else if (bond2.atom2 === oxygenId && bond2.atom1 !== carbonId) {
                otherAtomId = bond2.atom1;
              }

              if (otherAtomId !== undefined) {
                const otherAtom = molecule.atoms[otherAtomId];
                if (otherAtom?.symbol === "C") {
                  isBondedToCarbon = true;
                  break;
                }
                if (otherAtom?.symbol === "Si") {
                  isBondedToSilicon = true;
                  break;
                }
              }
            }
          }

          // If oxygen has 1 hydrogen and is not bonded to C or Si, it's a hydroxyl
          if (
            oxygenAtom.hydrogens === 1 &&
            !isBondedToCarbon &&
            !isBondedToSilicon
          ) {
            const position = i + 1;
            alkoxySubstituents.push({
              position,
              name: "hydroxy",
              type: "hydroxyl",
            });
            if (process.env.VERBOSE) {
              console.log(
                `[getAlkoxyGroupName] 2c. Found hydroxyl at position ${position}`,
              );
            }
            break; // Only one hydroxyl per carbon
          }
        }
      }
    }
  }

  // 3. Check each carbon in the alkoxy chain for O-Si groups (silyloxy substituents)
  type SilyloxySubstituent = {
    position: number;
    oxygenId: number;
    siliconId: number;
    methylCount: number;
    name: string;
  };
  const silyloxySubstituents: SilyloxySubstituent[] = [];

  for (let i = 0; i < carbonChain.length; i++) {
    const carbonId = carbonChain[i];
    if (carbonId === undefined) continue;

    // Find oxygen atoms connected to this carbon
    for (const bond of molecule.bonds) {
      if (bond.type === "single") {
        let oxygenId: number | undefined;

        if (
          bond.atom1 === carbonId &&
          molecule.atoms[bond.atom2]?.symbol === "O"
        ) {
          oxygenId = bond.atom2;
        } else if (
          bond.atom2 === carbonId &&
          molecule.atoms[bond.atom1]?.symbol === "O"
        ) {
          oxygenId = bond.atom1;
        }

        if (oxygenId !== undefined && oxygenId !== esterOxygenId) {
          // Found an oxygen attached to this alkoxy carbon (not the ester oxygen)
          // Check if this oxygen is connected to silicon
          for (const bond2 of molecule.bonds) {
            let siliconId: number | undefined;

            if (
              bond2.atom1 === oxygenId &&
              molecule.atoms[bond2.atom2]?.symbol === "Si"
            ) {
              siliconId = bond2.atom2;
            } else if (
              bond2.atom2 === oxygenId &&
              molecule.atoms[bond2.atom1]?.symbol === "Si"
            ) {
              siliconId = bond2.atom1;
            }

            if (siliconId !== undefined) {
              // Found O-Si group! Now count methyl groups on silicon
              let methylCount = 0;
              for (const bond3 of molecule.bonds) {
                let carbonIdOnSi: number | undefined;

                if (
                  bond3.atom1 === siliconId &&
                  molecule.atoms[bond3.atom2]?.symbol === "C"
                ) {
                  carbonIdOnSi = bond3.atom2;
                } else if (
                  bond3.atom2 === siliconId &&
                  molecule.atoms[bond3.atom1]?.symbol === "C"
                ) {
                  carbonIdOnSi = bond3.atom1;
                }

                if (carbonIdOnSi !== undefined) {
                  // Check if this carbon is a methyl (no other carbons attached)
                  const carbonNeighbors = molecule.bonds.filter(
                    (b: Bond) =>
                      b.atom1 === carbonIdOnSi || b.atom2 === carbonIdOnSi,
                  );
                  const hasOtherCarbons = carbonNeighbors.some((b: Bond) => {
                    const otherId =
                      b.atom1 === carbonIdOnSi ? b.atom2 : b.atom1;
                    return (
                      otherId !== siliconId &&
                      molecule.atoms[otherId]?.symbol === "C"
                    );
                  });

                  if (!hasOtherCarbons) {
                    methylCount++;
                  }
                }
              }

              // Build the silyloxy name based on methyl count
              let silyloxyName = "";
              if (methylCount === 1) {
                silyloxyName = "methylsilyloxy";
              } else if (methylCount === 2) {
                silyloxyName = "dimethylsilyloxy";
              } else if (methylCount === 3) {
                silyloxyName = "trimethylsilyloxy";
              } else {
                silyloxyName = "silyloxy";
              }

              silyloxySubstituents.push({
                position: i + 1, // IUPAC numbering starts at 1
                oxygenId,
                siliconId,
                methylCount,
                name: silyloxyName,
              });

              if (process.env.VERBOSE) {
                console.log(
                  `[getAlkoxyGroupName] Found ${silyloxyName} at position ${i + 1} (carbon ${carbonId})`,
                );
              }
            }
          }
        }
      }
    }
  }

  // Merge all substituents (acyloxy, alkoxy, silyloxy) for unified naming
  const allSubstituents: AlkoxySubstituent[] = [
    ...alkoxySubstituents,
    ...silyloxySubstituents.map((s) => ({
      position: s.position,
      name: s.name,
      type: "silyloxy",
    })),
  ];

  // Build prefix for all substituents
  let substituentsPrefix = "";
  if (allSubstituents.length > 0) {
    // Sort by position first, then alphabetically by name
    allSubstituents.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.name.localeCompare(b.name);
    });

    // Group substituents by name to detect identical substituents at different positions
    const byName = new Map<string, number[]>();
    for (const sub of allSubstituents) {
      if (!byName.has(sub.name)) {
        byName.set(sub.name, []);
      }
      byName.get(sub.name)!.push(sub.position);
    }

    // Build prefix parts with multiplicative prefixes for identical substituents
    const prefixParts: string[] = [];
    const sortedNames = Array.from(byName.keys()).sort();

    for (const name of sortedNames) {
      const positions = byName.get(name)!;
      const positionString = positions.join(",");

      if (positions.length === 1) {
        // Single substituent: "2-trimethylsilyloxy"
        prefixParts.push(`${positionString}-${name}`);
      } else {
        // Multiple identical substituents: use bis/tris/tetrakis
        const multiplicity = positions.length;
        const multiplicativePrefix = getComplexMultiplier(
          multiplicity,
          opsinService ?? getSharedOPSINService(),
        );

        // For complex substituent names (containing hyphens or being compound),
        // wrap in parentheses: "2,3-bis(trimethylsilyloxy)"
        // For simple names, no parentheses needed
        const needsParentheses =
          name.includes("-") || name.includes("oxy") || name.length > 6;

        if (needsParentheses) {
          prefixParts.push(
            `${positionString}-${multiplicativePrefix}(${name})`,
          );
        } else {
          prefixParts.push(`${positionString}-${multiplicativePrefix}${name}`);
        }
      }
    }

    substituentsPrefix = prefixParts.join("-");

    if (process.env.VERBOSE) {
      console.log(
        "[getAlkoxyGroupName] Built substituentsPrefix:",
        substituentsPrefix,
      );
    }
  }

  if (branches.size === 0) {
    // Simple alkyl group (possibly with substituents)
    const alkylPrefixes = [
      "",
      "meth",
      "eth",
      "prop",
      "but",
      "pent",
      "hex",
      "hept",
      "oct",
      "non",
      "dec",
    ];
    const baseName =
      chainLength < alkylPrefixes.length
        ? `${alkylPrefixes[chainLength]}yl`
        : `C${chainLength}-alkyl`;

    if (substituentsPrefix) {
      // Determine if parentheses are needed based on substituent complexity
      // Use parentheses when:
      // 1. Multiple different substituent types (mixed substituents)
      // 2. Substituents at the same position

      // Check if all substituents are identical (same name)
      const uniqueNames = new Set(allSubstituents.map((s) => s.name));
      const hasMultipleTypes = uniqueNames.size > 1;

      // Check if any position has multiple substituents
      const positionCounts = new Map<number, number>();
      for (const sub of allSubstituents) {
        positionCounts.set(
          sub.position,
          (positionCounts.get(sub.position) || 0) + 1,
        );
      }
      const hasMultipleAtSamePosition = Array.from(
        positionCounts.values(),
      ).some((count) => count > 1);

      // Use parentheses for complex cases (mixed types or multiple at same position)
      const needsParentheses = hasMultipleTypes || hasMultipleAtSamePosition;

      if (needsParentheses) {
        return `(${substituentsPrefix}${baseName})`;
      } else {
        // Simple case: all identical substituents at different positions
        // Example: "2,3-bis(trimethylsilyloxy)propyl"
        return `${substituentsPrefix}${baseName}`;
      }
    }
    return baseName;
  } else {
    // Branched alkyl group - need to name the branches
    // Group branches by position and name to handle gem-dimethyl, etc.
    type BranchSubstituent = {
      position: number;
      name: string;
    };
    const branchSubstituents: BranchSubstituent[] = [];

    for (const [position, branchCarbons] of branches) {
      for (const _branchId of branchCarbons) {
        // Simple case: assume single carbon branch (methyl)
        branchSubstituents.push({ position, name: "methyl" });
      }
    }

    // Group by name to detect identical branches at different positions
    const branchByName = new Map<string, number[]>();
    for (const sub of branchSubstituents) {
      if (!branchByName.has(sub.name)) {
        branchByName.set(sub.name, []);
      }
      branchByName.get(sub.name)!.push(sub.position);
    }

    // Build branch prefix parts with multiplicative prefixes for identical branches
    const branchPrefixParts: string[] = [];
    const sortedBranchNames = Array.from(branchByName.keys()).sort();

    for (const name of sortedBranchNames) {
      const positions = branchByName.get(name)!;
      positions.sort((a, b) => a - b); // Sort positions numerically
      const positionString = positions.join(",");

      if (positions.length === 1) {
        // Single branch: "2-methyl"
        branchPrefixParts.push(`${positionString}-${name}`);
      } else {
        // Multiple identical branches: "2,4,4-trimethyl"
        const multiplicity = positions.length;
        const multiplicativePrefix = getSimpleMultiplier(
          multiplicity,
          opsinService ?? getSharedOPSINService(),
        );
        branchPrefixParts.push(
          `${positionString}-${multiplicativePrefix}${name}`,
        );
      }
    }

    const branchesPrefix = branchPrefixParts.join("-");

    const alkylPrefixes = [
      "",
      "meth",
      "eth",
      "prop",
      "but",
      "pent",
      "hex",
      "hept",
      "oct",
      "non",
      "dec",
    ];
    const baseName =
      chainLength < alkylPrefixes.length
        ? alkylPrefixes[chainLength]
        : `C${chainLength}-alk`;

    const allSubstituents = substituentsPrefix
      ? `${substituentsPrefix}-${branchesPrefix}`
      : branchesPrefix;
    // Wrap in parentheses for complex alkyl names
    return `(${allSubstituents}${baseName}yl)`;
  }
}
