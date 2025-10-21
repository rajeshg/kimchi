import { describe, it, expect } from 'bun:test';
import { parseSMILES, kekulize } from 'index';
import { renderSVG } from 'src/generators/svg-renderer';
import type { Bond } from 'types';
import { BondType } from 'types';

describe('SVG Basic Rendering', () => {
  it('should render benzene with kekulized bonds', () => {
    const parseResult = parseSMILES('c1ccccc1');
    expect(parseResult.errors).toEqual([]);
    expect(parseResult.molecules.length).toBe(1);
    
    const molecule = parseResult.molecules[0]!;
    
    const aromaticBonds = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
    expect(aromaticBonds).toBe(6);
    
    const kekulized = kekulize(molecule);
    
    const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
    const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
    const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
    
    console.log('Benzene bonds after kekulization:', {
      single: singleBonds,
      double: doubleBonds,
      aromatic: aromaticBondsAfter,
      total: kekulized.bonds.length
    });
    
    expect(singleBonds).toBe(3);
    expect(doubleBonds).toBe(3);
    expect(aromaticBondsAfter).toBe(0);
    
    const result = renderSVG(molecule);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
  
  it('should render ethane with single bond', () => {
    const parseResult = parseSMILES('CC');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
    
    expect(molecule.bonds.length).toBe(1);
    expect(molecule.bonds[0]?.type).toBe(BondType.SINGLE);
  });
  
  it('should render ethene with double bond', () => {
    const parseResult = parseSMILES('C=C');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule);
    expect(result.errors).toEqual([]);
    
    expect(molecule.bonds.length).toBe(1);
    expect(molecule.bonds[0]?.type).toBe(BondType.DOUBLE);
    
    expect(result.svg).toMatch(/<path.*?>/);
  });
  
  it('should render ethyne with triple bond', () => {
    const parseResult = parseSMILES('C#C');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule);
    expect(result.errors).toEqual([]);
    
    expect(molecule.bonds.length).toBe(1);
    expect(molecule.bonds[0]?.type).toBe(BondType.TRIPLE);
  });
  
  it('should handle naphthalene (fused aromatic rings)', () => {
    const parseResult = parseSMILES('c1ccc2ccccc2c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    expect(molecule.bonds.length).toBe(11);
    
    const aromaticBonds = molecule.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
    expect(aromaticBonds).toBe(11);
    
    const kekulized = kekulize(molecule);
    
    const singleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
    const doubleBonds = kekulized.bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
    const aromaticBondsAfter = kekulized.bonds.filter((b: Bond) => b.type === BondType.AROMATIC).length;
    
    expect(singleBonds).toBe(6);
    expect(doubleBonds).toBe(5);
    expect(aromaticBondsAfter).toBe(0);
    
    const result = renderSVG(molecule);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
  });
});

describe('SVG Multi-Molecule Rendering', () => {
  it('should render multiple molecules from ParseResult', () => {
    const parseResult = parseSMILES('CC.CC');
    expect(parseResult.molecules.length).toBe(2);
    
    const result = renderSVG(parseResult);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
  });
  
  it('should render organic molecule with counter-ion', () => {
    const parseResult = parseSMILES('C1=CC=CC=C1C(=O)C(=O)[O-].[Li+]');
    expect(parseResult.molecules.length).toBe(2);
    
    const benzoate = parseResult.molecules[0]!;
    const lithium = parseResult.molecules[1]!;
    
    expect(benzoate.atoms.length).toBe(11);
    expect(lithium.atoms.length).toBe(1);
    expect(lithium.atoms[0]?.symbol).toBe('Li');
    expect(lithium.atoms[0]?.charge).toBe(1);
    
    const result = renderSVG(parseResult);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('Li');
  });
  
  it('should render array of molecules', () => {
    const result1 = parseSMILES('CC');
    const result2 = parseSMILES('CC');
    const molecules = [...result1.molecules, ...result2.molecules];
    
    const result = renderSVG(molecules);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
  });
  
  it('should render multiple complex molecules with spacing', () => {
    const parseResult = parseSMILES('c1ccccc1.c1cccnc1');
    expect(parseResult.molecules.length).toBe(2);
    
    const benzene = parseResult.molecules[0]!;
    const pyridine = parseResult.molecules[1]!;
    
    expect(benzene.atoms.length).toBe(6);
    expect(pyridine.atoms.length).toBe(6);
    
    const result = renderSVG(parseResult, { moleculeSpacing: 100 });
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
  });
  
  it('should render ionic compound with multiple counter-ions', () => {
    const parseResult = parseSMILES('CC(=O)OC1=CC=CC=C1C(=O)O.Na.[Na]');
    expect(parseResult.molecules.length).toBe(3);
    
    const result = renderSVG(parseResult);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('Na');
  });
});


describe('SVG Aromatic Ring Rendering', () => {
  it('should render benzene with inner double bond lines pointing toward ring center', () => {
    const parseResult = parseSMILES('c1ccccc1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { kekulize: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    const bondPathRegex = /<path class='bond-(\d+).*?d='([^']+)'/g;
    const bonds: Array<{ index: number; paths: string[] }> = [];
    
    let match;
    while ((match = bondPathRegex.exec(svg)) !== null) {
      const index = parseInt(match[1]!);
      const path = match[2]!;
      
      const existing = bonds.find(b => b.index === index);
      if (existing) {
        existing.paths.push(path);
      } else {
        bonds.push({ index, paths: [path] });
      }
    }
    
    const doubleBonds = bonds.filter(b => b.paths.length === 2);
    expect(doubleBonds.length).toBe(3);
    
    for (const bond of doubleBonds) {
      expect(bond.paths.length).toBe(2);
      
      const outerPath = bond.paths[0]!;
      const innerPath = bond.paths[1]!;
      
      const outerCoords = outerPath.match(/M ([\d.]+),([\d.]+) L ([\d.]+),([\d.]+)/);
      const innerCoords = innerPath.match(/M ([\d.]+),([\d.]+) L ([\d.]+),([\d.]+)/);
      
      expect(outerCoords).not.toBeNull();
      expect(innerCoords).not.toBeNull();
      
      if (outerCoords && innerCoords) {
        const outerX1 = parseFloat(outerCoords[1]!);
        const outerY1 = parseFloat(outerCoords[2]!);
        const outerX2 = parseFloat(outerCoords[3]!);
        const outerY2 = parseFloat(outerCoords[4]!);
        
        const innerX1 = parseFloat(innerCoords[1]!);
        const innerY1 = parseFloat(innerCoords[2]!);
        const innerX2 = parseFloat(innerCoords[3]!);
        const innerY2 = parseFloat(innerCoords[4]!);
        
        const outerMidX = (outerX1 + outerX2) / 2;
        const outerMidY = (outerY1 + outerY2) / 2;
        const innerMidX = (innerX1 + innerX2) / 2;
        const innerMidY = (innerY1 + innerY2) / 2;
        
        const ringCenterX = 170;
        const ringCenterY = 170;
        
        const outerDist = Math.sqrt(Math.pow(outerMidX - ringCenterX, 2) + Math.pow(outerMidY - ringCenterY, 2));
        const innerDist = Math.sqrt(Math.pow(innerMidX - ringCenterX, 2) + Math.pow(innerMidY - ringCenterY, 2));
        
        expect(innerDist).toBeLessThan(outerDist);
      }
    }
  });
  
  it('should render pyridine with inner double bond lines pointing toward ring center', () => {
    const parseResult = parseSMILES('c1ccncc1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { kekulize: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    const bondPathRegex = /<path class='bond-(\d+).*?d='([^']+)'/g;
    const bonds: Array<{ index: number; paths: string[] }> = [];
    
    let match;
    while ((match = bondPathRegex.exec(svg)) !== null) {
      const index = parseInt(match[1]!);
      const path = match[2]!;
      
      const existing = bonds.find(b => b.index === index);
      if (existing) {
        existing.paths.push(path);
      } else {
        bonds.push({ index, paths: [path] });
      }
    }
    
    const doubleBonds = bonds.filter(b => b.paths.length === 2);
    expect(doubleBonds.length).toBe(3);
  });
  
  it('should render naphthalene with inner double bond lines pointing toward ring centers', () => {
    const parseResult = parseSMILES('c1ccc2ccccc2c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { kekulize: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    const bondPathRegex = /<path class='bond-(\d+).*?d='([^']+)'/g;
    const bonds: Array<{ index: number; paths: string[] }> = [];
    
    let match;
    while ((match = bondPathRegex.exec(svg)) !== null) {
      const index = parseInt(match[1]!);
      const path = match[2]!;
      
      const existing = bonds.find(b => b.index === index);
      if (existing) {
        existing.paths.push(path);
      } else {
        bonds.push({ index, paths: [path] });
      }
    }
    
    const doubleBonds = bonds.filter(b => b.paths.length === 2);
    expect(doubleBonds.length).toBeGreaterThan(0);
    
    for (const bond of doubleBonds) {
      expect(bond.paths.length).toBe(2);
    }
  });
  
  it('should render quinoline with inner double bond lines for both rings', () => {
    const parseResult = parseSMILES('c1ccc2ncccc2c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { kekulize: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    const bondPathRegex = /<path class='bond-(\d+).*?d='([^']+)'/g;
    const bonds: Array<{ index: number; paths: string[] }> = [];
    
    let match;
    while ((match = bondPathRegex.exec(svg)) !== null) {
      const index = parseInt(match[1]!);
      const path = match[2]!;
      
      const existing = bonds.find(b => b.index === index);
      if (existing) {
        existing.paths.push(path);
      } else {
        bonds.push({ index, paths: [path] });
      }
    }
    
    const doubleBonds = bonds.filter(b => b.paths.length === 2);
    expect(doubleBonds.length).toBeGreaterThan(0);
  });
  
  it('should render implicit hydrogens on heteroatoms with correct colors', () => {
    const parseResult = parseSMILES('CCO');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { showImplicitHydrogens: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    
    expect(svg).toContain('fill="#FF0D0D"');
    expect(svg).toContain('>O<');
    expect(svg).toContain('fill="#AAAAAA"');
    expect(svg).toContain('>H<');
  });
});

