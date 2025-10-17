import { zip } from 'es-toolkit';

/**
 * Simple, efficient graph data structure for cheminformatics applications.
 * Optimized for small graphs (molecules typically have <100 nodes).
 * Undirected graph with support for node and edge data.
 */

export class Graph<TNode = any, TEdge = any> {
  private nodes = new Map<number, TNode>();
  private edges = new Map<string, { from: number; to: number; data: TEdge }>();
  private adjacency = new Map<number, Set<number>>();

  /**
   * Add a node to the graph.
   * @param id Unique node identifier
   * @param data Optional node data
   */
  addNode(id: number, data?: TNode): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, data!);
      this.adjacency.set(id, new Set());
    } else if (data !== undefined) {
      this.nodes.set(id, data);
    }
  }

  /**
   * Add an undirected edge between two nodes.
   * @param from Source node ID
   * @param to Target node ID
   * @param data Optional edge data
   */
  addEdge(from: number, to: number, data?: TEdge): void {
    // Ensure both nodes exist
    this.addNode(from);
    this.addNode(to);

    const edgeKey = this.getEdgeKey(from, to);

    if (!this.edges.has(edgeKey)) {
      this.edges.set(edgeKey, { from, to, data: data! });
      this.adjacency.get(from)!.add(to);
      this.adjacency.get(to)!.add(from);
    } else if (data !== undefined) {
      this.edges.get(edgeKey)!.data = data;
    }
  }

  /**
   * Remove a node and all its edges.
   * @param id Node ID to remove
   */
  removeNode(id: number): void {
    if (!this.nodes.has(id)) return;

    // Remove all edges connected to this node
    const neighbors = Array.from(this.adjacency.get(id) || []);
    for (const neighbor of neighbors) {
      this.removeEdge(id, neighbor);
    }

    this.nodes.delete(id);
    this.adjacency.delete(id);
  }

  /**
   * Remove an edge between two nodes.
   * @param from Source node ID
   * @param to Target node ID
   */
  removeEdge(from: number, to: number): void {
    const edgeKey = this.getEdgeKey(from, to);

    if (this.edges.has(edgeKey)) {
      this.edges.delete(edgeKey);
      this.adjacency.get(from)?.delete(to);
      this.adjacency.get(to)?.delete(from);
    }
  }

  /**
   * Check if a node exists.
   * @param id Node ID
   * @returns True if node exists
   */
  hasNode(id: number): boolean {
    return this.nodes.has(id);
  }

  /**
   * Check if an edge exists between two nodes.
   * @param from Source node ID
   * @param to Target node ID
   * @returns True if edge exists
   */
  hasEdge(from: number, to: number): boolean {
    return this.edges.has(this.getEdgeKey(from, to));
  }

  /**
   * Get data associated with a node.
   * @param id Node ID
   * @returns Node data or undefined
   */
  getNodeData(id: number): TNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get data associated with an edge.
   * @param from Source node ID
   * @param to Target node ID
   * @returns Edge data or undefined
   */
  getEdgeData(from: number, to: number): TEdge | undefined {
    const edge = this.edges.get(this.getEdgeKey(from, to));
    return edge?.data;
  }

  /**
   * Get all node IDs in the graph.
   * @returns Array of node IDs
   */
  getNodes(): number[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get all edges as [from, to] pairs.
   * @returns Array of edge pairs
   */
  getEdges(): [number, number][] {
    return Array.from(this.edges.values()).map(edge => [edge.from, edge.to]);
  }

  /**
   * Get neighbors of a node.
   * @param id Node ID
   * @returns Array of neighbor node IDs
   */
  getNeighbors(id: number): number[] {
    return Array.from(this.adjacency.get(id) || []);
  }

  /**
   * Get degree of a node (number of neighbors).
   * @param id Node ID
   * @returns Degree of the node
   */
  getDegree(id: number): number {
    return this.adjacency.get(id)?.size || 0;
  }

  /**
   * Get the number of nodes in the graph.
   * @returns Number of nodes
   */
  nodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Get the number of edges in the graph.
   * @returns Number of edges
   */
  edgeCount(): number {
    return this.edges.size;
  }

  /**
   * Check if the graph is empty.
   * @returns True if graph has no nodes
   */
  isEmpty(): boolean {
    return this.nodes.size === 0;
  }

  /**
   * Clear all nodes and edges from the graph.
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
  }

  /**
   * Create a copy of the graph.
   * @returns New Graph instance with copied data
   */
  clone(): Graph<TNode, TEdge> {
    const newGraph = new Graph<TNode, TEdge>();

    // Copy nodes
    for (const [id, data] of this.nodes) {
      newGraph.addNode(id, data);
    }

    // Copy edges
    for (const edge of this.edges.values()) {
      newGraph.addEdge(edge.from, edge.to, edge.data);
    }

    return newGraph;
  }

  private getEdgeKey(from: number, to: number): string {
    // Ensure consistent ordering for undirected edges
    const [a, b] = from < to ? [from, to] : [to, from];
    return `${a}-${b}`;
  }
}

