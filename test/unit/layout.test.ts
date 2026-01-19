import { describe, it, expect } from "bun:test";
import { parseSMILES, layoutMolecule } from "index";

describe("layoutMolecule", () => {
  it("should generate 2D coordinates for benzene", () => {
    const result = parseSMILES("c1ccccc1");
    expect(result.molecules.length).toBeGreaterThan(0);
    const benzene = result.molecules[0]!;

    const layouted = layoutMolecule(benzene);

    // Should have coordinates for all 6 atoms
    expect(layouted.atoms).toHaveLength(6);
    layouted.atoms.forEach((atom) => {
      expect(typeof atom.x).toBe("number");
      expect(typeof atom.y).toBe("number");
      expect(Number.isFinite(atom.x)).toBe(true);
      expect(Number.isFinite(atom.y)).toBe(true);
    });

    // Bonds should be preserved
    expect(layouted.bonds).toHaveLength(benzene.bonds.length);
  });

  it("should generate coordinates for aspirin", () => {
    const result = parseSMILES("CC(=O)Oc1ccccc1C(=O)O");
    expect(result.molecules.length).toBeGreaterThan(0);
    const aspirin = result.molecules[0]!;

    const layouted = layoutMolecule(aspirin);

    expect(layouted.atoms).toHaveLength(13); // C9H8O4
    layouted.atoms.forEach((atom) => {
      expect(typeof atom.x).toBe("number");
      expect(typeof atom.y).toBe("number");
    });
  });

  it("should respect bondLength option", () => {
    const result = parseSMILES("CC");
    expect(result.molecules.length).toBeGreaterThan(0);
    const ethane = result.molecules[0]!;
    const layouted = layoutMolecule(ethane, { bondLength: 50 });

    // Check that the distance between carbons is approximately 50
    const c1 = layouted.atoms[0];
    const c2 = layouted.atoms[1];
    if (c1 && c2) {
      const distance = Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2);
      expect(distance).toBeCloseTo(50, 5); // Allow some tolerance
    }
  });

  it("should handle complex molecules", () => {
    const result = parseSMILES("CC(=O)OC1=CC=CC=C1C(=O)O");
    expect(result.molecules.length).toBeGreaterThan(0);
    const aspirin = result.molecules[0]!;

    const layouted = layoutMolecule(aspirin);

    expect(layouted.atoms.length).toBe(13); // C9H8O4
    layouted.atoms.forEach((atom) => {
      expect(typeof atom.x).toBe("number");
      expect(typeof atom.y).toBe("number");
      expect(Number.isFinite(atom.x)).toBe(true);
      expect(Number.isFinite(atom.y)).toBe(true);
    });
  });

  it("should preserve rings information", () => {
    const result = parseSMILES("c1ccccc1");
    expect(result.molecules.length).toBeGreaterThan(0);
    const benzene = result.molecules[0]!;

    const layouted = layoutMolecule(benzene);

    expect(layouted.rings).toEqual(benzene.rings);
  });
});
