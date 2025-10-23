import type { Atom, Bond, Molecule } from 'types';
import { analyzeRings } from './ring-analysis';
import { bondKey, getBondsForAtom, getHeavyNeighborCount, hasDoubleBond, hasTripleBond, hasCarbonylBond } from './bond-utils';
import { MoleculeGraph } from './molecular-graph';
import { findAllRings } from './sssr-kekule';

export function enrichMolecule(mol: Molecule, mg?: MoleculeGraph): Molecule {
  const ringInfo = analyzeRings(mol, mg);

  // For SMARTS [R] primitive, use all cycles (not just SSSR) to match RDKit behavior
  const allCycles = findAllRings(mol.atoms as Atom[], mol.bonds as Bond[]);

  const enrichedRingInfo = {
    atomRings: buildAtomRingsMap(allCycles),
    bondRings: buildBondRingsMap(allCycles, mol.bonds),
    rings: ringInfo.rings, // Keep SSSR for other purposes
  };

  const enrichedAtoms = enrichAtoms(mol, ringInfo, enrichedRingInfo);
  const enrichedBonds = enrichBonds(mol, ringInfo, enrichedRingInfo);

  return {
    atoms: enrichedAtoms,
    bonds: enrichedBonds,
    rings: ringInfo.rings,
    ringInfo: enrichedRingInfo,
  };
}

function buildAtomRingsMap(rings: number[][]): Map<number, Set<number>> {
  const atomRings = new Map<number, Set<number>>();

  rings.forEach((ring, ringIdx) => {
    ring.forEach(atomId => {
      if (!atomRings.has(atomId)) {
        atomRings.set(atomId, new Set());
      }
      atomRings.get(atomId)!.add(ringIdx);
    });
  });

  return atomRings;
}

function buildBondRingsMap(rings: number[][], bonds: readonly Bond[]): Map<string, Set<number>> {
  const bondRings = new Map<string, Set<number>>();

  rings.forEach((ring, ringIdx) => {
    bonds.forEach(bond => {
      if (ring.includes(bond.atom1) && ring.includes(bond.atom2)) {
        const key = bondKey(bond.atom1, bond.atom2);
        if (!bondRings.has(key)) {
          bondRings.set(key, new Set());
        }
        bondRings.get(key)!.add(ringIdx);
      }
    });
  });

  return bondRings;
}

function enrichAtoms(
  mol: Molecule, 
  ringInfo: ReturnType<typeof analyzeRings>,
  enrichedRingInfo: { atomRings: Map<number, Set<number>> }
): Atom[] {
  return mol.atoms.map(atom => {
    const degree = getHeavyNeighborCount(mol.bonds, atom.id, mol.atoms);
    const isInRing = ringInfo.isAtomInRing(atom.id);
    const ringIds = isInRing ? [...(enrichedRingInfo.atomRings.get(atom.id) || [])] : [];
    const hybridization = determineHybridization(atom, mol.bonds, mol.atoms);
    
    return {
      ...atom,
      degree,
      isInRing,
      ringIds,
      hybridization,
    };
  });
}

function enrichBonds(
  mol: Molecule, 
  ringInfo: ReturnType<typeof analyzeRings>,
  enrichedRingInfo: { bondRings: Map<string, Set<number>> }
): Bond[] {
  return mol.bonds.map(bond => {
    const key = bondKey(bond.atom1, bond.atom2);
    const isInRing = ringInfo.isBondInRing(bond.atom1, bond.atom2);
    const ringIds = isInRing ? [...(enrichedRingInfo.bondRings.get(key) || [])] : [];
    const isRotatable = isRotatableBond(bond, mol, ringInfo);
    
    return {
      ...bond,
      isInRing,
      ringIds,
      isRotatable,
    };
  });
}

function determineHybridization(atom: Atom, bonds: readonly Bond[], atoms: readonly Atom[]): 'sp' | 'sp2' | 'sp3' | 'other' {
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