/**
 * Graph traversal and analysis utilities
 */

/**
 * Perform depth-first search traversal.
 * @param graph The graph to traverse
 * @param startNode Starting node ID
 * @param visitCallback Callback function called for each visited node
 * @param visited Optional set to track visited nodes (for external control)
 * @returns Set of visited nodes
 */
export function dfs<TNode, TEdge>(
  graph: Graph<TNode, TEdge>,
  startNode: number,
  visitCallback?: (nodeId: number, data: TNode | undefined) => void,
  visited: Set<number> = new Set()
): Set<number> {
  if (visited.has(startNode)) return visited;

  visited.add(startNode);
  const nodeData = graph.getNodeData(startNode);
  visitCallback?.(startNode, nodeData);

  for (const neighbor of graph.getNeighbors(startNode)) {
    if (!visited.has(neighbor)) {
      dfs(graph, neighbor, visitCallback, visited);
    }
  }

  return visited;
}

/**
 * Perform breadth-first search traversal.
 * @param graph The graph to traverse
 * @param startNode Starting node ID
 * @param visitCallback Callback function called for each visited node
 * @returns Set of visited nodes
 */
export function bfs<TNode, TEdge>(
  graph: Graph<TNode, TEdge>,
  startNode: number,
  visitCallback?: (nodeId: number, data: TNode | undefined) => void
): Set<number> {
  const visited = new Set<number>();
  const queue: number[] = [startNode];

  visited.add(startNode);
  const nodeData = graph.getNodeData(startNode);
  visitCallback?.(startNode, nodeData);

  while (queue.length > 0) {
    const currentNode = queue.shift()!;
    const neighbors = graph.getNeighbors(currentNode);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        const neighborData = graph.getNodeData(neighbor);
        visitCallback?.(neighbor, neighborData!);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

/**
 * Find all connected components in the graph.
 * @param graph The graph to analyze
 * @returns Array of arrays, where each subarray contains node IDs in one component
 */
export function findConnectedComponents<TNode, TEdge>(
  graph: Graph<TNode, TEdge>
): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const nodeId of graph.getNodes()) {
    if (!visited.has(nodeId)) {
      const component: number[] = [];
      dfs(graph, nodeId, (nodeId) => component.push(nodeId), visited);
      components.push(component.sort((a, b) => a - b));
    }
  }

  return components;
}

/**
 * Find shortest path between two nodes using BFS.
 * @param graph The graph to search
 * @param startNode Starting node ID
 * @param endNode Target node ID
 * @returns Array of node IDs representing the path, or empty array if no path exists
 */
