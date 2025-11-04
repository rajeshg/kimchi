import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { generateCoordinates } from "src/utils/coordinate-generator";
import { renderSVG } from "src/generators/svg-renderer";

interface AngleInfo {
  atom: number;
  angle: number;
  neighbors: number[];
}

function calculateBondAngle(
  centerCoord: { x: number; y: number },
  neighbor1Coord: { x: number; y: number },
  neighbor2Coord: { x: number; y: number },
): number {
  const v1x = neighbor1Coord.x - centerCoord.x;
  const v1y = neighbor1Coord.y - centerCoord.y;
  const v2x = neighbor2Coord.x - centerCoord.x;
  const v2y = neighbor2Coord.y - centerCoord.y;

  const dot = v1x * v2x + v1y * v2y;
  const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

  if (len1 === 0 || len2 === 0) return 0;

  const cosAngle = dot / (len1 * len2);
  const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));
  return (Math.acos(clampedCosAngle) * 180) / Math.PI;
}

function analyzeAngles(molecule: any, coords: any[]): AngleInfo[] {
  const angles: AngleInfo[] = [];

  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    const coord = coords[i];
    if (!coord) continue;

    const neighbors = molecule.bonds
      .filter((b: any) => b.atom1 === atom.id || b.atom2 === atom.id)
      .map((b: any) => (b.atom1 === atom.id ? b.atom2 : b.atom1));

    if (neighbors.length < 2) continue;

    for (let j = 0; j < neighbors.length - 1; j++) {
      for (let k = j + 1; k < neighbors.length; k++) {
        const nIdx1 = molecule.atoms.findIndex(
          (a: any) => a.id === neighbors[j],
        );
        const nIdx2 = molecule.atoms.findIndex(
          (a: any) => a.id === neighbors[k],
        );

        if (nIdx1 >= 0 && nIdx2 >= 0) {
          const angle = calculateBondAngle(
            coord,
            coords[nIdx1]!,
            coords[nIdx2]!,
          );
          angles.push({
            atom: atom.id,
            angle,
            neighbors: [neighbors[j], neighbors[k]],
          });
        }
      }
    }
  }

  return angles;
}

