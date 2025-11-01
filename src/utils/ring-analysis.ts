import type { Atom, Bond, Molecule } from 'types';
import { bondKey } from './bond-utils';
import { MoleculeGraph } from './molecular-graph';

/**
 * Detects all simple cycles (elementary rings) in a molecular graph using depth-first search.
 *
 * This function finds every elementary cycle in the molecule, including cycles that may
 * overlap or be contained within larger rings. For most cheminformatics applications,
 * use `findSSSR()` instead to get the minimal set of independent rings.
 *
 * @param atoms - Array of atoms in the molecule
 * @param bonds - Array of bonds in the molecule
 * @returns Array of rings, where each ring is an array of atom IDs sorted in ascending order.
 *          Rings are sorted by size (smallest first).
 *
 * @example
 * const allRings = findRings(mol.atoms, mol.bonds);
 * // For cyclohexane: [[0, 1, 2, 3, 4, 5]]
 * // For decalin (fused bicyclic): [[0,1,2,3,4,5], [5,6,7,8,9,0], [0,1,2,3,4,5,6,7,8,9]]
 *
 * @complexity O(V × E^2) in worst case; typically much faster for typical molecules
 * @see findSSSR, findMCB
 */
export function findRings(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const rings: number[][] = [];
  const visited = new Set<number>();
  const ringSet = new Set<string>();

  function dfs(startId: number, currentId: number, path: number[], visitedEdges: Set<string>, pathSet: Set<number>): void {
    path.push(currentId);
    pathSet.add(currentId);
    visited.add(currentId);

    const neighbors = bonds
      .filter(b => b.atom1 === currentId || b.atom2 === currentId)
      .map(b => b.atom1 === currentId ? b.atom2 : b.atom1)
      .filter(id => !visitedEdges.has(`${Math.min(currentId, id)}-${Math.max(currentId, id)}`));

    for (const neighborId of neighbors) {
      const edgeKey = `${Math.min(currentId, neighborId)}-${Math.max(currentId, neighborId)}`;
      visitedEdges.add(edgeKey);

      if (neighborId === startId && path.length >= 3) {
        const ring = [...path].sort((a, b) => a - b);
        const ringKey = ring.join(',');
        if (!ringSet.has(ringKey)) {
          ringSet.add(ringKey);
          rings.push(ring);
        }
      } else if (!pathSet.has(neighborId)) {
        const newPathSet = new Set(pathSet);
        newPathSet.add(neighborId);
        dfs(startId, neighborId, [...path], new Set(visitedEdges), newPathSet);
      }

      visitedEdges.delete(edgeKey);
    }

    path.pop();
    pathSet.delete(currentId);
    visited.delete(currentId);
  }

  for (const atom of atoms) {
    if (!visited.has(atom.id)) {
      dfs(atom.id, atom.id, [], new Set(), new Set());
    }
  }

  return rings.sort((a, b) => a.length - b.length);
}

/**
 * Returns a map of atom IDs to their containing SSSR rings.
 *
 * For each atom, computes which SSSR (Smallest Set of Smallest Rings) rings it belongs to.
 * This is useful for understanding the ring topology of complex polycyclic systems.
 *
 * @param atoms - Array of atoms in the molecule
 * @param bonds - Array of bonds in the molecule
 * @returns Map where keys are atom IDs and values are arrays of rings (each ring is an atom ID array)
 *
 * @example
 * const atomRings = findAtomRings(mol.atoms, mol.bonds);
 * const bridgeheadRings = atomRings.get(3); // Get rings containing atom 3
 *
 * @complexity O(N) where N is the number of atoms
 * @see findSSSR, analyzeRings
 */
export function findAtomRings(atoms: readonly Atom[], bonds: readonly Bond[]): Map<number, number[][]> {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  const atomRings = new Map<number, number[][]>();

  for (const atom of atoms) {
    const ringIndices = mg.getNodeRings(atom.id);
    const rings = ringIndices.map(idx => mg.sssr[idx]!);
    atomRings.set(atom.id, rings);
  }

  return atomRings;
}