export function findShortestPath<TNode, TEdge>(
  graph: Graph<TNode, TEdge>,
  startNode: number,
  endNode: number
): number[] {
  if (startNode === endNode) return [startNode];

  const visited = new Set<number>();
  const queue: { node: number; path: number[] }[] = [{ node: startNode, path: [startNode] }];
  visited.add(startNode);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    for (const neighbor of graph.getNeighbors(node)) {
      if (!visited.has(neighbor)) {
        const newPath = [...path, neighbor];
        if (neighbor === endNode) {
          return newPath;
        }
        visited.add(neighbor);
        queue.push({ node: neighbor, path: newPath });
      }
    }
  }

  return []; // No path found
}

/**
 * Calculate shortest path distance between two nodes.
 * @param graph The graph to search
 * @param startNode Starting node ID
 * @param endNode Target node ID
 * @returns Distance (number of edges) or -1 if no path exists
 */
export function getDistance<TNode, TEdge>(
  graph: Graph<TNode, TEdge>,
  startNode: number,
  endNode: number
): number {
  const path = findShortestPath(graph, startNode, endNode);
  return path.length === 0 ? -1 : path.length - 1;
}

/**
 * Detect all simple cycles in the graph using a backtracking approach.
 * @param graph The graph to analyze
 * @returns Array of cycles, where each cycle is an array of node IDs
 */
export function findCycles<TNode, TEdge>(
  graph: Graph<TNode, TEdge>
): number[][] {
  const cycles: number[][] = [];
  const nodes = graph.getNodes();

  for (const startNode of nodes) {
    findCyclesFromNode(graph, startNode, cycles);
  }

  // Remove duplicates and normalize cycles
  const uniqueCycles = removeDuplicateCycles(cycles);
  return uniqueCycles;
}

/**
 * Find all cycles starting from a given node using backtracking.
 */
function findCyclesFromNode<TNode, TEdge>(
  graph: Graph<TNode, TEdge>,
  startNode: number,
  cycles: number[][]
): void {
  const path: number[] = [];
  const visited = new Set<number>();

  function backtrack(current: number): void {
    const pathIndex = path.indexOf(current);

    if (pathIndex !== -1) {
      // Found a cycle
      const cycle = path.slice(pathIndex);
      cycle.push(current); // Close the cycle
      if (cycle.length >= 4) { // At least 3 unique nodes + closing node
        cycles.push([...cycle]);
      }
      return;
    }

    path.push(current);
    visited.add(current);

    for (const neighbor of graph.getNeighbors(current)) {
      if (neighbor >= startNode) { // Avoid duplicate cycles by direction
        backtrack(neighbor);
      }
    }

    path.pop();
    visited.delete(current);
  }

  backtrack(startNode);
}

/**
 * Remove duplicate cycles from the list.
 */
function removeDuplicateCycles(cycles: number[][]): number[][] {
  const uniqueCycles: number[][] = [];
  const seen = new Set<string>();

  for (const cycle of cycles) {
    const normalized = normalizeCycle(cycle);
    const key = normalized.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCycles.push(normalized);
    }
  }

  return uniqueCycles;
}

/**
 * Compare two cycles lexicographically.
 */
function compareCycles(a: number[], b: number[]): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return a.length - b.length;
}

/**
 * Normalize a cycle by rotating to start with the smallest node ID
 * and ensuring consistent direction.
 */
function normalizeCycle(cycle: number[]): number[] {
  if (cycle.length === 0) return cycle;

  // Check if cycle has closing duplicate
  const hasClosingDuplicate = cycle.length > 1 && cycle[0]! === cycle[cycle.length - 1]!;
  
  // Remove the closing duplicate if present
  const uniqueCycle = hasClosingDuplicate ? cycle.slice(0, -1) : cycle;

  // Function to get canonical for a sequence
  const getCanonical = (seq: number[]): number[] => {
    let minIndex = 0;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i]! < seq[minIndex]!) {
        minIndex = i;
      }
    }

    const rotated = [
      ...seq.slice(minIndex),
      ...seq.slice(0, minIndex)
    ];

    const reversed = [...rotated].reverse();
    const reversedKey = reversed.slice(0, 2).join(',');
    const forwardKey = rotated.slice(0, 2).join(',');

    return reversedKey < forwardKey ? reversed : rotated;
  };

  const canonical1 = getCanonical(uniqueCycle);
  const canonical2 = getCanonical([...uniqueCycle].reverse());

  return compareCycles(canonical1, canonical2) <= 0 ? canonical1 : canonical2;
}

