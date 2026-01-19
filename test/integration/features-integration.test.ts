import { describe, it, expect } from "bun:test";
import {
  parseSMILES,
  layoutMolecule,
  aromatizeMolecule,
  checkStructure,
  addExplicitHydrogens,
  removeExplicitHydrogens,
} from "index";

describe("Integration tests - combining multiple features", () => {
  it("should parse, layout, aromatize, and validate benzene", () => {
    // Parse Kekulé benzene
    const result = parseSMILES("C1=CC=CC=C1");
    expect(result.molecules.length).toBeGreaterThan(0);
    const benzene = result.molecules[0]!;

    // Validate structure
    const validation = checkStructure(benzene);
    expect(validation.isValid).toBe(true);

    // Generate 2D coordinates
    const layouted = layoutMolecule(benzene);
    expect(layouted.atoms.length).toBe(6);
    layouted.atoms.forEach((atom) => {
      expect(typeof atom.x).toBe("number");
      expect(typeof atom.y).toBe("number");
    });

    // Aromatize
    const aromatized = aromatizeMolecule(layouted);
    expect(aromatized.atoms.every((a) => a.aromatic)).toBe(true);

    // Validate aromatized structure
    const finalValidation = checkStructure(aromatized);
    expect(finalValidation.isValid).toBe(true);
  });

  it("should handle hydrogen operations with validation", () => {
    const result = parseSMILES("CCO");
    expect(result.molecules.length).toBeGreaterThan(0);
    const ethanol = result.molecules[0]!;

    // Validate original
    expect(checkStructure(ethanol).isValid).toBe(true);

    // Add explicit hydrogens
    const withHs = addExplicitHydrogens(ethanol);
    expect(withHs.atoms.length).toBeGreaterThan(ethanol.atoms.length);

    // Validate with explicit H
    expect(checkStructure(withHs).isValid).toBe(true);

    // Remove explicit hydrogens
    const withoutHs = removeExplicitHydrogens(withHs);
    expect(withoutHs.atoms.length).toBe(ethanol.atoms.length);

    // Validate final structure
    expect(checkStructure(withoutHs).isValid).toBe(true);
  });

  it("should work with complex molecules", () => {
    const result = parseSMILES("CC(=O)Oc1ccccc1C(=O)O");
    expect(result.molecules.length).toBeGreaterThan(0);
    const aspirin = result.molecules[0]!;

    // Chain operations
    const validated = checkStructure(aspirin);
    expect(validated.isValid).toBe(true);

    const layouted = layoutMolecule(aspirin);
    expect(layouted.atoms.length).toBe(13);

    const withHs = addExplicitHydrogens(layouted);
    expect(withHs.atoms.length).toBeGreaterThan(layouted.atoms.length);

    // Final validation
    const finalValidation = checkStructure(withHs);
    expect(finalValidation.isValid).toBe(true);
  });
});
