import type { Bond, Molecule } from 'types';
import { BondType, StereoType } from 'types';
import { uniq } from 'es-toolkit';
import { findRings } from './ring-finder';
import { getBondsForAtom, getOtherAtomId } from './bond-utils';

function getNeighbors(atomId: number, molecule: Molecule): Array<[number, Bond]> {
  const bonds = getBondsForAtom(molecule.bonds, atomId);
  return bonds.map((bond: Bond) => [getOtherAtomId(bond, atomId), bond]);
}

function computeCanonicalLabels(mol: Molecule): Map<number, string> {
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

  const maxIter = 20;
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

  return labels;
}

function hasSymmetricSubstituents(atomId: number, molecule: Molecule, labels: Map<number, string>): boolean {
  const neighbors = getNeighbors(atomId, molecule);
  
  if (neighbors.length < 2) return false;

  const neighborLabels = neighbors.map(([nid]) => labels.get(nid)!);
  const uniqueLabels = new Set(neighborLabels);
  
  if (uniqueLabels.size >= neighborLabels.length) return false;

  const rings = findRings(molecule.atoms, molecule.bonds);
  
  for (let i = 0; i < neighbors.length; i++) {
    for (let j = i + 1; j < neighbors.length; j++) {
      if (neighborLabels[i] === neighborLabels[j]) {
        const [nid1] = neighbors[i]!;
        const [nid2] = neighbors[j]!;
        
        const inSameRing = rings.some((ring: number[]) =>
          ring.includes(nid1) && ring.includes(nid2) && ring.includes(atomId)
        );
        
        if (!inSameRing) {
          return true;
        }
      }
    }
  }
  
  return false;
}

function getDoubleBondSubstituents(atomId: number, doubleBondAtomId: number, molecule: Molecule): number[] {
  const neighbors = getNeighbors(atomId, molecule);
  const explicitSubs = neighbors
    .filter(([nid]) => nid !== doubleBondAtomId)
    .map(([nid]) => nid);
  
  const atom = molecule.atoms.find(a => a.id === atomId);
  const implicitH = atom?.hydrogens || 0;
  
  for (let i = 0; i < implicitH; i++) {
    explicitSubs.push(-1);
  }
  
  return explicitSubs;
}

function hasGeminalIdenticalGroups(bond: Bond, molecule: Molecule, labels: Map<number, string>): boolean {
  const subs1 = getDoubleBondSubstituents(bond.atom1, bond.atom2, molecule);
  const subs2 = getDoubleBondSubstituents(bond.atom2, bond.atom1, molecule);

  if (subs1.length < 2 && subs2.length < 2) return false;

  if (subs1.length === 2) {
    const label1 = subs1[0]! === -1 ? 'H' : labels.get(subs1[0]!)!;
    const label2 = subs1[1]! === -1 ? 'H' : labels.get(subs1[1]!)!;
    if (label1 === label2) return true;
  }

  if (subs2.length === 2) {
    const label1 = subs2[0]! === -1 ? 'H' : labels.get(subs2[0]!)!;
    const label2 = subs2[1]! === -1 ? 'H' : labels.get(subs2[1]!)!;
    if (label1 === label2) return true;
  }

  return false;
}

export function removeInvalidStereo(molecule: Molecule): void {
  const labels = computeCanonicalLabels(molecule);
  const rings = findRings(molecule.atoms, molecule.bonds);

  for (const atom of molecule.atoms) {
    if (atom.chiral && (atom.chiral === '@' || atom.chiral === '@@')) {
      if (atom.atomicNumber === 7 || atom.atomicNumber === 15) {
        atom.chiral = null;
        atom.isBracket = false;
      } else if (atom.atomicNumber === 6 && (atom.hydrogens === 0 || atom.hydrogens === undefined)) {
        const neighbors = getNeighbors(atom.id, molecule);
        if (neighbors.length === 4) {
          const neighborLabels = neighbors.map(([nid]) => labels.get(nid)!);
          const uniqueLabels = new Set(neighborLabels);
          if (uniqueLabels.size < 4) {
            atom.chiral = null;
            atom.isBracket = false;
          }
        }
      } else {
        const inRings = rings.filter((ring: number[]) => ring.includes(atom.id));
        if (inRings.length > 0) {
          const neighbors = getNeighbors(atom.id, molecule);
          const outsideRingNeighbors = neighbors.filter(([nid]) =>
            !inRings.some((ring: number[]) => ring.includes(nid) && ring.includes(atom.id))
          );
          
          if (outsideRingNeighbors.length <= 1) {
            const otherChiralInRing = inRings.some((ring: number[]) =>
              ring.some((ringAtomId: number) => {
                if (ringAtomId === atom.id) return false;
                const ringAtom = molecule.atoms.find(a => a.id === ringAtomId);
                return ringAtom && ringAtom.chiral && (ringAtom.chiral === '@' || ringAtom.chiral === '@@');
              })
            );
            
            if (!otherChiralInRing) {
              atom.chiral = null;
              atom.isBracket = false;
              continue;
            }
          }
        }
        
        if (hasSymmetricSubstituents(atom.id, molecule, labels)) {
          atom.chiral = null;
          atom.isBracket = false;
        }
      }
    }
  }

  for (const bond of molecule.bonds) {
    if (bond.type === BondType.DOUBLE) {
      const stereoBonds = molecule.bonds.filter(b =>
        b.type === BondType.SINGLE &&
        (b.atom1 === bond.atom1 || b.atom2 === bond.atom1 || 
         b.atom1 === bond.atom2 || b.atom2 === bond.atom2) &&
        b.stereo && b.stereo !== StereoType.NONE
      );

      if (stereoBonds.length > 0 && hasGeminalIdenticalGroups(bond, molecule, labels)) {
        for (const b of stereoBonds) {
          b.stereo = StereoType.NONE;
        }
      }
    }
  }
}
