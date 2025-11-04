import type { Atom, Bond } from "types";

function buildAdj(atoms: Atom[], bonds: Bond[]): Record<number, Set<number>> {
  const adj: Record<number, Set<number>> = {};
  for (const atom of atoms) adj[atom.id] = new Set();
  for (const bond of bonds) {
    adj[bond.atom1]?.add(bond.atom2);
    adj[bond.atom2]?.add(bond.atom1);
  }
  return adj;
}

// Find all simple cycles in the molecular graph.
// Dynamically adjusts maxLen based on graph density to prevent exponential explosion in polycyclic systems.
export function findAllCycles(
  atoms: Atom[],
  bonds: Bond[],
  maxLen: number = 40,
): number[][] {
  // Smart adaptive limit based on graph density and size
  const n = atoms.length;
  const m = bonds.length;

  // Estimate graph density: typical drug-like ≈ 1.0-1.2, polycyclic ≈ 1.2-1.5
  const density = m / n;

  // Estimate expected SSSR count: sssr = m - n + 1
  const expectedSSSR = m - n + 1;

  // Adaptive limit based on density to prevent exponential explosion in polycyclic systems.
  // Sparse trees use full maxLen; high-density systems cap at 15-25 atoms depending on molecule size.
  if (density >= 1.15) {
    // High density: definitely polycyclic, limit aggressively
    if (n > 150) {
      maxLen = Math.min(maxLen, 15);
    } else if (n > 100) {
      maxLen = Math.min(maxLen, 16);
    } else if (n > 60) {
      maxLen = Math.min(maxLen, 17);
    }
    // else: n ≤ 60, use maxLen=18 (small dense molecules are still manageable)
    else {
      maxLen = Math.min(maxLen, 18);
    }
  } else if (density >= 1.05) {
    // Moderate density: polycyclic but not extremely bridged
    if (n > 150) {
      maxLen = Math.min(maxLen, 20);
    } else if (n > 100) {
      maxLen = Math.min(maxLen, 22);
    } else if (n > 60) {
      maxLen = Math.min(maxLen, 25);
    }
    // else: n ≤ 60, keep full maxLen (reasonable for small moderate-density molecules)
  }
  // else: density < 1.05, keep full maxLen (sparse graphs are fast, trees/chains)

  const adj = buildAdj(atoms, bonds);
  const cycles: number[][] = [];
  const nodes = atoms.map((a) => a.id);

  function dfs(
    path: number[],
    visited: Set<number>,
    start: number,
    curr: number,
    depth: number,
  ) {
    if (depth > maxLen) return;
    const neighbors = adj[curr];
    if (!neighbors) return;
    for (const next of neighbors) {
      const nextInPath = path.indexOf(next);
      if (nextInPath !== -1 && path.length - nextInPath > 2) {
        // Found cycle
        const cycle = path.slice(nextInPath);
        const minIdx = cycle.indexOf(Math.min(...cycle));
        const norm = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
        const ring = norm.sort((a, b) => a - b);
        if (
          !cycles.some(
            (c) => c.length === ring.length && c.every((v, i) => v === ring[i]),
          )
        ) {
          cycles.push(ring);
        }
      } else if (!visited.has(next)) {
        visited.add(next);
        dfs([...path, next], visited, start, next, depth + 1);
        visited.delete(next);
      }
    }
  }
  for (const n of nodes) {
    dfs([n], new Set([n]), n, n, 1);
  }
  return cycles;
}

// BFS-based cycle finding for large molecules (more efficient than DFS for large rings)
function findCyclesBFS(
  atoms: Atom[],
  bonds: Bond[],
  maxLen: number,
): number[][] {
  const adj = buildAdj(atoms, bonds);
  const cycles: number[][] = [];
  const visited = new Set<number>();

  for (const start of atoms.map((a) => a.id)) {
    if (visited.has(start)) continue;

    // BFS from start node
    const queue: Array<{ node: number; path: number[]; visited: Set<number> }> =
      [{ node: start, path: [start], visited: new Set([start]) }];

    while (queue.length > 0) {
      const { node, path, visited: pathVisited } = queue.shift()!;
      const neighbors = adj[node];

      if (!neighbors) continue;

      for (const next of neighbors) {
        if (path.length >= maxLen) continue;

        if (next === start && path.length > 2) {
          // Found cycle back to start
          const cycle = [...path, start];
          const minIdx = cycle.indexOf(Math.min(...cycle));
          const norm = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
          const ring = norm.sort((a, b) => a - b);
          if (
            !cycles.some(
              (c) =>
                c.length === ring.length && c.every((v, i) => v === ring[i]),
            )
          ) {
            cycles.push(ring);
          }
        } else if (!pathVisited.has(next)) {
          const newVisited = new Set(pathVisited);
          newVisited.add(next);
          queue.push({
            node: next,
            path: [...path, next],
            visited: newVisited,
          });
        }
      }
    }

    visited.add(start);
  }

  return cycles;
}