/**
 * Find the Smallest Set of Smallest Rings (SSSR) / Minimum Cycle Basis (MCB).
 * Uses a greedy algorithm to find a linearly independent set of cycles.
 * The number of rings = edges - nodes + components (cyclomatic complexity).
 * @param graph The graph to analyze
 * @returns Array of rings, where each ring is an array of node IDs
 */
export function findSSSR<TNode, TEdge>(
  graph: Graph<TNode, TEdge>
): number[][] {
  const allCycles = findCycles(graph);
  
  if (allCycles.length === 0) return [];

  const components = findConnectedComponents(graph);
  const numNodes = graph.nodeCount();
  const numEdges = graph.edgeCount();
  const targetRingCount = numEdges - numNodes + components.length;

  if (targetRingCount === 0) return [];
  if (allCycles.length <= targetRingCount) return allCycles;

  allCycles.sort((a, b) => a.length - b.length);

  const sssr: number[][] = [];
  const usedEdges = new Set<string>();

  for (const cycle of allCycles) {
    if (sssr.length >= targetRingCount) break;

    const cycleEdges = new Set<string>();
    for (let i = 0; i < cycle.length; i++) {
      const from = cycle[i]!;
      const to = cycle[(i + 1) % cycle.length]!;
      cycleEdges.add(getEdgeKey(from, to));
    }

    const hasNewEdge = Array.from(cycleEdges).some(edge => !usedEdges.has(edge));
    
    if (hasNewEdge || sssr.length === 0) {
      sssr.push(cycle);
      cycleEdges.forEach(edge => usedEdges.add(edge));
    }
  }

  if (sssr.length < targetRingCount) {
    const remaining = allCycles.filter(c => !sssr.includes(c));
    for (const cycle of remaining) {
      if (sssr.length >= targetRingCount) break;
      sssr.push(cycle);
    }
  }

  return sssr.slice(0, targetRingCount);
}

/**
 * Helper function to create consistent edge keys.
 */
