import type { Atom, Bond, Molecule } from 'types';
import { analyzeRings } from './ring-utils';
import { bondKey, getBondsForAtom, getHeavyNeighborCount, hasDoubleBond, hasTripleBond, hasCarbonylBond } from './bond-utils';

export function enrichMolecule(mol: Molecule): void {
  const ringInfo = analyzeRings(mol.atoms, mol.bonds);
  
  mol.rings = ringInfo.rings;
  mol.ringInfo = {
    atomRings: buildAtomRingsMap(ringInfo.rings),
    bondRings: buildBondRingsMap(ringInfo.rings, mol.bonds),
    rings: ringInfo.rings,
  };
  
  enrichAtoms(mol, ringInfo);
  enrichBonds(mol, ringInfo);
}

function buildAtomRingsMap(rings: number[][]): Map<number, Set<number>> {
  const atomRings = new Map<number, Set<number>>();
  
  for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
    const ring = rings[ringIdx]!;
    for (const atomId of ring) {
      if (!atomRings.has(atomId)) {
        atomRings.set(atomId, new Set());
      }
      atomRings.get(atomId)!.add(ringIdx);
    }
  }
  
  return atomRings;
}

function buildBondRingsMap(rings: number[][], bonds: Bond[]): Map<string, Set<number>> {
  const bondRings = new Map<string, Set<number>>();
  
  for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
    const ring = rings[ringIdx]!;
    for (const bond of bonds) {
      const atom1InThisRing = ring.includes(bond.atom1);
      const atom2InThisRing = ring.includes(bond.atom2);
      
      if (atom1InThisRing && atom2InThisRing) {
        const key = bondKey(bond.atom1, bond.atom2);
        if (!bondRings.has(key)) {
          bondRings.set(key, new Set());
        }
        bondRings.get(key)!.add(ringIdx);
      }
    }
  }
  
  return bondRings;
}

function enrichAtoms(mol: Molecule, ringInfo: ReturnType<typeof analyzeRings>): void {
  for (const atom of mol.atoms) {
    atom.degree = getHeavyNeighborCount(mol.bonds, atom.id, mol.atoms);
    atom.isInRing = ringInfo.isAtomInRing(atom.id);
    
    if (atom.isInRing) {
      atom.ringIds = [...(mol.ringInfo!.atomRings.get(atom.id) || [])];
    } else {
      atom.ringIds = [];
    }
    
    atom.hybridization = determineHybridization(atom, mol.bonds, mol.atoms);
  }
}

function enrichBonds(mol: Molecule, ringInfo: ReturnType<typeof analyzeRings>): void {
  for (const bond of mol.bonds) {
    const key = bondKey(bond.atom1, bond.atom2);
    bond.isInRing = ringInfo.isBondInRing(bond.atom1, bond.atom2);
    
    if (bond.isInRing) {
      bond.ringIds = [...(mol.ringInfo!.bondRings.get(key) || [])];
    } else {
      bond.ringIds = [];
    }
    
    bond.isRotatable = isRotatableBond(bond, mol, ringInfo);
  }
}

function determineHybridization(atom: Atom, bonds: Bond[], atoms: Atom[]): 'sp' | 'sp2' | 'sp3' | 'other' {
  if (atom.aromatic) return 'sp2';
  
  const atomBonds = getBondsForAtom(bonds, atom.id);
  
  const hasTriple = atomBonds.some(b => b.type === 'triple');
  if (hasTriple) return 'sp';
  
  const hasDouble = atomBonds.some(b => b.type === 'double');
  if (hasDouble) return 'sp2';
  
  const heavyNeighbors = getHeavyNeighborCount(bonds, atom.id, atoms);
  
  if (heavyNeighbors <= 3) return 'sp3';
  
  return 'other';
}

function isRotatableBond(bond: Bond, mol: Molecule, ringInfo: ReturnType<typeof analyzeRings>): boolean {
  if (bond.type !== 'single') return false;
  
  if (ringInfo.isBondInRing(bond.atom1, bond.atom2)) return false;
  
  const atom1 = mol.atoms.find(a => a.id === bond.atom1)!;
  const atom2 = mol.atoms.find(a => a.id === bond.atom2)!;
  
  if (atom1.symbol === 'H' && !atom1.isotope) return false;
  if (atom2.symbol === 'H' && !atom2.isotope) return false;
  
  const heavyNeighbors1 = getHeavyNeighborCount(mol.bonds, atom1.id, mol.atoms);
  const heavyNeighbors2 = getHeavyNeighborCount(mol.bonds, atom2.id, mol.atoms);
  
  if (heavyNeighbors1 < 2 || heavyNeighbors2 < 2) return false;
  
  const atom1InRing = ringInfo.isAtomInRing(atom1.id);
  const atom2InRing = ringInfo.isAtomInRing(atom2.id);
  
  if ((atom1InRing && heavyNeighbors2 === 1) || (atom2InRing && heavyNeighbors1 === 1)) return false;
  
  if (hasTripleBond(mol.bonds, atom1.id) || hasTripleBond(mol.bonds, atom2.id)) return false;
  
  const hasDoubleBond1 = !atom1.aromatic && hasDoubleBond(mol.bonds, atom1.id);
  const hasDoubleBond2 = !atom2.aromatic && hasDoubleBond(mol.bonds, atom2.id);
  
  if (heavyNeighbors1 >= 4 && !atom1InRing && !hasDoubleBond1) return false;
  if (heavyNeighbors2 >= 4 && !atom2InRing && !hasDoubleBond2) return false;
  
  const hasCarbonyl1 = hasCarbonylBond(mol.bonds, atom1.id, mol.atoms);
  const hasCarbonyl2 = hasCarbonylBond(mol.bonds, atom2.id, mol.atoms);
  
  const isHeteroatom1 = atom1.symbol !== 'C' && atom1.symbol !== 'H';
  const isHeteroatom2 = atom2.symbol !== 'C' && atom2.symbol !== 'H';
  
  if ((hasCarbonyl1 && isHeteroatom2) || (hasCarbonyl2 && isHeteroatom1)) return false;
  
  return true;
}
