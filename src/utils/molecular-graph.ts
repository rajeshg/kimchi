import type { Molecule, Atom, Bond } from 'types';
import { Graph, findSSSR, findCycles, findBiconnectedComponents, findBridges, findConnectedComponents } from 'src/utils/graph';

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

export function getFragmentGraphs(mol: Molecule): Graph<Atom | undefined, EdgeData>[] {
  const info = computeMoleculeGraphInfo(mol);
  const graphs: Graph<Atom | undefined, EdgeData>[] = [];

  for (const comp of info.components) {
    graphs.push(getInducedSubgraphFromGraph(info.graph, comp));
  }

  return graphs;
}

function getInducedSubgraphFromGraph(graph: Graph<Atom | undefined, EdgeData>, nodeIds: number[]) {
  const sub = new Graph<Atom | undefined, EdgeData>();
  const nodeSet = new Set(nodeIds);

  for (const id of nodeIds) {
    sub.addNode(id, graph.getNodeData(id));
  }

  for (const [from, to] of graph.getEdges()) {
    if (nodeSet.has(from) && nodeSet.has(to)) {
      sub.addEdge(from, to, graph.getEdgeData(from, to));
    }
  }

  return sub;
}
