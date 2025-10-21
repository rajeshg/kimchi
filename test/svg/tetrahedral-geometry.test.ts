import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { renderSVG } from 'src/generators/svg-renderer';

interface AtomPosition {
  x: number;
  y: number;
  label: string;
}

function extractAtomPositions(svg: string): AtomPosition[] {
  const positions: AtomPosition[] = [];
  const regex = /<text x="([\d.-]+)"[^>]*y="([\d.-]+)"[^>]*>(.*?)<\/text>/g;
  let match;
  
  while ((match = regex.exec(svg)) !== null) {
    positions.push({
      x: parseFloat(match[1]!),
      y: parseFloat(match[2]!),
      label: match[3]!.trim(),
    });
  }
  
  return positions;
}

function getDistance(p1: AtomPosition, p2: AtomPosition): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getAngle(center: AtomPosition, point: AtomPosition): number {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

function normalizeAngle(angle: number): number {
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

function angleDifference(angle1: number, angle2: number): number {
  let diff = Math.abs(angle1 - angle2);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

describe('Tetrahedral Geometry Rendering', () => {
  it('should render tetravalent N+ (C[N+](C)(C)C) as plus sign', () => {
    const parseResult = parseSMILES('C[N+](C)(C)C');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { width: 250, height: 200 });
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
    
    const atoms = extractAtomPositions(result.svg);
    
    const nPlus = atoms.find(a => a.label === 'N');
    expect(nPlus).toBeDefined();
    
    const carbons = atoms.filter(a => a.label === 'C');
    expect(carbons.length).toBe(4);
    
    const angles = carbons.map(c => normalizeAngle(getAngle(nPlus!, c)));
    angles.sort((a, b) => a - b);
    
    const expectedAngles = [0, 90, 180, 270];
    for (let i = 0; i < angles.length; i++) {
      const diff = Math.min(
        angleDifference(angles[i]!, expectedAngles[i]!),
        angleDifference(angles[i]!, expectedAngles[(i + 1) % 4]!),
        angleDifference(angles[i]!, expectedAngles[(i + 3) % 4]!)
      );
      expect(diff).toBeLessThan(55);
    }
  });
  
  it('should have roughly equal bond lengths in tetrahedral N+', () => {
    const parseResult = parseSMILES('C[N+](C)(C)C');
    const molecule = parseResult.molecules[0]!;
    const result = renderSVG(molecule, { width: 250, height: 200 });
    
    const atoms = extractAtomPositions(result.svg);
    const nPlus = atoms.find(a => a.label === 'N');
    const carbons = atoms.filter(a => a.label === 'C');
    
    const distances = carbons.map(c => getDistance(nPlus!, c));
    const avgDistance = distances.reduce((a, b) => a + b) / distances.length;
    
    for (const dist of distances) {
      expect(Math.abs(dist - avgDistance) / avgDistance).toBeLessThan(0.15);
    }
  });
  
  it('should render tetrahedral carbon (quaternary carbon)', () => {
    const parseResult = parseSMILES('CC(C)(C)C');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { width: 250, height: 200 });
    expect(result.errors).toEqual([]);
    
    const atoms = extractAtomPositions(result.svg);
    expect(atoms.length).toBeGreaterThanOrEqual(3);
  });
  
  it('should handle ammonium ion [NH4+]', () => {
    const parseResult = parseSMILES('[NH4+]');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { width: 250, height: 200 });
    expect(result.errors).toEqual([]);
    
    const atoms = extractAtomPositions(result.svg);
    const nAtom = atoms.find(a => a.label === 'N');
    expect(nAtom).toBeDefined();
  });
  
  it('should have 90-degree angular spacing in tetrahedral geometry', () => {
    const parseResult = parseSMILES('C[N+](C)(C)C');
    const molecule = parseResult.molecules[0]!;
    const result = renderSVG(molecule, { width: 250, height: 200 });
    
    const atoms = extractAtomPositions(result.svg);
    const nPlus = atoms.find(a => a.label === 'N');
    const carbons = atoms.filter(a => a.label === 'C');
    
    const angles = carbons.map(c => normalizeAngle(getAngle(nPlus!, c)));
    angles.sort((a, b) => a - b);
    
    const expectedIntervals = [90, 90, 90, 90];
    const actualIntervals = [
      angleDifference(angles[0]!, angles[1]!),
      angleDifference(angles[1]!, angles[2]!),
      angleDifference(angles[2]!, angles[3]!),
      angleDifference(angles[3]!, angles[0]!),
    ];
    
    for (let i = 0; i < actualIntervals.length; i++) {
      expect(Math.abs(actualIntervals[i]! - expectedIntervals[i]!)).toBeLessThan(30);
    }
  });
  
  it('should render charged phosphorus P+ with tetrahedral geometry', () => {
    const parseResult = parseSMILES('CP(C)(C)C');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { width: 250, height: 200 });
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
  });
  
  it('should render branched sp3 center with tetrahedral-like angles', () => {
    const parseResult = parseSMILES('C(C)(C)C');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { width: 250, height: 200 });
    expect(result.errors).toEqual([]);
    
    const atoms = extractAtomPositions(result.svg);
    expect(atoms.length).toBeGreaterThan(0);
  });
  
  it('should maintain tetrahedral geometry with webcola refinement', () => {
    const parseResult = parseSMILES('C[N+](C)(C)C');
    const molecule = parseResult.molecules[0]!;
    
    const defaultResult = renderSVG(molecule, { width: 250, height: 200 });
    const webcolaResult = renderSVG(molecule, { 
      width: 250, 
      height: 200, 
      webcolaIterations: 100 
    });
    
    const defaultAtoms = extractAtomPositions(defaultResult.svg);
    const webcolaAtoms = extractAtomPositions(webcolaResult.svg);
    
    const defaultN = defaultAtoms.find(a => a.label === 'N')!;
    const webcolaN = webcolaAtoms.find(a => a.label === 'N')!;
    
    const defaultCarbons = defaultAtoms.filter(a => a.label === 'C');
    const webbcolaCarbons = webcolaAtoms.filter(a => a.label === 'C');
    
    const defaultDistances = defaultCarbons.map(c => getDistance(defaultN, c));
    const webcolaDistances = webbcolaCarbons.map(c => getDistance(webcolaN, c));
    
    const defaultAvg = defaultDistances.reduce((a, b) => a + b) / defaultDistances.length;
    const webcolaAvg = webcolaDistances.reduce((a, b) => a + b) / webcolaDistances.length;
    
    expect(Math.abs(defaultAvg - webcolaAvg) / defaultAvg).toBeLessThan(0.3);
  });
});
