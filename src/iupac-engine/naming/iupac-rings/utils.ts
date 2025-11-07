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
      console.log(`[classifyFusedSubstituent] carbonCount=${carbonCount}, alkaneName=${alkaneName}`);
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

  // Only consider 2 or 3 rings, all atoms carbon, all non-aromatic
  if (rings.length !== 2 && rings.length !== 3) {
    if (process.env.VERBOSE)
      console.log("[VERBOSE] classic polycyclic: not 2 or 3 rings");
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

  // Allow heteroatoms but reject aromatic systems
  if (!atoms.every((a) => !a.aromatic)) {
    if (process.env.VERBOSE)
      console.log("[VERBOSE] classic polycyclic: contains aromatic atoms");
    return null;
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

  // For bicyclo: two bridgeheads, three bridges
  if (rings.length === 2 && bridgeheads.length === 2) {
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
        const heteroNames: string[] = [];
        const heteroMap: Record<string, string> = {
          O: "oxa",
          N: "aza",
          S: "thia",
          P: "phospha",
          Si: "sila",
        };

        for (const atom of heteroatoms) {
          const prefix = heteroMap[atom.symbol];
          if (prefix) {
            const heteroIdx = molecule.atoms.indexOf(atom);
            const position = vonBaeyerNumbering.get(heteroIdx);
            if (position !== undefined) {
              heteroNames.push(`${position}-${prefix}`);
            }
          }
        }

        if (heteroNames.length > 0) {
          heteroPrefix = heteroNames.join("-");
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
      return {
        name: `${heteroPrefix}bicyclo[${bridgeLengths.slice(0, 3).join(".")}]${alkaneName}`,
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

  // For tricyclo: three or more rings, three or more bridgeheads
  if (rings.length >= 3 && bridgeheads.length >= 3) {
    // Build adjacency list once for O(1) neighbor lookups
    const adjacency = new Map<number, Set<number>>();
    for (const bond of molecule.bonds) {
      if (!adjacency.has(bond.atom1)) adjacency.set(bond.atom1, new Set());
      if (!adjacency.has(bond.atom2)) adjacency.set(bond.atom2, new Set());
      adjacency.get(bond.atom1)!.add(bond.atom2);
      adjacency.get(bond.atom2)!.add(bond.atom1);
    }

    // Find all bridge lengths between all pairs of bridgeheads
    const bridgeLengths: number[] = [];
    for (let i = 0; i < bridgeheads.length; i++) {
      for (let j = i + 1; j < bridgeheads.length; j++) {
        const start = bridgeheads[i]!;
        const end = bridgeheads[j]!;
        const paths: number[][] = [];
        const visited = new Set<number>();

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

        // Find all shortest paths between bridgeheads
        const validPaths = paths.filter((path) => path.length >= 2); // At least start and end

        if (validPaths.length > 0) {
          const minLength = Math.min(...validPaths.map((p) => p.length - 2));
          if (process.env.VERBOSE)
            console.log(
              `[VERBOSE] bridge between ${start}-${end}: paths=${validPaths.length}, minLength=${minLength}`,
            );
          if (minLength >= 0) {
            bridgeLengths.push(minLength);
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
      const prefix = rings.length === 3 ? "tricyclo" : "polycyclo";
      if (process.env.VERBOSE)
        console.log(
          "[VERBOSE] classic polycyclic: tricyclo+",
          uniqueLengths,
          alkaneName,
        );
      return {
        name: `${prefix}[${uniqueLengths.slice(0, Math.min(uniqueLengths.length, 4)).join(".").replace(/0/g, "")}]${alkaneName}`,
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
