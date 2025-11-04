import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { renderSVG } from "src/generators/svg-renderer";
import { generateCoordinates } from "src/utils/coordinate-generator";
import { BondType } from "types";

describe("Biphenyl Rendering", () => {
  it("should render biphenyl as two separate benzene rings connected by single bond", () => {
    const smiles = "c1ccccc1c1ccccc1"; // biphenyl
    const parseResult = parseSMILES(smiles);

    expect(parseResult.molecules).toHaveLength(1);
    const molecule = parseResult.molecules[0]!;

    // Verify molecular structure
    expect(molecule.atoms).toHaveLength(12);
    expect(molecule.bonds).toHaveLength(13);

    // Check that we have exactly 2 rings (not fused)
    const rings = molecule.ringInfo?.rings || [];
    expect(rings).toHaveLength(2);

    // Verify inter-ring bond exists
    const interRingBonds = molecule.bonds.filter((bond) => {
      const atom1Rings = rings.filter((ring) => ring.includes(bond.atom1));
      const atom2Rings = rings.filter((ring) => ring.includes(bond.atom2));
      return (
        atom1Rings.length > 0 &&
        atom2Rings.length > 0 &&
        !atom1Rings.some((r1) => atom2Rings.some((r2) => r1 === r2))
      );
    });
    expect(interRingBonds).toHaveLength(1);
    expect(interRingBonds[0]!.type).toBe(BondType.SINGLE);

    // Generate coordinates and verify no duplicates
    const coords = generateCoordinates(molecule);
    expect(coords).toHaveLength(12);

    // Check that no coordinates are duplicated, except for the connecting atoms
    const coordSet = new Set<string>();
    const connectingAtomIds = new Set([
      interRingBonds[0]!.atom1,
      interRingBonds[0]!.atom2,
    ]);

    coords.forEach((coord, idx) => {
      if (coord) {
        const atomId = molecule.atoms[idx]!.id;
        const key = `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`;

        // Allow duplicates for connecting atoms (they should be at same position)
        if (!connectingAtomIds.has(atomId)) {
          expect(coordSet.has(key)).toBe(false);
        }
        coordSet.add(key);
      }
    });

    // Verify the two rings are positioned at different locations
    const ring0Coords = rings[0]!.map((atomId) => {
      const idx = molecule.atoms.findIndex((a) => a.id === atomId);
      return coords[idx];
    });
    const ring1Coords = rings[1]!.map((atomId) => {
      const idx = molecule.atoms.findIndex((a) => a.id === atomId);
      return coords[idx];
    });

    // Calculate centroids of both rings
    const ring0CenterX =
      ring0Coords.reduce((sum, c) => sum + (c?.x || 0), 0) / ring0Coords.length;
    const ring0CenterY =
      ring0Coords.reduce((sum, c) => sum + (c?.y || 0), 0) / ring0Coords.length;
    const ring1CenterX =
      ring1Coords.reduce((sum, c) => sum + (c?.x || 0), 0) / ring1Coords.length;
    const ring1CenterY =
      ring1Coords.reduce((sum, c) => sum + (c?.y || 0), 0) / ring1Coords.length;

    // Rings should be separated by a reasonable distance
    const distance = Math.sqrt(
      Math.pow(ring1CenterX - ring0CenterX, 2) +
        Math.pow(ring1CenterY - ring0CenterY, 2),
    );
    expect(distance).toBeGreaterThan(30); // Should be roughly one bond length apart

    // Generate SVG and verify it's reasonable
    const svgResult = renderSVG(molecule, { width: 300, height: 200 });
    expect(svgResult.svg).toBeTruthy();
    expect(svgResult.svg.length).toBeGreaterThan(1000);
    expect(svgResult.errors).toHaveLength(0);
  });

  it("should handle different biphenyl SMILES notations", () => {
    const variants = [
      "c1ccccc1c1ccccc1", // standard
      "c1ccc(cc1)c2ccccc2", // explicit ring closures
      "c1ccc(cc1)-c2ccccc2", // explicit single bond
    ];

    variants.forEach((smiles) => {
      const parseResult = parseSMILES(smiles);
      expect(parseResult.molecules).toHaveLength(1);

      const molecule = parseResult.molecules[0]!;
      const coords = generateCoordinates(molecule);

      // Should have no duplicate coordinates (except for connecting atoms)
      const coordSet = new Set<string>();
      coords.forEach((coord) => {
        if (coord) {
          const key = `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`;
          expect(coordSet.has(key)).toBe(false);
          coordSet.add(key);
        }
      });
    });
  });
});
