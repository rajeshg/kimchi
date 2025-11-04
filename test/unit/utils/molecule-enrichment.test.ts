import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { enrichMolecule } from "src/utils/molecule-enrichment";

describe("molecule-enrichment", () => {
  describe("enrichMolecule", () => {
    it("enriches acyclic molecule", () => {
      const result = parseSMILES("CCC");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.atoms.length).toBe(3);
      expect(enriched.bonds.length).toBe(2);
      expect(enriched.rings).toBeDefined();
      expect(enriched.ringInfo).toBeDefined();
    });

    it("enriches atoms with degree information", () => {
      const result = parseSMILES("CC(C)C");
      const enriched = enrichMolecule(result.molecules[0]!);

      const centerCarbon = enriched.atoms[1]!;
      expect(centerCarbon.degree).toBe(3);

      const terminalCarbon = enriched.atoms[0]!;
      expect(terminalCarbon.degree).toBe(1);
    });

    it("enriches atoms with ring information", () => {
      const result = parseSMILES("c1ccccc1");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.atoms.every((a) => a.isInRing)).toBe(true);
      expect(
        enriched.atoms.every((a) => a.ringIds && a.ringIds.length > 0),
      ).toBe(true);
    });

    it("marks non-ring atoms correctly", () => {
      const result = parseSMILES("c1ccccc1CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      const ringAtom = enriched.atoms[0]!;
      expect(ringAtom.isInRing).toBe(true);

      const chainAtom = enriched.atoms[6]!;
      expect(chainAtom.isInRing).toBe(false);
      expect(chainAtom.ringIds).toEqual([]);
    });

    it("enriches atoms with hybridization - sp3", () => {
      const result = parseSMILES("CCCC");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.atoms.every((a) => a.hybridization === "sp3")).toBe(true);
    });

    it("enriches atoms with hybridization - sp2", () => {
      const result = parseSMILES("C=CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.atoms[0]!.hybridization).toBe("sp2");
      expect(enriched.atoms[1]!.hybridization).toBe("sp2");
      expect(enriched.atoms[2]!.hybridization).toBe("sp3");
    });

    it("enriches atoms with hybridization - sp", () => {
      const result = parseSMILES("C#CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.atoms[0]!.hybridization).toBe("sp");
      expect(enriched.atoms[1]!.hybridization).toBe("sp");
      expect(enriched.atoms[2]!.hybridization).toBe("sp3");
    });

    it("marks aromatic atoms as sp2", () => {
      const result = parseSMILES("c1ccccc1");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.atoms.every((a) => a.hybridization === "sp2")).toBe(true);
    });

    it("enriches bonds with ring information", () => {
      const result = parseSMILES("c1ccccc1");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.bonds.every((b) => b.isInRing)).toBe(true);
      expect(
        enriched.bonds.every((b) => b.ringIds && b.ringIds.length > 0),
      ).toBe(true);
    });

    it("marks non-ring bonds correctly", () => {
      const result = parseSMILES("c1ccccc1CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      const ringBonds = enriched.bonds.filter((b) => b.isInRing);
      const chainBonds = enriched.bonds.filter((b) => !b.isInRing);

      expect(ringBonds.length).toBe(6);
      expect(chainBonds.length).toBeGreaterThan(0);
    });

    it("identifies rotatable bonds", () => {
      const result = parseSMILES("CCCC");
      const enriched = enrichMolecule(result.molecules[0]!);

      const rotatableBonds = enriched.bonds.filter((b) => b.isRotatable);
      expect(rotatableBonds.length).toBe(1);
    });

    it("marks double bonds as non-rotatable", () => {
      const result = parseSMILES("C=CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      const doubleBond = enriched.bonds.find((b) => b.type === "double")!;
      expect(doubleBond.isRotatable).toBe(false);
    });

    it("marks triple bonds as non-rotatable", () => {
      const result = parseSMILES("C#CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      const tripleBond = enriched.bonds.find((b) => b.type === "triple")!;
      expect(tripleBond.isRotatable).toBe(false);
    });

    it("marks ring bonds as non-rotatable", () => {
      const result = parseSMILES("C1CCCCC1");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.bonds.every((b) => !b.isRotatable)).toBe(true);
    });

    it("marks terminal bonds as non-rotatable", () => {
      const result = parseSMILES("CCC");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.bonds.every((b) => !b.isRotatable)).toBe(true);
    });

    it("handles fused ring systems", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.rings!.length).toBe(2); // SSSR has 2 rings

      // Fusion atoms are in both SSSR rings (2 rings each)
      const fusionAtoms = enriched.atoms.filter(
        (a) => a.ringIds && a.ringIds.length === 2,
      );
      expect(fusionAtoms.length).toBe(2);
    });

    it("handles spiro systems", () => {
      const result = parseSMILES("C1CCC2(C1)CCCCC2");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.rings!.length).toBe(2);

      const spiroAtom = enriched.atoms.find(
        (a) => a.ringIds && a.ringIds.length === 2,
      );
      expect(spiroAtom).toBeDefined();
    });

    it("excludes hydrogen bonds from rotatable calculation", () => {
      const result = parseSMILES("CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.bonds.every((b) => !b.isRotatable)).toBe(true);
    });

    it("handles complex molecules with multiple features", () => {
      const result = parseSMILES("c1ccccc1C(=O)CC");
      const enriched = enrichMolecule(result.molecules[0]!);

      const ringAtoms = enriched.atoms.filter((a) => a.isInRing);
      expect(ringAtoms.length).toBe(6);

      const sp2Atoms = enriched.atoms.filter((a) => a.hybridization === "sp2");
      expect(sp2Atoms.length).toBeGreaterThan(6);

      const rotatableBonds = enriched.bonds.filter((b) => b.isRotatable);
      expect(rotatableBonds.length).toBeGreaterThan(0);
    });

    it("handles molecules with heteroatoms", () => {
      const result = parseSMILES("c1ccncc1");
      const enriched = enrichMolecule(result.molecules[0]!);

      const nitrogen = enriched.atoms.find((a) => a.symbol === "N")!;
      expect(nitrogen.isInRing).toBe(true);
      expect(nitrogen.hybridization).toBe("sp2");
    });

    it("preserves original atom and bond properties", () => {
      const result = parseSMILES("c1ccccc1");
      const original = result.molecules[0]!;
      const enriched = enrichMolecule(original);

      expect(enriched.atoms.length).toBe(original.atoms.length);
      expect(enriched.bonds.length).toBe(original.bonds.length);

      enriched.atoms.forEach((atom, i) => {
        expect(atom.id).toBe(original.atoms[i]!.id);
        expect(atom.symbol).toBe(original.atoms[i]!.symbol);
      });
    });

    it("creates ringInfo with atomRings map", () => {
      const result = parseSMILES("c1ccccc1");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.ringInfo).toBeDefined();
      expect(enriched.ringInfo!.atomRings).toBeDefined();
      expect(enriched.ringInfo!.atomRings.size).toBeGreaterThan(0);
    });

    it("creates ringInfo with bondRings map", () => {
      const result = parseSMILES("c1ccccc1");
      const enriched = enrichMolecule(result.molecules[0]!);

      expect(enriched.ringInfo!.bondRings).toBeDefined();
      expect(enriched.ringInfo!.bondRings.size).toBeGreaterThan(0);
    });

    it("does not mark carbonyl adjacent bonds as rotatable", () => {
      const result = parseSMILES("CC(=O)O");
      const enriched = enrichMolecule(result.molecules[0]!);

      const bonds = enriched.bonds.filter((b) => b.type === "single");
      const coRotatable = bonds.filter((b) => b.isRotatable);
      expect(coRotatable.length).toBe(0);
    });
  });
});
