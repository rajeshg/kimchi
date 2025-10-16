import { describe, it, expect } from 'bun:test';
import {
  Graph,
  dfs,
  bfs,
  findConnectedComponents,
  findShortestPath,
  getDistance,
  findCycles,
  findSSSR,
  findBiconnectedComponents,
  findBridges,
  getInducedSubgraph,
  findAllSimplePaths
} from 'src/utils/graph';

describe('Graph Class', () => {
  describe('Basic Operations', () => {
    it('should create an empty graph', () => {
      const graph = new Graph();
      expect(graph.nodeCount()).toBe(0);
      expect(graph.edgeCount()).toBe(0);
      expect(graph.isEmpty()).toBe(true);
    });

    it('should add nodes', () => {
      const graph = new Graph<string, number>();
      graph.addNode(1, 'node1');
      graph.addNode(2, 'node2');

      expect(graph.nodeCount()).toBe(2);
      expect(graph.hasNode(1)).toBe(true);
      expect(graph.hasNode(2)).toBe(true);
      expect(graph.getNodeData(1)).toBe('node1');
      expect(graph.getNodeData(2)).toBe('node2');
    });

    it('should add edges', () => {
      const graph = new Graph<string, number>();
      graph.addNode(1, 'A');
      graph.addNode(2, 'B');
      graph.addEdge(1, 2, 42);

      expect(graph.edgeCount()).toBe(1);
      expect(graph.hasEdge(1, 2)).toBe(true);
      expect(graph.hasEdge(2, 1)).toBe(true); // Undirected
      expect(graph.getEdgeData(1, 2)).toBe(42);
    });

    it('should handle undirected edges correctly', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 1); // Should not create duplicate

      expect(graph.edgeCount()).toBe(1);
      expect(graph.hasEdge(1, 2)).toBe(true);
    });

    it('should get neighbors', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);
      graph.addEdge(2, 4);

      expect(graph.getNeighbors(1)).toEqual([2, 3]);
      expect(graph.getNeighbors(2)).toEqual([1, 4]);
      expect(graph.getNeighbors(3)).toEqual([1]);
      expect(graph.getNeighbors(4)).toEqual([2]);
    });

    it('should calculate degrees', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);
      graph.addEdge(2, 4);

      expect(graph.getDegree(1)).toBe(2);
      expect(graph.getDegree(2)).toBe(2);
      expect(graph.getDegree(3)).toBe(1);
      expect(graph.getDegree(4)).toBe(1);
    });

    it('should remove nodes', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);
      graph.removeNode(1);

      expect(graph.hasNode(1)).toBe(false);
      expect(graph.hasEdge(1, 2)).toBe(false);
      expect(graph.hasEdge(1, 3)).toBe(false);
      expect(graph.nodeCount()).toBe(2);
      expect(graph.edgeCount()).toBe(0);
    });

    it('should remove edges', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);
      graph.removeEdge(1, 2);

      expect(graph.hasEdge(1, 2)).toBe(false);
      expect(graph.hasEdge(1, 3)).toBe(true);
      expect(graph.edgeCount()).toBe(1);
    });

    it('should get all nodes and edges', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);

      expect(graph.getNodes()).toEqual([1, 2, 3]);
      expect(graph.getEdges()).toEqual([[1, 2], [2, 3]]);
    });

    it('should clone the graph', () => {
      const graph = new Graph<string, number>();
      graph.addNode(1, 'A');
      graph.addNode(2, 'B');
      graph.addEdge(1, 2, 42);

      const cloned = graph.clone();

      expect(cloned.nodeCount()).toBe(2);
      expect(cloned.edgeCount()).toBe(1);
      expect(cloned.getNodeData(1)).toBe('A');
      expect(cloned.getEdgeData(1, 2)).toBe(42);
      expect(cloned).not.toBe(graph); // Different instances
    });

    it('should clear the graph', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.clear();

      expect(graph.isEmpty()).toBe(true);
      expect(graph.nodeCount()).toBe(0);
      expect(graph.edgeCount()).toBe(0);
    });
  });
});