/**
 * Checks whether two rings share at least one atom.
 *
 * Useful for identifying fused, bridged, or spiro ring systems where rings
 * may overlap at one or more atoms.
 *
 * @param ring1 - Array of atom IDs in first ring
 * @param ring2 - Array of atom IDs in second ring
 * @returns true if rings share at least one atom, false otherwise
 *
 * @example
 * const shares = ringsShareAtoms([0, 1, 2, 3], [3, 4, 5, 6]); // true (atom 3)
 *
 * @complexity O(N) where N is the size of ring2
 * @see classifyRingSystems, isPartOfFusedSystem
 */
export function ringsShareAtoms(ring1: number[], ring2: number[]): boolean {
  const set2 = new Set(ring2);
  return ring1.some(atom => set2.has(atom));
}

/**
 * Computes the Smallest Set of Smallest Rings (SSSR) for a molecule.
 *
 * SSSR is the minimal set of independent rings needed to represent all ring topology.
 * The size of the SSSR equals rank = M - N + C where M = bonds, N = atoms, C = components.
 *
 * This is the standard ring set used in SMARTS `[Rn]` matching and most cheminformatics applications.
 * For most molecules, SSSR = MCB (Minimum Cycle Basis).
 *
 * @param atoms - Array of atoms in the molecule
 * @param bonds - Array of bonds in the molecule
 * @returns Array of rings (each is an array of atom IDs), representing the SSSR
 *
 * @example
 * const sssr = findSSSR(mol.atoms, mol.bonds);
 * // For naphthalene: [[0,1,2,3,4,5], [5,6,7,8,9,0]] (2 rings)
 * // For adamantane: [[0,1,2,3], [1,2,7,8], [3,4,5,6,7]] (3 rings)
 *
 * @complexity O(N²) where N is the number of atoms
 * @see findMCB, findAtomRings
 */
export function findSSSR(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  return mg.sssr;
}

/**
 * Alias for findSSSR: Computes the Minimum Cycle Basis (MCB) for a molecule.
 *
 * MCB is mathematically equivalent to SSSR for simple organic molecules.
 * Both represent the minimal set of independent rings needed to describe ring topology.
 *
 * @param atoms - Array of atoms in the molecule
 * @param bonds - Array of bonds in the molecule
 * @returns Array of rings (each is an array of atom IDs), representing the MCB/SSSR
 *
 * @see findSSSR
 */
export function findMCB(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  return mg.sssr;
}

function countConnectedComponents(atoms: readonly Atom[], bonds: readonly Bond[]): number {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  return mg.components.length;
}

function getRingEdges(ring: number[]): string[] {
  const edges: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const atom1 = ring[i]!;
    const atom2 = ring[(i + 1) % ring.length]!;
    edges.push(`${Math.min(atom1, atom2)}-${Math.max(atom1, atom2)}`);
  }
  return edges;
}

/**
 * Classifies SSSR rings into categories: isolated, fused, spiro, and bridged.
 *
 * Uses atom overlap patterns to determine ring connectivity:
 * - **Isolated**: Ring with no shared atoms (separate from other rings)
 * - **Fused**: Ring sharing 2+ atoms with another ring (e.g., naphthalene)
 * - **Spiro**: Ring sharing exactly 1 atom with another ring (e.g., spiro compounds)
 * - **Bridged**: Ring that bridges two separate ring systems
 *
 * @param atoms - Array of atoms in the molecule
 * @param bonds - Array of bonds in the molecule
 * @returns Object with categories: `{ isolated, fused, spiro, bridged }`, each containing ring arrays
 *
 * @example
 * const classified = classifyRingSystems(mol.atoms, mol.bonds);
 * classified.fused.forEach(ring => console.log('Fused ring:', ring));
 *
 * @complexity O(R²) where R is the number of rings (typically small)
 * @see findSSSR, isPartOfFusedSystem
 */
