import type { Molecule, Bond, Atom } from '../../types';
import { BondType, StereoType } from '../../types';
import { isOrganicAtom } from '../utils/atom-utils';

// SMILES generation strategy:
// - For simple SMILES: treat molecule as a graph and use DFS traversal
// - For canonical SMILES: implement canonical numbering (iterative atom invariants),
//   then use DFS with deterministic ordering based on canonical labels

export function generateSMILES(input: Molecule | Molecule[], canonical = true): string {
  if (Array.isArray(input)) {
    return input.map(mol => generateSMILES(mol, canonical)).join('.');
  }
  // Work on a shallow-cloned molecule to avoid mutating the caller's data
  const molecule = input as Molecule;
  const cloned: Molecule = {
    atoms: molecule.atoms.map(a => ({ ...a })),
    bonds: molecule.bonds.map(b => ({ ...b })),
  };

  if (cloned.atoms.length === 0) return '';

  for (const atom of cloned.atoms) {
    if (atom.chiral) {
      const neighbors = getNeighbors(atom.id, cloned);
      if (neighbors.length < 3) {
        // clear chiral marker for atoms that can't be chiral
        atom.chiral = null;
        if (atom.symbol === 'C' && atom.hydrogens <= 1 && atom.charge === 0 && !atom.isotope) {
          atom.isBracket = false;
          atom.hydrogens = 0;
        }
      }
    }
  }

  // For canonical SMILES, preserve stereochemistry but normalize bracket
  // notation for organic subset atoms when they are not chiral. Do not
  // globally clear stereochemical markers here; chiral atoms are kept and
  // already had impossible chiral flags removed earlier.
  if (canonical) {
    for (const atom of cloned.atoms) {
      // Only minimize brackets for non-chiral organic atoms with no isotope/charge
      if (!atom.chiral && isOrganicAtom(atom.symbol) && atom.isBracket && !atom.isotope && (atom.charge === 0 || atom.charge === undefined)) {
        atom.isBracket = false;
        atom.hydrogens = 0;
      }
    }
  }

  for (const bond of cloned.bonds) {
    if (bond.type === BondType.DOUBLE) {
      const inSmallRing = isInSmallRing(bond.atom1, bond.atom2, cloned, 8);
      if (inSmallRing) {
        for (const b of cloned.bonds) {
          if (b.type === BondType.SINGLE && b.stereo && b.stereo !== StereoType.NONE) {
            b.stereo = StereoType.NONE;
          }
        }
        break;
      }
    }
  }

  // Normalize stereo markers for canonical SMILES
  if (canonical) {
    normalizeStereoMarkers(cloned);
  }

  const components = findConnectedComponents(cloned);
  if (components.length > 1) {
    return components.map(comp => generateComponentSMILES(comp, cloned, canonical)).join('.');
  }

  return generateComponentSMILES(cloned.atoms.map(a => a.id), cloned, canonical);
}

// Treat the molecule as a graph: use BFS to find disconnected components
function findConnectedComponents(molecule: Molecule): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const atom of molecule.atoms) {
    if (visited.has(atom.id)) continue;
    const component: number[] = [];
    const queue = [atom.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const [neighbor] of getNeighbors(current, molecule)) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }

  return components;
}