describe("Fused Ring Coordinate Generation", () => {
  describe("Naphthalene (2 fused rings)", () => {
    it("should generate coordinates with valid bond angles", () => {
      const smiles = "c1ccc2ccccc2c1";
      const result = parseSMILES(smiles);
      expect(result.molecules.length).toBe(1);

      const molecule = result.molecules[0]!;
      expect(molecule.atoms.length).toBe(10);

      const coords = generateCoordinates(molecule);
      expect(coords.length).toBe(10);

      const angles = analyzeAngles(molecule, coords);
      expect(angles.length).toBeGreaterThan(0);

      const angleDegrees = angles.map((a) => a.angle);
      const avgAngle =
        angleDegrees.reduce((a, b) => a + b, 0) / angleDegrees.length;
      const minAngle = Math.min(...angleDegrees);
      const maxAngle = Math.max(...angleDegrees);

      expect(avgAngle).toBeGreaterThan(115);
      expect(avgAngle).toBeLessThan(130);
      expect(minAngle).toBeGreaterThan(100);
      expect(maxAngle).toBeLessThan(140);
    });

    it("should render naphthalene SVG without errors", () => {
      const smiles = "c1ccc2ccccc2c1";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const svg = renderSVG(molecule);
      expect(svg.errors.length).toBe(0);
      expect(svg.svg).toContain("<svg");
    });
  });

  describe("Anthracene (3 linear fused rings)", () => {
    it("should generate coordinates for linear fused ring system", () => {
      const smiles = "C1=CC2=C3C=CC=CC3=CC=C2C=C1";
      const result = parseSMILES(smiles);
      expect(result.molecules.length).toBe(1);

      const molecule = result.molecules[0]!;
      expect(molecule.atoms.length).toBe(14);
      expect(molecule.bonds.length).toBe(16);

      const coords = generateCoordinates(molecule);
      expect(coords.length).toBe(14);
      expect(
        coords.every((c) => typeof c.x === "number" && typeof c.y === "number"),
      ).toBe(true);
    });

    it("should produce valid bond angles for anthracene", () => {
      const smiles = "C1=CC2=C3C=CC=CC3=CC=C2C=C1";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const coords = generateCoordinates(molecule);
      const angles = analyzeAngles(molecule, coords);

      expect(angles.length).toBeGreaterThan(0);

      const angleDegrees = angles.map((a) => a.angle);
      const avgAngle =
        angleDegrees.reduce((a, b) => a + b, 0) / angleDegrees.length;
      const minAngle = Math.min(...angleDegrees);
      const maxAngle = Math.max(...angleDegrees);

      expect(avgAngle).toBeGreaterThan(115);
      expect(avgAngle).toBeLessThan(130);
      expect(minAngle).toBeGreaterThan(100);
      expect(maxAngle).toBeLessThan(140);
    });

    it("should not have severe angle distortions", () => {
      const smiles = "C1=CC2=C3C=CC=CC3=CC=C2C=C1";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const coords = generateCoordinates(molecule);
      const angles = analyzeAngles(molecule, coords);

      const angleDegrees = angles.map((a) => a.angle);
      const angleDeviations = angleDegrees.map((angle) =>
        Math.abs(angle - 120),
      );

      const severeDistortions = angleDeviations.filter(
        (dev) => dev > 30,
      ).length;
      expect(severeDistortions).toBe(0);
    });

    it("should render anthracene SVG without errors", () => {
      const smiles = "C1=CC2=C3C=CC=CC3=CC=C2C=C1";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const svg = renderSVG(molecule);
      expect(svg.errors.length).toBe(0);
      expect(svg.svg).toContain("<svg");
    });

    it("should have approximately 120 degree average angle", () => {
      const smiles = "C1=CC2=C3C=CC=CC3=CC=C2C=C1";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const coords = generateCoordinates(molecule);
      const angles = analyzeAngles(molecule, coords);

      const angleDegrees = angles.map((a) => a.angle);
      const avgAngle =
        angleDegrees.reduce((a, b) => a + b, 0) / angleDegrees.length;
      const within5Degrees = angleDegrees.filter(
        (angle) => Math.abs(angle - 120) <= 5,
      ).length;

      expect(avgAngle).toBeGreaterThan(115);
      expect(avgAngle).toBeLessThan(125);
      expect(within5Degrees / angleDegrees.length).toBeGreaterThan(0.3);
    });
  });

  describe("Phenanthrene (3 angular fused rings)", () => {
    it("should generate coordinates for angular fused ring system", () => {
      const smiles = "c1cc2ccccc2cc1c3ccccc3";
      const result = parseSMILES(smiles);
      expect(result.molecules.length).toBe(1);

      const molecule = result.molecules[0]!;
      expect(molecule.atoms.length).toBeGreaterThan(0);

      const coords = generateCoordinates(molecule);
      expect(coords.length).toBe(molecule.atoms.length);
    });

    it("should produce valid bond angles for phenanthrene", () => {
      const smiles = "c1cc2ccccc2cc1c3ccccc3";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const coords = generateCoordinates(molecule);
      const angles = analyzeAngles(molecule, coords);

      const angleDegrees = angles.map((a) => a.angle);
      const minAngle = Math.min(...angleDegrees);
      const maxAngle = Math.max(...angleDegrees);

      expect(minAngle).toBeGreaterThan(90);
      expect(maxAngle).toBeLessThan(150);
    });
  });

  describe("Tetracene (4 linear fused rings)", () => {
    it("should generate coordinates for 4-ring PAH", () => {
      const smiles = "C1=CC=C2C(=C1)C=CC3=CC=CC4=CC=CC(=C23)C=C4";
      const result = parseSMILES(smiles);
      expect(result.molecules.length).toBe(1);

      const molecule = result.molecules[0]!;
      expect(molecule.atoms.length).toBe(20);

      const coords = generateCoordinates(molecule);
      expect(coords.length).toBe(20);
    });

    it("should produce valid bond angles for tetracene", () => {
      const smiles = "C1=CC=C2C(=C1)C=CC3=CC=CC4=CC=CC(=C23)C=C4";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const coords = generateCoordinates(molecule);
      const angles = analyzeAngles(molecule, coords);

      const angleDegrees = angles.map((a) => a.angle);
      const avgAngle =
        angleDegrees.reduce((a, b) => a + b, 0) / angleDegrees.length;

      expect(avgAngle).toBeGreaterThan(110);
      expect(avgAngle).toBeLessThan(140);
      expect(angles.length).toBeGreaterThan(0);
    });
  });

  describe("Spiro compounds (single shared atom)", () => {
    it("should generate coordinates for spiropentane", () => {
      const smiles = "C1CCC2(C1)CCC2";
      const result = parseSMILES(smiles);
      expect(result.molecules.length).toBe(1);

      const molecule = result.molecules[0]!;
      const coords = generateCoordinates(molecule);
      expect(coords.length).toBe(molecule.atoms.length);
    });

    it("should render spiropentane SVG without errors", () => {
      const smiles = "C1CCC2(C1)CCC2";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const svg = renderSVG(molecule);
      expect(svg.errors.length).toBe(0);
    });
  });

  describe("Benzene (single ring baseline)", () => {
    it("should generate coordinates with perfect 120 degree angles", () => {
      const smiles = "c1ccccc1";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const coords = generateCoordinates(molecule);
      const angles = analyzeAngles(molecule, coords);

      const angleDegrees = angles.map((a) => a.angle);
      const allPerfect = angleDegrees.every(
        (angle) => Math.abs(angle - 120) < 1,
      );

      expect(allPerfect).toBe(true);
    });
  });

  describe("Complex fused ring combinations", () => {
    it("should handle naphthalene derivatives with substituents", () => {
      const smiles = "Cc1ccc2ccccc2c1";
      const result = parseSMILES(smiles);
      const molecule = result.molecules[0]!;

      const coords = generateCoordinates(molecule);
      expect(coords.length).toBe(molecule.atoms.length);

      const svg = renderSVG(molecule);
      expect(svg.errors.length).toBe(0);
    });
  });
});
