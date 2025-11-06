import type { Molecule } from "types";

/**
 * Find all heavy-atom chains (non-hydrogen atoms) of maximum length, canonicalized.
 * Uses iterative deepening DFS to enumerate all maximal chains.
 */
export function findAllAtomChains(
  molecule: Molecule,
  excludedAtomIds: Set<number> = new Set(),
): number[][] {
  const atomIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom, idx }) => atom.symbol !== "H" && !excludedAtomIds.has(idx))
    .map(({ idx }) => idx);

  if (atomIndices.length === 0) return [];

  const adjList = new Map<number, number[]>();
  for (const idx of atomIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol !== "H" &&
      molecule.atoms[bond.atom2]?.symbol !== "H" &&
      !excludedAtomIds.has(bond.atom1) &&
      !excludedAtomIds.has(bond.atom2)
    ) {
      adjList.get(bond.atom1)?.push(bond.atom2);
      adjList.get(bond.atom2)?.push(bond.atom1);
    }
  }

  // Use iterative deepening to find the true maximum chain length.
  // Start with DFS estimate as lower bound, then try increasingly longer chains.
  const longest = ((): number[] => {
    let longestPath: number[] = [];
    const dfs = (node: number, visited: Set<number>, path: number[]): void => {
      if (path.length > longestPath.length) longestPath = [...path];
      const neighbors = adjList.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          path.push(neighbor);
          dfs(neighbor, visited, path);
          path.pop();
          visited.delete(neighbor);
        }
      }
    };
    for (const start of atomIndices) {
      const visited = new Set<number>([start]);
      dfs(start, visited, [start]);
    }
    return longestPath;
  })();

  let minLength = longest.length;
  if (minLength < 1) return [];

  // Special case: single atom (no bonds)
  if (minLength === 1) {
    return atomIndices.map((idx) => [idx]);
  }

  // Iterative deepening: try lengths minLength, minLength+1, minLength+2, ...
  // until no chains are found at target length.
  let allChainsAtMaxLength: number[][] = [];

  for (
    let targetLength = minLength;
    targetLength <= atomIndices.length;
    targetLength++
  ) {
    const found: number[][] = [];
    const seen = new Set<string>();

    function dfsLimited(
      current: number,
      visited: Set<number>,
      path: number[],
    ): void {
      if (path.length === targetLength) {
        const forward = path.join(",");
        const reversed = [...path].slice().reverse().join(",");
        const key = forward < reversed ? forward : reversed;
        if (!seen.has(key)) {
          seen.add(key);
          const canonical =
            forward < reversed ? [...path] : [...path].slice().reverse();
          found.push(canonical);
        }
        return;
      }

      const neighbors = adjList.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          path.push(neighbor);
          dfsLimited(neighbor, visited, path);
          path.pop();
          visited.delete(neighbor);
        }
      }
    }

    for (const startAtom of atomIndices) {
      const visited = new Set<number>([startAtom]);
      dfsLimited(startAtom, visited, [startAtom]);
    }

    if (found.length > 0) {
      allChainsAtMaxLength = found;
    } else {
      // No chains found at this length, stop searching
      break;
    }
  }

  return allChainsAtMaxLength.filter((chain) => chain.length >= 2);
}

/**
 * Find all maximum-length carbon-only chains in the molecule.
 * Uses iterative deepening DFS to enumerate all maximal carbon chains.
 */
