import type { Molecule, Atom, Bond } from 'types';
import { BondType } from 'types';
import { Graph, findSSSR, findCycles, findBiconnectedComponents, findBridges, findConnectedComponents } from 'src/utils/graph';
import { analyzeRings, filterElementaryRings, getRingAtoms, getRingBonds } from './ring-utils';
import { getBondsForAtom, bondKey } from './bond-utils';

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
  nodeRings: Map<number, number[]>; // atom id -> ring ids
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
  // WeakMap does not support clear; recreate it to drop references
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

// ----------------------
// RDKit-like aromaticity perception (self-contained)
// ----------------------

interface FusedSystem {
  rings: number[][];
  atoms: Set<number>;
  bonds: Set<string>;
}

function findFusedSystems(rings: number[][]): FusedSystem[] {
  const systems: FusedSystem[] = [];
  const processedRings = new Set<number>();
  
  for (let i = 0; i < rings.length; i++) {
    if (processedRings.has(i)) continue;
    const ring = rings[i];
    if (!ring) continue;

    const system: FusedSystem = {
      rings: [ring],
      atoms: new Set(ring),
      bonds: new Set()
    };

    for (let j = 0; j < ring.length; j++) {
      const a1 = ring[j];
      const a2 = ring[(j + 1) % ring.length];
      if (a1 === undefined || a2 === undefined) continue;
      system.bonds.add(bondKey(a1, a2));
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < rings.length; j++) {
        if (processedRings.has(j)) continue;
        if (j === i) continue;
        const otherRing = rings[j];
        if (!otherRing) continue;
        const hasSharedAtom = otherRing.some(atomId => system.atoms.has(atomId));
        if (hasSharedAtom) {
          system.rings.push(otherRing);
          processedRings.add(j);
          for (const atomId of otherRing) system.atoms.add(atomId);
          for (let k = 0; k < otherRing.length; k++) {
            const a1 = otherRing[k];
            const a2 = otherRing[(k + 1) % otherRing.length];
            if (a1 === undefined || a2 === undefined) continue;
            system.bonds.add(bondKey(a1, a2));
          }
          changed = true;
        }
      }
    }

    processedRings.add(i);
    systems.push(system);
  }

  return systems;
}

function hasExocyclicDoubleBondToElectronegative(
  atom: Atom,
  ringAtoms: Set<number>,
  bonds: Bond[]
): boolean {
  const atomBonds = getBondsForAtom(bonds, atom.id);
  for (const bond of atomBonds) {
    if (bond.type !== BondType.DOUBLE) continue;
    const otherAtomId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
    if (ringAtoms.has(otherAtomId)) continue;
    // In RDKit heuristics this checks electronegative partners (O, N, S etc.).
    return true;
  }
  return false;
}

function ringHasExocyclicDoubleBond(
  ring: number[],
  atoms: Atom[],
  bonds: Bond[]
): boolean {
  const ringSet = new Set(ring);
  for (const atomId of ring) {
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) continue;
    if (hasExocyclicDoubleBondToElectronegative(atom, ringSet, bonds)) return true;
  }
  return false;
}

function countPiElectronsRDKit(
  atom: Atom,
  ringAtoms: Set<number>,
  allBonds: Bond[],
  originalAromaticFlags: Record<number, boolean>,
  allAtomsWereAromatic: boolean
): number {
  const atomBonds = getBondsForAtom(allBonds, atom.id);
  const bondCount = atomBonds.length;

  const ringBonds = atomBonds.filter(b => {
    const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
    return ringAtoms.has(otherId);
  });

  const hasExocyclicDouble = hasExocyclicDoubleBondToElectronegative(atom, ringAtoms, allBonds);

  switch (atom.symbol) {
    case 'C':
      if (hasExocyclicDouble) return 0;
      const hasDoubleBondInRingC = ringBonds.some(b => b.type === BondType.DOUBLE || b.type === BondType.AROMATIC);
      if (hasDoubleBondInRingC) return 1;
      return 0;

    case 'N':
      if (hasExocyclicDouble) return 0;
      if (atom.charge > 0) return 1;
      if (atom.hydrogens > 0) return 2;
      if (bondCount === 3 && ringBonds.length === 2) return 2;
      const hasDoubleBondInRing = ringBonds.some(b => b.type === BondType.DOUBLE || b.type === BondType.AROMATIC);
      if (hasDoubleBondInRing) return 1;
      if (bondCount === 2) return 2;
      return 1;

    case 'O':
    case 'S':
      if (atom.charge !== 0) return 0;
      if (hasExocyclicDouble) return 0;
      const hasDouble = atomBonds.some(b => b.type === BondType.DOUBLE);
      if (hasDouble) return 0;
      if (bondCount === 2) return 2;
      return 0;

    case 'B':
      if (atom.charge === -1 || originalAromaticFlags[atom.id]) return 2;
      return 0;

    case 'P':
      if (atom.charge > 0) return 0;
      const hasPDouble = atomBonds.some(b => b.type === BondType.DOUBLE);
      if (hasPDouble) return 1;
      if (atom.hydrogens > 0) return 2;
      return 1;

    case 'As':
      return atom.hydrogens > 0 ? 2 : 1;

    case 'Se':
      if (atom.charge !== 0) return 0;
      const hasSeDouble = atomBonds.some(b => b.type === BondType.DOUBLE);
      if (hasSeDouble) return 0;
      if (bondCount === 2) return 2;
      return 0;

    default:
      return 0;
  }
}

function hasConjugatedSystem(ringAtoms: Set<number>, atoms: Atom[]): boolean {
  for (const atomId of ringAtoms) {
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) return false;
    const isConjugatable = ['C', 'N', 'O', 'S', 'P', 'As', 'Se', 'B'].includes(atom.symbol);
    if (!isConjugatable) return false;
  }
  return true;
}