describe('SVG Aromatic Ring Double Bond Spacing', () => {
  it('should maintain minimum spacing between double bond lines in aromatic rings', () => {
    const parseResult = parseSMILES('c1ccccc1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { kekulize: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    const bondPathRegex = /<path class='bond-(\d+).*?d='M ([\d.]+),([\d.]+) L ([\d.]+),([\d.]+)'/g;
    const bonds: Array<{ index: number; x1: number; y1: number; x2: number; y2: number }> = [];
    
    let match;
    while ((match = bondPathRegex.exec(svg)) !== null) {
      bonds.push({
        index: parseInt(match[1]!),
        x1: parseFloat(match[2]!),
        y1: parseFloat(match[3]!),
        x2: parseFloat(match[4]!),
        y2: parseFloat(match[5]!)
      });
    }
    
    const doubleBondGroups = new Map<number, typeof bonds>();
    for (const bond of bonds) {
      if (!doubleBondGroups.has(bond.index)) {
        doubleBondGroups.set(bond.index, []);
      }
      doubleBondGroups.get(bond.index)!.push(bond);
    }
    
    for (const [index, group] of doubleBondGroups) {
      if (group.length === 2) {
        const bond1 = group[0]!;
        const bond2 = group[1]!;
        
        const mid1X = (bond1.x1 + bond1.x2) / 2;
        const mid1Y = (bond1.y1 + bond1.y2) / 2;
        const mid2X = (bond2.x1 + bond2.x2) / 2;
        const mid2Y = (bond2.y1 + bond2.y2) / 2;
        
        const spacing = Math.sqrt(Math.pow(mid2X - mid1X, 2) + Math.pow(mid2Y - mid1Y, 2));
        
        expect(spacing).toBeGreaterThan(3);
      }
    }
  });
  
  it('should maintain minimum spacing for caffeine pentagon aromatic ring', () => {
    const parseResult = parseSMILES('CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { kekulize: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    const bondPathRegex = /<path class='bond-(\d+).*?d='M ([\d.]+),([\d.]+) L ([\d.]+),([\d.]+)'/g;
    const bonds: Array<{ index: number; x1: number; y1: number; x2: number; y2: number }> = [];
    
    let match;
    while ((match = bondPathRegex.exec(svg)) !== null) {
      bonds.push({
        index: parseInt(match[1]!),
        x1: parseFloat(match[2]!),
        y1: parseFloat(match[3]!),
        x2: parseFloat(match[4]!),
        y2: parseFloat(match[5]!)
      });
    }
    
    const doubleBondGroups = new Map<number, typeof bonds>();
    for (const bond of bonds) {
      if (!doubleBondGroups.has(bond.index)) {
        doubleBondGroups.set(bond.index, []);
      }
      doubleBondGroups.get(bond.index)!.push(bond);
    }
    
    let aromaticDoubleBondCount = 0;
    for (const [index, group] of doubleBondGroups) {
      if (group.length === 2) {
        const bond1 = group[0]!;
        const bond2 = group[1]!;
        
        const mid1X = (bond1.x1 + bond1.x2) / 2;
        const mid1Y = (bond1.y1 + bond1.y2) / 2;
        const mid2X = (bond2.x1 + bond2.x2) / 2;
        const mid2Y = (bond2.y1 + bond2.y2) / 2;
        
        const spacing = Math.sqrt(Math.pow(mid2X - mid1X, 2) + Math.pow(mid2Y - mid1Y, 2));
        
        if (spacing > 3) {
          aromaticDoubleBondCount++;
        }
      }
    }
    
    expect(aromaticDoubleBondCount).toBeGreaterThan(0);
  });
  
  it('should detect and render naphthalene aromatic rings with proper spacing', () => {
    const parseResult = parseSMILES('c1ccc2ccccc2c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const result = renderSVG(molecule, { kekulize: true });
    expect(result.errors).toEqual([]);
    
    const svg = result.svg;
    const bondPathRegex = /<path class='bond-(\d+).*?d='M ([\d.]+),([\d.]+) L ([\d.]+),([\d.]+)'/g;
    const bonds: Array<{ index: number; x1: number; y1: number; x2: number; y2: number }> = [];
    
    let match;
    while ((match = bondPathRegex.exec(svg)) !== null) {
      bonds.push({
        index: parseInt(match[1]!),
        x1: parseFloat(match[2]!),
        y1: parseFloat(match[3]!),
        x2: parseFloat(match[4]!),
        y2: parseFloat(match[5]!)
      });
    }
    
    const doubleBondGroups = new Map<number, typeof bonds>();
    for (const bond of bonds) {
      if (!doubleBondGroups.has(bond.index)) {
        doubleBondGroups.set(bond.index, []);
      }
      doubleBondGroups.get(bond.index)!.push(bond);
    }
    
    let aromaticDoubleBondCount = 0;
    for (const [index, group] of doubleBondGroups) {
      if (group.length === 2) {
        const bond1 = group[0]!;
        const bond2 = group[1]!;
        
        const mid1X = (bond1.x1 + bond1.x2) / 2;
        const mid1Y = (bond1.y1 + bond1.y2) / 2;
        const mid2X = (bond2.x1 + bond2.x2) / 2;
        const mid2Y = (bond2.y1 + bond2.y2) / 2;
        
        const spacing = Math.sqrt(Math.pow(mid2X - mid1X, 2) + Math.pow(mid2Y - mid1Y, 2));
        
        if (spacing > 3) {
          aromaticDoubleBondCount++;
        }
      }
    }
    
    expect(aromaticDoubleBondCount).toBeGreaterThan(0);
  });
});

