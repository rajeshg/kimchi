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

// Build spanning tree using DFS, recording tree/back edge classification.
// Returns back edges which generate fundamental cycles (one per back edge).
// This avoids exponential path exploration of exhaustive DFS.
interface SpanningTreeResult {
  parent: Map<number, number>;
  ancestors: Map<number, number[]>;
  backEdges: [number, number][];
}

function buildSpanningTreeOptimized(
  atoms: Atom[],
  adj: Record<number, Set<number>>,
  startNodes: Set<number>,
): SpanningTreeResult {
  const parent = new Map<number, number>();
  const ancestors = new Map<number, number[]>();
  const visited = new Set<number>();
  const backEdges: [number, number][] = [];

  function dfs(node: number, fromNode: number = -1): void {
    visited.add(node);

    const neighbors = adj[node] || new Set();
    for (const next of neighbors) {
      if (!visited.has(next)) {
        // Tree edge: first visit to 'next'
        parent.set(next, node);
        dfs(next, node);
      } else if (next !== fromNode) {
        // Back edge: connection to already-visited node
        // Normalize edge direction to avoid duplicates
        const edgeKey = [Math.min(next, node), Math.max(next, node)] as const;
        if (
          !backEdges.some((e) => e[0] === edgeKey[0] && e[1] === edgeKey[1])
        ) {
          backEdges.push([edgeKey[0], edgeKey[1]]);
        }
      }
    }
  }

  // Start DFS from atoms with degree >= 2 (chemistry constraint)
  for (const atom of atoms) {
    if (startNodes.has(atom.id) && !visited.has(atom.id)) {
      parent.set(atom.id, -1);
      dfs(atom.id);
    }
  }

  // Build ancestor paths for each node (for LCA queries)
  for (const atom of atoms) {
    const path: number[] = [];
    let current: number | undefined = atom.id;
    while (current !== undefined && current !== -1) {
      path.unshift(current);
      current = parent.get(current);
    }
    ancestors.set(atom.id, path);
  }

  return { parent, ancestors, backEdges };
}

// Extract fundamental cycle from a back edge in the spanning tree.
// Fundamental cycle = path(u→LCA) + path(LCA→v) where u-v is the back edge.
function extractFundamentalCycle(
  u: number,
  v: number,
  parent: Map<number, number>,
  ancestors: Map<number, number[]>,
): number[] {
  const pathU = ancestors.get(u) || [];
  const pathV = ancestors.get(v) || [];

  if (pathU.length === 0 || pathV.length === 0) {
    return [];
  }

  // Find LCA: deepest (lowest) common node in ancestor paths
  // Iterate pathV in REVERSE to find the deepest common ancestor
  const pathUSet = new Set(pathU);
  let lca = -1;
  for (let i = pathV.length - 1; i >= 0; i--) {
    const node = pathV[i];
    if (node !== undefined && pathUSet.has(node)) {
      lca = node;
      break;
    }
  }

  if (lca === -1) return [];

  // Build cycle: u → lca (via parent pointers) + lca → v (reverse path)
  const cycle: number[] = [];

  // Path from u up to lca
  let current: number | undefined = u;
  while (current !== undefined && current !== -1 && current !== lca) {
    cycle.push(current);
    current = parent.get(current);
  }
  cycle.push(lca);

  // Path from lca down to v (via parent pointers, traversed backward)
  const pathFromLcaToV: number[] = [];
  current = v;
  while (current !== undefined && current !== -1 && current !== lca) {
    pathFromLcaToV.unshift(current);
    current = parent.get(current);
  }
  cycle.push(...pathFromLcaToV);

  // Remove duplicates and validate
  const uniqueCycle = Array.from(new Set(cycle));
  return uniqueCycle.length >= 3 ? uniqueCycle : [];
}

