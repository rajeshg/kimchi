import type { Molecule, Bond } from 'types';
import { BondType } from 'types';

export interface AromaticRing {
  ringId: number;
  atoms: number[];
  bonds: Bond[];
}

export function detectAromaticRings(molecule: Molecule): AromaticRing[] {
  const aromaticRings: AromaticRing[] = [];
  
  if (!molecule.ringInfo) return aromaticRings;
  
  for (let rid = 0; rid < molecule.ringInfo.rings.length; rid++) {
    const ring = molecule.ringInfo.rings[rid];
    if (!ring) continue;
    
    const ringAtomIds: number[] = Array.from(ring);
    const allAromatic = ringAtomIds.every(atomId => {
      const atom = molecule.atoms.find(a => a.id === atomId);
      return atom?.aromatic === true;
    });
    
    if (!allAromatic || ringAtomIds.length < 5 || ringAtomIds.length > 7) {
      continue;
    }
    
    const ringBonds: Bond[] = molecule.bonds.filter(bond => {
      return ringAtomIds.includes(bond.atom1) && ringAtomIds.includes(bond.atom2);
    });
    
    const allBondsAromatic = ringBonds.length > 0 && ringBonds.every(bond => bond.type === BondType.AROMATIC);
    
    let allBondsAlternating = false;
    if (ringBonds.length > 0 && ringBonds.length === ringAtomIds.length) {
      const orderedBonds = orderBondsInRing(ringAtomIds, ringBonds);
      allBondsAlternating = checkAlternatingBonds(orderedBonds);
    }
    
    if ((allBondsAromatic || allBondsAlternating) && ringBonds.length === ringAtomIds.length) {
      aromaticRings.push({ ringId: rid, atoms: ringAtomIds, bonds: ringBonds });
    }
  }
  
  return aromaticRings;
}

function orderBondsInRing(ringAtomIds: number[], ringBonds: Bond[]): Bond[] {
  const orderedBonds: Bond[] = [];
  for (let i = 0; i < ringAtomIds.length; i++) {
    const a1 = ringAtomIds[i]!;
    const a2 = ringAtomIds[(i + 1) % ringAtomIds.length]!;
    const bond = ringBonds.find(b => 
      (b.atom1 === a1 && b.atom2 === a2) || (b.atom1 === a2 && b.atom2 === a1)
    );
    if (bond) orderedBonds.push(bond);
  }
  return orderedBonds;
}

function checkAlternatingBonds(orderedBonds: Bond[]): boolean {
  if (orderedBonds.length === 0) return false;
  
  let alternatingCount = 0;
  for (let i = 1; i < orderedBonds.length; i++) {
    const bond = orderedBonds[i]!;
    const prevBond = orderedBonds[i - 1]!;
    if ((bond.type === BondType.SINGLE && prevBond.type === BondType.DOUBLE) ||
        (bond.type === BondType.DOUBLE && prevBond.type === BondType.SINGLE)) {
      alternatingCount++;
    }
  }
  return alternatingCount >= orderedBonds.length - 2;
}