export function classifyRingSystems(atoms: readonly Atom[], bonds: readonly Bond[]): {
  isolated: number[][];
  fused: number[][];
  spiro: number[][];
  bridged: number[][];
} {
  const rings = findSSSR(atoms, bonds);
  const isolated: number[][] = [];
  const fused: number[][] = [];
  const spiro: number[][] = [];
  const bridged: number[][] = [];
  // Reworked classification: examine pairwise shared atom counts to determine
  // whether a ring is isolated, spiro (shares exactly one atom with another ring),
  // fused (shares 2 adjacent atoms with another ring), or bridged (shares 3+ atoms or 2+ non-adjacent).
  for (let i = 0; i < rings.length; i++) {
    const ring1 = rings[i];
    if (!ring1) continue;
    const ring1Set = new Set(ring1);
    let maxShared = 0;
    let isBridged = false;
    let isFused = false;

    for (let j = 0; j < rings.length; j++) {
      if (i === j) continue;
      const ring2 = rings[j]!;
      const sharedAtoms = ring2.filter(atom => ring1Set.has(atom));
      const shared = sharedAtoms.length;
      if (shared > maxShared) maxShared = shared;

      if (shared === 2) {
        // Check if the 2 shared atoms are adjacent (connected by a bond)
        const [atom1, atom2] = sharedAtoms;
        const areAdjacent = bonds.some(
          b => (b.atom1 === atom1 && b.atom2 === atom2) || (b.atom1 === atom2 && b.atom2 === atom1)
        );
        if (areAdjacent) {
          isFused = true;
        } else {
          isBridged = true;
        }
      } else if (shared >= 3) {
        // 3+ shared atoms → bridged
        isBridged = true;
      }
    }

    // Classification based on analysis
    if (maxShared === 0) {
      isolated.push(ring1);
    } else if (maxShared === 1) {
      spiro.push(ring1);
    } else if (isBridged) {
      bridged.push(ring1);
    } else if (isFused) {
      fused.push(ring1);
    } else {
      // Fallback: should not happen
      isolated.push(ring1);
    }
  }

  return { isolated, fused, spiro, bridged };
}

/**
 * Comprehensive ring information interface for querying ring topology.
 *
 * Provides both raw ring data and convenient query methods for checking atom/bond
 * membership and ring relationships.
 *
 * @property rings - Array of SSSR rings (each ring is array of atom IDs)
 * @property ringAtomSet - Set of all atom IDs that are part of any ring
 * @property ringBondSet - Set of all bond keys that are part of any ring
 * @property isAtomInRing - Query if a specific atom is part of any ring
 * @property isBondInRing - Query if a bond (by atom IDs) is part of any ring
 * @property getRingsContainingAtom - Get all rings containing a specific atom
 * @property areBothAtomsInSameRing - Check if two atoms share at least one ring
 *
 * @see analyzeRings
 */
export interface RingInfo {
  rings: number[][];
  ringAtomSet: Set<number>;
  ringBondSet: Set<string>;
  isAtomInRing: (atomId: number) => boolean;
  isBondInRing: (atom1: number, atom2: number) => boolean;
  getRingsContainingAtom: (atomId: number) => number[][];
  areBothAtomsInSameRing: (atom1: number, atom2: number) => boolean;
}

/**
 * Performs comprehensive ring analysis and returns convenient query interface.
 *
 * Builds both the raw SSSR rings and efficient lookup structures for querying.
 * Optionally accepts a pre-computed MoleculeGraph to avoid re-computation.
 *
 * @param mol - Molecule to analyze
 * @param mg - Optional pre-computed MoleculeGraph (avoids re-computation)
 * @returns RingInfo object with rings and query methods
 *
 * @example
 * const info = analyzeRings(mol);
 * if (info.isAtomInRing(5)) console.log('Atom 5 is in a ring');
 * const rings = info.getRingsContainingAtom(3);
 *
 * @complexity O(N) where N is the number of atoms
 * @see RingInfo, findSSSR
 */
