import { describe, expect, it } from 'bun:test';
import { calculateValence } from 'src/utils/valence-calculator';
import { BondType } from 'types';

describe('Valence calculator', () => {
  it('counts single, double, triple and aromatic correctly with hydrogens', () => {
    const atom = { id: 1, hydrogens: 1 } as any;
    const bonds = [
      { atom1: 1, atom2: 2, type: BondType.SINGLE },
      { atom1: 1, atom2: 3, type: BondType.DOUBLE },
      { atom1: 1, atom2: 4, type: BondType.TRIPLE },
      { atom1: 5, atom2: 6, type: BondType.SINGLE },
      { atom1: 1, atom2: 7, type: BondType.AROMATIC },
    ];

    // contributions: single(1) + double(2) + triple(3) + aromatic(1.5) + hydrogens(1) = 8.5
    const val = calculateValence(atom, bonds as any);
    expect(val).toBe(8.5);
  });

  it('returns 0 if no bonds and no hydrogens', () => {
    const atom = { id: 10, hydrogens: 0 } as any;
    const val = calculateValence(atom, [] as any);
    expect(val).toBe(0);
  });
});
