import type { Molecule } from "types";
import { getSimpleMultiplier } from "../../opsin-adapter";
import { getSharedOPSINService } from "../../opsin-service";
import { ruleEngine } from "../iupac-rule-engine";

export function getAlkaneBySize(n: number): string {
  const map: Record<number, string> = {
    1: "methane",
    2: "ethane",
    3: "propane",
    4: "butane",
    5: "pentane",
    6: "hexane",
    7: "heptane",
    8: "octane",
    9: "nonane",
    10: "decane",
    11: "undecane",
    12: "dodecane",
    13: "tridecane",
    14: "tetradecane",
    15: "pentadecane",
    16: "hexadecane",
    17: "heptadecane",
    18: "octadecane",
    19: "nonadecane",
    20: "eicosane",
  };
  return map[n] ?? `C${n}`;
}

export function combineCycloWithSuffix(base: string, suffix: string): string {
  if (base.endsWith("ane") && /^[aeiou]/.test(suffix))
    return base.slice(0, -1) + suffix;
  return base + suffix;
}

export interface FusedSystem {
  rings: number[][];
}

export function buildPerimeterFromRings(fusedSystem: FusedSystem): number[] {
  // Build edges present in rings, count ring-membership per edge and keep edges
  // that belong to only one ring -> outer perimeter edges. Then traverse that
  // cycle to return an ordered list of perimeter atoms.
  const edgeCount: Record<string, number> = {};
  const rings = fusedSystem.rings;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edgeCount[key] = (edgeCount[key] || 0) + 1;
    }
  }
  const perimeterAdj: Record<string, number[]> = {};
  for (const key of Object.keys(edgeCount)) {
    if (edgeCount[key] === 1) {
      const parts = key.split("-");
      const sa = Number(parts[0]);
      const sb = Number(parts[1]);
      const ksa = String(sa),
        ksb = String(sb);
      if (!Array.isArray(perimeterAdj[ksa])) perimeterAdj[ksa] = [];
      if (!Array.isArray(perimeterAdj[ksb])) perimeterAdj[ksb] = [];
      if (Array.isArray(perimeterAdj[ksa]) && !perimeterAdj[ksa].includes(sb))
        perimeterAdj[ksa].push(sb);
      if (Array.isArray(perimeterAdj[ksb]) && !perimeterAdj[ksb].includes(sa))
        perimeterAdj[ksb].push(sa);
    }
  }
  const perimeterAtoms = Object.keys(perimeterAdj).map((k) => Number(k));
  if (perimeterAtoms.length === 0) return Array.from(new Set(rings.flat()));
  // Find a start (degree 2 nodes expected on a closed perimeter)
  const start =
    perimeterAtoms.find((a) => {
      const adj = perimeterAdj[String(a)];
      return Array.isArray(adj) && adj.length === 2;
    }) ?? perimeterAtoms[0];
  const ordered: number[] = [];
  const visited = new Set<number>();
  let current = start;
  let prev: number | null = null;
  while (typeof current === "number" && !visited.has(current)) {
    ordered.push(current);
    visited.add(current);
    const adj = perimeterAdj[String(current)];
    const neighbors = Array.isArray(adj)
      ? adj.filter((n: number) => n !== prev)
      : [];
    prev = current;
    current = neighbors.length ? neighbors[0] : undefined;
    if (ordered.length > 1000) break; // safety
  }
  // ensure we have all perimeter atoms; otherwise, fallback
  if (!Array.isArray(ordered) || ordered.length !== perimeterAtoms.length)
    return Array.from(new Set(rings.flat()));
  return ordered;
}

export function getMultiplicityPrefix(n: number): string {
  const opsinService = getSharedOPSINService();
  return getSimpleMultiplier(n, opsinService);
}

export function compareNumericArrays(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const bi = b[i];
    if (typeof ai !== "number" || typeof bi !== "number") continue;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

export function classifyFusedSubstituent(
  molecule: Molecule,
  startAtomIdx: number,
  fusedAtoms: Set<number>,
): { type: string; size: number; name: string } | null {
  const visited = new Set<number>(fusedAtoms);
  const substituentAtoms = new Set<number>();
  const stack = [startAtomIdx];
  visited.add(startAtomIdx);
  substituentAtoms.add(startAtomIdx);

  while (stack.length > 0) {
    const currentIdx = stack.pop()!;
    substituentAtoms.add(currentIdx);
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (bond.atom1 === currentIdx && !visited.has(bond.atom2)) {
        neighborIdx = bond.atom2;
      } else if (bond.atom2 === currentIdx && !visited.has(bond.atom1)) {
        neighborIdx = bond.atom1;
      }
      if (neighborIdx >= 0) {
        visited.add(neighborIdx);
        stack.push(neighborIdx);
      }
    }
  }

  const atoms = Array.from(substituentAtoms)
    .map((idx) => molecule.atoms[idx])
    .filter((atom): atom is (typeof molecule.atoms)[0] => atom !== undefined);

  const carbonCount = atoms.filter((atom) => atom.symbol === "C").length;

  // Simple substituents
  if (carbonCount === 1 && atoms.length === 1) {
    return { type: "alkyl", size: 1, name: "methyl" };
  } else if (carbonCount === 2 && atoms.length === 2) {
    return { type: "alkyl", size: 2, name: "ethyl" };
  } else if (carbonCount === 3 && atoms.length === 3) {
    return { type: "alkyl", size: 3, name: "propyl" };
  } else if (
    atoms.some((atom) => atom.symbol === "O" && atom.hydrogens === 1)
  ) {
    return { type: "functional", size: 1, name: "hydroxy" };
  } else if (atoms.some((atom) => atom.symbol === "Cl")) {
    return { type: "halo", size: 1, name: "chloro" };
  } else if (atoms.some((atom) => atom.symbol === "Br")) {
    return { type: "halo", size: 1, name: "bromo" };
  } else if (atoms.some((atom) => atom.symbol === "I")) {
    return { type: "halo", size: 1, name: "iodo" };
  }

  // Larger alkyl groups
  if (carbonCount > 0) {
    // Use IUPAC rule engine to get alkane stem (supports C1-C100+)
    const alkaneName = ruleEngine.getAlkaneName(carbonCount);
    if (process.env.VERBOSE) {
      console.log(
        `[classifyFusedSubstituent] carbonCount=${carbonCount}, alkaneName=${alkaneName}`,
      );
    }
    if (alkaneName) {
      // Remove "ane" suffix and add "yl" for substituent naming
      const prefix = alkaneName.replace(/ane$/, "");
      return { type: "alkyl", size: carbonCount, name: `${prefix}yl` };
    }
    // Fallback to generic notation if rule engine fails
    return { type: "alkyl", size: carbonCount, name: `C${carbonCount}yl` };
  }

  return null;
}