export function analyzeRings(mol: Molecule, mg?: MoleculeGraph): RingInfo {
  const moleculeGraph = mg || new MoleculeGraph(mol);
  const rings = moleculeGraph.sssr;
  const ringAtomSet = new Set<number>();
  const ringBondSet = new Set<string>();

  for (const ring of rings) {
    for (const atomId of ring) {
      ringAtomSet.add(atomId);
    }
  }

  for (const bond of mol.bonds) {
    for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
      const ring = rings[ringIdx]!;
      const ringSet = new Set(ring);
      const atom1InThisRing = ringSet.has(bond.atom1);
      const atom2InThisRing = ringSet.has(bond.atom2);

      if (atom1InThisRing && atom2InThisRing) {
        ringBondSet.add(bondKey(bond.atom1, bond.atom2));
        break;
      }
    }
  }

  const ringSetArray = rings.map(r => new Set(r));

  return {
    rings,
    ringAtomSet,
    ringBondSet,
    isAtomInRing: (atomId: number) => ringAtomSet.has(atomId),
    isBondInRing: (atom1: number, atom2: number) => ringBondSet.has(bondKey(atom1, atom2)),
    getRingsContainingAtom: (atomId: number) => rings.filter((_, idx) => ringSetArray[idx]!.has(atomId)),
    areBothAtomsInSameRing: (atom1: number, atom2: number) => {
      return ringSetArray.some(ringSet => ringSet.has(atom1) && ringSet.has(atom2));
    },
  };
}

/**
 * Checks if a specific atom is part of any ring.
 *
 * @param atomId - ID of atom to check
 * @param rings - Array of rings (typically SSSR)
 * @returns true if atom is in any ring, false otherwise
 *
 * @example
 * const isRingAtom = isAtomInRing(5, sssr);
 *
 * @complexity O(R × S) where R is number of rings, S is average ring size
 * @see analyzeRings
 */
export function isAtomInRing(atomId: number, rings: number[][]): boolean {
  const ringSets = rings.map(r => new Set(r));
  return ringSets.some(ringSet => ringSet.has(atomId));
}

/**
 * Checks if a bond (by atom IDs) is part of any ring.
 *
 * @param atom1 - ID of first atom
 * @param atom2 - ID of second atom
 * @param rings - Array of rings (typically SSSR)
 * @returns true if bond is in any ring, false otherwise
 *
 * @example
 * const isRingBond = isBondInRing(3, 5, sssr);
 *
 * @complexity O(R × S) where R is number of rings, S is average ring size
 * @see analyzeRings
 */
export function isBondInRing(atom1: number, atom2: number, rings: number[][]): boolean {
  const ringSets = rings.map(r => new Set(r));
  return ringSets.some(ringSet => ringSet.has(atom1) && ringSet.has(atom2));
}

/**
 * Returns all rings containing a specific atom.
 *
 * Useful for queries like "which rings contain the bridgehead carbon?" or "what are
 * the common rings between two atoms?"
 *
 * @param atomId - ID of atom to query
 * @param rings - Array of rings (typically SSSR)
 * @returns Array of rings containing the atom (empty array if atom is not in any ring)
 *
 * @example
 * const bridgeheadRings = getRingsContainingAtom(3, sssr);
 * // For adamantane bridgehead: returns 3 rings
 *
 * @complexity O(R × S) where R is number of rings, S is average ring size
 * @see findAtomRings, analyzeRings
 */
export function getRingsContainingAtom(atomId: number, rings: number[][]): number[][] {
  return rings.filter(ring => {
    const ringSet = new Set(ring);
    return ringSet.has(atomId);
  });
}

/**
 * Filters rings to only those where all atoms are aromatic.
 *
 * Identifies aromatic rings in the molecule. A ring is aromatic only if
 * ALL its atoms have been marked as aromatic.
 *
 * @param rings - Array of rings (typically SSSR)
 * @param atoms - Array of atoms with aromatic flags set
 * @returns Array of rings where every atom is aromatic
 *
 * @example
 * const aromaticRings = getAromaticRings(sssr, mol.atoms);
 * // For naphthalene: returns 2 aromatic benzene-like rings
 *
 * @complexity O(R × S) where R is number of rings, S is average ring size
 * @see findSSSR
 */
export function getAromaticRings(rings: number[][], atoms: readonly Atom[]): number[][] {
  const atomMap = new Map(atoms.map(a => [a.id, a]));
  return rings.filter(ring => {
    return ring.every(atomId => {
      const atom = atomMap.get(atomId);
      return atom?.aromatic === true;
    });
  });
}

