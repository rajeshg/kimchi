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
  // Use rule engine for large rings (>20 carbons)
  if (map[n]) return map[n];

  const alkaneName = ruleEngine.getAlkaneName(n);
  if (alkaneName) {
    // For von Baeyer nomenclature, we need the stem form
    // e.g., "henatriacontane" → "hentriaconta" (remove "ane", apply vowel elision)
    let stem = alkaneName.replace(/ane$/, "");
    // Apply vowel elision for double vowels (e.g., "henatriacont" → "hentriacont")
    stem = stem.replace(/aa/, "a").replace(/atriacont/, "triacont");
    return stem + "a";
  }

  return `C${n}`;
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
  vonBaeyerNumberingOptimized?: boolean; // Track if von Baeyer numbering has been path-reversed/optimized
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
        heteroLocants?: number[];
        principalLocants?: number[];
        substituentLocants?: number[];
        heteroSum?: number;
      } | null = null;

      for (let i = 0; i < bridgeheads.length; i++) {
        for (let j = i + 1; j < bridgeheads.length; j++) {
          // Test BOTH directions: (i,j) and (j,i)
          // This ensures we evaluate all possible numbering directions
          for (const [alphaIdx, omegaIdx] of [
            [i, j],
            [j, i],
          ] as const) {
            const alpha = bridgeheads[alphaIdx];
            const omega = bridgeheads[omegaIdx];
            if (alpha === undefined || omega === undefined) continue;

            // Try to find 3 node-disjoint paths
            const rawPaths = findNodeDisjointPaths(alpha, omega, 3);

            if (!rawPaths || rawPaths.length !== 3) {
              if (process.env.VERBOSE) {
                console.log(
                  `[TRICYCLO] Skipping alpha=${alpha}, omega=${omega} (found ${rawPaths?.length ?? 0} paths, need 3)`,
                );
              }
              continue;
            }

            // Generate all permutations of the 3 paths to find optimal numbering
            const pathPermutations: number[][][] = [];
            for (let i = 0; i < 3; i++) {
              for (let j = 0; j < 3; j++) {
                if (j === i) continue;
                for (let k = 0; k < 3; k++) {
                  if (k === i || k === j) continue;
                  pathPermutations.push([
                    rawPaths[i]!,
                    rawPaths[j]!,
                    rawPaths[k]!,
                  ]);
                }
              }
            }

            if (process.env.VERBOSE) {
              console.log(`[TRICYCLO] Testing alpha=${alpha}, omega=${omega}`);
              console.log(
                `  Found ${pathPermutations.length} path permutations to evaluate`,
              );
            }

            // Test each path permutation
            for (const paths of pathPermutations) {
              const lengths = paths.map((p) => p.length - 2);
              const sortedLengths = [...lengths].sort((a, b) => b - a);

              if (process.env.VERBOSE) {
                console.log(
                  `  [Permutation] Path1: ${paths[0]!.join(",")} (length=${lengths[0]})`,
                );
                console.log(
                  `  [Permutation] Path2: ${paths[1]!.join(",")} (length=${lengths[1]})`,
                );
                console.log(
                  `  [Permutation] Path3: ${paths[2]!.join(",")} (length=${lengths[2]})`,
                );
                console.log(
                  `  [Permutation] Bridge lengths: [${sortedLengths.join(".")}]`,
                );
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

                      const secondaryPaths = findAllPaths(
                        atom1,
                        atom2,
                        usedNodes,
                      );
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
                  console.log(
                    `  REJECTED: Not all heteroatoms are in main paths`,
                  );
                }
                continue;
              }

              // Calculate von Baeyer numbering for this configuration to evaluate it
              // IMPORTANT: Must match the final numbering scheme in lines 1074-1104
              const tempNumbering: Map<number, number> = new Map();
              let pos = 1;
              tempNumbering.set(alpha, pos++);
              for (let i = 1; i < paths[0]!.length - 1; i++) {
                const atomIdx = paths[0]![i]!;
                if (!tempNumbering.has(atomIdx))
                  tempNumbering.set(atomIdx, pos++);
              }
              tempNumbering.set(omega, pos++);
              // Path 2: traverse in REVERSE (from omega back to alpha) to match final numbering
              for (let i = paths[1]!.length - 2; i > 0; i--) {
                const atomIdx = paths[1]![i]!;
                if (!tempNumbering.has(atomIdx))
                  tempNumbering.set(atomIdx, pos++);
              }
              for (let i = 1; i < paths[2]!.length - 1; i++) {
                const atomIdx = paths[2]![i]!;
                if (!tempNumbering.has(atomIdx))
                  tempNumbering.set(atomIdx, pos++);
              }

              // Calculate heteroatom locant sum for comparison (lower is better per IUPAC)
              const heteroLocants: number[] = [];
              for (const ha of heteroatoms) {
                const atomIdx = molecule.atoms.indexOf(ha);
                const haPos = tempNumbering.get(atomIdx);
                if (haPos) heteroLocants.push(haPos);
              }
              heteroLocants.sort((a, b) => a - b);
              const heteroSum = heteroLocants.reduce(
                (sum, val) => sum + val,
                0,
              );

              if (process.env.VERBOSE) {
                console.log(`  Temp numbering map:`);
                const sortedEntries = Array.from(tempNumbering.entries()).sort(
                  (a, b) => a[1] - b[1],
                );
                for (const [atomIdx, pos] of sortedEntries) {
                  const atom = molecule.atoms[atomIdx];
                  console.log(
                    `    pos ${pos} -> atom ${atomIdx} (${atom?.symbol})`,
                  );
                }
              }

              // Calculate principal functional group locants (ketones, aldehydes, etc.)
              const principalLocants: number[] = [];
              const ringAtomSet = new Set(atomIds);
              for (
                let atomIdx = 0;
                atomIdx < molecule.atoms.length;
                atomIdx++
              ) {
                const atom = molecule.atoms[atomIdx];
                if (!atom || !ringAtomSet.has(atomIdx)) continue;

                // Detect ketone: sp2 carbon with C=O double bond (within ring)
                if (atom.symbol === "C" && atom.hybridization === "sp2") {
                  const carbonylBond = molecule.bonds.find((b) => {
                    const otherAtomIdx =
                      b.atom1 === atomIdx
                        ? b.atom2
                        : b.atom2 === atomIdx
                          ? b.atom1
                          : -1;
                    if (otherAtomIdx < 0) return false;
                    const otherAtom = molecule.atoms[otherAtomIdx];
                    return (
                      otherAtom &&
                      otherAtom.symbol === "O" &&
                      b.type === "double"
                    );
                  });

                  if (carbonylBond) {
                    const pos = tempNumbering.get(atomIdx);
                    if (pos !== undefined) {
                      principalLocants.push(pos);
                      if (process.env.VERBOSE) {
                        console.log(
                          `  Ketone at atom ${atomIdx} -> temp position ${pos}`,
                        );
                      }
                    }
                  }
                }
              }
              principalLocants.sort((a, b) => a - b);

              // Calculate substituent locants (methyl groups, etc.) for tie-breaking
              // Build a set of functional group atoms to exclude (e.g., C=O oxygen)
              const fgAtomSet = new Set<number>();
              for (
                let atomIdx = 0;
                atomIdx < molecule.atoms.length;
                atomIdx++
              ) {
                const atom = molecule.atoms[atomIdx];
                if (!atom || !ringAtomSet.has(atomIdx)) continue;

                // Check if this atom is part of a ketone (C=O with O outside the ring)
                if (atom.symbol === "C" && atom.hybridization === "sp2") {
                  const carbonylBond = molecule.bonds.find((b) => {
                    const otherAtomIdx =
                      b.atom1 === atomIdx
                        ? b.atom2
                        : b.atom2 === atomIdx
                          ? b.atom1
                          : -1;
                    if (otherAtomIdx < 0) return false;
                    const otherAtom = molecule.atoms[otherAtomIdx];
                    return (
                      otherAtom &&
                      otherAtom.symbol === "O" &&
                      b.type === "double"
                    );
                  });

                  if (carbonylBond) {
                    // Mark the oxygen as a functional group atom
                    const oxygenIdx =
                      carbonylBond.atom1 === atomIdx
                        ? carbonylBond.atom2
                        : carbonylBond.atom1;
                    fgAtomSet.add(oxygenIdx);
                  }
                }
              }

              const substituentLocants: number[] = [];
              for (
                let atomIdx = 0;
                atomIdx < molecule.atoms.length;
                atomIdx++
              ) {
                const atom = molecule.atoms[atomIdx];
                if (!atom || !ringAtomSet.has(atomIdx)) continue;

                // Find substituent atoms: non-H atoms bonded to ring atoms but not in the ring
                const neighbors = molecule.bonds
                  .filter((b) => b.atom1 === atomIdx || b.atom2 === atomIdx)
                  .map((b) => (b.atom1 === atomIdx ? b.atom2 : b.atom1));

                for (const neighborIdx of neighbors) {
                  const neighbor = molecule.atoms[neighborIdx];
                  if (!neighbor || neighbor.symbol === "H") continue;
                  if (ringAtomSet.has(neighborIdx)) continue; // Skip ring atoms
                  if (fgAtomSet.has(neighborIdx)) continue; // Skip functional group atoms (e.g., C=O oxygen)

                  // This is a substituent attached to this ring atom
                  const pos = tempNumbering.get(atomIdx);
                  if (pos !== undefined) {
                    substituentLocants.push(pos);
                    if (process.env.VERBOSE) {
                      console.log(
                        `  Substituent ${neighbor.symbol} (atom ${neighborIdx}) bonded to ring atom ${atomIdx} -> ring position ${pos}`,
                      );
                    }
                  }
                }
              }
              substituentLocants.sort((a, b) => a - b);

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
              // Then prefer largest third bridge. Use sortedLengths for consistent scoring across permutations.
              const sumOfTwoLargest = sortedLengths[0]! + sortedLengths[1]!;
              const currentScore =
                sumOfTwoLargest * 1000000 +
                sortedLengths[2]! * 10000 +
                sortedLengths[0]! * 100;

              if (process.env.VERBOSE) {
                console.log(
                  `  Heteroatom positions: [${heteroLocants.join(",")}], sum=${heteroSum}`,
                );
                console.log(
                  `  Secondary bridge locants: [${secondaryBridgeLocants.join(",")}]`,
                );
                console.log(
                  `  Principal FG locants: [${principalLocants.join(",")}]`,
                );
                console.log(
                  `  Substituent locants: [${substituentLocants.join(",")}]`,
                );
                console.log(
                  `  Score: ${currentScore} (sum2=${sumOfTwoLargest}, third=${lengths[2]}, first=${lengths[0]})`,
                );
                console.log(
                  `  --> alpha=${alpha}, omega=${omega}, paths=[${paths[0]!.length - 1},${paths[1]!.length - 1},${paths[2]!.length - 1}]`,
                );
              }

              if (!bestConfig) {
                bestConfig = {
                  alpha,
                  omega,
                  paths,
                  bridgeLengths: sortedLengths, // Use sorted lengths for von Baeyer notation
                  secondaryBridges,
                  secondaryBridgeLocants,
                  heteroLocants,
                  principalLocants,
                  substituentLocants,
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
                const compareArrays = (
                  arr1: number[],
                  arr2: number[],
                ): number => {
                  const len = Math.min(arr1.length, arr2.length);
                  for (let i = 0; i < len; i++) {
                    if (arr1[i]! < arr2[i]!) return -1;
                    if (arr1[i]! > arr2[i]!) return 1;
                  }
                  return arr1.length - arr2.length;
                };

                // ============================================================================
                // IUPAC Priority Order for von Baeyer Numbering Configuration Selection
                // ============================================================================
                //
                // The following priority hierarchy determines which numbering configuration
                // is selected when multiple valid configurations exist:
                //
                // 1. Bridge score (sum of two largest bridges) - VB-6.1
                //    Higher score is preferred
                //
                // 2. Third bridge length - VB-6.2
                //    Larger third bridge is preferred (already encoded in bridge score)
                //
                // 3. Secondary bridge locants - P-23.2.6.2.4
                //    Lower locants preferred (defines overall numbering system)
                //
                // 4. FIRST heteroatom locant - P-14.4
                //    Lower first heteroatom locant preferred
                //
                // 5. Principal functional group locants - P-14.4
                //    Lower principal group locants preferred
                //    (ONLY compared when first heteroatom locant ties)
                //
                // 6. REMAINING heteroatom locants - P-14.4
                //    Lower remaining heteroatom locants preferred
                //    (ONLY compared when principal group locants also tie)
                //
                // 7. Substituent locants - P-14.4
                //    Lower substituent locants preferred (detachable prefixes)
                //
                // CRITICAL: Steps 4-6 implement P-14.4's "lowest locants" rule correctly:
                // When the first heteroatom locant ties, we MUST compare principal groups
                // BEFORE comparing the second heteroatom locant. This ensures principal
                // functional groups take priority in tie-breaking situations.
                //
                // Example: CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C
                //   Config A: heteroatoms [3,9], principal [6,12]
                //   Config B: heteroatoms [3,12], principal [6,9]
                //   Since first heteroatom ties (3=3), compare principal groups next.
                //   Config B wins because [6,9] < [6,12], even though [3,9] < [3,12].
                // ============================================================================

                const secondaryBridgeComparison = compareArrays(
                  secondaryBridgeLocants,
                  bestConfig.secondaryBridgeLocants ?? [],
                );

                // Step 4: Compare FIRST heteroatom locant only
                const bestHeteroLocants = bestConfig.heteroLocants ?? [];
                let firstHeteroComparison = 0;
                if (heteroLocants.length > 0 && bestHeteroLocants.length > 0) {
                  if (heteroLocants[0]! < bestHeteroLocants[0]!)
                    firstHeteroComparison = -1;
                  else if (heteroLocants[0]! > bestHeteroLocants[0]!)
                    firstHeteroComparison = 1;
                } else if (heteroLocants.length > 0) {
                  firstHeteroComparison = -1; // Current has heteroatoms, best doesn't
                } else if (bestHeteroLocants.length > 0) {
                  firstHeteroComparison = 1; // Best has heteroatoms, current doesn't
                }

                // Step 5: Compare principal functional group locants
                const principalComparison = compareArrays(
                  principalLocants,
                  bestConfig.principalLocants ?? [],
                );

                // Step 6: Compare REMAINING heteroatom locants (after first)
                // Only used if first heteroatom AND principal groups tie
                const remainingHeteroComparison = compareArrays(
                  heteroLocants.slice(1),
                  bestHeteroLocants.slice(1),
                );

                // Step 7: Compare substituent locants
                const substituentComparison = compareArrays(
                  substituentLocants,
                  bestConfig.substituentLocants ?? [],
                );

                if (process.env.VERBOSE) {
                  console.log(`[VONBAEYER] Comparing configurations:`);
                  console.log(
                    `  Current: alpha=${alpha}, omega=${omega}, paths=${JSON.stringify(paths)}`,
                  );
                  console.log(
                    `    secondaryBridgeLocants: ${JSON.stringify(secondaryBridgeLocants)}`,
                  );
                  console.log(
                    `    heteroLocants: ${JSON.stringify(heteroLocants)}`,
                  );
                  console.log(
                    `    principalLocants: ${JSON.stringify(principalLocants)}`,
                  );
                  console.log(
                    `    substituentLocants: ${JSON.stringify(substituentLocants)}`,
                  );
                  console.log(
                    `  Best: alpha=${bestConfig.alpha}, omega=${bestConfig.omega}`,
                  );
                  console.log(
                    `    secondaryBridgeLocants: ${JSON.stringify(bestConfig.secondaryBridgeLocants)}`,
                  );
                  console.log(
                    `    heteroLocants: ${JSON.stringify(bestConfig.heteroLocants)}`,
                  );
                  console.log(
                    `    principalLocants: ${JSON.stringify(bestConfig.principalLocants)}`,
                  );
                  console.log(
                    `    substituentLocants: ${JSON.stringify(bestConfig.substituentLocants)}`,
                  );
                  console.log(
                    `  Comparisons: score=${currentScore > bestScore}, secondaryBridge=${secondaryBridgeComparison}, firstHetero=${firstHeteroComparison}, principal=${principalComparison}, remainingHetero=${remainingHeteroComparison}, substituent=${substituentComparison}`,
                  );
                }

                // Apply the priority order to select the best configuration
                // Each condition represents a tie-breaking step in the hierarchy
                if (
                  // Step 1: Higher bridge score wins
                  currentScore > bestScore ||
                  // Step 3: Lower secondary bridge locants win (when bridge scores tie)
                  (currentScore === bestScore &&
                    secondaryBridgeComparison < 0) ||
                  // Step 4: Lower first heteroatom locant wins (when secondary bridges tie)
                  (currentScore === bestScore &&
                    secondaryBridgeComparison === 0 &&
                    firstHeteroComparison < 0) ||
                  // Step 5: Lower principal group locants win (when first heteroatom ties)
                  (currentScore === bestScore &&
                    secondaryBridgeComparison === 0 &&
                    firstHeteroComparison === 0 &&
                    principalComparison < 0) ||
                  // Step 6: Lower remaining heteroatom locants win (when principal groups tie)
                  (currentScore === bestScore &&
                    secondaryBridgeComparison === 0 &&
                    firstHeteroComparison === 0 &&
                    principalComparison === 0 &&
                    remainingHeteroComparison < 0) ||
                  // Step 7: Lower substituent locants win (when all above tie)
                  (currentScore === bestScore &&
                    secondaryBridgeComparison === 0 &&
                    firstHeteroComparison === 0 &&
                    principalComparison === 0 &&
                    remainingHeteroComparison === 0 &&
                    substituentComparison < 0)
                ) {
                  bestConfig = {
                    alpha,
                    omega,
                    paths,
                    bridgeLengths: sortedLengths, // Use sorted lengths for von Baeyer notation
                    secondaryBridges,
                    secondaryBridgeLocants,
                    heteroLocants,
                    principalLocants,
                    substituentLocants,
                    heteroSum,
                  };
                }
              }
            } // Close permutation loop
          } // Close direction loop (both alpha→omega and omega→alpha)
        }
      }

      if (bestConfig && bestConfig.bridgeLengths.length === 3) {
        if (process.env.VERBOSE) {
          console.log("[VONBAEYER] Selected best configuration:");
          console.log("  alpha:", bestConfig.alpha, "omega:", bestConfig.omega);
          console.log("  bridgeLengths:", bestConfig.bridgeLengths);
          console.log("  heteroLocants:", bestConfig.heteroLocants);
          console.log("  principalLocants:", bestConfig.principalLocants);
          console.log("  substituentLocants:", bestConfig.substituentLocants);
        }
        const alkaneName = getAlkaneBySize(atomIds.length);

        // Helper function to build a numbering from given alpha/omega/paths
        const buildNumbering = (
          alpha: number,
          omega: number,
          paths: number[][],
        ): Map<number, number> => {
          const numbering: Map<number, number> = new Map();
          let pos = 1;

          numbering.set(alpha, pos++);

          const path1 = paths[0]!;
          for (let i = 1; i < path1.length - 1; i++) {
            const atomIdx = path1[i]!;
            if (!numbering.has(atomIdx)) numbering.set(atomIdx, pos++);
          }

          numbering.set(omega, pos++);

          const path2 = paths[1]!;
          for (let i = path2.length - 2; i > 0; i--) {
            const atomIdx = path2[i]!;
            if (!numbering.has(atomIdx)) numbering.set(atomIdx, pos++);
          }

          const path3 = paths[2]!;
          for (let i = 1; i < path3.length - 1; i++) {
            const atomIdx = path3[i]!;
            if (!numbering.has(atomIdx)) numbering.set(atomIdx, pos++);
          }

          for (const atomIdx of atomIds) {
            if (!numbering.has(atomIdx)) numbering.set(atomIdx, pos++);
          }

          return numbering;
        };

        // Helper to compute locants for a given numbering
        const _computeLocants = (numbering: Map<number, number>) => {
          const heteroLocs: number[] = [];
          for (const ha of heteroatoms) {
            const atomIdx = molecule.atoms.indexOf(ha);
            const pos = numbering.get(atomIdx);
            if (pos) heteroLocs.push(pos);
          }
          heteroLocs.sort((a, b) => a - b);

          const principalLocs: number[] = [];
          const ringAtomSet = new Set(atomIds);
          for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
            const atom = molecule.atoms[atomIdx];
            if (!atom || !ringAtomSet.has(atomIdx)) continue;

            if (atom.symbol === "C" && atom.hybridization === "sp2") {
              const carbonylBond = molecule.bonds.find((b) => {
                const otherIdx =
                  b.atom1 === atomIdx
                    ? b.atom2
                    : b.atom2 === atomIdx
                      ? b.atom1
                      : -1;
                if (otherIdx < 0) return false;
                const other = molecule.atoms[otherIdx];
                return other && other.symbol === "O" && b.type === "double";
              });

              if (carbonylBond) {
                const pos = numbering.get(atomIdx);
                if (pos !== undefined) principalLocs.push(pos);
              }
            }
          }
          principalLocs.sort((a, b) => a - b);

          const substituentLocs: number[] = [];
          const fgAtomSet = new Set<number>();
          for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
            const atom = molecule.atoms[atomIdx];
            if (!atom || !ringAtomSet.has(atomIdx)) continue;

            if (atom.symbol === "C" && atom.hybridization === "sp2") {
              const carbonylBond = molecule.bonds.find((b) => {
                const otherIdx =
                  b.atom1 === atomIdx
                    ? b.atom2
                    : b.atom2 === atomIdx
                      ? b.atom1
                      : -1;
                if (otherIdx < 0) return false;
                const other = molecule.atoms[otherIdx];
                return other && other.symbol === "O" && b.type === "double";
              });
              if (carbonylBond) {
                const oxygenIdx =
                  carbonylBond.atom1 === atomIdx
                    ? carbonylBond.atom2
                    : carbonylBond.atom1;
                fgAtomSet.add(oxygenIdx);
              }
            }
          }

          for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
            const atom = molecule.atoms[atomIdx];
            if (!atom || ringAtomSet.has(atomIdx) || fgAtomSet.has(atomIdx))
              continue;

            const bonds = molecule.bonds.filter(
              (b) => b.atom1 === atomIdx || b.atom2 === atomIdx,
            );
            for (const bond of bonds) {
              const otherIdx = bond.atom1 === atomIdx ? bond.atom2 : bond.atom1;
              if (ringAtomSet.has(otherIdx)) {
                const pos = numbering.get(otherIdx);
                if (pos !== undefined) substituentLocs.push(pos);
              }
            }
          }
          substituentLocs.sort((a, b) => a - b);

          return { heteroLocs, principalLocs, substituentLocs };
        };

        // Helper to get secondary bridge locants
        const _getSecondaryBridgeLocants = (numbering: Map<number, number>) => {
          const locants: number[] = [];
          for (const sb of bestConfig.secondaryBridges) {
            const pos1 = numbering.get(sb.from);
            const pos2 = numbering.get(sb.to);
            if (pos1 && pos2) {
              locants.push(Math.min(pos1, pos2), Math.max(pos1, pos2));
            }
          }
          locants.sort((a, b) => a - b);
          return locants;
        };

        let vonBaeyerNumbering = buildNumbering(
          bestConfig.alpha,
          bestConfig.omega,
          bestConfig.paths,
        );

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
          vonBaeyerNumberingOptimized: true, // Tricyclo path reversal optimization applied
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

      // Apply cyclic shifting to find optimal von Baeyer numbering per P-14.4
      // This ensures the lowest complete locant set while preserving higher-priority locants

      // Helper to compute locants for a given numbering
      const computeLocants = (numbering: Map<number, number>) => {
        const heteroLocs: number[] = [];
        const principalLocs: number[] = [];
        const substituentLocs: number[] = [];

        const ringAtomSet = new Set(atomIds);

        // Detect heteroatoms in the ring
        for (const ha of heteroatoms) {
          const atomIdx = molecule.atoms.indexOf(ha);
          const pos = numbering.get(atomIdx);
          if (pos !== undefined) {
            heteroLocs.push(pos);
          }
        }

        // Detect ketones: sp2 carbon with C=O double bond
        for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
          const atom = molecule.atoms[atomIdx];
          if (!atom || !ringAtomSet.has(atomIdx)) continue;

          if (atom.symbol === "C" && atom.hybridization === "sp2") {
            const carbonylBond = molecule.bonds.find((b) => {
              const otherAtomIdx =
                b.atom1 === atomIdx
                  ? b.atom2
                  : b.atom2 === atomIdx
                    ? b.atom1
                    : -1;
              if (otherAtomIdx < 0) return false;
              const otherAtom = molecule.atoms[otherAtomIdx];
              return (
                otherAtom && otherAtom.symbol === "O" && b.type === "double"
              );
            });

            if (carbonylBond) {
              const pos = numbering.get(atomIdx);
              if (pos !== undefined) {
                principalLocs.push(pos);
              }
            }
          }
        }

        // Detect substituents (e.g., methyl groups) attached to ring atoms
        // Build a set of functional group atoms to exclude (e.g., C=O oxygen)
        const fgAtomSet = new Set<number>();
        for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
          const atom = molecule.atoms[atomIdx];
          if (!atom || !ringAtomSet.has(atomIdx)) continue;

          if (atom.symbol === "C" && atom.hybridization === "sp2") {
            const carbonylBond = molecule.bonds.find((b) => {
              const otherAtomIdx =
                b.atom1 === atomIdx
                  ? b.atom2
                  : b.atom2 === atomIdx
                    ? b.atom1
                    : -1;
              if (otherAtomIdx < 0) return false;
              const otherAtom = molecule.atoms[otherAtomIdx];
              return (
                otherAtom && otherAtom.symbol === "O" && b.type === "double"
              );
            });

            if (carbonylBond) {
              const oxygenIdx =
                carbonylBond.atom1 === atomIdx
                  ? carbonylBond.atom2
                  : carbonylBond.atom1;
              fgAtomSet.add(oxygenIdx);
            }
          }
        }

        for (let atomIdx = 0; atomIdx < molecule.atoms.length; atomIdx++) {
          const atom = molecule.atoms[atomIdx];
          if (!atom || !ringAtomSet.has(atomIdx)) continue;

          const neighbors = molecule.bonds
            .filter((b) => b.atom1 === atomIdx || b.atom2 === atomIdx)
            .map((b) => (b.atom1 === atomIdx ? b.atom2 : b.atom1));

          for (const neighborIdx of neighbors) {
            const neighbor = molecule.atoms[neighborIdx];
            if (!neighbor || neighbor.symbol === "H") continue;
            if (ringAtomSet.has(neighborIdx)) continue;
            if (fgAtomSet.has(neighborIdx)) continue;

            const pos = numbering.get(atomIdx);
            if (pos !== undefined) {
              substituentLocs.push(pos);
            }
          }
        }

        heteroLocs.sort((a, b) => a - b);
        principalLocs.sort((a, b) => a - b);
        substituentLocs.sort((a, b) => a - b);

        return { heteroLocs, principalLocs, substituentLocs };
      };

      // Helper to apply cyclic shift to numbering
      const applyShift = (
        numbering: Map<number, number>,
        shift: number,
        maxPos: number,
      ): Map<number, number> => {
        const shifted = new Map<number, number>();
        for (const [atomIdx, pos] of numbering.entries()) {
          const newPos = ((pos - 1 + shift) % maxPos) + 1;
          shifted.set(atomIdx, newPos);
        }
        return shifted;
      };

      // Compare locants according to IUPAC priority
      const compareArrays = (arr1: number[], arr2: number[]): number => {
        const len = Math.min(arr1.length, arr2.length);
        for (let i = 0; i < len; i++) {
          if (arr1[i]! < arr2[i]!) return -1;
          if (arr1[i]! > arr2[i]!) return 1;
        }
        return arr1.length - arr2.length;
      };

      // Helper to get complete locant set for comparison (P-14.4)
      const getCompleteLocantSet = (locants: {
        heteroLocs: number[];
        principalLocs: number[];
        substituentLocs: number[];
      }): number[] => {
        return [
          ...locants.heteroLocs,
          ...locants.principalLocs,
          ...locants.substituentLocs,
        ].sort((a, b) => a - b);
      };

      // Try all cyclic shifts to find optimal numbering
      const maxPos = atomIds.length;
      const originalLocants = computeLocants(vonBaeyerNumbering);
      let bestNumbering = vonBaeyerNumbering;
      let bestLabel = "original";
      let bestLocants = originalLocants;
      let bestCompleteSet = getCompleteLocantSet(bestLocants);

      // IMPORTANT: For polycyclic von Baeyer systems with heteroatoms, the numbering
      // is determined by the bridge structure and should NOT be changed by cyclic shifts.
      // The heteroatom positions (e.g., 8,15,19-trioxa) are structural features of the
      // parent hydride, not optimization targets.
      const hasHeteroatoms = originalLocants.heteroLocs.length > 0;
      if (hasHeteroatoms) {
        if (process.env.VERBOSE) {
          console.log(
            `[TRICYCLO SHIFT] Heteroatoms present - skipping cyclic shift optimization`,
          );
        }
        // Keep original numbering - no cyclic shift optimization needed
      } else {
        // Only apply cyclic shift optimization when no heteroatoms are present
        for (let shift = 1; shift < maxPos; shift++) {
          const shiftedNumbering = applyShift(
            vonBaeyerNumbering,
            shift,
            maxPos,
          );
          const locants = computeLocants(shiftedNumbering);
          const completeSet = getCompleteLocantSet(locants);

          if (process.env.VERBOSE) {
            console.log(`[TRICYCLO SHIFT] Evaluating shift${shift}:`);
            console.log(`  Hetero: [${locants.heteroLocs.join(",")}]`);
            console.log(`  Principal: [${locants.principalLocs.join(",")}]`);
            console.log(
              `  Substituent: [${locants.substituentLocs.join(",")}]`,
            );
            console.log(`  Complete set: [${completeSet.join(",")}]`);
          }

          // Compare according to IUPAC priority hierarchy for von Baeyer nomenclature:
          // Note: Heteroatom positions are structural features determined by the parent
          // hydride and should NOT be minimized during cyclic shift optimization.
          // 1. Principal functional group locants (P-14.3)
          // 2. Complete locant set (P-14.4)
          const principalComp = compareArrays(
            locants.principalLocs,
            bestLocants.principalLocs,
          );
          const completeSetComp = compareArrays(completeSet, bestCompleteSet);

          if (process.env.VERBOSE) {
            console.log(
              `  principalComp=${principalComp}, completeSetComp=${completeSetComp}`,
            );
          }

          if (
            principalComp < 0 ||
            (principalComp === 0 && completeSetComp < 0)
          ) {
            if (process.env.VERBOSE) {
              console.log(
                `[TRICYCLO SHIFT] shift${shift} is BETTER - updating best`,
              );
            }
            bestNumbering = shiftedNumbering;
            bestLabel = `shift${shift}`;
            bestLocants = locants;
            bestCompleteSet = completeSet;
          }
        }
      }

      const optimizedVonBaeyerNumbering = bestNumbering;

      if (process.env.VERBOSE) {
        console.log(`[TRICYCLO SHIFT] Selected ${bestLabel} (best locants)`);
        console.log(`[TRICYCLO SHIFT] Final optimized von Baeyer numbering:`);
        const sorted = Array.from(optimizedVonBaeyerNumbering.entries()).sort(
          (a, b) => a[1] - b[1],
        );
        for (const [atomIdx, pos] of sorted) {
          const atom = molecule.atoms[atomIdx];
          console.log(`  Position ${pos}: atom ${atomIdx} (${atom?.symbol})`);
        }
        console.log(`  Hetero: [${bestLocants.heteroLocs.join(",")}]`);
        console.log(`  Principal: [${bestLocants.principalLocs.join(",")}]`);
        console.log(
          `  Substituent: [${bestLocants.substituentLocs.join(",")}]`,
        );
        console.log(`  Complete set: [${bestCompleteSet.join(",")}]`);
      }

      // Build heteroatom prefix if present
      // IMPORTANT: Use optimizedVonBaeyerNumbering here, not the original vonBaeyerNumbering
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
          const position = optimizedVonBaeyerNumbering.get(heteroIdx);
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
        vonBaeyerNumbering: optimizedVonBaeyerNumbering,
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