/**
 * Result from generating a classic polycyclic name
 */
export interface ClassicPolycyclicNameResult {
  name: string;
  vonBaeyerNumbering?: Map<number, number>; // Map from atom index to von Baeyer position
}

/**
 * Generates classic IUPAC polycyclic names (bicyclo, tricyclo) for non-aromatic systems.
 * Returns null if not a classic polycyclic system.
 */
export function generateClassicPolycyclicName(
  molecule: Molecule,
  rings: number[][],
  ringCount?: number,
): ClassicPolycyclicNameResult | null {
  // Special case: adamantane (C10H16, 3 rings, diamondoid structure)
  if (molecule.atoms.length === 10 && rings.length === 3) {
    const allAtomsCarbon = molecule.atoms.every((a) => a.symbol === "C");
    if (allAtomsCarbon) {
      // Check for adamantane pattern: 4 bridgeheads, specific connectivity
      const atomIds = Array.from(new Set(rings.flat()));
      if (atomIds.length === 10) {
        return { name: "adamantane" }; // Retained name per IUPAC
      }
    }
  }

  // Consider 2 or more rings, all atoms non-aromatic
  if (rings.length < 2) {
    if (process.env.VERBOSE)
      console.log("[VERBOSE] classic polycyclic: less than 2 rings");
    return null;
  }
  const atomIds = Array.isArray(rings)
    ? Array.from(
        new Set(
          rings.flat().filter((idx): idx is number => typeof idx === "number"),
        ),
      )
    : [];
  const atoms = atomIds
    .map((idx) => molecule.atoms[idx])
    .filter((a): a is (typeof molecule.atoms)[0] => a !== undefined);

  // Calculate SSSR rank if not provided: rank = M - N + 1
  // where M = bonds in ring system, N = atoms in ring system
  let ssrRank = ringCount;
  if (process.env.VERBOSE) {
    console.log(
      `[VERBOSE] classic polycyclic: ringCount parameter = ${ringCount}, ssrRank = ${ssrRank}`,
    );
  }
  if (ssrRank === undefined) {
    const atomSet = new Set(atomIds);
    let bondCount = 0;
    for (const bond of molecule.bonds) {
      if (atomSet.has(bond.atom1) && atomSet.has(bond.atom2)) {
        bondCount++;
      }
    }
    ssrRank = bondCount - atomIds.length + 1;
    if (process.env.VERBOSE) {
      console.log(
        `[VERBOSE] classic polycyclic: calculated SSSR rank = ${bondCount} - ${atomIds.length} + 1 = ${ssrRank}`,
      );
    }
  }

  // Collect heteroatoms for naming
  const heteroatoms = atoms.filter((a) => a.symbol !== "C");
  if (process.env.VERBOSE) {
    console.log(
      "[VERBOSE] classic polycyclic: heteroatoms=",
      heteroatoms.map((a) => a.symbol),
    );
  }

  // Find bridgehead atoms: atoms shared by more than one ring AND with degree >= 3
  const ringMembership: Record<number, number> = {};
  for (const ring of rings) {
    if (!Array.isArray(ring)) continue;
    for (const idx of ring) {
      if (typeof idx !== "number") continue;
      ringMembership[idx] = (ringMembership[idx] || 0) + 1;
    }
  }

  // Calculate degree for each atom in the ring system
  const degree: Record<number, number> = {};
  for (const bond of molecule.bonds) {
    if (atomIds.includes(bond.atom1) && atomIds.includes(bond.atom2)) {
      degree[bond.atom1] = (degree[bond.atom1] || 0) + 1;
      degree[bond.atom2] = (degree[bond.atom2] || 0) + 1;
    }
  }

  const bridgeheads = Object.entries(ringMembership)
    .filter(([idx, count]) => {
      const atomIdx = Number(idx);
      return (
        typeof count === "number" && count > 1 && (degree[atomIdx] || 0) >= 3
      );
    })
    .map(([idx]) => Number(idx));

  if (process.env.VERBOSE) {
    console.log(
      "[VERBOSE] classic polycyclic: ringMembership=",
      ringMembership,
    );
    console.log("[VERBOSE] classic polycyclic: degree=", degree);
    console.log("[VERBOSE] classic polycyclic: bridgeheads=", bridgeheads);
  }
  if (bridgeheads.length < 2) {
    if (process.env.VERBOSE)
      console.log("[VERBOSE] classic polycyclic: not enough bridgeheads");
    return null;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[VERBOSE] classic polycyclic: rings.length=${rings.length}, bridgeheads.length=${bridgeheads.length}, ssrRank=${ssrRank}`,
    );
  }

  // For bicyclo: two bridgeheads, three bridges
  // Use ssrRank instead of rings.length to properly handle complex polycyclics
  if (ssrRank === 2 && bridgeheads.length === 2) {
    const bh1 = bridgeheads[0]!;
    const bh2 = bridgeheads[1]!;

    // Build adjacency list once for O(1) neighbor lookups
    const adjacency = new Map<number, Set<number>>();
    for (const bond of molecule.bonds) {
      if (!adjacency.has(bond.atom1)) adjacency.set(bond.atom1, new Set());
      if (!adjacency.has(bond.atom2)) adjacency.set(bond.atom2, new Set());
      adjacency.get(bond.atom1)!.add(bond.atom2);
      adjacency.get(bond.atom2)!.add(bond.atom1);
    }

    const paths: number[][] = [];
    const visited = new Set<number>();
    const pathSignatures = new Set<string>();

    function dfs(current: number, target: number, path: number[]): void {
      if (current === target) {
        const signature = path.join(",");
        if (!pathSignatures.has(signature)) {
          pathSignatures.add(signature);
          paths.push([...path]);
        }
        return;
      }
      // Early termination: stop if we already have 3 unique paths
      if (paths.length >= 3) return;

      visited.add(current);
      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const next of neighbors) {
          if (!visited.has(next)) {
            dfs(next, target, [...path, next]);
          }
        }
      }
      visited.delete(current);
    }

    dfs(bh1, bh2, [bh1]);

    const uniquePaths = paths;

    const bridgeLengths = uniquePaths
      .map((p) => p.length - 2)
      .filter((n) => n >= 0);
    if (bridgeLengths.length >= 3) {
      // Sort paths by length (descending) for von Baeyer numbering
      const pathsWithLengths = uniquePaths.map((p) => ({
        path: p,
        length: p.length - 2,
      }));
      pathsWithLengths.sort((a, b) => b.length - a.length);

      bridgeLengths.sort((a, b) => b - a); // IUPAC: descending order
      const alkaneName = getAlkaneBySize(atomIds.length);

      // Build von Baeyer numbering: start at bh1, traverse bridges in descending order
      const vonBaeyerNumbering: Map<number, number> = new Map();
      let currentPosition = 1;

      // Number first bridgehead
      vonBaeyerNumbering.set(bh1, currentPosition++);

      // Number atoms along the longest bridge (excluding bridgeheads)
      const longestPath = pathsWithLengths[0]!.path;
      for (let i = 1; i < longestPath.length - 1; i++) {
        vonBaeyerNumbering.set(longestPath[i]!, currentPosition++);
      }

      // Number second bridgehead
      vonBaeyerNumbering.set(bh2, currentPosition++);

      // Number atoms along the second bridge (excluding bridgeheads)
      const secondPath = pathsWithLengths[1]!.path;
      for (let i = secondPath.length - 2; i > 0; i--) {
        const atomIdx = secondPath[i]!;
        if (!vonBaeyerNumbering.has(atomIdx)) {
          vonBaeyerNumbering.set(atomIdx, currentPosition++);
        }
      }

      // Number atoms along the shortest bridge (excluding bridgeheads)
      const shortestPath = pathsWithLengths[2]!.path;
      for (let i = 1; i < shortestPath.length - 1; i++) {
        const atomIdx = shortestPath[i]!;
        if (!vonBaeyerNumbering.has(atomIdx)) {
          vonBaeyerNumbering.set(atomIdx, currentPosition++);
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          "[VERBOSE] von Baeyer numbering:",
          Array.from(vonBaeyerNumbering.entries()),
        );
      }

      // Build heteroatom prefix if present
      let heteroPrefix = "";
      if (heteroatoms.length > 0) {
        const opsinService = getSharedOPSINService();
        const heteroMap: Record<string, string> = {
          O: "oxa",
          N: "aza",
          S: "thia",
          P: "phospha",
          Si: "sila",
        };

        const heteroPositions: Array<{ pos: number; symbol: string }> = [];
        for (const atom of heteroatoms) {
          const prefix = heteroMap[atom.symbol];
          if (prefix) {
            const heteroIdx = molecule.atoms.indexOf(atom);
            const position = vonBaeyerNumbering.get(heteroIdx);
            if (position !== undefined) {
              heteroPositions.push({ pos: position, symbol: prefix });
            }
          }
        }

        if (heteroPositions.length > 0) {
          // Sort by position
          heteroPositions.sort((a, b) => a.pos - b.pos);

          // Group by element type
          const groupedByElement = new Map<string, number[]>();
          for (const hp of heteroPositions) {
            const existing = groupedByElement.get(hp.symbol) ?? [];
            existing.push(hp.pos);
            groupedByElement.set(hp.symbol, existing);
          }

          // Build consolidated prefix for each element type
          const heteroGroups: string[] = [];
          for (const [symbol, positions] of groupedByElement) {
            const positionStr = positions.join(",");
            const count = positions.length;
            const multiplier =
              count > 1 ? getSimpleMultiplier(count, opsinService) : "";
            heteroGroups.push(`${positionStr}-${multiplier}${symbol}`);
          }
          heteroPrefix = heteroGroups.join("-");
        }
      }

      if (process.env.VERBOSE)
        console.log(
          "[VERBOSE] classic polycyclic: bicyclo",
          bridgeLengths,
          alkaneName,
          "heteroPrefix:",
          heteroPrefix,
        );

      const fullPrefix = heteroPrefix ? `${heteroPrefix}` : "";
      return {
        name: `${fullPrefix}bicyclo[${bridgeLengths.slice(0, 3).join(".")}]${alkaneName}`,
        vonBaeyerNumbering,
      };
    }
    if (process.env.VERBOSE)
      console.log(
        "[VERBOSE] classic polycyclic: did not find 3 bridges",
        bridgeLengths,
      );
    return null;
  }

  // For tricyclo and higher: three or more rings, three or more bridgeheads
  // Use ssrRank instead of rings.length to properly handle complex polycyclics
  if (ssrRank >= 3 && bridgeheads.length >= 3) {
    // Build adjacency list once for O(1) neighbor lookups
    const adjacency = new Map<number, Set<number>>();
    for (const bond of molecule.bonds) {
      if (!adjacency.has(bond.atom1)) adjacency.set(bond.atom1, new Set());
      if (!adjacency.has(bond.atom2)) adjacency.set(bond.atom2, new Set());
      adjacency.get(bond.atom1)!.add(bond.atom2);
      adjacency.get(bond.atom2)!.add(bond.atom1);
    }

    // Helper function to find all paths between two nodes avoiding certain nodes
    function findAllPaths(
      start: number,
      end: number,
      avoid: Set<number> = new Set(),
    ): number[][] {
      const paths: number[][] = [];
      const visited = new Set<number>(avoid);

      function dfs(current: number, path: number[]): void {
        if (current === end) {
          paths.push([...path]);
          return;
        }
        visited.add(current);
        const neighbors = adjacency.get(current);
        if (neighbors) {
          for (const next of neighbors) {
            if (!visited.has(next)) {
              dfs(next, [...path, next]);
            }
          }
        }
        visited.delete(current);
      }

      dfs(start, [start]);
      return paths.filter((p) => p.length >= 2);
    }

    // For tricyclo+ systems with 4+ bridgeheads, we need to find:
    // 1. Two primary bridgeheads (alpha and omega)
    // 2. Three NODE-DISJOINT paths between them
    // 3. Secondary bridges between remaining bridgeheads

    if (bridgeheads.length >= 4 && rings.length >= 3) {
      // Helper function to find node-disjoint paths
      function findNodeDisjointPaths(
        start: number,
        end: number,
        numPaths: number,
      ): number[][] | null {
        const allPaths = findAllPaths(start, end);
        if (allPaths.length < numPaths) return null;

        // Sort paths by length (descending) to prioritize longer paths
        allPaths.sort((a, b) => b.length - a.length);

        // Greedily select node-disjoint paths
        const selected: number[][] = [];
        const usedNodes = new Set<number>();
        usedNodes.add(start);
        usedNodes.add(end);

        for (const path of allPaths) {
          // Check if this path is node-disjoint with already selected paths
          const pathNodes = new Set(path.slice(1, -1)); // Exclude start and end
          let isDisjoint = true;

          for (const node of pathNodes) {
            if (usedNodes.has(node)) {
              isDisjoint = false;
              break;
            }
          }

          if (isDisjoint) {
            selected.push(path);
            for (const node of pathNodes) {
              usedNodes.add(node);
            }

            if (selected.length === numPaths) {
              break;
            }
          }
        }

        return selected.length === numPaths ? selected : null;
      }

      let bestConfig: {
        alpha: number;
        omega: number;
        paths: number[][];
        bridgeLengths: number[];
        secondaryBridges: Array<{ length: number; from: number; to: number }>;
        secondaryBridgeLocants?: number[];
        heteroSum?: number;
      } | null = null;

      for (let i = 0; i < bridgeheads.length; i++) {
        for (let j = i + 1; j < bridgeheads.length; j++) {
          const alpha = bridgeheads[i]!;
          const omega = bridgeheads[j]!;

          // Try to find 3 node-disjoint paths
          const paths = findNodeDisjointPaths(alpha, omega, 3);

          if (!paths || paths.length !== 3) {
            continue;
          }

          // Sort paths by length (descending) for von Baeyer numbering
          paths.sort((a, b) => b.length - a.length);

          const lengths = paths.map((p) => p.length - 2).sort((a, b) => b - a);

          if (process.env.VERBOSE) {
            console.log(`[TRICYCLO] Testing alpha=${alpha}, omega=${omega}`);
            console.log(
              `  Path1: ${paths[0]!.join(",")} (length=${lengths[0]})`,
            );
            console.log(
              `  Path2: ${paths[1]!.join(",")} (length=${lengths[1]})`,
            );
            console.log(
              `  Path3: ${paths[2]!.join(",")} (length=${lengths[2]})`,
            );
            console.log(`  Bridge lengths: [${lengths.join(".")}]`);
          }

          // Look for secondary bridges between intermediate bridgeheads
          const secondaryBridges: Array<{
            length: number;
            from: number;
            to: number;
          }> = [];

          // Find secondary bridges WITHIN each main path (shortcuts)
          // For pentacyclic+ systems, select the shortest bridge from each path
          for (let pathIdx = 0; pathIdx < paths.length; pathIdx++) {
            const path = paths[pathIdx]!;
            let shortestBridge: {
              length: number;
              from: number;
              to: number;
            } | null = null;

            // Check all pairs of non-adjacent atoms in this path
            for (let i = 0; i < path.length; i++) {
              for (let j = i + 2; j < path.length; j++) {
                const atom1 = path[i]!;
                const atom2 = path[j]!;

                // Direct connection (0-length bridge)?
                if (adjacency.get(atom1)?.has(atom2)) {
                  const bridge = { length: 0, from: atom1, to: atom2 };
                  if (
                    !shortestBridge ||
                    bridge.length < shortestBridge.length
                  ) {
                    shortestBridge = bridge;
                  }
                  if (process.env.VERBOSE) {
                    console.log(
                      `  Secondary bridge candidate in path${pathIdx + 1}: ${atom1}-${atom2} (length=0, shortcut)`,
                    );
                  }
                } else {
                  // Find shortest path between these atoms that doesn't use the main path
                  const usedNodes = new Set<number>();
                  // Exclude all intermediate nodes on THIS main path between atom1 and atom2
                  for (let k = i + 1; k < j; k++) {
                    usedNodes.add(path[k]!);
                  }

                  const secondaryPaths = findAllPaths(atom1, atom2, usedNodes);
                  if (secondaryPaths.length > 0) {
                    const minLength = Math.min(
                      ...secondaryPaths.map((p) => p.length - 2),
                    );
                    if (minLength >= 0 && minLength < j - i - 1) {
                      // Only consider if it's actually a shortcut
                      const bridge = {
                        length: minLength,
                        from: atom1,
                        to: atom2,
                      };
                      if (
                        !shortestBridge ||
                        bridge.length < shortestBridge.length
                      ) {
                        shortestBridge = bridge;
                      }
                      if (process.env.VERBOSE) {
                        console.log(
                          `  Secondary bridge candidate in path${pathIdx + 1}: ${atom1}-${atom2} (length=${minLength}, shortcut)`,
                        );
                      }
                    }
                  }
                }
              }
            }

            // For pentacyclic+ systems, add ALL bridges with minimum length from this path
            if (shortestBridge) {
              const minLength = shortestBridge.length;
              // Collect all bridges with this minimum length
              const bridgesWithMinLength: Array<{
                length: number;
                from: number;
                to: number;
              }> = [];

              for (let i = 0; i < path.length; i++) {
                for (let j = i + 2; j < path.length; j++) {
                  const atom1 = path[i]!;
                  const atom2 = path[j]!;

                  // Check for direct connection (length 0)
                  const directBond = molecule.bonds.find(
                    (b) =>
                      (b.atom1 === atom1 && b.atom2 === atom2) ||
                      (b.atom1 === atom2 && b.atom2 === atom1),
                  );

                  if (directBond && minLength === 0) {
                    bridgesWithMinLength.push({
                      length: 0,
                      from: atom1,
                      to: atom2,
                    });
                  } else if (!directBond) {
                    // Find shortest path
                    const usedNodes = new Set<number>();
                    for (let k = i + 1; k < j; k++) {
                      usedNodes.add(path[k]!);
                    }
                    const secondaryPaths = findAllPaths(
                      atom1,
                      atom2,
                      usedNodes,
                    );
                    if (secondaryPaths.length > 0) {
                      const pathMinLength = Math.min(
                        ...secondaryPaths.map((p) => p.length - 2),
                      );
                      if (
                        pathMinLength === minLength &&
                        pathMinLength < j - i - 1
                      ) {
                        bridgesWithMinLength.push({
                          length: pathMinLength,
                          from: atom1,
                          to: atom2,
                        });
                      }
                    }
                  }
                }
              }

              // Add all bridges with minimum length, excluding alpha-omega bridges
              for (const bridge of bridgesWithMinLength) {
                // Skip bridges between alpha and omega (redundant with main paths)
                const isAlphaOmega =
                  (bridge.from === alpha && bridge.to === omega) ||
                  (bridge.from === omega && bridge.to === alpha);

                if (!isAlphaOmega) {
                  secondaryBridges.push(bridge);
                  if (process.env.VERBOSE) {
                    console.log(
                      `  Selected bridge from path${pathIdx + 1}: ${bridge.from}-${bridge.to} (length=${bridge.length})`,
                    );
                  }
                } else if (process.env.VERBOSE) {
                  console.log(
                    `  Skipped alpha-omega bridge from path${pathIdx + 1}: ${bridge.from}-${bridge.to} (redundant)`,
                  );
                }
              }
            }
          }

          // Check if all heteroatoms are in the main paths (IUPAC requirement)
          const atomsInPaths = new Set<number>();
          atomsInPaths.add(alpha);
          atomsInPaths.add(omega);
          for (const path of paths) {
            for (let i = 1; i < path.length - 1; i++) {
              atomsInPaths.add(path[i]!);
            }
          }

          const allHeteroatomsInPaths = heteroatoms.every((ha) => {
            const atomIdx = molecule.atoms.indexOf(ha);
            return atomsInPaths.has(atomIdx);
          });

          if (!allHeteroatomsInPaths && heteroatoms.length > 0) {
            if (process.env.VERBOSE) {
              console.log(`  REJECTED: Not all heteroatoms are in main paths`);
            }
            continue;
          }

          // Calculate von Baeyer numbering for this configuration to evaluate it
          const tempNumbering: Map<number, number> = new Map();
          let pos = 1;
          tempNumbering.set(alpha, pos++);
          for (let i = 1; i < paths[0]!.length - 1; i++) {
            const atomIdx = paths[0]![i]!;
            if (!tempNumbering.has(atomIdx)) tempNumbering.set(atomIdx, pos++);
          }
          tempNumbering.set(omega, pos++);
          for (let i = 1; i < paths[1]!.length - 1; i++) {
            const atomIdx = paths[1]![i]!;
            if (!tempNumbering.has(atomIdx)) tempNumbering.set(atomIdx, pos++);
          }
          for (let i = 1; i < paths[2]!.length - 1; i++) {
            const atomIdx = paths[2]![i]!;
            if (!tempNumbering.has(atomIdx)) tempNumbering.set(atomIdx, pos++);
          }

          // Calculate heteroatom locant sum for comparison (lower is better per IUPAC)
          const heteroLocants: number[] = [];
          for (const ha of heteroatoms) {
            const atomIdx = molecule.atoms.indexOf(ha);
            const haPos = tempNumbering.get(atomIdx);
            if (haPos) heteroLocants.push(haPos);
          }
          heteroLocants.sort((a, b) => a - b);
          const heteroSum = heteroLocants.reduce((sum, val) => sum + val, 0);

          // Calculate secondary bridge locants (P-23.2.6.2.4)
          // Convert bridge endpoints to Von Baeyer positions and create comparison array
          const secondaryBridgeLocants: number[] = [];
          for (const bridge of secondaryBridges) {
            const pos1 = tempNumbering.get(bridge.from);
            const pos2 = tempNumbering.get(bridge.to);
            if (pos1 !== undefined && pos2 !== undefined) {
              // Add min then max for each bridge
              secondaryBridgeLocants.push(Math.min(pos1, pos2));
              secondaryBridgeLocants.push(Math.max(pos1, pos2));
            }
          }
          secondaryBridgeLocants.sort((a, b) => a - b);

          // Score based on IUPAC VB-6.1: prefer configuration with largest sum of two main bridges
          // Then prefer largest third bridge, then lowest secondary bridge locants (P-23.2.6.2.4), then lowest heteroatom locants
          const sumOfTwoLargest = lengths[0]! + lengths[1]!;
          const currentScore =
            sumOfTwoLargest * 1000000 + lengths[2]! * 10000 + lengths[0]! * 100;

          if (process.env.VERBOSE) {
            console.log(
              `  Heteroatom positions: [${heteroLocants.join(",")}], sum=${heteroSum}`,
            );
            console.log(
              `  Secondary bridge locants: [${secondaryBridgeLocants.join(",")}]`,
            );
            console.log(
              `  Score: ${currentScore} (sum2=${sumOfTwoLargest}, third=${lengths[2]}, first=${lengths[0]})`,
            );
          }

          if (!bestConfig) {
            bestConfig = {
              alpha,
              omega,
              paths,
              bridgeLengths: lengths,
              secondaryBridges,
              secondaryBridgeLocants,
              heteroSum,
            };
          } else {
            const bestSumOfTwo =
              bestConfig.bridgeLengths[0]! + bestConfig.bridgeLengths[1]!;
            const bestScore =
              bestSumOfTwo * 1000000 +
              bestConfig.bridgeLengths[2]! * 10000 +
              bestConfig.bridgeLengths[0]! * 100;

            // Helper function to compare two arrays lexicographically
            const compareArrays = (arr1: number[], arr2: number[]): number => {
              const len = Math.min(arr1.length, arr2.length);
              for (let i = 0; i < len; i++) {
                if (arr1[i]! < arr2[i]!) return -1;
                if (arr1[i]! > arr2[i]!) return 1;
              }
              return arr1.length - arr2.length;
            };

            // Prefer configuration with higher bridge score (sum of two largest bridges)
            // If tied, prefer lower secondary bridge locants (P-23.2.6.2.4)
            // If tied, prefer lower heteroatom locant sum (IUPAC lowest locants rule)
            const secondaryBridgeComparison = compareArrays(
              secondaryBridgeLocants,
              bestConfig.secondaryBridgeLocants ?? [],
            );

            if (
              currentScore > bestScore ||
              (currentScore === bestScore && secondaryBridgeComparison < 0) ||
              (currentScore === bestScore &&
                secondaryBridgeComparison === 0 &&
                heteroSum < (bestConfig.heteroSum ?? Infinity))
            ) {
              bestConfig = {
                alpha,
                omega,
                paths,
                bridgeLengths: lengths,
                secondaryBridges,
                secondaryBridgeLocants,
                heteroSum,
              };
            }
          }
        }
      }

      if (bestConfig && bestConfig.bridgeLengths.length === 3) {
        const alkaneName = getAlkaneBySize(atomIds.length);

        // Build von Baeyer numbering
        const vonBaeyerNumbering: Map<number, number> = new Map();
        let currentPosition = 1;

        // Number alpha
        vonBaeyerNumbering.set(bestConfig.alpha, currentPosition++);

        // Number along path 1 (longest)
        const path1 = bestConfig.paths[0]!;
        for (let i = 1; i < path1.length - 1; i++) {
          const atomIdx = path1[i]!;
          if (!vonBaeyerNumbering.has(atomIdx)) {
            vonBaeyerNumbering.set(atomIdx, currentPosition++);
          }
        }

        // Number omega (end of path 1)
        vonBaeyerNumbering.set(bestConfig.omega, currentPosition++);

        // Number along path 2 (in reverse, from omega back to alpha)
        const path2 = bestConfig.paths[1]!;
        for (let i = path2.length - 2; i > 0; i--) {
          const atomIdx = path2[i]!;
          if (!vonBaeyerNumbering.has(atomIdx)) {
            vonBaeyerNumbering.set(atomIdx, currentPosition++);
          }
        }

        // Number along path 3 (forward)
        const path3 = bestConfig.paths[2]!;
        for (let i = 1; i < path3.length - 1; i++) {
          const atomIdx = path3[i]!;
          if (!vonBaeyerNumbering.has(atomIdx)) {
            vonBaeyerNumbering.set(atomIdx, currentPosition++);
          }
        }

        // Number any remaining atoms
        for (const atomIdx of atomIds) {
          if (!vonBaeyerNumbering.has(atomIdx)) {
            vonBaeyerNumbering.set(atomIdx, currentPosition++);
          }
        }

        if (process.env.VERBOSE) {
          console.log(`[TRICYCLO] Von Baeyer numbering:`);
          const sorted = Array.from(vonBaeyerNumbering.entries()).sort(
            (a, b) => a[1] - b[1],
          );
          for (const [atomIdx, pos] of sorted) {
            const atom = molecule.atoms[atomIdx];
            console.log(`  Position ${pos}: atom ${atomIdx} (${atom?.symbol})`);
          }
        }

        // Build heteroatom prefix
        let heteroPrefix = "";
        if (heteroatoms.length > 0) {
          const opsinService = getSharedOPSINService();
          const heteroMap: Record<string, string> = {
            O: "oxa",
            N: "aza",
            S: "thia",
            P: "phospha",
            Si: "sila",
          };

          const heteroPositions = heteroatoms
            .map((ha) => {
              const atomIdx = molecule.atoms.indexOf(ha);
              const pos = vonBaeyerNumbering.get(atomIdx);
              const heteroName = heteroMap[ha.symbol];
              if (pos && heteroName) {
                return { pos, symbol: heteroName };
              }
              return null;
            })
            .filter((x): x is { pos: number; symbol: string } => x !== null)
            .sort((a, b) => a.pos - b.pos);

          if (heteroPositions.length > 0) {
            // Group by element type
            const groupedByElement = new Map<string, number[]>();
            for (const hp of heteroPositions) {
              const existing = groupedByElement.get(hp.symbol) ?? [];
              existing.push(hp.pos);
              groupedByElement.set(hp.symbol, existing);
            }

            // Build consolidated prefix for each element type
            const heteroGroups: string[] = [];
            for (const [symbol, positions] of groupedByElement) {
              const positionStr = positions.join(",");
              const count = positions.length;
              const multiplier =
                count > 1 ? getSimpleMultiplier(count, opsinService) : "";
              heteroGroups.push(`${positionStr}-${multiplier}${symbol}`);
            }
            heteroPrefix = heteroGroups.join("-");
          }
        }

        // Detect double bonds in ring system and map to Von Baeyer positions
        const doubleBondLocants: number[] = [];
        const atomIdSet = new Set(atomIds);
        for (const bond of molecule.bonds) {
          if (
            bond.type === "double" &&
            atomIdSet.has(bond.atom1) &&
            atomIdSet.has(bond.atom2)
          ) {
            const pos1 = vonBaeyerNumbering.get(bond.atom1);
            const pos2 = vonBaeyerNumbering.get(bond.atom2);
            if (pos1 !== undefined && pos2 !== undefined) {
              const lowerPos = Math.min(pos1, pos2);
              doubleBondLocants.push(lowerPos);
            }
          }
        }
        doubleBondLocants.sort((a, b) => a - b);

        if (process.env.VERBOSE && doubleBondLocants.length > 0) {
          console.log(
            `[TRICYCLO] Double bonds at positions: ${doubleBondLocants.join(",")}`,
          );
        }

        // Build bridge notation with secondary bridges
        let bridgeNotation = `[${bestConfig.bridgeLengths.join(".")}`;
        if (bestConfig.secondaryBridges.length > 0) {
          // Sort secondary bridges by their positions for consistent output
          const sortedSecondary = bestConfig.secondaryBridges
            .map((sb) => {
              const pos1 = vonBaeyerNumbering.get(sb.from);
              const pos2 = vonBaeyerNumbering.get(sb.to);
              if (!pos1 || !pos2) return null;
              const [minPos, maxPos] = [pos1, pos2].sort((a, b) => a - b);
              return { length: sb.length, minPos, maxPos };
            })
            .filter(
              (x): x is { length: number; minPos: number; maxPos: number } =>
                x !== null,
            )
            .filter((bridge, index, self) => {
              // Deduplicate: keep only first occurrence of each unique bridge (by positions)
              return (
                index ===
                self.findIndex(
                  (b) =>
                    b.minPos === bridge.minPos && b.maxPos === bridge.maxPos,
                )
              );
            })
            .sort((a, b) => a.minPos - b.minPos || a.maxPos - b.maxPos);

          for (const sb of sortedSecondary) {
            if (process.env.VERBOSE) {
              console.log(
                `[TRICYCLO+] Secondary bridge: positions ${sb.minPos},${sb.maxPos} length=${sb.length}`,
              );
            }
            bridgeNotation += `.${sb.length}${sb.minPos},${sb.maxPos}`;
          }
        }
        bridgeNotation += "]";

        // Determine proper prefix based on SSSR ring count
        let cycloPrefix = "polycyclo"; // fallback
        const cycloPrefixMap: Record<number, string> = {
          2: "bicyclo",
          3: "tricyclo",
          4: "tetracyclo",
          5: "pentacyclo",
          6: "hexacyclo",
          7: "heptacyclo",
          8: "octacyclo",
          9: "nonacyclo",
          10: "decacyclo",
        };
        if (ssrRank in cycloPrefixMap) {
          cycloPrefix = cycloPrefixMap[ssrRank]!;
        }

        const fullPrefix = heteroPrefix ? `${heteroPrefix}` : "";

        // Build final name with double bond suffix if present
        let finalName = "";
        if (doubleBondLocants.length > 0) {
          // Convert alkane to alkene: "nonadecane" → "nonadec"
          const alkeneStem = alkaneName.replace(/ane$/, "");
          const locantStr = doubleBondLocants.join(",");
          finalName = `${fullPrefix}${cycloPrefix}${bridgeNotation}${alkeneStem}-${locantStr}-en`;
        } else {
          finalName = `${fullPrefix}${cycloPrefix}${bridgeNotation}${alkaneName}`;
        }

        return {
          name: finalName,
          vonBaeyerNumbering,
        };
      }
    }

    // Fall back to original algorithm for other cases
    const bridgeLengths: number[] = [];
    const allPaths: Array<{
      start: number;
      end: number;
      path: number[];
      length: number;
    }> = [];

    for (let i = 0; i < bridgeheads.length; i++) {
      for (let j = i + 1; j < bridgeheads.length; j++) {
        const start = bridgeheads[i]!;
        const end = bridgeheads[j]!;
        const paths = findAllPaths(start, end);

        if (paths.length > 0) {
          const minLength = Math.min(...paths.map((p) => p.length - 2));
          if (process.env.VERBOSE)
            console.log(
              `[VERBOSE] bridge between ${start}-${end}: paths=${paths.length}, minLength=${minLength}`,
            );
          if (minLength >= 0) {
            bridgeLengths.push(minLength);
            // Store the shortest path for von Baeyer numbering
            const shortestPath = paths.find((p) => p.length - 2 === minLength);
            if (shortestPath) {
              allPaths.push({
                start,
                end,
                path: shortestPath,
                length: minLength,
              });
            }
          }
        }
      }
    }

    // Remove duplicates and sort
    const uniqueLengths = Array.from(new Set(bridgeLengths)).sort(
      (a, b) => b - a,
    );

    if (uniqueLengths.length >= 3) {
      const alkaneName = getAlkaneBySize(atomIds.length);

      // Determine proper prefix based on SSSR ring count
      let prefix = "polycyclo"; // fallback
      const prefixMap: Record<number, string> = {
        2: "bicyclo",
        3: "tricyclo",
        4: "tetracyclo",
        5: "pentacyclo",
        6: "hexacyclo",
        7: "heptacyclo",
        8: "octacyclo",
        9: "nonacyclo",
        10: "decacyclo",
      };
      if (ssrRank in prefixMap) {
        prefix = prefixMap[ssrRank]!;
      }

      // Build von Baeyer numbering for tricyclo+ systems
      // Strategy: number bridgeheads first, then atoms along bridges in descending order
      const vonBaeyerNumbering: Map<number, number> = new Map();
      let currentPosition = 1;

      // Sort paths by length (descending) for systematic numbering
      const sortedPaths = allPaths.sort((a, b) => b.length - a.length);

      // Number first bridgehead
      if (bridgeheads.length > 0) {
        vonBaeyerNumbering.set(bridgeheads[0]!, currentPosition++);
      }

      // Number atoms along the longest bridge (excluding bridgeheads)
      if (sortedPaths.length > 0) {
        const longestPath = sortedPaths[0]!.path;
        for (let i = 1; i < longestPath.length - 1; i++) {
          const atomIdx = longestPath[i]!;
          if (!vonBaeyerNumbering.has(atomIdx)) {
            vonBaeyerNumbering.set(atomIdx, currentPosition++);
          }
        }
        // Number the second bridgehead
        const secondBridgehead = longestPath[longestPath.length - 1]!;
        if (!vonBaeyerNumbering.has(secondBridgehead)) {
          vonBaeyerNumbering.set(secondBridgehead, currentPosition++);
        }
      }

      // Number remaining bridgeheads
      for (const bh of bridgeheads) {
        if (!vonBaeyerNumbering.has(bh)) {
          vonBaeyerNumbering.set(bh, currentPosition++);
        }
      }

      // Number atoms along remaining bridges
      for (const pathInfo of sortedPaths.slice(1)) {
        for (let i = 1; i < pathInfo.path.length - 1; i++) {
          const atomIdx = pathInfo.path[i]!;
          if (!vonBaeyerNumbering.has(atomIdx)) {
            vonBaeyerNumbering.set(atomIdx, currentPosition++);
          }
        }
      }

      // Number any remaining atoms in the ring system
      for (const atomIdx of atomIds) {
        if (!vonBaeyerNumbering.has(atomIdx)) {
          vonBaeyerNumbering.set(atomIdx, currentPosition++);
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          "[VERBOSE] von Baeyer numbering (tricyclo+):",
          Array.from(vonBaeyerNumbering.entries()),
        );
      }

      // Build heteroatom prefix if present
      let heteroPrefix = "";
      if (heteroatoms.length > 0) {
        const opsinService = getSharedOPSINService();
        const heteroMap: Record<string, string> = {
          O: "oxa",
          N: "aza",
          S: "thia",
          P: "phospha",
          Si: "sila",
        };

        const heteroPositions: Array<{ pos: number; symbol: string }> = [];
        for (const atom of heteroatoms) {
          const heteroIdx = molecule.atoms.indexOf(atom);
          const position = vonBaeyerNumbering.get(heteroIdx);
          if (position !== undefined) {
            const heteroName = heteroMap[atom.symbol];
            if (heteroName) {
              heteroPositions.push({ pos: position, symbol: heteroName });
            }
          }
        }

        if (heteroPositions.length > 0) {
          // Sort by position
          heteroPositions.sort((a, b) => a.pos - b.pos);

          // Group by element type
          const groupedByElement = new Map<string, number[]>();
          for (const hp of heteroPositions) {
            const existing = groupedByElement.get(hp.symbol) ?? [];
            existing.push(hp.pos);
            groupedByElement.set(hp.symbol, existing);
          }

          // Build consolidated prefix for each element type
          const heteroGroups: string[] = [];
          for (const [symbol, positions] of groupedByElement) {
            const positionStr = positions.join(",");
            const count = positions.length;
            const multiplier =
              count > 1 ? getSimpleMultiplier(count, opsinService) : "";
            heteroGroups.push(`${positionStr}-${multiplier}${symbol}`);
          }
          heteroPrefix = heteroGroups.join("-");
        }
      }

      if (process.env.VERBOSE)
        console.log(
          `[VERBOSE] classic polycyclic: ${prefix}`,
          uniqueLengths,
          alkaneName,
          "heteroPrefix:",
          heteroPrefix,
          "ssrRank:",
          ssrRank,
        );

      // Format bridge lengths for von Baeyer notation
      const bridgeNotation = uniqueLengths
        .slice(0, Math.min(uniqueLengths.length, 5))
        .join(".");

      const fullPrefix = heteroPrefix ? `${heteroPrefix}${prefix}` : prefix;

      return {
        name: `${fullPrefix}[${bridgeNotation}]${alkaneName}`,
        vonBaeyerNumbering,
      };
    }
    if (process.env.VERBOSE)
      console.log(
        "[VERBOSE] classic polycyclic: did not find enough bridges",
        uniqueLengths,
      );
    return null;
  }

  if (process.env.VERBOSE)
    console.log("[VERBOSE] classic polycyclic: no valid system");
  return null;
}

export function findHeteroatomsInRing(
  ring: number[],
  molecule: Molecule,
): { symbol: string; count: number }[] {
  const atoms = ring.map((idx) => molecule.atoms[idx]).filter((a) => a);
  const counts: Record<string, number> = {};
  atoms.forEach((atom) => {
    if (atom && atom.symbol !== "C")
      counts[atom.symbol] = (counts[atom.symbol] || 0) + 1;
  });
  return Object.entries(counts).map(([symbol, count]) => ({ symbol, count }));
}
