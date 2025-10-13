import type { Atom, Bond } from '../../types';

/**
 * Find all rings in a molecule using DFS
 * Returns an array of ring atom ID arrays
 */
export function findRings(atoms: Atom[], bonds: Bond[]): number[][] {
  // Simple ring finding using DFS
  const rings: number[][] = [];
  const visited = new Set<number>();

  function dfs(startId: number, currentId: number, path: number[], visitedEdges: Set<string>): void {
    path.push(currentId);
    visited.add(currentId);

    const neighbors = bonds
      .filter(b => b.atom1 === currentId || b.atom2 === currentId)
      .map(b => b.atom1 === currentId ? b.atom2 : b.atom1)
      .filter(id => !visitedEdges.has(`${Math.min(currentId, id)}-${Math.max(currentId, id)}`));

    for (const neighborId of neighbors) {
      const edgeKey = `${Math.min(currentId, neighborId)}-${Math.max(currentId, neighborId)}`;
      visitedEdges.add(edgeKey);

      if (neighborId === startId && path.length >= 3) {
        // Found a ring
        rings.push([...path]);
      } else if (!path.includes(neighborId)) {
        dfs(startId, neighborId, [...path], new Set(visitedEdges));
      }

      visitedEdges.delete(edgeKey);
    }

    path.pop();
    visited.delete(currentId);
  }

  for (const atom of atoms) {
    if (!visited.has(atom.id)) {
      dfs(atom.id, atom.id, [], new Set());
    }
  }

  return rings;
}