/**
 * Returns the Atom objects for all atoms in a ring.
 *
 * @param ring - Array of atom IDs forming a ring
 * @param atoms - Array of all atoms in the molecule
 * @returns Array of Atom objects corresponding to the ring
 *
 * @example
 * const ringAtoms = getRingAtoms([0, 1, 2, 3, 4, 5], mol.atoms);
 *
 * @complexity O(S) where S is the ring size
 * @see getRingBonds
 */
export function getRingAtoms(ring: readonly number[], atoms: readonly Atom[]): Atom[] {
  const atomMap = new Map(atoms.map(a => [a.id, a]));
  return [...ring].map((id: number) => atomMap.get(id)!);
}

/**
 * Returns the Bond objects for all bonds in a ring.
 *
 * @param ring - Array of atom IDs forming a ring
 * @param bonds - Array of all bonds in the molecule
 * @returns Array of Bond objects where both atoms are in the ring
 *
 * @example
 * const ringBonds = getRingBonds([0, 1, 2, 3, 4, 5], mol.bonds);
 *
 * @complexity O(M) where M is the number of bonds
 * @see getRingAtoms
 */
export function getRingBonds(ring: readonly number[], bonds: readonly Bond[]): Bond[] {
  const ringSet = new Set(ring);
  return bonds.filter(b => ringSet.has(b.atom1) && ringSet.has(b.atom2));
}

/**
 * Checks if a ring is a composite (union of two or more smaller rings).
 *
 * A composite ring is one that can be represented as the union of smaller rings
 * in the ring set. For example, in naphthalene, the "superring" combining both
 * aromatic rings is composite.
 *
 * @param ring - Ring to check
 * @param smallerRings - Array of smaller rings to test against
 * @returns true if ring is composite, false if it is elementary
 *
 * @example
 * const isComposite = isCompositeRing([0,1,2,3,4,5,6,7,8,9], allRings);
 *
 * @complexity O(R²) where R is number of rings
 * @see filterElementaryRings, isPartOfFusedSystem
 */
export function isCompositeRing(ring: number[], smallerRings: number[][]): boolean {
  for (let i = 0; i < smallerRings.length; i++) {
    for (let j = i + 1; j < smallerRings.length; j++) {
      const ring1 = smallerRings[i]!;
      const ring2 = smallerRings[j]!;
      const combined = new Set([...ring1, ...ring2]);
      if (combined.size === ring.length && ring.every(id => combined.has(id))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Filters rings to only elementary (non-composite) rings.
 *
 * Elementary rings are the "primitive" rings that cannot be expressed as
 * unions of smaller rings. This differs from SSSR/MCB which emphasizes
 * mathematical minimality over chemical primitives.
 *
 * @param allRings - Array of all rings (from findRings)
 * @returns Array of only elementary rings
 *
 * @example
 * const elementary = filterElementaryRings(findRings(mol.atoms, mol.bonds));
 *
 * @complexity O(R³) where R is number of rings
 * @see isCompositeRing, findRings
 */
export function filterElementaryRings(allRings: number[][]): number[][] {
  return allRings.filter((ring: number[]) => {
    const smallerRings = allRings.filter((r: number[]) => r.length < ring.length);
    return !isCompositeRing(ring, smallerRings);
  });
}

/**
 * Checks if a ring is part of a fused ring system.
 *
 * A ring is part of a fused system if it shares 2 or more atoms with any other ring.
 * Useful for identifying polycyclic aromatic hydrocarbons and other fused systems.
 *
 * @param ring - Ring to check
 * @param allRings - Array of all rings (typically SSSR)
 * @returns true if ring shares 2+ atoms with another ring, false otherwise
 *
 * @example
 * const isFused = isPartOfFusedSystem([0,1,2,3,4,5], sssr);
 *
 * @complexity O(R × S) where R is number of rings, S is average ring size
 * @see classifyRingSystems, ringsShareAtoms
 */
export function isPartOfFusedSystem(ring: number[], allRings: number[][]): boolean {
  const ringSet = new Set(ring);
  for (const otherRing of allRings) {
    if (otherRing === ring) continue;
    const sharedCount = otherRing.filter(id => ringSet.has(id)).length;
    if (sharedCount >= 2) {
      return true;
    }
  }
  return false;
}
