 import type { Atom, Bond, Molecule } from 'types';
 import { BondType } from 'types';
 import { range } from 'es-toolkit';
 import { getRingAtoms, getRingBonds } from './ring-analysis';
 import { getBondsForAtom } from './bond-utils';
 import { MoleculeGraph } from './molecular-graph';

type MutableAtom = { -readonly [K in keyof Atom]: Atom[K] };
type MutableBond = { -readonly [K in keyof Bond]: Bond[K] };

interface FusedSystem {
  rings: number[][];
  atoms: Set<number>;
  bonds: Set<string>;
}

function bondKey(atom1: number, atom2: number): string {
  return `${Math.min(atom1, atom2)}-${Math.max(atom1, atom2)}`;
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
      const a1 = ring[j]!;
      const a2 = ring[(j + 1) % ring.length]!;
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
          
          for (const atomId of otherRing) {
            system.atoms.add(atomId);
          }
          
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
    
    if (hasExocyclicDoubleBondToElectronegative(atom, ringSet, bonds)) {
      return true;
    }
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
      
      const hasDoubleBondInRingC = ringBonds.some(b => 
        b.type === BondType.DOUBLE || b.type === BondType.AROMATIC
      );
      if (hasDoubleBondInRingC) return 1;
      
      return 0;
      
    case 'N':
      if (hasExocyclicDouble) return 0;
      
      if (atom.charge > 0) return 1;
      
      if (atom.hydrogens > 0) return 2;
      
      if (bondCount === 3 && ringBonds.length === 2) {
        return 2;
      }
      
      const hasDoubleBondInRing = ringBonds.some(b => 
        b.type === BondType.DOUBLE || b.type === BondType.AROMATIC
      );
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
      if (atom.charge === -1 || originalAromaticFlags[atom.id]) {
        return 2;
      }
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

function hasConjugatedSystem(
  ringAtoms: Set<number>, 
  atoms: Atom[], 
  bonds: Bond[],
  originalBondTypes: Record<string, BondType>
): boolean {
  const bondKeyFn = (a1: number, a2: number) => {
    const [min, max] = a1 < a2 ? [a1, a2] : [a2, a1];
    return `${min}-${max}`;
  };
  
  for (const atomId of ringAtoms) {
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) return false;
    
    const isConjugatable = 
      ['C', 'N', 'O', 'S', 'P', 'As', 'Se', 'B'].includes(atom.symbol);
    
    if (!isConjugatable) {
      return false;
    }
    
    const atomBonds = getBondsForAtom(bonds, atom.id);
    const ringBonds = atomBonds.filter(b => {
      const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
      return ringAtoms.has(otherId);
    });
    
    const hasDoubleBond = ringBonds.some(b => {
      const key = bondKeyFn(b.atom1, b.atom2);
      const originalType = originalBondTypes[key];
      return originalType === BondType.DOUBLE || originalType === BondType.AROMATIC;
    });
    
    if (atom.symbol === 'C') {
      if (!hasDoubleBond && atom.hydrogens >= 1) {
        return false;
      }
    }
  }
  
  return true;
}

