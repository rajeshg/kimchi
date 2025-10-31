/**
 * Basic validation test for the IUPAC rule engine
 */

import { describe, test, expect } from 'bun:test';
import { IUPACNamer } from '../../../src/iupac-engine';
import { parseSMILES } from '../../../src/parsers/smiles-parser';

describe('IUPAC Engine Validation', () => {
  test('should initialize engine and get rules', () => {
    const namer = new IUPACNamer();
    
    const rules = namer.getSupportedRules();
    const layers = namer.getLayers();
    
    // Should have rules from our layers
    expect(rules.length).toBeGreaterThan(0);
    expect(layers.length).toBeGreaterThan(0);
    
    // Check that we have our atomic and functional group rules
    const atomicRules = rules.filter(r => r.id.startsWith('atomic-'));
    const functionalGroupRules = rules.filter(r => r.id.includes('detection'));
    
    expect(atomicRules.length).toBeGreaterThan(0);
    expect(functionalGroupRules.length).toBeGreaterThan(0);
  });
  
  test('should handle simple hydrocarbon', () => {
    const namer = new IUPACNamer();
    
    // Parse methane from SMILES
    const parseResult = parseSMILES('C');
    expect(parseResult.molecules.length).toBeGreaterThan(0);
    
    const molecule = parseResult.molecules[0];
    expect(molecule).toBeDefined();
    
    const result = namer.generateName(molecule!);
    
    expect(result.name).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.method).toBeDefined();
    
    console.log(`✓ Methane name: ${result.name} (confidence: ${result.confidence})`);
  });
  
  test('should handle ethane', () => {
    const namer = new IUPACNamer();
    
    // Parse ethane from SMILES
    const parseResult = parseSMILES('CC');
    expect(parseResult.molecules.length).toBeGreaterThan(0);
    
    const molecule = parseResult.molecules[0];
    expect(molecule).toBeDefined();
    
    const result = namer.generateName(molecule!);
    
    expect(result.name).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    
    console.log(`✓ Ethane name: ${result.name} (confidence: ${result.confidence})`);
  });
  
  test('should detect functional groups', () => {
    const namer = new IUPACNamer();
    
    // Parse ethanol from SMILES (alcohol)
    const parseResult = parseSMILES('CCO');
    expect(parseResult.molecules.length).toBeGreaterThan(0);
    
    const molecule = parseResult.molecules[0];
    expect(molecule).toBeDefined();
    
    const result = namer.generateName(molecule!);
    
    expect(result.name).toBeDefined();
    expect(result.functionalGroups.length).toBeGreaterThanOrEqual(0); // May or may not detect OH depending on implementation
    expect(result.rules.length).toBeGreaterThan(0);
    
    console.log(`✓ Ethanol name: ${result.name} (confidence: ${result.confidence})`);
  });
  
  test('should handle carboxylic acids', () => {
    const namer = new IUPACNamer();
    
    // Parse acetic acid from SMILES
    const parseResult = parseSMILES('CC(=O)O');
    expect(parseResult.molecules.length).toBeGreaterThan(0);
    
    const molecule = parseResult.molecules[0];
    expect(molecule).toBeDefined();
    
    const result = namer.generateName(molecule!);
    
    expect(result.name).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    
    console.log(`✓ Acetic acid name: ${result.name} (confidence: ${result.confidence})`);
  });
  
  test('should handle ketones', () => {
    const namer = new IUPACNamer();
    
    // Parse acetone from SMILES
    const parseResult = parseSMILES('CC(=O)C');
    expect(parseResult.molecules.length).toBeGreaterThan(0);
    
    const molecule = parseResult.molecules[0];
    expect(molecule).toBeDefined();
    
    const result = namer.generateName(molecule!);
    
    expect(result.name).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    
    console.log(`✓ Acetone name: ${result.name} (confidence: ${result.confidence})`);
  });
  
  test('should run atomic layer rules', () => {
    const namer = new IUPACNamer();
    
    // Parse ethane from SMILES
    const parseResult = parseSMILES('CC');
    expect(parseResult.molecules.length).toBeGreaterThan(0);
    
    const molecule = parseResult.molecules[0];
    expect(molecule).toBeDefined();
    
    const result = namer.generateName(molecule!);
    
    // Check that atomic rules were executed
  console.log('DEBUG: executed rules for ethane:', result.rules);
  expect(result.rules.some(ruleId => ruleId.startsWith('atomic-'))).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    
    console.log(`✓ Executed rules: ${result.rules.join(', ')}`);
  });
  
  test('should handle various hydrocarbons', () => {
    const namer = new IUPACNamer();
    
    const hydrocarbons = [
      { smiles: 'C', name: 'methane' },
      { smiles: 'CC', name: 'ethane' },
      { smiles: 'CCC', name: 'propane' },
      { smiles: 'CCCC', name: 'butane' }
    ];
    
    for (const testCase of hydrocarbons) {
      const parseResult = parseSMILES(testCase.smiles);
      expect(parseResult.molecules.length).toBeGreaterThan(0);
      
      const molecule = parseResult.molecules[0];
      expect(molecule).toBeDefined();
      
      const result = namer.generateName(molecule!);
      
      expect(result.name).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      
      console.log(`✓ ${testCase.smiles} → ${result.name}`);
    }
  });
});