describe('Graph Algorithms', () => {
  describe('DFS Traversal', () => {
    it('should traverse a simple graph', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);
      graph.addEdge(2, 4);

      const visited: number[] = [];
      dfs(graph, 1, (nodeId) => visited.push(nodeId));

      expect(visited).toEqual([1, 2, 4, 3]);
    });

    it('should handle disconnected graphs', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(3, 4);

      const visited: number[] = [];
      dfs(graph, 1, (nodeId) => visited.push(nodeId));

      expect(visited).toEqual([1, 2]);
    });

    it('should return visited set', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);

      const visited = dfs(graph, 1);
      expect(visited).toEqual(new Set([1, 2, 3]));
    });
  });

  describe('BFS Traversal', () => {
    it('should traverse a simple graph level by level', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);
      graph.addEdge(2, 4);
      graph.addEdge(3, 5);

      const visited: number[] = [];
      bfs(graph, 1, (nodeId) => visited.push(nodeId));

      expect(visited).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return visited set', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);

      const visited = bfs(graph, 1);
      expect(visited).toEqual(new Set([1, 2, 3]));
    });
  });

  describe('Connected Components', () => {
    it('should find components in a connected graph', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1);

      const components = findConnectedComponents(graph);
      expect(components).toEqual([[1, 2, 3]]);
    });

    it('should find components in a disconnected graph', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(3, 4);
      graph.addEdge(5, 6);

      const components = findConnectedComponents(graph);
      expect(components.length).toBe(3);
      expect(components).toContainEqual([1, 2]);
      expect(components).toContainEqual([3, 4]);
      expect(components).toContainEqual([5, 6]);
    });

    it('should handle isolated nodes', () => {
      const graph = new Graph();
      graph.addNode(1);
      graph.addNode(2);
      graph.addEdge(3, 4);

      const components = findConnectedComponents(graph);
      expect(components.length).toBe(3);
      expect(components).toContainEqual([1]);
      expect(components).toContainEqual([2]);
      expect(components).toContainEqual([3, 4]);
    });
  });

  describe('Shortest Path', () => {
    it('should find shortest path in a simple graph', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);
      graph.addEdge(1, 4); // Shorter path

      const path = findShortestPath(graph, 1, 4);
      expect(path).toEqual([1, 4]);
    });

    it('should return empty array when no path exists', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(3, 4);

      const path = findShortestPath(graph, 1, 4);
      expect(path).toEqual([]);
    });

    it('should handle same start and end node', () => {
      const graph = new Graph();
      graph.addNode(1);

      const path = findShortestPath(graph, 1, 1);
      expect(path).toEqual([1]);
    });
  });

  describe('Distance Calculation', () => {
    it('should calculate distances correctly', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);

      expect(getDistance(graph, 1, 1)).toBe(0);
      expect(getDistance(graph, 1, 2)).toBe(1);
      expect(getDistance(graph, 1, 3)).toBe(2);
      expect(getDistance(graph, 1, 4)).toBe(3);
    });

    it('should return -1 for unreachable nodes', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(3, 4);

      expect(getDistance(graph, 1, 4)).toBe(-1);
    });
  });

  describe('Cycle Detection', () => {
    it('should detect cycles in a triangular graph', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1);

      const cycles = findCycles(graph);
      console.log('Cycles found:', cycles);
      expect(cycles.length).toBe(1);
      expect(cycles[0]).toEqual([1, 2, 3]);
    });

    it('should detect multiple cycles', () => {
      const graph = new Graph();
      // Triangle
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1);
      // Square
      graph.addEdge(3, 4);
      graph.addEdge(4, 5);
      graph.addEdge(5, 6);
      graph.addEdge(6, 3);

      const cycles = findCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
      // Should contain both cycles
    });

    it('should not detect cycles in acyclic graphs', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);

      const cycles = findCycles(graph);
      expect(cycles.length).toBe(0);
    });

    it('should not detect cycles smaller than 3 nodes', () => {
      const graph = new Graph();
      graph.addEdge(1, 1); // Self-loop

      const cycles = findCycles(graph);
      expect(cycles.length).toBe(0);
    });
  });

  describe('SSSR (Smallest Set of Smallest Rings)', () => {
    it('should find SSSR for a simple ring', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);
      graph.addEdge(4, 1);

      const sssr = findSSSR(graph);
      expect(sssr.length).toBe(1);
      expect(sssr[0]).toEqual([1, 2, 3, 4]);
    });

    it('should find SSSR for fused rings', () => {
      const graph = new Graph();
      // First ring: 1-2-3-4-1
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);
      graph.addEdge(4, 1);
      // Second ring: 3-4-5-6-3
      graph.addEdge(4, 5);
      graph.addEdge(5, 6);
      graph.addEdge(6, 3);

      const sssr = findSSSR(graph);
      expect(sssr.length).toBe(2);
      // Should contain both smallest rings
    });

    it('should handle graphs with no rings', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);

      const sssr = findSSSR(graph);
      expect(sssr.length).toBe(0);
    });
  });

  describe('Biconnected Components', () => {
    it('should find biconnected components in a simple cycle', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1);

      const result = findBiconnectedComponents(graph);
      expect(result.components.length).toBe(1);
      expect(result.articulationPoints.length).toBe(0);
    });

    it('should identify articulation points', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);
      graph.addEdge(4, 2);
      graph.addEdge(2, 5);

      const result = findBiconnectedComponents(graph);
      expect(result.articulationPoints).toContain(2);
    });

    it('should find multiple biconnected components in fused rings', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1);
      graph.addEdge(3, 4);
      graph.addEdge(4, 5);
      graph.addEdge(5, 3);

      const result = findBiconnectedComponents(graph);
      expect(result.components.length).toBeGreaterThan(0);
      expect(result.articulationPoints).toContain(3);
    });

    it('should handle empty graph for biconnected components', () => {
      const graph = new Graph();
      const result = findBiconnectedComponents(graph);
      expect(result.components).toEqual([]);
      expect(result.articulationPoints).toEqual([]);
    });
  });

  describe('Bridge Finding', () => {
    it('should find no bridges in a cycle', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1);

      const bridges = findBridges(graph);
      expect(bridges.length).toBe(0);
    });

    it('should find bridges in a tree', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);

      const bridges = findBridges(graph);
      expect(bridges.length).toBe(3);
    });

    it('should find bridges connecting components', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1);
      graph.addEdge(3, 4);
      graph.addEdge(4, 5);
      graph.addEdge(5, 6);
      graph.addEdge(6, 4);

      const bridges = findBridges(graph);
      expect(bridges.length).toBe(1);
      expect(bridges[0]).toEqual([3, 4]);
    });
  });

  describe('Induced Subgraph', () => {
    it('should create subgraph from node subset', () => {
      const graph = new Graph<string, number>();
      graph.addNode(1, 'A');
      graph.addNode(2, 'B');
      graph.addNode(3, 'C');
      graph.addNode(4, 'D');
      graph.addEdge(1, 2, 10);
      graph.addEdge(2, 3, 20);
      graph.addEdge(3, 4, 30);
      graph.addEdge(1, 4, 40);

      const subgraph = getInducedSubgraph(graph, [1, 2, 3]);

      expect(subgraph.nodeCount()).toBe(3);
      expect(subgraph.edgeCount()).toBe(2);
      expect(subgraph.hasEdge(1, 2)).toBe(true);
      expect(subgraph.hasEdge(2, 3)).toBe(true);
      expect(subgraph.hasEdge(1, 4)).toBe(false);
      expect(subgraph.getNodeData(1)).toBe('A');
    });

    it('should handle empty node list', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      
      const subgraph = getInducedSubgraph(graph, []);
      
      expect(subgraph.isEmpty()).toBe(true);
    });

    it('should include nodes without explicit data when present', () => {
      const graph = new Graph<string, number>();
      // add nodes without data
      graph.addNode(1);
      graph.addNode(2);
      graph.addEdge(1, 2, 5);

      const subgraph = getInducedSubgraph(graph, [1, 2]);
      expect(subgraph.nodeCount()).toBe(2);
      expect(subgraph.edgeCount()).toBe(1);
      expect(subgraph.getNodeData(1)).toBeUndefined();
    });
  });

  describe('All Simple Paths', () => {
    it('should find all simple paths between two nodes', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(1, 3);
      graph.addEdge(2, 4);
      graph.addEdge(3, 4);

      const paths = findAllSimplePaths(graph, 1, 4);

      expect(paths.length).toBe(2);
      expect(paths).toContainEqual([1, 2, 4]);
      expect(paths).toContainEqual([1, 3, 4]);
    });

    it('should respect max length constraint', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 4);

      const paths = findAllSimplePaths(graph, 1, 4, 3);

      expect(paths.length).toBe(0);
    });

    it('should find path when start equals end', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);

      const paths = findAllSimplePaths(graph, 1, 1);

      expect(paths.length).toBe(1);
      expect(paths[0]).toEqual([1]);
    });

    it('should find all simple paths in presence of cycles without infinite loop', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1); // cycle
      graph.addEdge(2, 4);

  const paths = findAllSimplePaths(graph, 1, 4);
  // In presence of cycle, should still find only simple paths
  expect(paths).toContainEqual([1, 2, 4]);
  expect(paths).toContainEqual([1, 3, 2, 4]);
  expect(paths.length).toBe(2);
    });

    it('should respect max length when cycles exist', () => {
      const graph = new Graph();
      graph.addEdge(1, 2);
      graph.addEdge(2, 3);
      graph.addEdge(3, 1); // cycle
      graph.addEdge(3, 4);

      const paths = findAllSimplePaths(graph, 1, 4, 3);
      // shortest simple path is 1-3-4 length 3, but maxLength is 3 nodes -> should allow
      expect(paths).toContainEqual([1, 3, 4]);
    });
  });
});