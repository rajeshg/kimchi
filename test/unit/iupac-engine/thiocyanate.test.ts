import { describe, test, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { RuleEngine } from 'src/iupac-engine/engine';

describe('Thiocyanate Functional Class Nomenclature', () => {
  const engine = new RuleEngine();

  test('CSC#N should generate methyl thiocyanate', () => {
    const result = parseSMILES('CSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('methyl thiocyanate');
  });

  test('CCSC#N should generate ethyl thiocyanate', () => {
    const result = parseSMILES('CCSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('ethyl thiocyanate');
  });

  test('CCCSC#N should generate propyl thiocyanate', () => {
    const result = parseSMILES('CCCSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('propyl thiocyanate');
  });

  test('CC(=O)CCSC#N should generate 3-oxobutyl thiocyanate', () => {
    const result = parseSMILES('CC(=O)CCSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('3-oxobutyl thiocyanate');
  });

  test('CC(C)CSC#N should generate 2-methylpropyl thiocyanate', () => {
    const result = parseSMILES('CC(C)CSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('2-methylpropyl thiocyanate');
  });
});
