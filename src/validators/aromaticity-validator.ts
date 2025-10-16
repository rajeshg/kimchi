import type { Atom, Bond, ParseError } from 'types';
import { BondType } from 'types';
import { analyzeRings, getRingAtoms, getRingBonds, filterElementaryRings, isPartOfFusedSystem } from 'src/utils/ring-utils';
import { getBondsForAtom } from 'src/utils/bond-utils';

function countPiElectrons(atom: Atom, bonds: Bond[]): number {
  const atomBonds = getBondsForAtom(bonds, atom.id);
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

function detectAromaticRings(atoms: Atom[], bonds: Bond[], rings: number[][]): void {
  for (const ring of rings) {
    if (ring.length < 5 || ring.length > 7) continue;

    const ringAtoms = getRingAtoms(ring, atoms);
    const ringBonds = getRingBonds(ring, bonds);

    const hasAlternatingBonds = ringBonds.every(bond => {
      const atom1Bonds = ringBonds.filter(b => b.atom1 === bond.atom1 || b.atom2 === bond.atom1);
      const atom2Bonds = ringBonds.filter(b => b.atom1 === bond.atom2 || b.atom2 === bond.atom2);
      return atom1Bonds.length <= 2 && atom2Bonds.length <= 2;
    });

    const allAromatic = ringAtoms.every(atom => atom.aromatic);
    if (allAromatic && hasAlternatingBonds) {
      ringBonds.forEach(bond => bond.type = BondType.AROMATIC);
    }
  }
}

export function validateAromaticity(atoms: Atom[], bonds: Bond[], errors: ParseError[], explicitBonds?: Set<string>): void {
  const ringInfo = analyzeRings(atoms, bonds);
  const allRings = ringInfo.rings;

  detectAromaticRings(atoms, bonds, allRings);

  const aromaticAtoms = atoms.filter(a => a.aromatic);
  if (aromaticAtoms.length === 0) return;

  for (const atom of aromaticAtoms) {
    const atomInRing = ringInfo.isAtomInRing(atom.id);

    if (!atomInRing) {
      errors.push({
        message: `Aromatic atom ${atom.symbol} (id: ${atom.id}) is not in a ring`,
        position: -1
      });
      atom.aromatic = false;
    }
  }

  const rings = filterElementaryRings(allRings);

  for (const ring of rings) {
    const ringAtoms = getRingAtoms(ring, atoms);
    const allAromatic = ringAtoms.every((a: Atom) => a.aromatic);

    if (allAromatic) {
      if (isPartOfFusedSystem(ring, rings)) {
        continue;
      }

      const ringBonds = getRingBonds(ring, bonds);

      if (!isHuckelAromatic(ringAtoms, ringBonds)) {
        const bondKey = (a1: number, a2: number) => {
          const [min, max] = a1 < a2 ? [a1, a2] : [a2, a1];
          return `${min}-${max}`;
        };
        
        const hasExplicitBondTypes = explicitBonds 
          ? ringBonds.some(b => explicitBonds.has(bondKey(b.atom1, b.atom2)))
          : false;
        
        if (hasExplicitBondTypes) {
          ringAtoms.forEach((a: Atom) => a.aromatic = false);
          ringBonds.forEach((b: Bond) => {
            if (b.type === BondType.AROMATIC) {
              b.type = BondType.SINGLE;
            }
          });
        }
      }
    }
  }

  for (const ring of rings) {
    const ringAtoms = getRingAtoms(ring, atoms);
    const allAromatic = ringAtoms.every((a: Atom) => a.aromatic);

    if (allAromatic) {
      const ringBonds = getRingBonds(ring, bonds);

      const aromaticBondCount = ringBonds.filter(b => b.type === BondType.AROMATIC).length;
      const singleBondCount = ringBonds.filter(b => b.type === BondType.SINGLE).length;
      const doubleBondCount = ringBonds.filter(b => b.type === BondType.DOUBLE).length;

      if (aromaticBondCount !== ring.length && singleBondCount + doubleBondCount !== ring.length) {
        errors.push({
          message: `Aromatic ring ${ring.join(',')} has inconsistent bond types`,
          position: -1
        });
      }
    }
  }
}