export function findAllCarbonChains(
  molecule: Molecule,
  excludedAtomIds: Set<number> = new Set(),
): number[][] {
  const carbonIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom, idx }) => atom.symbol === "C" && !excludedAtomIds.has(idx))
    .map(({ idx }) => idx);

  if (carbonIndices.length === 0) return [];

  const adjList = new Map<number, number[]>();
  for (const idx of carbonIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol === "C" &&
      molecule.atoms[bond.atom2]?.symbol === "C" &&
      !excludedAtomIds.has(bond.atom1) &&
      !excludedAtomIds.has(bond.atom2)
    ) {
      adjList.get(bond.atom1)?.push(bond.atom2);
      adjList.get(bond.atom2)?.push(bond.atom1);
    }
  }

  // Use iterative deepening to find the true maximum chain length.
  // Start with DFS estimate as lower bound, then try increasingly longer chains.
  let longestPath: number[] = [];
  const dfsFindLongest = (
    node: number,
    visited: Set<number>,
    path: number[],
  ): void => {
    if (path.length > longestPath.length) longestPath = [...path];
    const neighbors = adjList.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfsFindLongest(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };
  for (const startAtom of carbonIndices) {
    const visited = new Set<number>([startAtom]);
    dfsFindLongest(startAtom, visited, [startAtom]);
  }
  let minLength = longestPath.length;
  if (minLength < 1) return [];

  // Special case: single atom (no bonds)
  if (minLength === 1) {
    return carbonIndices.map((idx) => [idx]);
  }

  // Iterative deepening: try lengths minLength, minLength+1, minLength+2, ...
  // until no chains are found at target length.
  let allChainsAtMaxLength: number[][] = [];

  for (
    let targetLength = minLength;
    targetLength <= carbonIndices.length;
    targetLength++
  ) {
    const found: number[][] = [];
    const seen = new Set<string>();

    function dfsLimited(
      current: number,
      visited: Set<number>,
      path: number[],
    ): void {
      if (path.length === targetLength) {
        const forward = path.join(",");
        const reversed = [...path].slice().reverse().join(",");
        const key = forward < reversed ? forward : reversed;
        if (!seen.has(key)) {
          seen.add(key);
          const canonical =
            forward < reversed ? [...path] : [...path].slice().reverse();
          found.push(canonical);
        }
        return;
      }

      const neighbors = adjList.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          path.push(neighbor);
          dfsLimited(neighbor, visited, path);
          path.pop();
          visited.delete(neighbor);
        }
      }
    }

    for (const startAtom of carbonIndices) {
      const visited = new Set<number>([startAtom]);
      dfsLimited(startAtom, visited, [startAtom]);
    }

    if (found.length > 0) {
      allChainsAtMaxLength = found;
    } else {
      // No chains found at this length, stop searching
      break;
    }
  }

  return allChainsAtMaxLength.filter((chain) => chain.length >= 2);
}

/**
 * Find all maximum-length carbon-only chains starting from a specific carbon atom.
 * This is used for amine parent chain construction where we want [N] + [longest carbon chain from N].
 */
export function findAllCarbonChainsFromStart(
  molecule: Molecule,
  startAtom: number,
  excludedAtomIds: Set<number> = new Set(),
): number[][] {
  const carbonIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom, idx }) => atom.symbol === "C" && !excludedAtomIds.has(idx))
    .map(({ idx }) => idx);

  if (carbonIndices.length === 0) return [];
  if (!carbonIndices.includes(startAtom)) return [];

  const adjList = new Map<number, number[]>();
  for (const idx of carbonIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol === "C" &&
      molecule.atoms[bond.atom2]?.symbol === "C" &&
      !excludedAtomIds.has(bond.atom1) &&
      !excludedAtomIds.has(bond.atom2)
    ) {
      adjList.get(bond.atom1)?.push(bond.atom2);
      adjList.get(bond.atom2)?.push(bond.atom1);
    }
  }

  // Find longest path starting from startAtom
  let longestPath: number[] = [];
  const dfsFindLongest = (
    node: number,
    visited: Set<number>,
    path: number[],
  ): void => {
    if (path.length > longestPath.length) longestPath = [...path];
    const neighbors = adjList.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfsFindLongest(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };

  const visited = new Set<number>([startAtom]);
  dfsFindLongest(startAtom, visited, [startAtom]);

  const targetLength = longestPath.length;
  if (targetLength < 1) return [];

  // Special case: single atom
  if (targetLength === 1) {
    return [[startAtom]];
  }

  // Find all paths of maximum length starting from startAtom
  const found: number[][] = [];
  const seen = new Set<string>();

  function dfsLimited(
    current: number,
    visited: Set<number>,
    path: number[],
  ): void {
    if (path.length === targetLength) {
      const key = path.join(",");
      if (!seen.has(key)) {
        seen.add(key);
        found.push([...path]);
      }
      return;
    }

    const neighbors = adjList.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfsLimited(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  }

  const visitedStart = new Set<number>([startAtom]);
  dfsLimited(startAtom, visitedStart, [startAtom]);

  return found.filter((chain) => chain.length >= 1);
}
