import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { generateMolfile } from 'src/generators/mol-generator';

describe('MOL Generator', () => {
  it('should generate MOL file for methane', () => {
    const result = parseSMILES('C');
    expect(result.errors).toHaveLength(0);

    const molfile = generateMolfile(result.molecules[0]!);
    expect(molfile).toContain('M  END');

    // Check basic structure
    const lines = molfile.split('\n');
    expect(lines[0]).toBe(''); // Title
    expect(lines[1]).toContain('chemkit'); // Program line
    expect(lines[2]).toBe(''); // Comment
    expect(lines[3]).toContain('V2000'); // Counts line
    expect(lines[4]).toContain(' C  '); // Atom line
    expect(lines[5]).toBe('M  END'); // End marker
  });

  it('should generate MOL file for ethanol', () => {
    const result = parseSMILES('CCO');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms).toHaveLength(3);
    expect(result.molecules[0]!.bonds).toHaveLength(2);

    const molfile = generateMolfile(result.molecules[0]!);
    expect(molfile).toContain('M  END');

    const lines = molfile.split('\n');
    expect(lines[3]).toContain('  3'); // 3 atoms
    expect(lines[3]).toContain('  2'); // 2 bonds
  });

  it('should handle empty molecule', () => {
    const molfile = generateMolfile({ atoms: [], bonds: [] });
    expect(molfile).toContain('  0  0');
    expect(molfile).toContain('M  END');
  });

  it('should handle charged atoms', () => {
    const result = parseSMILES('[NH4+]');
    expect(result.errors).toHaveLength(0);

    const molfile = generateMolfile(result.molecules[0]!);
    expect(molfile).toContain('M  CHG');
  });

  it('should handle isotopes', () => {
    const result = parseSMILES('[13CH4]');
    expect(result.errors).toHaveLength(0);

    const molfile = generateMolfile(result.molecules[0]!);
    expect(molfile).toContain('M  ISO');
  });

  it('should generate benzene MOL file', () => {
    const result = parseSMILES('c1ccccc1');
    expect(result.errors).toHaveLength(0);

    const molfile = generateMolfile(result.molecules[0]!);
    expect(molfile).toContain('M  END');

    const lines = molfile.split('\n');
    expect(lines[3]).toContain('  6  6'); // 6 atoms, 6 bonds
  });

  it('should handle chiral molecules', () => {
    const result = parseSMILES('C[C@H](O)N');
    expect(result.errors).toHaveLength(0);

    const molfile = generateMolfile(result.molecules[0]!);
    expect(molfile).toContain('M  END');

    const lines = molfile.split('\n');
    expect(lines[3]).toContain('  4  3'); // 4 atoms, 3 bonds
  });


});