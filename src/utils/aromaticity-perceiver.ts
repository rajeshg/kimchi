import type { Atom, Bond } from 'types';
import { BondType } from 'types';
import { findRings } from './ring-finder';

function countPiElectrons(atom: Atom, bonds: Bond[]): number {
  const atomBonds = bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
  const bondCount = atomBonds.length;
  const hasDouble = atomBonds.some(b => b.type === BondType.DOUBLE);

  switch (atom.symbol) {
    case 'C':
      return 1;
    case 'N':
      if (atom.charge > 0) return 1;
      if (hasDouble) return 1;
      if (atom.hydrogens > 0) return 2;
      return 1;
    case 'O':
    case 'S':
      if (atom.charge !== 0) return 0;
      if (hasDouble) return 0;
      if (bondCount === 2) return 2;
      return 0;
    case 'B':
      if (atom.charge === -1 || atom.aromatic) {
        return 2;
      }
      return 0;
    case 'P':
      if (atom.charge > 0) return 0;
      if (hasDouble) return 1;
      if (atom.hydrogens > 0) return 2;
      return 1;
    case 'As':
      return atom.hydrogens > 0 ? 2 : 1;
    case 'Se':
      if (atom.charge !== 0) return 0;
      if (hasDouble) return 0;
      if (bondCount === 2) return 2;
      return 0;
    default:
      return 0;
  }
}

function isHuckelAromatic(ringAtoms: Atom[], ringBonds: Bond[]): boolean {
  let totalPiElectrons = 0;

  for (const atom of ringAtoms) {
    totalPiElectrons += countPiElectrons(atom, ringBonds);
  }

  return totalPiElectrons >= 2 && (totalPiElectrons - 2) % 4 === 0;
}

function hasConjugatedSystem(ring: number[], atoms: Atom[], bonds: Bond[]): boolean {
  const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
  const ringBonds = bonds.filter(b =>
    ring.includes(b.atom1) && ring.includes(b.atom2)
  );

  for (const atom of ringAtoms) {
    const atomBonds = ringBonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
    const hasDouble = atomBonds.some(b => b.type === BondType.DOUBLE);
    
    const isConjugatable = 
      (atom.symbol === 'C' && hasDouble) ||
      ['N', 'O', 'S', 'P', 'As', 'Se', 'B'].includes(atom.symbol);

    if (!isConjugatable) {
      return false;
    }
  }

  const doubleOrAromaticBonds = ringBonds.filter(b => 
    b.type === BondType.DOUBLE || b.type === BondType.AROMATIC
  );

  return doubleOrAromaticBonds.length >= Math.floor(ring.length / 2);
}

function isCompositeRing(ring: number[], smallerRings: number[][]): boolean {
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



export function perceiveAromaticity(atoms: Atom[], bonds: Bond[]): void {
  const allRings = findRings(atoms, bonds);
  if (allRings.length === 0) return;

  const rings = allRings.filter(ring => {
    const smallerRings = allRings.filter(r => r.length < ring.length);
    return !isCompositeRing(ring, smallerRings);
  });

  const aromaticRings: number[][] = [];
 
  // preserve original bond types so we can restore when needed
  const originalBondTypes: Record<string, Bond['type']> = {};
  for (const b of bonds) {
    const key = `${Math.min(b.atom1, b.atom2)}-${Math.max(b.atom1, b.atom2)}`;
    originalBondTypes[key] = b.type;
  }
 
   for (const ring of rings) {
     if (ring.length < 5 || ring.length > 7) continue;
 
     const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
     const ringBonds = bonds.filter(b =>
       ring.includes(b.atom1) && ring.includes(b.atom2)
     );
 
     if (!hasConjugatedSystem(ring, atoms, bonds)) continue;
 
     if (isHuckelAromatic(ringAtoms, ringBonds)) {
       aromaticRings.push(ring);
     }
   }
 
   // helper to get bond key
   const bondKey = (b: Bond) => `${Math.min(b.atom1, b.atom2)}-${Math.max(b.atom1, b.atom2)}`;
 
   // compute how many aromatic rings each bond participates in
   const bondAromaticCount: Record<string, number> = {};
   for (const ring of aromaticRings) {
     const ringBonds = bonds.filter(b => ring.includes(b.atom1) && ring.includes(b.atom2));
     for (const b of ringBonds) {
       const k = bondKey(b);
       bondAromaticCount[k] = (bondAromaticCount[k] || 0) + 1;
     }
   }
 
   for (const ring of aromaticRings) {
     for (const atomId of ring) {
       const atom = atoms.find(a => a.id === atomId);
       if (atom) {
         atom.aromatic = true;
       }
     }
 
     const ringBonds = bonds.filter(b =>
       ring.includes(b.atom1) && ring.includes(b.atom2)
     );
     for (const bond of ringBonds) {
       bond.type = BondType.AROMATIC;
     }
   }
 
   for (const ring of aromaticRings) {
     const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
     
     for (const atom of ringAtoms) {
       const atomBonds = bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
       const exoDouble = atomBonds.find(b => {
         const otherAtomId = b.atom1 === atom.id ? b.atom2 : b.atom1;
         return b.type === BondType.DOUBLE && !ring.includes(otherAtomId);
       });
 
       if (exoDouble) {
         atom.aromatic = false;
         
         const ringBonds = bonds.filter(b =>
           ring.includes(b.atom1) && ring.includes(b.atom2) &&
           (b.atom1 === atom.id || b.atom2 === atom.id)
         );
         for (const bond of ringBonds) {
           const k = bondKey(bond);
           // if this bond participates in more than one aromatic ring, leave it aromatic
           if ((bondAromaticCount[k] || 0) > 1) continue;
           // otherwise restore original bond type
           bond.type = originalBondTypes[k] ?? BondType.SINGLE;
         }
       }
     }
   }
}
