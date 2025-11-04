import { describe, it, expect } from "bun:test";
import type { Atom, Bond } from "types";
import { BondType, StereoType } from "types";
import {
  getBondsForAtom,
  getOtherAtomId,
  getOtherAtom,
  isHeavyAtom,
  getHeavyNeighborCount,
  partitionBondsByType,
  hasDoubleBond,
  hasTripleBond,
  hasMultipleBond,
  hasCarbonylBond,
  bondKey,
} from "src/utils/bond-utils";

describe("bond-utils", () => {
  describe("getBondsForAtom", () => {
    it("returns empty array when atom has no bonds", () => {
      const bonds: Bond[] = [];
      expect(getBondsForAtom(bonds, 0)).toEqual([]);
    });

    it("returns bonds connected to atom", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      const result = getBondsForAtom(bonds, 0);
      expect(result.length).toBe(2);
      expect(result).toContainEqual({
        atom1: 0,
        atom2: 1,
        type: BondType.SINGLE,
        stereo: StereoType.NONE,
      });
      expect(result).toContainEqual({
        atom1: 0,
        atom2: 3,
        type: BondType.SINGLE,
        stereo: StereoType.NONE,
      });
    });

    it("finds bonds where atom is atom2", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 2, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      const result = getBondsForAtom(bonds, 1);
      expect(result.length).toBe(2);
    });
  });

  describe("getOtherAtomId", () => {
    it("returns atom2 when given atom1", () => {
      const bond: Bond = {
        atom1: 0,
        atom2: 5,
        type: BondType.SINGLE,
        stereo: StereoType.NONE,
      };
      expect(getOtherAtomId(bond, 0)).toBe(5);
    });

    it("returns atom1 when given atom2", () => {
      const bond: Bond = {
        atom1: 0,
        atom2: 5,
        type: BondType.SINGLE,
        stereo: StereoType.NONE,
      };
      expect(getOtherAtomId(bond, 5)).toBe(0);
    });
  });

  describe("getOtherAtom", () => {
    const atoms: Atom[] = [
      { id: 0, symbol: "C" } as Atom,
      { id: 1, symbol: "O" } as Atom,
      { id: 2, symbol: "N" } as Atom,
    ];

    it("returns other atom from bond", () => {
      const bond: Bond = {
        atom1: 0,
        atom2: 1,
        type: BondType.SINGLE,
        stereo: StereoType.NONE,
      };
      const result = getOtherAtom(bond, 0, atoms);
      expect(result).toEqual({ id: 1, symbol: "O" } as Atom);
    });

    it("returns undefined when atom not found", () => {
      const bond: Bond = {
        atom1: 0,
        atom2: 99,
        type: BondType.SINGLE,
        stereo: StereoType.NONE,
      };
      const result = getOtherAtom(bond, 0, atoms);
      expect(result).toBeUndefined();
    });
  });

  describe("isHeavyAtom", () => {
    it("returns false for undefined", () => {
      expect(isHeavyAtom(undefined)).toBe(false);
    });

    it("returns false for hydrogen", () => {
      expect(isHeavyAtom({ id: 0, symbol: "H" } as Atom)).toBe(false);
    });

    it("returns true for isotopic hydrogen", () => {
      expect(isHeavyAtom({ id: 0, symbol: "H", isotope: 2 } as Atom)).toBe(
        true,
      );
    });

    it("returns true for carbon", () => {
      expect(isHeavyAtom({ id: 0, symbol: "C" } as Atom)).toBe(true);
    });

    it("returns true for other elements", () => {
      expect(isHeavyAtom({ id: 0, symbol: "O" } as Atom)).toBe(true);
      expect(isHeavyAtom({ id: 0, symbol: "N" } as Atom)).toBe(true);
    });
  });

  describe("getHeavyNeighborCount", () => {
    it("returns 0 when no neighbors", () => {
      const atoms: Atom[] = [{ id: 0, symbol: "C" } as Atom];
      const bonds: Bond[] = [];
      expect(getHeavyNeighborCount(bonds, 0, atoms)).toBe(0);
    });

    it("excludes hydrogen neighbors", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "C" } as Atom,
        { id: 1, symbol: "H" } as Atom,
        { id: 2, symbol: "H" } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      expect(getHeavyNeighborCount(bonds, 0, atoms)).toBe(0);
    });

    it("counts heavy atom neighbors", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "C" } as Atom,
        { id: 1, symbol: "C" } as Atom,
        { id: 2, symbol: "O" } as Atom,
        { id: 3, symbol: "H" } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      expect(getHeavyNeighborCount(bonds, 0, atoms)).toBe(2);
    });

    it("includes isotopic hydrogen as heavy", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "C" } as Atom,
        { id: 1, symbol: "H", isotope: 2 } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      expect(getHeavyNeighborCount(bonds, 0, atoms)).toBe(1);
    });
  });

  describe("partitionBondsByType", () => {
    it("partitions empty bond list", () => {
      const result = partitionBondsByType([]);
      expect(result.single).toEqual([]);
      expect(result.double).toEqual([]);
      expect(result.triple).toEqual([]);
      expect(result.aromatic).toEqual([]);
    });

    it("partitions bonds by type", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 2, atom2: 3, type: BondType.TRIPLE, stereo: StereoType.NONE },
        {
          atom1: 3,
          atom2: 4,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        { atom1: 4, atom2: 5, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      const result = partitionBondsByType(bonds);
      expect(result.single.length).toBe(2);
      expect(result.double.length).toBe(1);
      expect(result.triple.length).toBe(1);
      expect(result.aromatic.length).toBe(1);
    });
  });

  describe("hasDoubleBond", () => {
    it("returns false when no double bonds", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      expect(hasDoubleBond(bonds, 0)).toBe(false);
    });

    it("returns true when atom has double bond", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 2, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];
      expect(hasDoubleBond(bonds, 0)).toBe(true);
    });
  });

  describe("hasTripleBond", () => {
    it("returns false when no triple bonds", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 2, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];
      expect(hasTripleBond(bonds, 0)).toBe(false);
    });

    it("returns true when atom has triple bond", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 0, atom2: 2, type: BondType.TRIPLE, stereo: StereoType.NONE },
      ];
      expect(hasTripleBond(bonds, 0)).toBe(true);
    });
  });

  describe("hasMultipleBond", () => {
    it("returns false when only single bonds", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      expect(hasMultipleBond(bonds, 0)).toBe(false);
    });

    it("returns true for double bond", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];
      expect(hasMultipleBond(bonds, 0)).toBe(true);
    });

    it("returns true for triple bond", () => {
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.TRIPLE, stereo: StereoType.NONE },
      ];
      expect(hasMultipleBond(bonds, 0)).toBe(true);
    });
  });

  describe("hasCarbonylBond", () => {
    it("returns false for non-carbon atom", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "O" } as Atom,
        { id: 1, symbol: "O" } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];
      expect(hasCarbonylBond(bonds, 0, atoms)).toBe(false);
    });

    it("returns false for aromatic carbon", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "C", aromatic: true } as Atom,
        { id: 1, symbol: "O" } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];
      expect(hasCarbonylBond(bonds, 0, atoms)).toBe(false);
    });

    it("returns true for C=O bond", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "C" } as Atom,
        { id: 1, symbol: "O" } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];
      expect(hasCarbonylBond(bonds, 0, atoms)).toBe(true);
    });

    it("returns false for C=C bond", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "C" } as Atom,
        { id: 1, symbol: "C" } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];
      expect(hasCarbonylBond(bonds, 0, atoms)).toBe(false);
    });

    it("returns false for C-O single bond", () => {
      const atoms: Atom[] = [
        { id: 0, symbol: "C" } as Atom,
        { id: 1, symbol: "O" } as Atom,
      ];
      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];
      expect(hasCarbonylBond(bonds, 0, atoms)).toBe(false);
    });
  });

  describe("bondKey", () => {
    it("creates consistent key regardless of order", () => {
      expect(bondKey(0, 5)).toBe(bondKey(5, 0));
      expect(bondKey(0, 5)).toBe("0-5");
    });

    it("handles same atom ids", () => {
      expect(bondKey(3, 3)).toBe("3-3");
    });

    it("creates unique keys for different bonds", () => {
      expect(bondKey(0, 1)).not.toBe(bondKey(0, 2));
      expect(bondKey(0, 1)).not.toBe(bondKey(1, 2));
    });
  });
});
