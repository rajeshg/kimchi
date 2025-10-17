import type { Molecule, Atom, Bond } from 'types';
import { Graph, findSSSR, findCycles, findBiconnectedComponents, findBridges, findConnectedComponents, getInducedSubgraph, findShortestPath, findAllSimplePaths } from 'src/utils/graph';

export type EdgeData = {
  bond: Bond;
};

export interface MoleculeGraphInfo {
  graph: Graph<Atom | undefined, EdgeData>;
  components: number[][];
  sssr: number[][];
  cycles: number[][];
  biconnected: { components: number[][][]; articulationPoints: number[] };
  bridges: [number, number][];
  nodeRings: Map<number, number[]>;
}

let graphCache = new WeakMap<object, MoleculeGraphInfo>();

export function buildGraphFromMolecule(mol: Molecule): Graph<Atom | undefined, EdgeData> {
  const g = new Graph<Atom | undefined, EdgeData>();

  for (const atom of mol.atoms) {
    g.addNode(atom.id, atom);
  }

  for (const bond of mol.bonds) {
    g.addEdge(bond.atom1, bond.atom2, { bond });
  }

  return g;
}

export function computeMoleculeGraphInfo(mol: Molecule): MoleculeGraphInfo {
  const cached = graphCache.get(mol as unknown as object);
  if (cached) return cached;

  const graph = buildGraphFromMolecule(mol);

  const components = findConnectedComponents(graph);
  const cycles = findCycles(graph);
  const sssr = findSSSR(graph);
  const biconnected = findBiconnectedComponents(graph);
  const bridges = findBridges(graph);

  const nodeRings = new Map<number, number[]>();
  sssr.forEach((ring, idx) => {
    for (const atomId of ring) {
      const arr = nodeRings.get(atomId) || [];
      arr.push(idx);
      nodeRings.set(atomId, arr);
    }
  });

  const info: MoleculeGraphInfo = {
    graph,
    components,
    sssr,
    cycles,
    biconnected,
    bridges,
    nodeRings,
  };

  graphCache.set(mol as unknown as object, info);
  return info;
}

export function clearGraphCache(): void {
  graphCache = new WeakMap<object, MoleculeGraphInfo>();
}

export class MoleculeGraph {
  private mol: Molecule;
  private _graph?: Graph<Atom | undefined, EdgeData>;
  private _components?: number[][];
  private _cycles?: number[][];
  private _sssr?: number[][];
  private _biconnected?: { components: number[][][]; articulationPoints: number[] };
  private _bridges?: [number, number][];
  private _nodeRings?: Map<number, number[]>;

  constructor(mol: Molecule) {
    this.mol = mol;
  }

  get graph(): Graph<Atom | undefined, EdgeData> {
    if (!this._graph) {
      this._graph = buildGraphFromMolecule(this.mol);
    }
    return this._graph;
  }

  get components(): number[][] {
    if (!this._components) {
      this._components = findConnectedComponents(this.graph);
    }
    return this._components;
  }

  get cycles(): number[][] {
    if (!this._cycles) {
      this._cycles = findCycles(this.graph);
    }
    return this._cycles;
  }

  get sssr(): number[][] {
    if (!this._sssr) {
      this._sssr = findSSSR(this.graph);
    }
    return this._sssr;
  }

  get biconnected(): { components: number[][][]; articulationPoints: number[] } {
    if (!this._biconnected) {
      this._biconnected = findBiconnectedComponents(this.graph);
    }
    return this._biconnected;
  }

  get bridges(): [number, number][] {
    if (!this._bridges) {
      this._bridges = findBridges(this.graph);
    }
    return this._bridges;
  }

  get nodeRings(): Map<number, number[]> {
    if (!this._nodeRings) {
      this._nodeRings = new Map<number, number[]>();
      this.sssr.forEach((ring, idx) => {
        for (const atomId of ring) {
          const arr = this._nodeRings!.get(atomId) || [];
          arr.push(idx);
          this._nodeRings!.set(atomId, arr);
        }
      });
    }
    return this._nodeRings;
  }

  getNodeRings(nodeId: number): number[] {
    return this.nodeRings.get(nodeId) || [];
  }

  getFragmentGraphs(): Graph<Atom | undefined, EdgeData>[] {
    return this.components.map(comp => getInducedSubgraph(this.graph, comp));
  }

  getFragmentGraph(componentIndex: number): Graph<Atom | undefined, EdgeData> {
    const comp = this.components[componentIndex];
    if (!comp) throw new Error(`Invalid component index: ${componentIndex}`);
    return getInducedSubgraph(this.graph, comp);
  }

  findShortestPath(startNode: number, endNode: number): number[] {
    return findShortestPath(this.graph, startNode, endNode);
  }

  findAllSimplePaths(startNode: number, endNode: number, maxLength?: number): number[][] {
    return findAllSimplePaths(this.graph, startNode, endNode, maxLength);
  }

  invalidate(): void {
    this._graph = undefined;
    this._components = undefined;
    this._cycles = undefined;
    this._sssr = undefined;
    this._biconnected = undefined;
    this._bridges = undefined;
    this._nodeRings = undefined;
  }
}

export function getFragmentGraphs(mol: Molecule): Graph<Atom | undefined, EdgeData>[] {
  const info = computeMoleculeGraphInfo(mol);
  const graphs: Graph<Atom | undefined, EdgeData>[] = [];

  for (const comp of info.components) {
    graphs.push(getInducedSubgraphFromGraph(info.graph, comp));
  }

  return graphs;
}

function getInducedSubgraphFromGraph(graph: Graph<Atom | undefined, EdgeData>, nodeIds: number[]) {
  return getInducedSubgraph(graph, nodeIds);
}
