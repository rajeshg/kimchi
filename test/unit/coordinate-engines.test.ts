import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { renderSVG } from 'src/generators/svg-renderer';
import { generateCoordinates } from 'src/utils/coordinate-generator';

describe('coordinate engine comparison', () => {
  const testMolecules = [
    { smiles: 'c1ccccc1', name: 'benzene' },
    { smiles: 'CC(=O)Oc1ccccc1C(=O)O', name: 'aspirin' },
    { smiles: 'C1CCCCC1', name: 'cyclohexane' },
    { smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', name: 'ibuprofen' },
  ];

  testMolecules.forEach(({ smiles, name }) => {
    it(`should generate coordinates for ${name}`, () => {
      const result = parseSMILES(smiles);
      expect(result.molecules.length).toBeGreaterThan(0);
      
      const molecule = result.molecules[0];
      expect(molecule).toBeDefined();
      if (!molecule) return;
      
      const coords = generateCoordinates(molecule);
      
      expect(coords.length).toBe(molecule.atoms.length);
      expect(coords.every(c => typeof c.x === 'number' && typeof c.y === 'number')).toBe(true);
    });
  });

  it('should render SVG', () => {
    const smiles = 'c1ccccc1';
    const result = parseSMILES(smiles);
    const molecule = result.molecules[0];
    expect(molecule).toBeDefined();
    if (!molecule) return;

    const svg = renderSVG(molecule);

    expect(svg.errors.length).toBe(0);
    expect(svg.svg.length).toBeGreaterThan(0);
  });

  it('should generate coordinates with webcola refinement', () => {
    const smiles = 'CC(C)Cc1ccc(cc1)C(C)C(=O)O';
    const result = parseSMILES(smiles);
    const molecule = result.molecules[0];
    expect(molecule).toBeDefined();
    if (!molecule) return;

    const coords = generateCoordinates(molecule, { });
    expect(coords.length).toBe(molecule.atoms.length);
    expect(coords.every(c => typeof c.x === 'number' && typeof c.y === 'number')).toBe(true);
  });

   it('should generate 120 degree angles for branched molecules', () => {
     const smiles = 'OC(C)O';
     const result = parseSMILES(smiles);
     expect(result.molecules.length).toBeGreaterThan(0);
     const molecule = result.molecules[0];
     expect(molecule).toBeDefined();
     if (!molecule) return;

     const coords = generateCoordinates(molecule);

     const c1Idx = molecule.atoms.findIndex(a => a.symbol === 'C' && a.id === 1);
     expect(c1Idx).toBeGreaterThanOrEqual(0);
     const c1Coord = coords[c1Idx]!;

     const neighbors = molecule.bonds
       .filter(b => b.atom1 === 1 || b.atom2 === 1)
       .map(b => b.atom1 === 1 ? b.atom2 : b.atom1);

     const neighborCoords = neighbors.map(id => {
       const idx = molecule.atoms.findIndex(a => a.id === id);
       return coords[idx]!;
     }).filter((c): c is {x: number, y: number} => c !== undefined);

     function angleBetween(a: {x: number, y: number}, b: {x: number, y: number}, c: {x: number, y: number}) {
       const v1x = a.x - b.x, v1y = a.y - b.y;
       const v2x = c.x - b.x, v2y = c.y - b.y;
       const dot = v1x * v2x + v1y * v2y;
       const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
       const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
       return Math.acos(dot / (len1 * len2));
     }

     const angle01 = angleBetween(neighborCoords[0]!, c1Coord, neighborCoords[1]!) * 180 / Math.PI;
     const angle12 = angleBetween(neighborCoords[1]!, c1Coord, neighborCoords[2]!) * 180 / Math.PI;
     const angle02 = angleBetween(neighborCoords[0]!, c1Coord, neighborCoords[2]!) * 180 / Math.PI;

     expect(angle01).toBeCloseTo(120, 1);
     expect(angle12).toBeCloseTo(120, 1);
     expect(angle02).toBeCloseTo(120, 1);
   });

});
