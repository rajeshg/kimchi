// SSSR algorithm ported from Kekule.js (Hanser et al. approach)
// Only core logic, minimal dependencies

import type { Atom, Bond } from 'types';

// --- Minimum Cycle Basis SSSR ---
// Utility: Build adjacency list
function buildAdj(atoms: Atom[], bonds: Bond[]): Record<number, Set<number>> {
  const adj: Record<number, Set<number>> = {};
  for (const atom of atoms) adj[atom.id] = new Set();
  for (const bond of bonds) {
    adj[bond.atom1]?.add(bond.atom2);
    adj[bond.atom2]?.add(bond.atom1);
  }
  return adj;
}

// Utility: Find all simple cycles up to maxLen (Johnson's algorithm would be better for large graphs)
// Increased default maxLen from 8 to 25 to match RDKit's ring detection for SMARTS [R] primitive
export function findAllCycles(atoms: Atom[], bonds: Bond[], maxLen = 40): number[][] {
  const adj = buildAdj(atoms, bonds);
  const cycles: number[][] = [];
  const nodes = atoms.map(a => a.id);
  function dfs(path: number[], visited: Set<number>, start: number, curr: number, depth: number) {
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
        if (!cycles.some(c => c.length === ring.length && c.every((v, i) => v === ring[i]))) {
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

// Utility: Get all edges in a cycle as string keys
function cycleEdges(cycle: number[]): Set<string> {
  const edges = new Set<string>();
  for (let i = 0; i < cycle.length; ++i) {
    const a = cycle[i], b = cycle[(i + 1) % cycle.length];
    if (a === undefined || b === undefined) continue;
    edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
  }
  return edges;
}

function isLinearlyIndependent(newEdges: Set<string>, prevEdgeSets: Set<string>[]): boolean {
  const n = prevEdgeSets.length;
  if (n === 0) return true;
  
  for (let mask = 1; mask < (1 << n); mask++) {
    const xorResult = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        for (const edge of prevEdgeSets[i]!) {
          if (xorResult.has(edge)) {
            xorResult.delete(edge);
          } else {
            xorResult.add(edge);
          }
        }
      }
    }
    
    if (xorResult.size === newEdges.size && 
        [...newEdges].every(e => xorResult.has(e))) {
      return false;
    }
  }
  
  return true;
}

// Minimum Cycle Basis SSSR selection
export function findSSSR_Kekule(atoms: Atom[], bonds: Bond[]): number[][] {
  const numNodes = atoms.length;
  const numEdges = bonds.length;
  const ringCount = numEdges - numNodes + 1;
  if (ringCount <= 0) return [];
  const allCycles = findAllCycles(atoms, bonds);
  allCycles.sort((a, b) => a.length - b.length || a.join(',').localeCompare(b.join(',')));
  
  const sssr: number[][] = [];
  const edgeSets: Set<string>[] = [];
  
  for (const cycle of allCycles) {
    const edges = cycleEdges(cycle);
    if (isLinearlyIndependent(edges, edgeSets)) {
      sssr.push(cycle);
      edgeSets.push(edges);
      if (sssr.length >= ringCount) break;
    }
  }
  
  return sssr;
}