function generateComponentSMILES(atomIds: number[], molecule: Molecule, useCanonical = true): string {
  const componentAtoms = atomIds.map(id => molecule.atoms.find(a => a.id === id)!);
  const componentBonds = molecule.bonds.filter(b => atomIds.includes(b.atom1) && atomIds.includes(b.atom2));
  
  const subMol: Molecule = { atoms: componentAtoms, bonds: componentBonds };
  
  // Canonical numbering: compute unique labels for each atom using iterative refinement
  const canonicalInfo = useCanonical ? canonicalLabels(subMol) : { labels: simpleLabels(subMol), duplicates: new Set<number>() };
  const labels = canonicalInfo.labels;
  const duplicates = canonicalInfo.duplicates;

  const atomsSorted = [...componentAtoms].sort((a, b) => {
    const la = labels.get(a.id)!;
    const lb = labels.get(b.id)!;
    if (la < lb) return -1;
    if (la > lb) return 1;
    if (a.atomicNumber !== b.atomicNumber) return a.atomicNumber - b.atomicNumber;
    if (a.charge !== b.charge) return (a.charge || 0) - (b.charge || 0);
    return a.id - b.id;
  });

  const degrees = new Map<number, number>();
  for (const bond of componentBonds) {
    degrees.set(bond.atom1, (degrees.get(bond.atom1) || 0) + 1);
    degrees.set(bond.atom2, (degrees.get(bond.atom2) || 0) + 1);
  }

  // Select root atom deterministically using canonical labels for canonical SMILES
  let root = atomsSorted[0]!.id;
  let rootAtom = componentAtoms.find(a => a.id === root)!;
  for (const atom of componentAtoms) {
    const currentLabel = labels.get(atom.id)!;
    const rootLabel = labels.get(root)!;
    
    if (currentLabel !== rootLabel) {
      if (currentLabel < rootLabel) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    const deg = degrees.get(atom.id) || 0;
    const rootDeg = degrees.get(root) || 0;
    if (deg !== rootDeg) {
      if (deg < rootDeg) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    const absCharge = Math.abs(atom.charge || 0);
    const rootAbsCharge = Math.abs(rootAtom.charge || 0);
    if (absCharge !== rootAbsCharge) {
      if (absCharge < rootAbsCharge) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    if (atom.hydrogens !== rootAtom.hydrogens) {
      if (atom.hydrogens < rootAtom.hydrogens) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    if (atom.id < root) {
      root = atom.id;
      rootAtom = atom;
    }
  }

  const ringNumbers = new Map<string, number>();
  let ringCounter = 1;
  const seen = new Set<number>();
  const atomRingNumbers = new Map<number, number[]>();
  const out: string[] = [];

  // DFS traversal: identify ring closures (back edges) in the molecular graph
  const findBackEdges = (atomId: number, parentId: number | null, visited: Set<number>, backEdges: Set<string>) => {
    visited.add(atomId);
    const neighbors = getNeighbors(atomId, subMol).filter(([nid]) => nid !== parentId);

    // Sort neighbors by canonical labels for deterministic traversal order
    neighbors.sort((x, y) => {
      const [aId, aBond] = x;
      const [bId, bBond] = y;
      const la = labels.get(aId)!;
      const lb = labels.get(bId)!;
      if (la < lb) return -1;
      if (la > lb) return 1;
      const w = bondPriority(aBond) - bondPriority(bBond);
      if (w !== 0) return w;
      return aId - bId;
    });

    for (const [nid] of neighbors) {
      if (visited.has(nid)) {
        // Back edge detected: this forms a ring closure
        backEdges.add(bondKey(atomId, nid));
      } else {
        findBackEdges(nid, atomId, visited, backEdges);
      }
    }
  };

  const visited = new Set<number>();
  const backEdges = new Set<string>();
  findBackEdges(root, null, visited, backEdges);

  for (const edge of backEdges) {
    const num = ringCounter++;
    ringNumbers.set(edge, num);
    const [a, b] = edge.split('-').map(Number);
    const aNum = a!;
    const bNum = b!;
    if (!atomRingNumbers.has(aNum)) atomRingNumbers.set(aNum, []);
    if (!atomRingNumbers.has(bNum)) atomRingNumbers.set(bNum, []);
    atomRingNumbers.get(aNum)!.push(num);
    atomRingNumbers.get(bNum)!.push(num);
  }

  const visit = (atomId: number, parentId: number | null) => {
    const atom = componentAtoms.find(a => a.id === atomId)!;
    const sym = atom.aromatic ? atom.symbol.toLowerCase() : atom.symbol;

    if (atom.isBracket) out.push('[');
    if (atom.isotope) out.push(atom.isotope.toString());
    out.push(sym);
    // Emit chiral marker only if atom is marked chiral and is unique in canonical labeling
    if (atom.chiral && !duplicates.has(atomId)) out.push(atom.chiral);
    if (atom.isBracket && atom.hydrogens > 0) {
      out.push('H');
      if (atom.hydrogens > 1) out.push(atom.hydrogens.toString());
    }
    if (atom.isBracket && atom.charge > 0) {
      out.push('+');
      if (atom.charge > 1) out.push(atom.charge.toString());
    } else if (atom.isBracket && atom.charge < 0) {
      out.push('-');
      if (atom.charge < -1) out.push((-atom.charge).toString());
    }
    if (atom.isBracket) out.push(']');

    const ringNums = atomRingNumbers.get(atomId) || [];
    for (const num of ringNums) {
      const numStr = num < 10 ? String(num) : `%${String(num).padStart(2, '0')}`;
      
      // Find the ring closure bond and the other atom for this ring number
      let ringBond: Bond | undefined;
      let otherAtom: number | undefined;
      for (const [edgeKey, ringNum] of ringNumbers.entries()) {
        if (ringNum === num) {
          const [a, b] = edgeKey.split('-').map(Number);
          ringBond = componentBonds.find(bond => 
            (bond.atom1 === a && bond.atom2 === b) || (bond.atom1 === b && bond.atom2 === a)
          );
          otherAtom = a === atomId ? b : a;
          break;
        }
      }
      
      // Output bond symbol BEFORE the ring number for the first occurrence
      // (when the other atom hasn't been seen yet)
      const isFirstOccurrence = otherAtom !== undefined && !seen.has(otherAtom);
      
      if (ringBond && isFirstOccurrence && ringBond.type !== BondType.SINGLE) {
        if (ringBond.type === BondType.DOUBLE) out.push('=');
        else if (ringBond.type === BondType.TRIPLE) out.push('#');
        // Aromatic bonds don't need a symbol
      }
      
      out.push(numStr);
    }

    seen.add(atomId);

    const neighbors = getNeighbors(atomId, subMol).filter(([nid]) => nid !== parentId);

    neighbors.sort((x, y) => {
      const [aId, aBond] = x;
      const [bId, bBond] = y;
      const aSeen = seen.has(aId);
      const bSeen = seen.has(bId);
      if (aSeen && !bSeen) return 1;
      if (!aSeen && bSeen) return -1;
      const la = labels.get(aId)!;
      const lb = labels.get(bId)!;
      if (la < lb) return -1;
      if (la > lb) return 1;
      const w = bondPriority(aBond) - bondPriority(bBond);
      if (w !== 0) return w;
      return aId - bId;
    });

    const unseenNeighbors = neighbors.filter(([nid, bond]) => {
      const edgeKey = bondKey(atomId, nid);
      return !seen.has(nid) && !backEdges.has(edgeKey);
    });

    // Process all but the last as branches, then process the last as main chain
    for (let i = 0; i < unseenNeighbors.length; i++) {
      const [nid, bond] = unseenNeighbors[i]!;
      const bondStr = bondSymbolForOutput(bond, nid, subMol, atomId, duplicates);
      
      if (i === unseenNeighbors.length - 1) {
        // Last neighbor: main chain continuation
        out.push(bondStr);
        visit(nid, atomId);
      } else {
        // Not last: branch
        out.push('(' + bondStr);
        visit(nid, atomId);
        out.push(')');
      }
    }
  };

  visit(root, null);

  return out.join('');
}

function simpleLabels(mol: Molecule): Map<number, string> {
  const labels = new Map<number, string>();
  for (const a of mol.atoms) {
    labels.set(a.id, String(a.id));
  }
  return labels;
}

function canonicalLabels(mol: Molecule): { labels: Map<number, string>, duplicates: Set<number> } {
  const labels = new Map<number, string>();
  for (const a of mol.atoms) {
    const deg = getNeighbors(a.id, mol).length;
    const absCharge = Math.abs(a.charge || 0);
    const lbl = [
      String(deg).padStart(3, '0'),
      String(a.atomicNumber).padStart(3, '0'),
      a.aromatic ? 'ar' : 'al',
      String(a.isotope || 0).padStart(3, '0'),
      String(absCharge).padStart(3, '0'),
      String(a.hydrogens || 0).padStart(3, '0')
    ].join('|');
    labels.set(a.id, lbl);
  }

  const maxIter = 8;
  for (let iter = 0; iter < maxIter; iter++) {
    const newLabels = new Map<number, string>();
    for (const a of mol.atoms) {
      const neigh = getNeighbors(a.id, mol)
        .map(([nid, b]) => `${b.type}:${labels.get(nid)}`)
        .sort();
      const combined = labels.get(a.id)! + '|' + neigh.join(',');
      newLabels.set(a.id, combined);
    }

    const uniq = new Map<string, number>();
    let counter = 1;
    const uniqueLabels = Array.from(new Set(mol.atoms.map(a => newLabels.get(a.id)!)));
    uniqueLabels.sort();
    for (const lbl of uniqueLabels) {
      uniq.set(lbl, counter++);
    }
    const normalized = new Map<number, string>();
    for (const a of mol.atoms) normalized.set(a.id, String(uniq.get(newLabels.get(a.id)!)!));

    let same = true;
    for (const a of mol.atoms) {
      if (labels.get(a.id)! !== normalized.get(a.id)!) {
        same = false;
        break;
      }
    }
    labels.clear();
    for (const [k, v] of normalized.entries()) labels.set(k, v);
    if (same) break;
  }

  // Detect duplicate labels (equivalence classes with size > 1)
  const counts = new Map<string, number>();
  for (const a of mol.atoms) {
    const l = labels.get(a.id)!;
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  const duplicates = new Set<number>();
  for (const a of mol.atoms) {
    if ((counts.get(labels.get(a.id)!) || 0) > 1) duplicates.add(a.id);
  }

  return { labels, duplicates };
}

function bondPriority(b: Bond): number {
  switch (b.type) {
    case BondType.TRIPLE: return -3;
    case BondType.DOUBLE: return -2;
    case BondType.AROMATIC: return -4; // aromatic bonds have highest priority
    case BondType.SINGLE: return -1;
    default: return 0;
  }
}

function bondSymbolForOutput(bond: Bond, childId: number, molecule: Molecule, parentId: number | null, duplicates: Set<number>): string {
  if (bond.type === BondType.SINGLE) {
    // For single bonds, check if they're involved in double bond stereochemistry
    const hasExplicitStereo = bond.stereo && bond.stereo !== StereoType.NONE;
    
    if (hasExplicitStereo) {
      // Determine the stereo marker based on traversal direction
      // The bond connects parentId to childId in our traversal
      const traversalForward = (bond.atom1 === parentId && bond.atom2 === childId) || 
                               (bond.atom2 === parentId && bond.atom1 === childId);
      
      if (!traversalForward) {
        // If bond direction doesn't match traversal, use original stereo
        return bond.stereo === StereoType.UP ? '/' : '\\';
      }
      
      // Normalize: prefer '/' marker for UP stereo in canonical form
      // If traversing bond in same direction as stored (atom1->atom2)
      const sameDirection = bond.atom1 === parentId;
      if (sameDirection) {
        return bond.stereo === StereoType.UP ? '/' : '\\';
      } else {
        // Traversing opposite direction: flip the marker
        return bond.stereo === StereoType.UP ? '\\' : '/';
      }
    }
    return '';
  }
  if (bond.type === BondType.DOUBLE) return '=';
  if (bond.type === BondType.TRIPLE) return '#';
  if (bond.type === BondType.AROMATIC) return '';
  return '';
}

function bondKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function getNeighbors(atomId: number, molecule: Molecule): [number, Bond][] {
  return molecule.bonds
    .filter(b => b.atom1 === atomId || b.atom2 === atomId)
    .map(b => [b.atom1 === atomId ? b.atom2 : b.atom1, b]);
}

function isInSmallRing(atom1: number, atom2: number, molecule: Molecule, maxSize: number): boolean {
  // BFS to find shortest path from atom2 back to atom1 without using the direct bond
  const queue: [number, number][] = [[atom2, 0]];
  const visited = new Set<number>([atom1, atom2]);
  
  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    if (dist >= maxSize - 1) continue;
    
    for (const [neighbor] of getNeighbors(current, molecule)) {
      if (neighbor === atom1 && dist > 0) {
        return dist + 1 < maxSize;
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }
  
  return false;
}

// Normalize stereo markers to canonical form
// For equivalent representations (e.g., F/C=C/F vs F\C=C\F), prefer UP markers
function normalizeStereoMarkers(molecule: Molecule): void {
  for (const bond of molecule.bonds) {
    if (bond.type !== BondType.DOUBLE) continue;
    
    // Find all single bonds attached to the double bond atoms
    const bondsOnAtom1 = molecule.bonds.filter(b => 
      b.type === BondType.SINGLE && 
      (b.atom1 === bond.atom1 || b.atom2 === bond.atom1) &&
      b.stereo && b.stereo !== StereoType.NONE
    );
    const bondsOnAtom2 = molecule.bonds.filter(b => 
      b.type === BondType.SINGLE && 
      (b.atom1 === bond.atom2 || b.atom2 === bond.atom2) &&
      b.stereo && b.stereo !== StereoType.NONE
    );
    
    if (bondsOnAtom1.length === 0 || bondsOnAtom2.length === 0) continue;
    
    // Check if all stereo markers are the same (all UP or all DOWN)
    const allUp = bondsOnAtom1.every(b => b.stereo === StereoType.UP) && 
                  bondsOnAtom2.every(b => b.stereo === StereoType.UP);
    const allDown = bondsOnAtom1.every(b => b.stereo === StereoType.DOWN) && 
                    bondsOnAtom2.every(b => b.stereo === StereoType.DOWN);
    
    // If all DOWN, convert to all UP (canonical form)
    if (allDown) {
      for (const b of bondsOnAtom1) {
        b.stereo = StereoType.UP;
      }
      for (const b of bondsOnAtom2) {
        b.stereo = StereoType.UP;
      }
    }
  }
}
