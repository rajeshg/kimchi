import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { generateSMILES } from "src/generators/smiles-generator";

describe("Atom Class Support", () => {
  describe("Parsing atom classes", () => {
    it("should parse single digit atom class", () => {
      const result = parseSMILES("[CH4:2]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(1);
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("C");
      expect(atom.atomClass).toBe(2);
      expect(atom.hydrogens).toBe(4);
    });

    it("should parse multi-digit atom class", () => {
      const result = parseSMILES("[NH4+:123]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("N");
      expect(atom.atomClass).toBe(123);
      expect(atom.charge).toBe(1);
    });

    it("should parse atom class with leading zeros", () => {
      const result = parseSMILES("[O:005]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("O");
      expect(atom.atomClass).toBe(5);
    });

    it("should parse atom class zero", () => {
      const result = parseSMILES("[C:0]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.atomClass).toBe(0);
    });

    it("should parse large atom class numbers", () => {
      const result = parseSMILES("[C:9999]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.atomClass).toBe(9999);
    });

    it("should parse atom class with isotope", () => {
      const result = parseSMILES("[13C:1]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("C");
      expect(atom.isotope).toBe(13);
      expect(atom.atomClass).toBe(1);
    });

    it("should parse atom class with charge", () => {
      const result = parseSMILES("[O-:2]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("O");
      expect(atom.charge).toBe(-1);
      expect(atom.atomClass).toBe(2);
    });

    it("should parse atom class with chirality", () => {
      const result = parseSMILES("[C@H:1](O)(N)C");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("C");
      expect(atom.chiral).toBe("@");
      expect(atom.atomClass).toBe(1);
    });

    it("should parse complete bracket notation with atom class", () => {
      const result = parseSMILES("[13C@H+:5](O)(N)C");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.isotope).toBe(13);
      expect(atom.symbol).toBe("C");
      expect(atom.chiral).toBe("@");
      expect(atom.charge).toBe(1);
      expect(atom.atomClass).toBe(5);
    });

    it("should parse multiple atoms with different classes", () => {
      const result = parseSMILES("[C:1][C:2][C:3]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(3);
      expect(mol.atoms[0]!.atomClass).toBe(1);
      expect(mol.atoms[1]!.atomClass).toBe(2);
      expect(mol.atoms[2]!.atomClass).toBe(3);
    });

    it("should parse atoms with same class", () => {
      const result = parseSMILES("[C:1]C[C:1]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms).toHaveLength(3);
      expect(mol.atoms[0]!.atomClass).toBe(1);
      expect(mol.atoms[1]!.atomClass).toBe(0);
      expect(mol.atoms[2]!.atomClass).toBe(1);
    });

    it("should parse aromatic atoms with class", () => {
      const result = parseSMILES("[c:1]1ccccc1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("C");
      expect(atom.aromatic).toBe(true);
      expect(atom.atomClass).toBe(1);
    });

    it("should parse wildcard with atom class", () => {
      const result = parseSMILES("[*:7]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const atom = mol.atoms[0]!;
      expect(atom.symbol).toBe("*");
      expect(atom.atomClass).toBe(7);
    });
  });

  describe("Generating atom classes", () => {
    it("should generate single digit atom class", () => {
      const result = parseSMILES("[C:1]");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe("[C:1]");
    });

    it("should generate multi-digit atom class", () => {
      const result = parseSMILES("[C:123]");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe("[C:123]");
    });

    it("should omit atom class when zero", () => {
      const result = parseSMILES("[C:0]");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe("C");
      expect(smiles).not.toContain(":");
    });

    it("should generate atom class with isotope", () => {
      const result = parseSMILES("[13C:1]");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe("[13C:1]");
    });

    it("should generate atom class with charge", () => {
      const result = parseSMILES("[O-:2]");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe("[O-:2]");
    });

    it("should generate atom class with hydrogens", () => {
      const result = parseSMILES("[CH2:3]CC");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toContain("[CH2:3]");
    });

    it("should generate complete bracket notation", () => {
      const result = parseSMILES("[13C@H+:5](O)(N)C");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toContain("13C");
      expect(smiles).toContain("@");
      expect(smiles).toContain("+");
      expect(smiles).toContain(":5");
    });

    it("should generate multiple atoms with classes", () => {
      const result = parseSMILES("[C:1][C:2][C:3]");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toContain("[C:1]");
      expect(smiles).toContain("[C:2]");
      expect(smiles).toContain("[C:3]");
    });

    it("should omit class for organic subset atoms without class", () => {
      const result = parseSMILES("CC");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe("CC");
      expect(smiles).not.toContain(":");
    });

    it("should generate aromatic atom with class", () => {
      const result = parseSMILES("[c:1]1ccccc1");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toContain("[c:1]");
    });

    it("should generate wildcard with class", () => {
      const result = parseSMILES("[*:7]");
      const smiles = generateSMILES(result.molecules[0]!);
      expect(smiles).toBe("[*:7]");
    });
  });

  describe("Round-trip atom classes", () => {
    it("should round-trip simple atom class", () => {
      const input = "[C:1]CC[C:2]";
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);

      expect(result2.molecules[0]!.atoms.some((a) => a.atomClass === 1)).toBe(
        true,
      );
      expect(result2.molecules[0]!.atoms.some((a) => a.atomClass === 2)).toBe(
        true,
      );
    });

    it("should round-trip complex atom class notation", () => {
      const input = "[13C@H+:5](O)(N)C";
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);

      const atom = result2.molecules[0]!.atoms.find((a) => a.atomClass === 5);
      expect(atom).toBeDefined();
      expect(atom!.isotope).toBe(13);
      expect(atom!.symbol).toBe("C");
      expect(atom!.chiral).toBe("@");
      expect(atom!.charge).toBe(1);
      expect(atom!.atomClass).toBe(5);
    });

    it("should round-trip aromatic with class", () => {
      const input = "[c:1]1ccccc1";
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);

      const classAtom = result2.molecules[0]!.atoms.find(
        (a) => a.atomClass === 1,
      );
      expect(classAtom).toBeDefined();
      expect(classAtom!.aromatic).toBe(true);
    });

    it("should round-trip multiple same classes", () => {
      const input = "[C:1]C[C:1]C[C:2]";
      const result = parseSMILES(input);
      expect(result.errors).toEqual([]);
      const output = generateSMILES(result.molecules[0]!);
      const result2 = parseSMILES(output);
      expect(result2.errors).toEqual([]);

      const class1Count = result2.molecules[0]!.atoms.filter(
        (a) => a.atomClass === 1,
      ).length;
      const class2Count = result2.molecules[0]!.atoms.filter(
        (a) => a.atomClass === 2,
      ).length;
      expect(class1Count).toBe(2);
      expect(class2Count).toBe(1);
    });
  });

  describe("Edge cases", () => {
    it("should handle atom class in ring", () => {
      const result = parseSMILES("C1[C:1]CCC1");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      const classAtom = mol.atoms.find((a) => a.atomClass === 1);
      expect(classAtom).toBeDefined();
    });

    it("should handle atom class in branched structure", () => {
      const result = parseSMILES("C([C:1])(C)[C:2]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms.some((a) => a.atomClass === 1)).toBe(true);
      expect(mol.atoms.some((a) => a.atomClass === 2)).toBe(true);
    });

    it("should handle atom class on heteroatoms", () => {
      const result = parseSMILES("[O:1]=[C:2]([N:3])[S:4]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms.find((a) => a.symbol === "O")!.atomClass).toBe(1);
      expect(mol.atoms.find((a) => a.symbol === "C")!.atomClass).toBe(2);
      expect(mol.atoms.find((a) => a.symbol === "N")!.atomClass).toBe(3);
      expect(mol.atoms.find((a) => a.symbol === "S")!.atomClass).toBe(4);
    });

    it("should handle disconnected molecules with classes", () => {
      const result = parseSMILES("[C:1].[C:2]");
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(2);
      expect(result.molecules[0]!.atoms[0]!.atomClass).toBe(1);
      expect(result.molecules[1]!.atoms[0]!.atomClass).toBe(2);
    });

    it("should handle very large atom class number", () => {
      const result = parseSMILES("[C:999999]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;
      expect(mol.atoms[0]!.atomClass).toBe(999999);
    });
  });

  describe("Application scenarios", () => {
    it("should track reaction atom mapping", () => {
      const reactant = parseSMILES("[C:1][O:2]");
      const product = parseSMILES("[C:1]=[O:2]");

      expect(reactant.errors).toEqual([]);
      expect(product.errors).toEqual([]);

      const reactantC = reactant.molecules[0]!.atoms.find(
        (a) => a.atomClass === 1,
      )!;
      const productC = product.molecules[0]!.atoms.find(
        (a) => a.atomClass === 1,
      )!;

      expect(reactantC.symbol).toBe("C");
      expect(productC.symbol).toBe("C");
    });

    it("should distinguish equivalent atoms in symmetric molecules", () => {
      const result = parseSMILES("[C:1]([C:2])([C:3])[C:4]");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;

      const classes = mol.atoms.map((a) => a.atomClass);
      expect(classes).toContain(1);
      expect(classes).toContain(2);
      expect(classes).toContain(3);
      expect(classes).toContain(4);
    });

    it("should mark specific positions in complex molecules", () => {
      const result = parseSMILES("[c:1]1ccccc1-[c:2]2ccccc2");
      expect(result.errors).toEqual([]);
      const mol = result.molecules[0]!;

      const markedAtoms = mol.atoms.filter((a) => a.atomClass > 0);
      expect(markedAtoms).toHaveLength(2);
      expect(markedAtoms[0]!.aromatic).toBe(true);
      expect(markedAtoms[1]!.aromatic).toBe(true);
    });
  });
});
