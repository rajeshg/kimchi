import { describe, it, expect } from 'bun:test';
import {
  generateIUPACNameFromSMILES,
  generateIUPACNameFromMolfile,
} from 'src/utils/iupac/iupac-generator';

describe('IUPAC generator input helpers', () => {
  it('generates correct IUPAC name from SMILES (methane)', () => {
    const result = generateIUPACNameFromSMILES('C');
    expect(result.name).toBe('methane');
    expect(result.errors.length).toBe(0);
  });

  it('generates correct IUPAC name from SMILES (ethanol)', () => {
    const result = generateIUPACNameFromSMILES('CCO', { includeCommonNames: true });
    expect(result.name).toMatch(/ethanol|oxylethane-ol/i);
    expect(result.errors.length).toBe(0);
  });

  it('returns error for invalid SMILES', () => {
    const result = generateIUPACNameFromSMILES('not-a-smiles');
    expect(result.name).toBe('');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toMatch(/unknown atom symbol/i);
  });

  it('generates correct IUPAC name from MOL (methane)', () => {
    // Strict V2000 MOL for methane with correct counts line formatting
    const molfile = `
Methane
OpenChem

  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`;
    const result = generateIUPACNameFromMolfile(molfile);
    expect(result.name).toBe('methane');
    expect(result.errors.length).toBe(0);
  });

  it('returns error for invalid MOL', () => {
    const result = generateIUPACNameFromMolfile('garbage-molfile');
    expect(result.name).toBe('');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toMatch(/parse|invalid|failed/i);
  });
});