// Utility: Get all edges in a cycle as string keys
function cycleEdges(cycle: number[]): Set<string> {
  const edges = new Set<string>();
  for (let i = 0; i < cycle.length; ++i) {
    const a = cycle[i],
      b = cycle[(i + 1) % cycle.length];
    if (a === undefined || b === undefined) continue;
    edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
  }
  return edges;
}

// Gaussian elimination over GF(2) to test linear independence of cycles in O(R^3).
// Maintains RREF basis matrix to efficiently determine if a cycle is dependent on prior cycles.

class GF2Matrix {
  rows: Map<number, boolean>[] = [];
  pivotCol: Map<number, number> = new Map();
  edgeToCol: Map<string, number> = new Map();
  nextCol: number = 0;

  addRow(edges: Set<string>): boolean {
    if (edges.size === 0) return false;

    for (const edge of edges) {
      if (!this.edgeToCol.has(edge)) {
        this.edgeToCol.set(edge, this.nextCol++);
      }
    }

    const vector = new Map<number, boolean>();
    for (const edge of edges) {
      vector.set(this.edgeToCol.get(edge)!, true);
    }

    this.reduceVector(vector);

    if (this.vectorIsZero(vector)) {
      return false;
    }

    const pivotCol = this.findPivotColumn(vector);
    if (this.pivotCol.has(pivotCol)) {
      return false;
    }

    this.pivotCol.set(pivotCol, this.rows.length);
    this.rows.push(vector);

    for (let i = this.rows.length - 2; i >= 0; i--) {
      if (this.rows[i]!.has(pivotCol)) {
        this.xorRows(this.rows[i]!, vector);
      }
    }

    return true;
  }

  private reduceVector(vector: Map<number, boolean>): void {
    const cols = Array.from(vector.keys()).sort((a, b) => a - b);
    for (const col of cols) {
      if (this.pivotCol.has(col)) {
        const pivotRowIdx = this.pivotCol.get(col)!;
        this.xorRows(vector, this.rows[pivotRowIdx]!);
      }
    }
  }

  private findPivotColumn(vector: Map<number, boolean>): number {
    const cols = Array.from(vector.keys()).sort((a, b) => b - a);
    return cols[0] ?? -1;
  }

  private vectorIsZero(vector: Map<number, boolean>): boolean {
    for (const [, val] of vector) {
      if (val) return false;
    }
    return true;
  }

  private xorRows(
    target: Map<number, boolean>,
    source: Map<number, boolean>,
  ): void {
    for (const [col, val] of source) {
      if (target.has(col)) {
        if (val) {
          target.delete(col);
        }
      } else if (val) {
        target.set(col, true);
      }
    }
  }
}

function isLinearlyIndependent(
  newEdges: Set<string>,
  matrix: GF2Matrix,
): boolean {
  return matrix.addRow(newEdges);
}

// Compute SSSR (Smallest Set of Smallest Rings) using cycle greedy selection and linear independence testing via GF(2).
// Guaranteed to find exactly (edges - nodes + components) linearly independent cycles.
export function findSSSR_Kekule(atoms: Atom[], bonds: Bond[]): number[][] {
  const numNodes = atoms.length;
  const numEdges = bonds.length;
  const ringCount = numEdges - numNodes + 1;
  if (ringCount <= 0) return [];
  const allCycles = findAllCycles(atoms, bonds);
  allCycles.sort(
    (a, b) => a.length - b.length || a.join(",").localeCompare(b.join(",")),
  );

  const sssr: number[][] = [];
  const matrix = new GF2Matrix();

  for (const cycle of allCycles) {
    const edges = cycleEdges(cycle);
    if (isLinearlyIndependent(edges, matrix)) {
      sssr.push(cycle);
      if (sssr.length >= ringCount) break;
    }
  }

  return sssr;
}

// Get all cycles for ring membership counting ([R] primitive)
// IMPORTANT: Uses SSSR (Smallest Set of Smallest Rings) per SMARTS specification
// [Rn] primitive counts atoms in n SSSR rings, NOT all elementary cycles
export function findAllRings(atoms: Atom[], bonds: Bond[]): number[][] {
  return findSSSR_Kekule(atoms, bonds);
}
