import type { Atom, Bond, Molecule } from './types';

export function generateSMILES(molecule: Molecule): string {
  if (molecule.atoms.length === 0) return '';

  // Simple SMILES generator (not canonical)
  const visited = new Set<number>();
  const ringLabels = new Map<number, number>(); // atom id to ring label
  let ringCounter = 1;

  // Find rings and assign labels
  for (const atom of molecule.atoms) {
    if (!visited.has(atom.id)) {
      dfs(atom.id, -1, visited, ringLabels, ringCounter, molecule);
    }
  }

  // Generate SMILES starting from first atom
  const smiles: string[] = [];
  const atomStack: number[] = [];
  const bondStack: string[] = [];
  const branchStack: string[] = [];

  generateFromAtom(molecule.atoms[0]!.id, -1, smiles, atomStack, bondStack, branchStack, molecule, ringLabels);

  return smiles.join('');
}

function dfs(atomId: number, parentId: number, visited: Set<number>, ringLabels: Map<number, number>, ringCounter: number, molecule: Molecule): number {
  visited.add(atomId);
  let counter = ringCounter;

  const neighbors = getNeighbors(atomId, molecule);
  for (const [neighborId, bond] of neighbors) {
    if (neighborId === parentId) continue;
    if (visited.has(neighborId)) {
      // back edge, ring
      if (!ringLabels.has(atomId)) {
        ringLabels.set(atomId, counter++);
      }
      if (!ringLabels.has(neighborId)) {
        ringLabels.set(neighborId, counter++);
      }
    } else {
      counter = dfs(neighborId, atomId, visited, ringLabels, counter, molecule);
    }
  }

  return counter;
}

function generateFromAtom(
  atomId: number,
  parentId: number,
  smiles: string[],
  atomStack: number[],
  bondStack: string[],
  branchStack: string[],
  molecule: Molecule,
  ringLabels: Map<number, number>
) {
  const atom = molecule.atoms.find(a => a.id === atomId)!;
  let symbol = atom.aromatic ? atom.symbol.toLowerCase() : atom.symbol;

  if (atom.isBracket) {
    smiles.push('[');
  }

  smiles.push(symbol);

  // Add isotope
  if (atom.isotope) {
    smiles.push(atom.isotope.toString());
  }

  // Add chiral
  if (atom.chiral) {
    smiles.push(atom.chiral);
  }

  // Add hydrogens if bracket
  if (atom.isBracket && atom.hydrogens > 0) {
    smiles.push('H');
    if (atom.hydrogens > 1) smiles.push(atom.hydrogens.toString());
  }

  // Add charge
  if (atom.isBracket) {
    if (atom.charge > 0) {
      smiles.push('+');
      if (atom.charge > 1) smiles.push(atom.charge.toString());
    } else if (atom.charge < 0) {
      smiles.push('-');
      if (atom.charge < -1) smiles.push((-atom.charge).toString());
    }
  }

  if (atom.isBracket) {
    smiles.push(']');
  }

  // Add ring labels
  for (const label of atom.ringClosures) {
    smiles.push(label.toString());
  }

  atomStack.push(atomId);

  const neighbors = getNeighbors(atomId, molecule);
  const children = neighbors.filter(([id]) => id !== parentId);

  for (let i = 0; i < children.length; i++) {
    const [childId, bond] = children[i]!;
    if (i > 0) {
      // branch
      smiles.push('(');
      branchStack.push(')');
    }

    // bond
    if (bond.type === 'double') smiles.push('=');
    else if (bond.type === 'triple') smiles.push('#');

    generateFromAtom(childId, atomId, smiles, atomStack, bondStack, branchStack, molecule, ringLabels);

    if (i > 0) {
      smiles.push(branchStack.pop()!);
    }
  }

  atomStack.pop();
}

function getNeighbors(atomId: number, molecule: Molecule): [number, Bond][] {
  return molecule.bonds
    .filter(b => b.atom1 === atomId || b.atom2 === atomId)
    .map(b => [b.atom1 === atomId ? b.atom2 : b.atom1, b]);
}