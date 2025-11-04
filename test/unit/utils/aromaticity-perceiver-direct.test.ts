import { describe, it, expect } from "bun:test";
import { perceiveAromaticity } from "src/utils/aromaticity-perceiver";
import { BondType, StereoType } from "types";
import type { Atom, Bond } from "types";

describe("Aromaticity Perception - Direct Unit Tests", () => {
  describe("Carbon pi-electron counting", () => {
    it("should not perceive cyclohexane (all single bonds) as aromatic", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 5,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 3, atom2: 4, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 4, atom2: 5, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 5, atom2: 0, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(result.atoms.every((a) => !a.aromatic)).toBe(true);
      expect(result.bonds.every((b) => b.type === BondType.SINGLE)).toBe(true);
    });

    it("should perceive benzene (alternating double bonds) as aromatic", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 5,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 2, atom2: 3, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 3, atom2: 4, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 4, atom2: 5, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 5, atom2: 0, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(result.atoms.every((a) => a.aromatic)).toBe(true);
      expect(result.bonds.every((b) => b.type === BondType.AROMATIC)).toBe(
        true,
      );
    });

    it("should not perceive cyclohexene (one double bond) as aromatic", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 5,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 2,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 3, atom2: 4, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 4, atom2: 5, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 5, atom2: 0, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(result.atoms.every((a) => !a.aromatic)).toBe(true);
      expect(
        result.bonds.filter((b) => b.type === BondType.AROMATIC),
      ).toHaveLength(0);
    });
  });

  describe("Re-perception of already aromatic molecules", () => {
    it("should correctly re-perceive aromatic benzene with aromatic bonds", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 5,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        {
          atom1: 0,
          atom2: 1,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 1,
          atom2: 2,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 2,
          atom2: 3,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 3,
          atom2: 4,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 4,
          atom2: 5,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 5,
          atom2: 0,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(result.atoms.every((a) => a.aromatic)).toBe(true);
      expect(result.bonds.every((b) => b.type === BondType.AROMATIC)).toBe(
        true,
      );
    });

    it("should correctly re-perceive aromatic pyridine with aromatic bonds", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "N",
          aromatic: true,
          atomicNumber: 7,
          charge: 0,
          hydrogens: 0,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 5,
          symbol: "C",
          aromatic: true,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        {
          atom1: 0,
          atom2: 1,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 1,
          atom2: 2,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 2,
          atom2: 3,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 3,
          atom2: 4,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 4,
          atom2: 5,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
        {
          atom1: 5,
          atom2: 0,
          type: BondType.AROMATIC,
          stereo: StereoType.NONE,
        },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(result.atoms.every((a) => a.aromatic)).toBe(true);
      expect(result.bonds.every((b) => b.type === BondType.AROMATIC)).toBe(
        true,
      );
    });
  });

  describe("Exocyclic double bonds", () => {
    it("should not perceive pyrimidinone (C=O exocyclic) as aromatic", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "N",
          aromatic: false,
          atomicNumber: 7,
          charge: 0,
          hydrogens: 0,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 0,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "O",
          aromatic: false,
          atomicNumber: 8,
          charge: 0,
          hydrogens: 0,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 5,
          symbol: "N",
          aromatic: false,
          atomicNumber: 7,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 3, atom2: 4, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 4, atom2: 5, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 5, atom2: 0, type: BondType.DOUBLE, stereo: StereoType.NONE },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(
        result.atoms.filter((a) => a.symbol !== "O").every((a) => !a.aromatic),
      ).toBe(true);
    });
  });

  describe("Nitrogen pi-electron counting", () => {
    it("should count nitrogen with NH (pyrrole-type) as 2 pi electrons", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "N",
          aromatic: false,
          atomicNumber: 7,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 2, atom2: 3, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 3, atom2: 4, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 4, atom2: 0, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(result.atoms.every((a) => a.aromatic)).toBe(true);
      expect(result.bonds.every((b) => b.type === BondType.AROMATIC)).toBe(
        true,
      );
    });

    it("should count nitrogen with double bond (pyridine-type) as 1 pi electron", () => {
      const atoms: Atom[] = [
        {
          id: 0,
          symbol: "N",
          aromatic: false,
          atomicNumber: 7,
          charge: 0,
          hydrogens: 0,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 1,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 2,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 3,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 4,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
        {
          id: 5,
          symbol: "C",
          aromatic: false,
          atomicNumber: 6,
          charge: 0,
          hydrogens: 1,
          isBracket: false,
          isotope: 0,
          chiral: null,
          atomClass: 0,
        },
      ];

      const bonds: Bond[] = [
        { atom1: 0, atom2: 1, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 2, atom2: 3, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 3, atom2: 4, type: BondType.SINGLE, stereo: StereoType.NONE },
        { atom1: 4, atom2: 5, type: BondType.DOUBLE, stereo: StereoType.NONE },
        { atom1: 5, atom2: 0, type: BondType.SINGLE, stereo: StereoType.NONE },
      ];

      const result = perceiveAromaticity(atoms, bonds);

      expect(result.atoms.every((a) => a.aromatic)).toBe(true);
      expect(result.bonds.every((b) => b.type === BondType.AROMATIC)).toBe(
        true,
      );
    });
  });
});