function getEdgeKey(a: number, b: number): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${x}-${y}`;
}

export function findBiconnectedComponents<TNode, TEdge>(
  graph: Graph<TNode, TEdge>
): { components: number[][][]; articulationPoints: number[] } {
  const nodes = graph.getNodes();
  if (nodes.length === 0) {
    return { components: [], articulationPoints: [] };
  }

  const visited = new Set<number>();
  const disc = new Map<number, number>();
  const low = new Map<number, number>();
  const parent = new Map<number, number>();
  const articulationPoints = new Set<number>();
  const components: number[][][] = [];
  const edgeStack: [number, number][] = [];
  let time = 0;

  function dfsArticulation(u: number): void {
    let children = 0;
    visited.add(u);
    disc.set(u, time);
    low.set(u, time);
    time++;

    const neighbors = graph.getNeighbors(u);
    for (const v of neighbors) {
      if (!visited.has(v)) {
        children++;
        parent.set(v, u);
        edgeStack.push([u, v]);
        
        dfsArticulation(v);

        const uLow = low.get(u)!;
        const vLow = low.get(v)!;
        low.set(u, Math.min(uLow, vLow));

        const parentU = parent.get(u);
        const vLow2 = low.get(v)!;
        const uDisc = disc.get(u)!;
        if ((parentU === undefined && children > 1) ||
            (parentU !== undefined && vLow2 >= uDisc)) {
          articulationPoints.add(u);

          const component: [number, number][] = [];
          let edge: [number, number] | undefined;
          do {
            edge = edgeStack.pop();
            if (edge) {
              component.push(edge);
            }
          } while (edge && !(edge[0] === u && edge[1] === v));
          
          if (component.length > 0) {
            components.push(component);
          }
        }
      } else if (v !== parent.get(u)) {
        const uLow2 = low.get(u)!;
        const vDisc = disc.get(v)!;
        low.set(u, Math.min(uLow2, vDisc));

        const vDisc2 = disc.get(v)!;
        const uDisc2 = disc.get(u)!;
        if (vDisc2 < uDisc2) {
          edgeStack.push([u, v]);
        }
      }
    }
  }

  for (const node of nodes) {
    if (!visited.has(node)) {
      dfsArticulation(node);
      
      if (edgeStack.length > 0) {
        components.push([...edgeStack]);
        edgeStack.length = 0;
      }
    }
  }

  return {
    components,
    articulationPoints: Array.from(articulationPoints)
  };
}

export function findBridges<TNode, TEdge>(
  graph: Graph<TNode, TEdge>
): [number, number][] {
  const nodes = graph.getNodes();
  if (nodes.length === 0) {
    return [];
  }

  const visited = new Set<number>();
  const disc = new Map<number, number>();
  const low = new Map<number, number>();
  const parent = new Map<number, number>();
  const bridges: [number, number][] = [];
  let time = 0;

  function dfsBridge(u: number): void {
    visited.add(u);
    disc.set(u, time);
    low.set(u, time);
    time++;

    const neighbors = graph.getNeighbors(u);
    for (const v of neighbors) {
      if (!visited.has(v)) {
        parent.set(v, u);
        dfsBridge(v);

        const uLow = low.get(u)!;
        const vLow = low.get(v)!;
        low.set(u, Math.min(uLow, vLow));

        const vLow2 = low.get(v)!;
        const uDisc = disc.get(u)!;
        if (vLow2 > uDisc) {
          bridges.push([u, v]);
        }
      } else if (v !== parent.get(u)) {
        const uLow2 = low.get(u)!;
        const vDisc = disc.get(v)!;
        low.set(u, Math.min(uLow2, vDisc));
      }
    }
  }

  for (const node of nodes) {
    if (!visited.has(node)) {
      dfsBridge(node);
    }
  }

  return bridges;
}

export function getInducedSubgraph<TNode, TEdge>(
  graph: Graph<TNode, TEdge>,
  nodeIds: number[]
): Graph<TNode, TEdge> {
  const subgraph = new Graph<TNode, TEdge>();
  const nodeSet = new Set(nodeIds);

  for (const nodeId of nodeIds) {
    const data = graph.getNodeData(nodeId);
    if (data !== undefined) {
      subgraph.addNode(nodeId, data);
    }
  }

  for (const [from, to] of graph.getEdges()) {
    if (nodeSet.has(from) && nodeSet.has(to)) {
      const edgeData = graph.getEdgeData(from, to);
      subgraph.addEdge(from, to, edgeData);
    }
  }

  return subgraph;
}

export function findAllSimplePaths<TNode, TEdge>(
  graph: Graph<TNode, TEdge>,
  startNode: number,
  endNode: number,
  maxLength?: number
): number[][] {
  const paths: number[][] = [];
  const currentPath: number[] = [];
  const visited = new Set<number>();

  function dfsPath(node: number): void {
    currentPath.push(node);
    visited.add(node);

    if (node === endNode) {
      paths.push([...currentPath]);
    } else if (!maxLength || currentPath.length < maxLength) {
      for (const neighbor of graph.getNeighbors(node)) {
        if (!visited.has(neighbor)) {
          dfsPath(neighbor);
        }
      }
    }

    currentPath.pop();
    visited.delete(node);
  }

  dfsPath(startNode);
  return paths;
}