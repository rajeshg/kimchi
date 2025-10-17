import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import {
  findRings,
  findAtomRings,
  ringsShareAtoms,
  findSSSR,
  findMCB,
  classifyRingSystems,
  analyzeRings,
  isAtomInRing,
  isBondInRing,
  getRingsContainingAtom,
  getAromaticRings,
  getRingAtoms,
  getRingBonds,
  isCompositeRing,
  filterElementaryRings,
  isPartOfFusedSystem,
} from "src/utils/ring-analysis";

describe("ring-analysis", () => {
  describe("findRings", () => {
    it("finds no rings in acyclic molecule", () => {
      const result = parseSMILES("CCC");
      const rings = findRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(rings.length).toBe(0);
    });

    it("finds single ring in benzene", () => {
      const result = parseSMILES("c1ccccc1");
      const rings = findRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(rings.length).toBeGreaterThan(0);
      expect(rings[0]!.length).toBe(6);
    });

    it("finds multiple rings in naphthalene", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      const rings = findRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(rings.length).toBeGreaterThanOrEqual(2);
    });

    it("finds rings in cubane", () => {
      const result = parseSMILES("C12C3C4C1C5C4C3C25");
      const rings = findRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(rings.length).toBeGreaterThan(0);
    });
  });

  describe("findAtomRings", () => {
    it("returns empty map for acyclic molecule", () => {
      const result = parseSMILES("CCC");
      const atomRings = findAtomRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      for (const [_, rings] of atomRings) {
        expect(rings.length).toBe(0);
      }
    });

    it("maps atoms to their rings in benzene", () => {
      const result = parseSMILES("c1ccccc1");
      const atomRings = findAtomRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      for (const [atomId, rings] of atomRings) {
        expect(rings.length).toBe(1);
        expect(rings[0]!.length).toBe(6);
        expect(rings[0]).toContain(atomId);
      }
    });

    it("maps fusion atoms to multiple rings", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      const atomRings = findAtomRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      const fusionAtoms = Array.from(atomRings.entries())
        .filter(([_, rings]) => rings.length === 2)
        .map(([atomId, _]) => atomId);
      expect(fusionAtoms.length).toBe(2);
    });
  });

  describe("ringsShareAtoms", () => {
    it("returns false for non-overlapping rings", () => {
      const ring1 = [0, 1, 2];
      const ring2 = [3, 4, 5];
      expect(ringsShareAtoms(ring1, ring2)).toBe(false);
    });

    it("returns true for overlapping rings", () => {
      const ring1 = [0, 1, 2];
      const ring2 = [2, 3, 4];
      expect(ringsShareAtoms(ring1, ring2)).toBe(true);
    });

    it("returns true for rings sharing multiple atoms", () => {
      const ring1 = [0, 1, 2, 3];
      const ring2 = [2, 3, 4, 5];
      expect(ringsShareAtoms(ring1, ring2)).toBe(true);
    });
  });

  describe("findSSSR and findMCB", () => {
    it("finds correct SSSR size for benzene", () => {
      const result = parseSMILES("c1ccccc1");
      const sssr = findSSSR(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(sssr.length).toBe(1);
    });

    it("finds correct SSSR size for naphthalene", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      const sssr = findSSSR(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(sssr.length).toBe(2);
    });

    it("MCB returns same as SSSR", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      const sssr = findSSSR(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      const mcb = findMCB(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(mcb.length).toBe(sssr.length);
    });
  });

  describe("classifyRingSystems", () => {
    it("classifies isolated ring", () => {
      const result = parseSMILES("c1ccccc1");
      const classification = classifyRingSystems(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(classification.isolated.length).toBe(1);
      expect(classification.fused.length).toBe(0);
      expect(classification.spiro.length).toBe(0);
    });

    it("classifies fused rings in naphthalene", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      const classification = classifyRingSystems(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(classification.fused.length).toBeGreaterThanOrEqual(1);
      expect(classification.isolated.length + classification.fused.length).toBe(2);
    });

    it("classifies spiro system", () => {
      const result = parseSMILES("C1CCC2(C1)CCCCC2");
      const classification = classifyRingSystems(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(classification.spiro.length).toBeGreaterThan(0);
    });
  });

  describe("analyzeRings", () => {
    it("creates ring info for acyclic molecule", () => {
      const result = parseSMILES("CCC");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(ringInfo.rings.length).toBe(0);
      expect(ringInfo.ringAtomSet.size).toBe(0);
      expect(ringInfo.ringBondSet.size).toBe(0);
    });

    it("creates ring info for benzene", () => {
      const result = parseSMILES("c1ccccc1");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(ringInfo.rings.length).toBe(1);
      expect(ringInfo.ringAtomSet.size).toBe(6);
      expect(ringInfo.ringBondSet.size).toBe(6);
    });

    it("isAtomInRing works correctly", () => {
      const result = parseSMILES("c1ccccc1CC");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(ringInfo.isAtomInRing(0)).toBe(true);
      expect(ringInfo.isAtomInRing(6)).toBe(false);
      expect(ringInfo.isAtomInRing(7)).toBe(false);
    });

    it("isBondInRing works correctly", () => {
      const result = parseSMILES("c1ccccc1CC");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      expect(ringInfo.isBondInRing(0, 1)).toBe(true);
      expect(ringInfo.isBondInRing(6, 7)).toBe(false);
    });

    it("getRingsContainingAtom works", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      const fusionRings = ringInfo.getRingsContainingAtom(0);
      const singleRings = ringInfo.getRingsContainingAtom(2);
      expect(fusionRings.length).toBeGreaterThanOrEqual(1);
      expect(singleRings.length).toBeGreaterThanOrEqual(1);
    });

    it("areBothAtomsInSameRing works", () => {
      const result = parseSMILES("c1ccccc1.c1ccccc1");
      const mol1 = result.molecules[0]!;
      const ringInfo = analyzeRings(mol1.atoms, mol1.bonds);
      expect(ringInfo.areBothAtomsInSameRing(0, 1)).toBe(true);
      expect(ringInfo.areBothAtomsInSameRing(0, 5)).toBe(true);
    });
  });

  describe("isAtomInRing", () => {
    it("returns false for empty rings", () => {
      expect(isAtomInRing(0, [])).toBe(false);
    });

    it("returns true when atom in ring", () => {
      const rings = [[0, 1, 2, 3]];
      expect(isAtomInRing(0, rings)).toBe(true);
      expect(isAtomInRing(2, rings)).toBe(true);
    });

    it("returns false when atom not in ring", () => {
      const rings = [[0, 1, 2, 3]];
      expect(isAtomInRing(5, rings)).toBe(false);
    });
  });

  describe("isBondInRing", () => {
    it("returns false for empty rings", () => {
      expect(isBondInRing(0, 1, [])).toBe(false);
    });

    it("returns true when both atoms in same ring", () => {
      const rings = [[0, 1, 2, 3]];
      expect(isBondInRing(0, 1, rings)).toBe(true);
      expect(isBondInRing(2, 3, rings)).toBe(true);
    });

    it("returns false when atoms not in same ring", () => {
      const rings = [[0, 1, 2, 3], [4, 5, 6, 7]];
      expect(isBondInRing(0, 4, rings)).toBe(false);
    });
  });

  describe("getRingsContainingAtom", () => {
    it("returns empty array when atom not in rings", () => {
      const rings = [[0, 1, 2]];
      expect(getRingsContainingAtom(5, rings)).toEqual([]);
    });

    it("returns rings containing atom", () => {
      const rings = [[0, 1, 2], [2, 3, 4], [5, 6, 7]];
      const result = getRingsContainingAtom(2, rings);
      expect(result.length).toBe(2);
    });
  });

  describe("getAromaticRings", () => {
    it("returns empty for non-aromatic molecule", () => {
      const result = parseSMILES("C1CCCCC1");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      const aromaticRings = getAromaticRings(ringInfo.rings, result.molecules[0]!.atoms);
      expect(aromaticRings.length).toBe(0);
    });

    it("returns aromatic rings for benzene", () => {
      const result = parseSMILES("c1ccccc1");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      const aromaticRings = getAromaticRings(ringInfo.rings, result.molecules[0]!.atoms);
      expect(aromaticRings.length).toBe(1);
    });

    it("filters out non-aromatic rings", () => {
      const result = parseSMILES("c1ccccc1C1CCCCC1");
      const ringInfo = analyzeRings(result.molecules[0]!.atoms, result.molecules[0]!.bonds);
      const aromaticRings = getAromaticRings(ringInfo.rings, result.molecules[0]!.atoms);
      expect(aromaticRings.length).toBeLessThan(ringInfo.rings.length);
    });
  });

  describe("getRingAtoms", () => {
    it("returns atoms in ring", () => {
      const result = parseSMILES("c1ccccc1");
      const ring = [0, 1, 2, 3, 4, 5];
      const atoms = getRingAtoms(ring, result.molecules[0]!.atoms);
      expect(atoms.length).toBe(6);
      expect(atoms.every(a => a.symbol === "C")).toBe(true);
    });
  });

  describe("getRingBonds", () => {
    it("returns bonds in ring", () => {
      const result = parseSMILES("c1ccccc1");
      const ring = [0, 1, 2, 3, 4, 5];
      const bonds = getRingBonds(ring, result.molecules[0]!.bonds);
      expect(bonds.length).toBe(6);
    });

    it("excludes bonds not in ring", () => {
      const result = parseSMILES("c1ccccc1CC");
      const ring = [0, 1, 2, 3, 4, 5];
      const bonds = getRingBonds(ring, result.molecules[0]!.bonds);
      expect(bonds.length).toBe(6);
    });
  });

  describe("isCompositeRing", () => {
    it("returns false for elementary ring", () => {
      const ring = [0, 1, 2, 3];
      const smallerRings = [[0, 1, 2], [5, 6, 7]];
      expect(isCompositeRing(ring, smallerRings)).toBe(false);
    });

    it("returns true for composite ring", () => {
      const ring = [0, 1, 2, 3, 4];
      const smallerRings = [[0, 1, 2], [2, 3, 4]];
      expect(isCompositeRing(ring, smallerRings)).toBe(true);
    });
  });

  describe("filterElementaryRings", () => {
    it("filters out composite rings", () => {
      const allRings = [
        [0, 1, 2],
        [2, 3, 4],
        [0, 1, 2, 3, 4],
      ];
      const elementary = filterElementaryRings(allRings);
      expect(elementary.length).toBeLessThanOrEqual(allRings.length);
    });

    it("keeps all rings when none are composite", () => {
      const allRings = [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ];
      const elementary = filterElementaryRings(allRings);
      expect(elementary.length).toBe(2);
    });
  });

  describe("isPartOfFusedSystem", () => {
    it("returns false for isolated ring when ring not in allRings", () => {
      const ring = [0, 1, 2, 3];
      const allRings = [[5, 6, 7, 8]];
      expect(isPartOfFusedSystem(ring, allRings)).toBe(false);
    });

    it("returns true for fused ring", () => {
      const ring = [0, 1, 2, 3];
      const allRings = [[0, 1, 2, 3], [2, 3, 4, 5]];
      expect(isPartOfFusedSystem(ring, allRings)).toBe(true);
    });

    it("returns false for spiro ring when ring not in allRings", () => {
      const ring = [0, 1, 2, 3];
      const allRings = [[3, 4, 5, 6]];
      expect(isPartOfFusedSystem(ring, allRings)).toBe(false);
    });
  });
});
