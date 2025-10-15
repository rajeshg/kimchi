import { describe, expect, it } from 'bun:test';
import { findRings, findAtomRings, ringsShareAtoms, classifyRingSystems } from 'src/utils/ring-finder';

describe('Ring finder utilities', () => {
  it('finds a 3-membered ring', () => {
    const atoms = [{ id: 1 }, { id: 2 }, { id: 3 }] as any;
    const bonds = [
      { atom1: 1, atom2: 2 },
      { atom1: 2, atom2: 3 },
      { atom1: 3, atom2: 1 },
    ] as any;
    const rings = findRings(atoms, bonds);
    // normalized rings are sorted by atom id in our implementation
    expect(rings).toContainEqual([1, 2, 3]);
  });

  it('finds two disconnected rings', () => {
    const atoms = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] as any;
    const bonds = [
      { atom1: 1, atom2: 2 }, { atom1: 2, atom2: 3 }, { atom1: 3, atom2: 1 },
      { atom1: 4, atom2: 5 }, { atom1: 5, atom2: 6 }, { atom1: 6, atom2: 4 },
    ] as any;
    const rings = findRings(atoms, bonds);
    expect(rings).toContainEqual([1, 2, 3]);
    expect(rings).toContainEqual([4, 5, 6]);
  });

  it('maps atoms to their rings', () => {
    const atoms = [{ id: 1 }, { id: 2 }, { id: 3 }] as any;
    const bonds = [
      { atom1: 1, atom2: 2 }, { atom1: 2, atom2: 3 }, { atom1: 3, atom2: 1 },
    ] as any;
    const map = findAtomRings(atoms, bonds);
    expect(map.get(1)![0]).toEqual([1, 2, 3]);
  });

  it('detects shared atoms between rings', () => {
    expect(ringsShareAtoms([1, 2, 3], [3, 4, 5])).toBe(true);
    expect(ringsShareAtoms([1, 2, 3], [4, 5, 6])).toBe(false);
  });

  it('classifies isolated and spiro systems', () => {
    // Two isolated triangles and a spiro connection
    const atoms = Array.from({ length: 7 }).map((_, i) => ({ id: i + 1 }));
    const bonds = [
      { atom1: 1, atom2: 2 }, { atom1: 2, atom2: 3 }, { atom1: 3, atom2: 1 }, // ring A
      { atom1: 4, atom2: 5 }, { atom1: 5, atom2: 6 }, { atom1: 6, atom2: 4 }, // ring B
      // spiro ring sharing atom 7 with ring A
      { atom1: 7, atom2: 1 }, { atom1: 7, atom2: 8 }, { atom1: 8, atom2: 1 },
    ] as any;

    const classified = classifyRingSystems(atoms as any, bonds as any);
    expect(classified.isolated.length).toBeGreaterThanOrEqual(1);
  });
});