function isRingHuckelAromatic(
  ring: number[],
  atoms: Atom[],
  bonds: Bond[],
  originalAromaticFlags: Record<number, boolean>,
  originalBondTypes: Record<string, BondType>
): boolean {
  const ringSet = new Set(ring);
  
  if (!hasConjugatedSystem(ringSet, atoms, bonds, originalBondTypes)) {
    return false;
  }
  
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
  originalAromaticFlags: Record<number, boolean>,
  originalBondTypes: Record<string, BondType>
): boolean {
  const systemAtoms = Array.from(fusedSystem.atoms);
  const systemAtomSet = new Set(systemAtoms);
  
  if (!hasConjugatedSystem(systemAtomSet, atoms, bonds, originalBondTypes)) {
    return false;
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

export function perceiveAromaticity(atoms: readonly Atom[], bonds: readonly Bond[]): { atoms: Atom[]; bonds: Bond[] } {
  const mutableAtoms: MutableAtom[] = atoms.map(a => ({ ...a, ringIds: a.ringIds ? [...a.ringIds] : undefined }));
  const mutableBonds: MutableBond[] = bonds.map(b => ({ ...b, ringIds: b.ringIds ? [...b.ringIds] : undefined }));
  perceiveAromaticityMutable(mutableAtoms, mutableBonds);
  return { atoms: mutableAtoms, bonds: mutableBonds };
}

function perceiveAromaticityMutable(atoms: MutableAtom[], bonds: MutableBond[]): void {
  const mol: Molecule = { atoms: atoms as Atom[], bonds: bonds as Bond[] };
  const mg = new MoleculeGraph(mol);
  const allRings = mg.cycles;
  if (allRings.length === 0) return;

  const originalBondTypes: Record<string, Bond['type']> = {};
  const originalAromaticFlags: Record<number, boolean> = {};

  for (const b of bonds) {
    const key = bondKey(b.atom1, b.atom2);
    originalBondTypes[key] = b.type;
  }

  for (const atom of atoms) {
    originalAromaticFlags[atom.id] = atom.aromatic;
    atom.aromatic = false;
  }

  const rings = allRings.filter(r => r.length >= 5 && r.length <= 7);
  if (rings.length === 0) return;

  const aromaticRings: number[][] = [];
  const ringsInFusedSystems = new Set<number[]>();
  
  const fusedSystems = findFusedSystems(rings);
  
  for (const system of fusedSystems) {
    if (system.rings.length === 1) {
      const ring = system.rings[0]!;
      if (isRingHuckelAromatic(ring, atoms, bonds, originalAromaticFlags, originalBondTypes)) {
        aromaticRings.push(ring);
      }
    } else {
      if (isFusedSystemAromatic(system, atoms, bonds, originalAromaticFlags, originalBondTypes)) {
        for (const ring of system.rings) {
          aromaticRings.push(ring);
          ringsInFusedSystems.add(ring);
        }
      } else {
        for (const ring of system.rings) {
          if (isRingHuckelAromatic(ring, atoms, bonds, originalAromaticFlags, originalBondTypes)) {
            aromaticRings.push(ring);
            ringsInFusedSystems.add(ring);
          }
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
      if (atom) {
        atom.aromatic = true;
      }
    }

    const ringBonds = getRingBonds(ring, bonds as Bond[]).map(b => ({ ...b }));
    for (const bond of ringBonds) {
      bond.type = BondType.AROMATIC;
      // Update the original bond in the bonds array
      const originalBond = bonds.find(b => b.atom1 === bond.atom1 && b.atom2 === bond.atom2);
      if (originalBond) {
        (originalBond as any).type = BondType.AROMATIC;
      }
    }
  }

  for (const ring of aromaticRings) {
    if (ringsInFusedSystems.has(ring)) continue;
    
    const ringAtoms = getRingAtoms(ring, atoms as Atom[]).map(a => a as MutableAtom);
    
    for (const atom of ringAtoms) {
      const exoDouble = hasExocyclicDoubleBondToElectronegative(
        atom as Atom,
        new Set(ring),
        bonds as Bond[]
      );

      if (exoDouble) {
        atom.aromatic = false;
        
        const ringBonds = getBondsForAtom(bonds as Bond[], atom.id).filter(b =>
          ring.includes(b.atom1) && ring.includes(b.atom2)
        ) as MutableBond[];
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
    for (const bond of ringBonds) {
      aromaticBonds.add(bondKey(bond.atom1, bond.atom2));
    }
  }

  for (const bond of bonds) {
    const k = bondKey(bond.atom1, bond.atom2);
    if (!aromaticBonds.has(k) && bond.type === BondType.AROMATIC) {
      bond.type = originalBondTypes[k] === BondType.AROMATIC ? BondType.SINGLE : (originalBondTypes[k] ?? BondType.SINGLE);
    }
  }

  kekulizeNonAromaticRings(rings, aromaticRings, atoms, bonds, originalBondTypes);
}

function kekulizeNonAromaticRings(
  allRings: number[][],
  aromaticRings: number[][],
  atoms: MutableAtom[],
  bonds: MutableBond[],
  originalBondTypes: Record<string, BondType>
): void {
  const aromaticRingSet = new Set(aromaticRings.map(ring => ring.join(',')));
  
  const aromaticBondSet = new Set<string>();
  for (const ring of aromaticRings) {
    for (let i = 0; i < ring.length; i++) {
      const a1 = ring[i]!;
      const a2 = ring[(i + 1) % ring.length]!;
      aromaticBondSet.add(bondKey(a1, a2));
    }
  }
  
  for (const ring of allRings) {
    if (aromaticRingSet.has(ring.join(','))) continue;
    
    const ringBonds = getRingBonds(ring, bonds);
    const aromaticBondCount = ringBonds.filter(b => {
      const k = bondKey(b.atom1, b.atom2);
      return originalBondTypes[k] === BondType.AROMATIC;
    }).length;
    
    if (aromaticBondCount === 0) continue;
    if (aromaticBondCount < ringBonds.length) continue;
    
    kekulizeRing(ring, atoms, bonds, originalBondTypes, aromaticBondSet);
  }
}

function kekulizeRing(
  ring: number[],
  atoms: MutableAtom[],
  bonds: MutableBond[],
  originalBondTypes: Record<string, BondType>,
  aromaticBondSet: Set<string>
): boolean {
  const ringSet = new Set(ring);
  const atomDegrees: Record<number, number> = {};
  
  for (const atomId of ring) {
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) continue;
    
    const atomBonds = getBondsForAtom(bonds, atom.id);
    let availableDoubleBonds = 0;
    
    const exocyclicBonds = atomBonds.filter(b => {
      const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
      return !ringSet.has(otherId);
    });
    
    const hasExocyclicDouble = exocyclicBonds.some(b => b.type === BondType.DOUBLE);
    
    if (hasExocyclicDouble) {
      availableDoubleBonds = 0;
    } else if (atom.symbol === 'N' && atom.hydrogens > 0) {
      availableDoubleBonds = 0;
    } else if (atom.symbol === 'C') {
      availableDoubleBonds = 1;
    } else if (atom.symbol === 'N') {
      availableDoubleBonds = 1;
    } else {
      availableDoubleBonds = 0;
    }
    
    atomDegrees[atom.id] = availableDoubleBonds;
  }
  
  const assignments: Record<string, BondType> = {};
  
  function backtrack(bondIndex: number): boolean {
    if (bondIndex >= ring.length) {
      for (const atomId of ring) {
        const degree = atomDegrees[atomId];
        if (degree !== undefined && degree !== 0) {
          return false;
        }
      }
      return true;
    }
    
    const atom1 = ring[bondIndex]!;
    const atom2 = ring[(bondIndex + 1) % ring.length]!;
    const k = bondKey(atom1, atom2);
    
    const degree1 = atomDegrees[atom1];
    const degree2 = atomDegrees[atom2];
    
    if (degree1 === undefined || degree2 === undefined) {
      return false;
    }
    
    if (degree1 > 0 && degree2 > 0) {
      assignments[k] = BondType.DOUBLE;
      atomDegrees[atom1] = degree1 - 1;
      atomDegrees[atom2] = degree2 - 1;
      
      if (backtrack(bondIndex + 1)) {
        return true;
      }
      
      atomDegrees[atom1] = degree1;
      atomDegrees[atom2] = degree2;
    }
    
    assignments[k] = BondType.SINGLE;
    if (backtrack(bondIndex + 1)) {
      return true;
    }
    
    return false;
  }
  
  const success = backtrack(0);
  
  if (success) {
    for (const bond of bonds) {
      const k = bondKey(bond.atom1, bond.atom2);
      const assignedType = assignments[k];
      if (assignedType !== undefined && !aromaticBondSet.has(k)) {
        bond.type = assignedType;
      }
    }
  }
  
  return success;
}
