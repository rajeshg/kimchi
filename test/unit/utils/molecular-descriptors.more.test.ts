import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import {
  computeDescriptors,
  getElementCounts,
  getHeavyAtomFraction,
  getFormalCharge,
  getAtomCount,
} from 'src/utils/molecular-descriptors';

describe('molecular-descriptors (more cases)', () => {
  it('throws for malformed molecule input (no atoms property)', () => {
    // computeDescriptors expects a Molecule with atoms array – passing malformed object should throw
    expect(() => computeDescriptors({} as any)).toThrow();
  });

  it('getElementCounts excludes isotope labels when includeIsotopes=false', () => {
    const result = parseSMILES('[13CH4]');
    expect(result.errors).toEqual([]);
    const mol = result.molecules[0]!;
    const counts = getElementCounts(mol, { includeIsotopes: false });
    expect(counts).toEqual({ C: 1, H: 4 });
  });

  it('counts explicit + implicit hydrogens correctly in manual molecule', () => {
    const manual: any = {
      atoms: [
        { symbol: 'C', hydrogens: 3 }, // implicit Hs on carbon
        { symbol: 'H' }, // explicit hydrogen atom
      ],
      bonds: [],
    };

    expect(getAtomCount(manual)).toBe(2);
    const counts = getElementCounts(manual); // includeImplicitH defaults to true
    expect(counts).toEqual({ C: 1, H: 4 });

    // heavy atom fraction: heavyAtoms = 1, implicitHydrogens = 3, totalAtoms = 2 + 3 = 5
    expect(getHeavyAtomFraction(manual)).toBe(1 / 5);
  });

  it('sums formal charges for manual atoms', () => {
    const manual: any = {
      atoms: [
        { symbol: 'N', charge: 2 },
        { symbol: 'O', charge: -1 },
      ],
      bonds: [],
    };

    expect(getFormalCharge(manual)).toBe(1);
  });
});