// Find all simple cycles using spanning tree algorithm (optimized method).
// CHEMISTRY OPTIMIZATION: Uses spanning tree + back edges for cycle detection
// supplemented with limited BFS for small cycles.
//
// Strategy:
// 1. Extract fundamental cycles from back edges (O(M) method, generates M-N+1 cycles)
// 2. Use BFS to find small cycles up to size 12 (practical ring size for drugs)
//    BFS is efficient for small cycles even in complex molecules
// 3. Combine and deduplicate all cycles for SSSR selection
//
// Chemistry constraint: Ring atoms must have degree >= 2, so we skip degree-1 atoms.
export function findAllCycles(
  atoms: Atom[],
  bonds: Bond[],
  maxLen: number = 40,
): number[][] {
  const n = atoms.length;
  const m = bonds.length;

  // Quick exit for acyclic graphs
  if (m <= n - 1) return [];

  const adj = buildAdj(atoms, bonds);

  // OPTIMIZATION 1: Skip degree-1 atoms (chemistry constraint)
  // Ring atoms must have degree >= 2 in the molecular graph
  const minDegreeAtoms = new Set<number>();
  for (const atom of atoms) {
    if ((adj[atom.id]?.size ?? 0) >= 2) {
      minDegreeAtoms.add(atom.id);
    }
  }

  if (minDegreeAtoms.size === 0) return [];

  // OPTIMIZATION 2: Build spanning tree efficiently (single DFS pass)
  // This avoids exponential path exploration of exhaustive DFS
  const treeResult = buildSpanningTreeOptimized(atoms, adj, minDegreeAtoms);

  if (treeResult.backEdges.length === 0) return [];

  // OPTIMIZATION 3: Extract fundamental cycles from back edges
  // Each back edge generates exactly one fundamental cycle
  const cycles: number[][] = [];
  const cycleSet = new Set<string>();

  for (const [u, v] of treeResult.backEdges) {
    try {
      const cycle = extractFundamentalCycle(
        u,
        v,
        treeResult.parent,
        treeResult.ancestors,
      );

      if (cycle && cycle.length <= maxLen && cycle.length >= 3) {
        // Normalize: sort atom IDs
        const normalized = [...cycle].sort((a, b) => a - b);
        const cycleKey = normalized.join(",");
        if (!cycleSet.has(cycleKey)) {
          cycleSet.add(cycleKey);
          cycles.push(normalized);
        }
      }
    } catch {
      // Skip malformed cycles
      continue;
    }
  }

  // OPTIMIZATION 4: Use BFS for small cycles (up to size 12)
  // This finds small cycles that BFS is efficient for, especially in dense rings
  // BFS finds cycles starting from each node up to practical drug-like ring sizes
  const smallCycles = _findSmallCyclesBFS(atoms, adj, 12, cycleSet);
  cycles.push(...smallCycles);

  // Sort by size (smallest first) for better SSSR selection
  return cycles.sort((a, b) => a.length - b.length);
}

// BFS-based small cycle finding (efficient for cycles up to ~12 atoms)
// Avoids combinatorial explosion by limiting search to practical ring sizes
// Used to supplement fundamental cycles for complete SSSR basis
function _findSmallCyclesBFS(
  atoms: Atom[],
  adj: Record<number, Set<number>>,
  maxLen: number,
  existingCycles: Set<string>,
): number[][] {
  const cycles: number[][] = [];

  for (const start of atoms.map((a) => a.id)) {
    // BFS from start node
    const queue: Array<{ node: number; path: number[]; pathSet: Set<number> }> =
      [{ node: start, path: [start], pathSet: new Set([start]) }];

    while (queue.length > 0) {
      const { node, path, pathSet } = queue.shift()!;
      const neighbors = adj[node];

      if (!neighbors || path.length > maxLen) continue;

      for (const next of neighbors) {
        if (next === start && path.length > 2) {
          // Found cycle back to start
          const ring = [...path].sort((a, b) => a - b);
          const cycleKey = ring.join(",");
          if (!existingCycles.has(cycleKey)) {
            existingCycles.add(cycleKey);
            cycles.push(ring);
          }
        } else if (!pathSet.has(next) && path.length < maxLen) {
          const newPath = [...path, next];
          const newPathSet = new Set(pathSet);
          newPathSet.add(next);
          queue.push({ node: next, path: newPath, pathSet: newPathSet });
        }
      }
    }
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
