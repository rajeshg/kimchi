import type { Atom, Bond, ParseError, Molecule } from 'types';
import { BondType } from 'types';
import { getRingAtoms, getRingBonds, isPartOfFusedSystem } from 'src/utils/ring-analysis';
 import { getBondsForAtom } from 'src/utils/bond-utils';
 import { MoleculeGraph } from 'src/utils/molecular-graph';

function countPiElectrons(atom: Atom, bonds: readonly Bond[]): number {
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

function isHuckelAromatic(ringAtoms: readonly Atom[], ringBonds: readonly Bond[]): boolean {
  const totalPiElectrons = ringAtoms.reduce((sum, atom) => sum + countPiElectrons(atom, ringBonds), 0);
  return totalPiElectrons >= 2 && (totalPiElectrons - 2) % 4 === 0;
}

function detectAromaticRings(atoms: readonly Atom[], bonds: readonly Bond[], rings: readonly (readonly number[])[]): Bond[] {
  const bondsToUpdate: Array<{ atom1: number; atom2: number }> = [];

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
      ringBonds.forEach(bond => {
        bondsToUpdate.push({ atom1: bond.atom1, atom2: bond.atom2 });
      });
    }
  }

  return bonds.map(bond => {
    const shouldUpdate = bondsToUpdate.some(
      b => (b.atom1 === bond.atom1 && b.atom2 === bond.atom2) ||
           (b.atom1 === bond.atom2 && b.atom2 === bond.atom1)
    );
    if (shouldUpdate) {
      return { ...bond, type: BondType.AROMATIC };
    }
    return bond;
  });
}

export function validateAromaticity(
  atoms: readonly Atom[],
  bonds: readonly Bond[],
  errors: ParseError[],
  explicitBonds?: Set<string>
): { atoms: Atom[]; bonds: Bond[] } {
  const mol: Molecule = { atoms, bonds };
  const mg = new MoleculeGraph(mol);
  const rings = mg.sssr;

  let updatedBonds = detectAromaticRings(atoms, bonds, rings);

  const aromaticAtoms = atoms.filter(a => a.aromatic);
  if (aromaticAtoms.length === 0) {
    return { atoms: [...atoms], bonds: updatedBonds };
  }

  const atomsToMarkNonAromatic = new Set<number>();

  for (const atom of aromaticAtoms) {
    const atomInRing = rings.some(ring => ring.includes(atom.id));

    if (!atomInRing) {
      errors.push({
        message: `Aromatic atom ${atom.symbol} (id: ${atom.id}) is not in a ring`,
        position: -1
      });
      atomsToMarkNonAromatic.add(atom.id);
    }
  }

  const bondsToUpdate = new Map<string, BondType>();
  const bondKey = (a1: number, a2: number) => {
    const [min, max] = a1 < a2 ? [a1, a2] : [a2, a1];
    return `${min}-${max}`;
  };

  for (const ring of rings) {
    const ringAtoms = getRingAtoms(ring, atoms);
    const allAromatic = ringAtoms.every((a: Atom) => a.aromatic);

    if (allAromatic) {
      if (isPartOfFusedSystem(ring, rings)) {
        continue;
      }

      const ringBonds = getRingBonds(ring, updatedBonds);

      if (!isHuckelAromatic(ringAtoms, ringBonds)) {
        const hasExplicitBondTypes = explicitBonds 
          ? ringBonds.some(b => explicitBonds.has(bondKey(b.atom1, b.atom2)))
          : false;
        
        if (hasExplicitBondTypes) {
          ringAtoms.forEach((a: Atom) => atomsToMarkNonAromatic.add(a.id));
          ringBonds.forEach((b: Bond) => {
            if (b.type === BondType.AROMATIC) {
              bondsToUpdate.set(bondKey(b.atom1, b.atom2), BondType.SINGLE);
            }
          });
        }
      }
    }
  }

  const updatedAtoms = atoms.map(atom => {
    if (atomsToMarkNonAromatic.has(atom.id)) {
      return { ...atom, aromatic: false };
    }
    return atom;
  });

  updatedBonds = updatedBonds.map(bond => {
    const key = bondKey(bond.atom1, bond.atom2);
    const newType = bondsToUpdate.get(key);
    if (newType !== undefined) {
      return { ...bond, type: newType };
    }
    return bond;
  });

  for (const ring of rings) {
    const ringAtoms = getRingAtoms(ring, updatedAtoms);
    const allAromatic = ringAtoms.every((a: Atom) => a.aromatic);

    if (allAromatic) {
      const ringBonds = getRingBonds(ring, updatedBonds);

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

  return { atoms: updatedAtoms, bonds: updatedBonds };
}