function isRingHuckelAromatic(
  ring: number[],
  atoms: Atom[],
  bonds: Bond[],
  originalAromaticFlags: Record<number, boolean>
): boolean {
  const ringSet = new Set(ring);
  if (!hasConjugatedSystem(ringSet, atoms)) return false;
  if (ringHasExocyclicDoubleBond(ring, atoms, bonds)) return false;
  const allAtomsWereAromatic = ring.every(atomId => originalAromaticFlags[atomId]);

  let totalPiElectrons = 0;
  for (const atomId of ring) {
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) continue;
    const piElectrons = countPiElectronsRDKit(atom, ringSet, bonds, originalAromaticFlags, allAtomsWereAromatic);
    totalPiElectrons += piElectrons;
  }

  const isAromatic = totalPiElectrons >= 6 && (totalPiElectrons - 2) % 4 === 0;
  return isAromatic;
}

function isFusedSystemAromatic(
  fusedSystem: FusedSystem,
  atoms: Atom[],
  bonds: Bond[],
  originalAromaticFlags: Record<number, boolean>
): boolean {
  const systemAtoms = Array.from(fusedSystem.atoms);
  const systemAtomSet = new Set(systemAtoms);
  if (!hasConjugatedSystem(systemAtomSet, atoms)) return false;

  for (const atomId of systemAtoms) {
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) continue;
    if (hasExocyclicDoubleBondToElectronegative(atom, systemAtomSet, bonds)) return false;
  }

  const allAtomsWereAromatic = systemAtoms.every(atomId => originalAromaticFlags[atomId]);
  let totalPiElectrons = 0;
  for (const atomId of systemAtoms) {
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) continue;
    const piElectrons = countPiElectronsRDKit(atom, systemAtomSet, bonds, originalAromaticFlags, allAtomsWereAromatic);
    totalPiElectrons += piElectrons;
  }

  const isAromatic = totalPiElectrons >= 6 && (totalPiElectrons - 2) % 4 === 0;
  return isAromatic;
}

export function perceiveAromaticity(mol: Molecule): void {
  const atoms = mol.atoms;
  const bonds = mol.bonds;

  const ringInfo = analyzeRings(atoms, bonds);
  const allRings = ringInfo.rings;
  if (!allRings || allRings.length === 0) return;

  const originalBondTypes: Record<string, Bond['type']> = {};
  const originalAromaticFlags: Record<number, boolean> = {};
  for (const b of bonds) {
    originalBondTypes[bondKey(b.atom1, b.atom2)] = b.type;
  }
  for (const atom of atoms) {
    originalAromaticFlags[atom.id] = atom.aromatic;
    atom.aromatic = false;
  }

  const rings = filterElementaryRings(allRings).filter(r => r.length >= 5 && r.length <= 7);
  if (rings.length === 0) return;

  const aromaticRings: number[][] = [];
  const fusedSystems = findFusedSystems(rings);

  for (const system of fusedSystems) {
    if (system.rings.length === 1) {
      const ring = system.rings[0]!;
      if (isRingHuckelAromatic(ring, atoms, bonds, originalAromaticFlags)) aromaticRings.push(ring);
    } else {
      if (isFusedSystemAromatic(system, atoms, bonds, originalAromaticFlags)) {
        for (const ring of system.rings) aromaticRings.push(ring);
      } else {
        for (const ring of system.rings) {
          if (isRingHuckelAromatic(ring, atoms, bonds, originalAromaticFlags)) aromaticRings.push(ring);
        }
      }
    }
  }

  const bondAromaticCount: Record<string, number> = {};
  for (const ring of aromaticRings) {
    const ringBonds = getRingBonds(ring, bonds);
    for (const b of ringBonds) {
      const k = bondKey(b.atom1, b.atom2);
      bondAromaticCount[k] = (bondAromaticCount[k] || 0) + 1;
    }
  }

  for (const ring of aromaticRings) {
    for (const atomId of ring) {
      const atom = atoms.find(a => a.id === atomId);
      if (atom) atom.aromatic = true;
    }

    const ringBonds = getRingBonds(ring, bonds);
    for (const bond of ringBonds) {
      bond.type = BondType.AROMATIC;
    }
  }

  for (const ring of aromaticRings) {
    const ringAtoms = getRingAtoms(ring, atoms);
    for (const atom of ringAtoms) {
      const exoDouble = hasExocyclicDoubleBondToElectronegative(atom, new Set(ring), bonds);
      if (exoDouble) {
        atom.aromatic = false;
        const ringBonds = getBondsForAtom(bonds, atom.id).filter(b => ring.includes(b.atom1) && ring.includes(b.atom2));
        for (const bond of ringBonds) {
          const k = bondKey(bond.atom1, bond.atom2);
          if ((bondAromaticCount[k] || 0) > 1) continue;
          bond.type = originalBondTypes[k] ?? BondType.SINGLE;
        }
      }
    }
  }

  const aromaticBonds = new Set<string>();
  for (const ring of aromaticRings) {
    const ringBonds = getRingBonds(ring, bonds);
    for (const bond of ringBonds) aromaticBonds.add(bondKey(bond.atom1, bond.atom2));
  }

  for (const bond of bonds) {
    const k = bondKey(bond.atom1, bond.atom2);
    if (!aromaticBonds.has(k) && bond.type === BondType.AROMATIC) {
      bond.type = originalBondTypes[k] === BondType.AROMATIC ? BondType.SINGLE : (originalBondTypes[k] ?? BondType.SINGLE);
    }
  }
}
