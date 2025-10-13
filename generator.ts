import type { Molecule, Bond } from './types';
import { BondType, StereoType } from './types';

// Internal canonical-ish SMILES generator using iterative atom invariants+
// deterministic traversal to approximate RDKit's canonical SMILES for common cases.

export function generateSMILES(molecule: Molecule): string {
  if (molecule.atoms.length === 0) return '';

  // Canonicalize stereo: omit stereo if substituents are symmetric
  for (const atom of molecule.atoms) {
    if (atom.chiral) {
      const neighbors = getNeighbors(atom.id, molecule).map(([id]) => molecule.atoms.find(a => a.id === id)!);
      const invariants = neighbors.map(n => n.symbol + (n.chiral ? '@' : ''));
      const sorted = [...invariants].sort();
      let hasDuplicate = false;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1]) {
          hasDuplicate = true;
          break;
        }
      }
      if (hasDuplicate) {
        atom.chiral = null;
        // If now can be organic, make it so
        if (atom.symbol === 'C' && atom.hydrogens === 1 && atom.charge === 0 && !atom.isotope) {
          atom.isBracket = false;
          atom.hydrogens = 0;
        }
      }
    }
  }

  const labels = canonicalLabels(molecule);

  // Choose root atom deterministically: lowest label, tie-break by id
  const atomsSorted = [...molecule.atoms].sort((a, b) => {
    const la = labels.get(a.id)!;
    const lb = labels.get(b.id)!;
    if (la < lb) return -1;
    if (la > lb) return 1;
    return a.id - b.id;
  });

  // Calculate degrees
  const degrees = new Map<number, number>();
  for (const bond of molecule.bonds) {
    degrees.set(bond.atom1, (degrees.get(bond.atom1) || 0) + 1);
    degrees.set(bond.atom2, (degrees.get(bond.atom2) || 0) + 1);
  }

  // Choose root: lowest degree, tie-break by id
  let root = atomsSorted[0]!.id;
  let minDegree = degrees.get(root) || 0;
  for (const atom of molecule.atoms) {
    const deg = degrees.get(atom.id) || 0;
    if (deg < minDegree || (deg === minDegree && atom.id < root)) {
      minDegree = deg;
      root = atom.id;
    }
  }

  // Prepare ring numbering map and seen set
  const ringNumbers = new Map<string, number>();
  let ringCounter = 1;
  const seen = new Set<number>();

  const out: string[] = [];

  const visit = (atomId: number, parentId: number | null) => {
    const atom = molecule.atoms.find(a => a.id === atomId)!;
    const sym = atom.aromatic ? atom.symbol.toLowerCase() : atom.symbol;

    // Build atom text once
    if (atom.isBracket) out.push('[');
    out.push(sym);
    if (atom.isotope) out.push(atom.isotope.toString());
    if (atom.chiral) out.push(atom.chiral);
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

    seen.add(atomId);

    // neighbors excluding parent
    const neighbors = getNeighbors(atomId, molecule).filter(([nid]) => nid !== parentId);

    // sort neighbors deterministically using their canonical labels and bond type
    neighbors.sort((x, y) => {
      const [aId, aBond] = x;
      const [bId, bBond] = y;
      const la = labels.get(aId)!;
      const lb = labels.get(bId)!;
      if (la < lb) return -1;
      if (la > lb) return 1;
      // tie-break by bond type weight
      const w = bondPriority(aBond) - bondPriority(bBond);
      if (w !== 0) return w;
      // tie-break by atom id
      return aId - bId;
    });

    for (let i = 0; i < neighbors.length; i++) {
      const [nid, bond] = neighbors[i]!;
      const bondStr = bondSymbolForOutput(bond, nid, molecule);
      const key = bondKey(atomId, nid);

      if (seen.has(nid)) {
        // ring closure: output a ring number (assign if needed)
        const rkey = bondKey(atomId, nid);
        let num = ringNumbers.get(rkey);
        if (!num) {
          num = ringCounter++;
          ringNumbers.set(rkey, num);
        }
        const numStr = num < 10 ? String(num) : `%${String(num).padStart(2, '0')}`;
        out.push(bondStr + numStr);
      } else {
        if (i === 0) {
          out.push(bondStr);
          visit(nid, atomId);
        } else {
          out.push('(' + bondStr);
          visit(nid, atomId);
          out.push(')');
        }
      }
    }
  };

  visit(root, null);

  return out.join('');
}

function canonicalLabels(mol: Molecule): Map<number, string> {
  // initial labels: element, aromatic, isotope, charge, chiral, explicit H count, degree
  const labels = new Map<number, string>();
  for (const a of mol.atoms) {
    const deg = getNeighbors(a.id, mol).length;
    const lbl = [a.symbol, a.aromatic ? 'ar' : 'al', a.isotope || 0, a.charge || 0, a.chiral || '', a.hydrogens || 0, deg].join('|');
    labels.set(a.id, lbl);
  }

  // iterative refinement using neighbor multisets
  const maxIter = 8;
  for (let iter = 0; iter < maxIter; iter++) {
    const newLabels = new Map<number, string>();
    for (const a of mol.atoms) {
      const neigh = getNeighbors(a.id, mol)
        .map(([nid, b]) => `${b.type}:${labels.get(nid)}:${b.stereo}`)
        .sort();
      const combined = labels.get(a.id)! + '|' + neigh.join(',');
      newLabels.set(a.id, combined);
    }

    // normalize to short canonical strings
    const uniq = new Map<string, number>();
    let counter = 1;
    for (const a of mol.atoms) {
      const s = newLabels.get(a.id)!;
      if (!uniq.has(s)) uniq.set(s, counter++);
    }
    const normalized = new Map<number, string>();
    for (const a of mol.atoms) normalized.set(a.id, String(uniq.get(newLabels.get(a.id)!)!));

    // check for convergence
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

  return labels;
}

function bondPriority(b: Bond): number {
  switch (b.type) {
    case BondType.TRIPLE: return -3;
    case BondType.DOUBLE: return -2;
    case BondType.SINGLE: return -1;
    case BondType.AROMATIC: return -4;
    default: return 0;
  }
}

function bondSymbolForOutput(bond: Bond, childId: number, molecule: Molecule): string {
  if (bond.type === BondType.SINGLE) {
    if (bond.stereo && bond.stereo !== StereoType.NONE) return bond.stereo === StereoType.UP ? '/' : '\\';
    // check adjacent double bond on child side
    const dbl = molecule.bonds.find(x => x.type === BondType.DOUBLE && x.stereo && x.stereo !== StereoType.NONE && (x.atom1 === childId || x.atom2 === childId));
    if (dbl) return dbl.stereo === StereoType.UP ? '/' : '\\';
    return '';
  }
  if (bond.type === BondType.DOUBLE) return '=';
  if (bond.type === BondType.TRIPLE) return '#';
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
