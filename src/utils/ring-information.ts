import type { Molecule } from 'types';
import type { RingInfo } from './ring-analysis';
import { analyzeRings, findSSSR, getRingsContainingAtom } from './ring-analysis';

/**
 * Comprehensive ring information interface providing access to SSSR (Smallest Set of Smallest Rings)
 * and ring membership queries. Similar to RDKit's GetRingInfo() functionality.
 */
export interface RingInformation {
  /** Number of rings in SSSR */
  numRings(): number;

  /** Get all rings as atom ID arrays */
  rings(): number[][];

  /** Check if atom is in any ring */
  isAtomInRing(atomIdx: number): boolean;

  /** Check if bond is in any ring */
  isBondInRing(atom1: number, atom2: number): boolean;

  /** Check if atom is in ring of specific size */
  isAtomInRingOfSize(atomIdx: number, size: number): boolean;

  /** Check if bond is in ring of specific size */
  isBondInRingOfSize(atom1: number, atom2: number, size: number): boolean;

  /** Get ring membership count for atom ([Rn] in SMARTS) */
  atomRingMembership(atomIdx: number): number;

  /** Get ring membership count for bond */
  bondRingMembership(atom1: number, atom2: number): number;

  /** Get all rings containing a specific atom */
  atomRings(atomIdx: number): number[][];

  /** Get all rings containing a specific bond */
  bondRings(atom1: number, atom2: number): number[][];

  /** Get atoms in a specific ring */
  ringAtoms(ringIdx: number): number[];

  /** Get bonds in a specific ring */
  ringBonds(ringIdx: number): Array<{atom1: number, atom2: number}>;
}

/**
 * Implementation of RingInformation interface.
 */
class RingInformationImpl implements RingInformation {
  private ringInfo: RingInfo;
  private sssr: number[][];
  private molecule: Molecule;

  constructor(mol: Molecule) {
    this.molecule = mol;
    this.ringInfo = analyzeRings(mol);
    this.sssr = findSSSR(mol.atoms, mol.bonds);
  }

  numRings(): number {
    return this.sssr.length;
  }

  rings(): number[][] {
    return [...this.sssr];
  }

  isAtomInRing(atomIdx: number): boolean {
    return this.ringInfo.isAtomInRing(atomIdx);
  }

  isBondInRing(atom1: number, atom2: number): boolean {
    return this.ringInfo.isBondInRing(atom1, atom2);
  }

  isAtomInRingOfSize(atomIdx: number, size: number): boolean {
    return this.sssr.some(ring => ring.length === size && ring.includes(atomIdx));
  }

  isBondInRingOfSize(atom1: number, atom2: number, size: number): boolean {
    return this.sssr.some(ring =>
      ring.length === size &&
      ring.includes(atom1) &&
      ring.includes(atom2) &&
      Math.abs(ring.indexOf(atom1) - ring.indexOf(atom2)) <= 1
    );
  }

  atomRingMembership(atomIdx: number): number {
    return getRingsContainingAtom(atomIdx, this.sssr).length;
  }

  bondRingMembership(atom1: number, atom2: number): number {
    return this.sssr.filter(ring =>
      ring.includes(atom1) && ring.includes(atom2)
    ).length;
  }

  atomRings(atomIdx: number): number[][] {
    return getRingsContainingAtom(atomIdx, this.sssr);
  }

  bondRings(atom1: number, atom2: number): number[][] {
    return this.sssr.filter(ring =>
      ring.includes(atom1) && ring.includes(atom2)
    );
  }

  ringAtoms(ringIdx: number): number[] {
    const ring = this.sssr[ringIdx];
    return ring ? [...ring] : [];
  }

  ringBonds(ringIdx: number): Array<{atom1: number, atom2: number}> {
    const ring = this.sssr[ringIdx];
    if (!ring) return [];

    const bonds: Array<{atom1: number, atom2: number}> = [];
    for (let i = 0; i < ring.length; i++) {
      const atom1 = ring[i]!;
      const atom2 = ring[(i + 1) % ring.length]!;
      bonds.push({ atom1, atom2 });
    }
    return bonds;
  }
}

/**
 * Get comprehensive ring information for a molecule.
 *
 * Returns a RingInformation object that provides access to SSSR rings and
 * various ring membership queries. This is the main entry point for ring analysis.
 *
 * @param molecule - The molecule to analyze
 * @returns RingInformation object with ring data and query methods
 *
 * @example
 * ```typescript
 * const ringInfo = getRingInfo(mol);
 * console.log(`Molecule has ${ringInfo.numRings()} rings`);
 * if (ringInfo.isAtomInRing(5)) {
 *   console.log('Atom 5 is in a ring');
 * }
 * ```
 */
export function getRingInfo(molecule: Molecule): RingInformation {
  return new RingInformationImpl(molecule);
}



