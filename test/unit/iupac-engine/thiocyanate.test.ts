import { describe, test, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { RuleEngine } from 'src/iupac-engine/engine';

describe('Thiocyanate Functional Class Nomenclature', () => {
  const engine = new RuleEngine();

  test('CSC#N should generate methylthiocyanate', () => {
    const result = parseSMILES('CSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('methylthiocyanate');
  });

  test('CCSC#N should generate ethylthiocyanate', () => {
    const result = parseSMILES('CCSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('ethylthiocyanate');
  });

  test('CCCSC#N should generate propylthiocyanate', () => {
    const result = parseSMILES('CCCSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('propylthiocyanate');
  });

  test('CC(=O)CCSC#N should generate 3-oxobutylthiocyanate', () => {
    const result = parseSMILES('CC(=O)CCSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('3-oxobutylthiocyanate');
  });

  test('CC(C)CSC#N should generate 2-methylpropylthiocyanate', () => {
    const result = parseSMILES('CC(C)CSC#N');
    const mol = result.molecules[0];
    expect(mol).toBeDefined();
    
    const iupacResult = engine.generateName(mol!);
    const generated = iupacResult.name?.trim().toLowerCase();
    
    expect(generated).toBe('2-methylpropylthiocyanate');
  });
});
