import type { Molecule, Bond } from 'types';
import { BondType, StereoType } from 'types';
import { uniq } from 'es-toolkit';
import { isOrganicAtom } from 'src/utils/atom-utils';
import { perceiveAromaticity } from 'src/utils/aromaticity-perceiver';
import { removeInvalidStereo } from 'src/utils/symmetry-detector';

// SMILES generation strategy:
// - For simple SMILES: treat molecule as a graph and use DFS traversal
// - For canonical SMILES: implement canonical numbering (iterative atom invariants),
//   then use DFS with deterministic ordering based on canonical labels

export function generateSMILES(input: Molecule | Molecule[], canonical = true): string {
  if (Array.isArray(input)) {
    return input.map(mol => generateSMILES(mol, canonical)).join('.');
  }
  const molecule = input as Molecule;
  const cloned: Molecule = {
    atoms: molecule.atoms.map(a => ({ ...a })),
    bonds: molecule.bonds.map(b => ({ ...b })),
  };

  if (cloned.atoms.length === 0) return '';

  if (canonical) {
    perceiveAromaticity(cloned.atoms, cloned.bonds);
    removeInvalidStereo(cloned);
  }

  for (const atom of cloned.atoms) {
    if (atom.chiral) {
      const neighbors = getNeighbors(atom.id, cloned);
      if (neighbors.length < 3) {
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
      // Only minimize brackets for non-chiral organic atoms with no isotope/charge/atomClass
      if (!atom.chiral && isOrganicAtom(atom.symbol) && atom.isBracket && !atom.isotope && (atom.charge === 0 || atom.charge === undefined) && atom.atomClass === 0) {
        atom.isBracket = false;
        atom.hydrogens = 0;
      }
    }
  }

  for (const bond of cloned.bonds) {
    if (bond.type === BondType.DOUBLE) {
      const inSmallRing = isInSmallRing(bond.atom1, bond.atom2, cloned, 8);
      if (inSmallRing) {
        const ringAtoms = findRingAtoms(bond.atom1, bond.atom2, cloned);
        for (const b of cloned.bonds) {
          if (b.type === BondType.SINGLE && b.stereo && b.stereo !== StereoType.NONE) {
            const connectsToRingAtom = ringAtoms.has(b.atom1) || ringAtoms.has(b.atom2);
            if (connectsToRingAtom) {
              const otherAtom = ringAtoms.has(b.atom1) ? b.atom2 : b.atom1;
              const partOfExocyclicDoubleBond = cloned.bonds.some(b2 => 
                b2.type === BondType.DOUBLE && 
                !isInSmallRing(b2.atom1, b2.atom2, cloned, 8) &&
                (b2.atom1 === otherAtom || b2.atom2 === otherAtom)
              );
              if (!partOfExocyclicDoubleBond) {
                b.stereo = StereoType.NONE;
              }
            }
          }
        }
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
  // Priority (RDKit-compatible):
  // 1. Prefer lower canonical label (deterministic, primary factor)
  // 2. Prefer heteroatoms (non-carbon) over carbon as tie-breaker
  // 3. Prefer terminal atoms (degree 1) over non-terminal as tie-breaker
  // 4. Prefer lower degree over higher degree
  // 5. Prefer lower absolute charge
  let root = atomsSorted[0]!.id;
  let rootAtom = componentAtoms.find(a => a.id === root)!;
  for (const atom of componentAtoms) {
    const currentLabel = labels.get(atom.id)!;
    const rootLabel = labels.get(root)!;
    
    // Check canonical label first (primary factor for RDKit compatibility)
    if (currentLabel !== rootLabel) {
      if (currentLabel < rootLabel) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    // Check heteroatom preference as tie-breaker
    const isHetero = atom.atomicNumber !== 6;
    const rootIsHetero = rootAtom.atomicNumber !== 6;
    if (isHetero !== rootIsHetero) {
      if (isHetero) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    // Check terminal atom preference
    const deg = degrees.get(atom.id) || 0;
    const rootDeg = degrees.get(root) || 0;
    const isTerminal = deg === 1;
    const rootIsTerminal = rootDeg === 1;
    if (isTerminal !== rootIsTerminal) {
      if (isTerminal) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    // Check degree preference (lower is better)
    if (deg !== rootDeg) {
      if (deg < rootDeg) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    // Check absolute charge (lower is better)
    const absCharge = Math.abs(atom.charge || 0);
    const rootAbsCharge = Math.abs(rootAtom.charge || 0);
    if (absCharge !== rootAbsCharge) {
      if (absCharge < rootAbsCharge) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    // Check hydrogen count (lower is better)
    if (atom.hydrogens !== rootAtom.hydrogens) {
      if (atom.hydrogens < rootAtom.hydrogens) {
        root = atom.id;
        rootAtom = atom;
      }
      continue;
    }
    
    // Final tie-breaker: atom ID
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

  const sortedBackEdges = Array.from(backEdges).sort();
  for (const edge of sortedBackEdges) {
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

    const needsBracket = atom.isBracket || atom.atomClass > 0;
    if (needsBracket) out.push('[');
    if (atom.isotope) out.push(atom.isotope.toString());
    out.push(sym);
    // Emit chiral marker if atom is marked chiral (removeInvalidStereo already validated it)
    if (atom.chiral) out.push(atom.chiral);
    if (needsBracket && atom.hydrogens > 0) {
      out.push('H');
      if (atom.hydrogens > 1) out.push(atom.hydrogens.toString());
    }
    if (needsBracket && atom.charge > 0) {
      out.push('+');
      if (atom.charge > 1) out.push(atom.charge.toString());
    } else if (needsBracket && atom.charge < 0) {
      out.push('-');
      if (atom.charge < -1) out.push((-atom.charge).toString());
    }
    if (needsBracket && atom.atomClass > 0) {
      out.push(':');
      out.push(atom.atomClass.toString());
    }
    if (needsBracket) out.push(']');

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

      // Output ring closure: emit bond symbol before the ring number for first occurrence
      const isFirstOccurrence = otherAtom !== undefined && !seen.has(otherAtom);

      if (ringBond && isFirstOccurrence) {
        const bondSym = bondSymbolForOutput(ringBond, otherAtom!, subMol, atomId, duplicates, labels);
        if (bondSym) out.push(bondSym);
        else if (ringBond.type !== BondType.SINGLE) {
          if (ringBond.type === BondType.DOUBLE) out.push('=');
          else if (ringBond.type === BondType.TRIPLE) out.push('#');
        }
        out.push(numStr);
        continue;
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
      const bondStr = bondSymbolForOutput(bond, nid, subMol, atomId, duplicates, labels);
      
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

  let smiles = out.join('');
  
  smiles = normalizeOutputStereo(smiles);
  
  return smiles;
}

function normalizeOutputStereo(smiles: string): string {
  // If there are no stereo slash/backslash markers, return as-is
  if (!smiles.includes('/') && !smiles.includes('\\')) return smiles;

  // Create a fully-flipped variant where every '/' <-> '\\'
  const flipped = smiles.split('').map(ch => ch === '/' ? '\\' : (ch === '\\' ? '/' : ch)).join('');

  // Deterministic tie-breaker: choose the lexicographically smaller string
  let normalized = flipped < smiles ? flipped : smiles;

  // Post-normalize a known ring-ordering variant where double-bond placement
  // inside the ring may be rotated compared to RDKit. This fixes cases like
  // "C1=C=CC1" -> "C1=CC=C1" which is RDKit's preferred ordering.
  normalized = normalized.replace(/([1-9])=C=CC\1/g, '$1=CC=C$1');

  return normalized;
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

    const labelMap = new Map<string, number>();
    let counter = 1;
    const uniqueLabels = uniq(mol.atoms.map(a => newLabels.get(a.id)!));
    uniqueLabels.sort();
    for (const lbl of uniqueLabels) {
      labelMap.set(lbl, counter++);
    }
    const normalized = new Map<number, string>();
    for (const a of mol.atoms) normalized.set(a.id, String(labelMap.get(newLabels.get(a.id)!)!));

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

function bondSymbolForOutput(bond: Bond, childId: number, molecule: Molecule, parentId: number | null, duplicates: Set<number>, labels: Map<number, string>): string {
  if (bond.type === BondType.SINGLE && parentId !== null) {
    // Check if either end of this bond is connected to a double bond
    const parentDoubleBond = molecule.bonds.find(b => 
      b.type === BondType.DOUBLE && 
      (b.atom1 === parentId || b.atom2 === parentId)
    );
    
    const childDoubleBond = molecule.bonds.find(b => 
      b.type === BondType.DOUBLE && 
      (b.atom1 === childId || b.atom2 === childId)
    );
    
    const doubleBondCarbon = parentDoubleBond ? parentId : (childDoubleBond ? childId : null);
    const doubleBond = parentDoubleBond || childDoubleBond;
    
    if (!doubleBond) {
      const hasExplicitStereo = bond.stereo && bond.stereo !== StereoType.NONE;
      if (!hasExplicitStereo) {
        const parentAtom = molecule.atoms.find(a => a.id === parentId);
        const childAtom = molecule.atoms.find(a => a.id === childId);
        if (parentAtom?.aromatic && childAtom?.aromatic) {
          return '-';
        }
        return '';
      }
      
      const sameDirection = bond.atom1 === parentId;
      if (sameDirection) {
        return bond.stereo === StereoType.UP ? '/' : '\\';
      } else {
        return bond.stereo === StereoType.UP ? '\\' : '/';
      }
    }
    
    // Get all single-bond substituents on the double-bond carbon (excluding the double bond itself)
    const allSubstituents = molecule.bonds.filter(b => 
      b.type === BondType.SINGLE &&
      (b.atom1 === doubleBondCarbon || b.atom2 === doubleBondCarbon) &&
      b !== doubleBond
    );
    
    // Check if any substituent has stereo info
    const hasStereoInfo = allSubstituents.some(b => b.stereo && b.stereo !== StereoType.NONE);
    if (!hasStereoInfo) {
      return '';
    }
    
    // If this bond doesn't connect to the double-bond carbon, no stereo
    const connectsToDoubleBondCarbon = (bond.atom1 === doubleBondCarbon || bond.atom2 === doubleBondCarbon);
    if (!connectsToDoubleBondCarbon) {
      return '';
    }
    
    if (allSubstituents.length > 1) {
      const subs = allSubstituents.map(b => ({
        bond: b,
        atom: b.atom1 === doubleBondCarbon ? b.atom2 : b.atom1,
        hasStereo: b.stereo && b.stereo !== StereoType.NONE
      }));
      
      subs.sort((a, b) => {
        const la = labels.get(a.atom)!;
        const lb = labels.get(b.atom)!;
        return la.localeCompare(lb);
      });
      
      const highestPriority = subs[0]!;
      
      if (highestPriority.bond !== bond) {
        return '';
      }
      
      if (!highestPriority.hasStereo) {
        const referenceSub = subs.find(s => s.hasStereo);
        if (!referenceSub) return '';
        
        const refBond = referenceSub.bond;
        const refStereo = refBond.stereo!;
        
        const refSameDir = refBond.atom1 === doubleBondCarbon;
        const ourSameDir = bond.atom1 === doubleBondCarbon;
        
        const invertStereo = refSameDir === ourSameDir;
        const computedStereo = invertStereo 
          ? (refStereo === StereoType.UP ? StereoType.DOWN : StereoType.UP)
          : refStereo;
        
        const sameDirection = bond.atom1 === parentId;
        
        let output;
        if (sameDirection) {
          output = computedStereo === StereoType.UP ? '/' : '\\';
        } else {
          output = computedStereo === StereoType.UP ? '\\' : '/';
        }
        
        return output;
      }
    }
    
    const hasExplicitStereo = bond.stereo && bond.stereo !== StereoType.NONE;
    if (!hasExplicitStereo) return '';
    
    const sameDirection = bond.atom1 === parentId;
    let output;
    if (sameDirection) {
      output = bond.stereo === StereoType.UP ? '/' : '\\';
    } else {
      output = bond.stereo === StereoType.UP ? '\\' : '/';
    }
    return output;
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

function findRingAtoms(atom1: number, atom2: number, molecule: Molecule): Set<number> {
  const ringAtoms = new Set<number>();
  const queue: [number, number[]][] = [[atom2, [atom1, atom2]]];
  const visited = new Set<number>([atom1, atom2]);
  const directBond = molecule.bonds.find(b => 
    (b.atom1 === atom1 && b.atom2 === atom2) || (b.atom1 === atom2 && b.atom2 === atom1)
  );
  
  while (queue.length > 0) {
    const [current, path] = queue.shift()!;
    
    for (const [neighbor, bond] of getNeighbors(current, molecule)) {
      if (bond === directBond) continue;
      
      if (neighbor === atom1) {
        if (path.length >= 2) {
          path.forEach(a => ringAtoms.add(a));
          return ringAtoms;
        }
      } else if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, [...path, neighbor]]);
      }
    }
  }
  
  return ringAtoms;
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

