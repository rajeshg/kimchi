import { describe, expect, it } from 'vitest';
import { parseMolfile } from 'src/parsers/molfile-parser';
import { generateSMILES } from 'src/generators/smiles-generator';
import { parseSMILES } from 'parser';

describe('molfile round-trip tests', () => {
  it('round-trips benzene V2000 → SMILES → internal model', () => {
    const molfile = `
  Mrv0541 02231512212D          

  6  6  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    1.7320    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.7320    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000    0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  2  0  0  0  0
  4  5  1  0  0  0  0
  5  6  2  0  0  0  0
  6  1  1  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule).not.toBeNull();

    const smiles = generateSMILES(result.molecule!);
    expect(smiles).toBeTruthy();

    const reparsed = parseSMILES(smiles);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.molecules[0]?.atoms.length).toBe(6);
  });

  it('round-trips ethanol V2000 → SMILES', () => {
    const molfile = `
  Mrv0541 02231512212D          

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);

    const smiles = generateSMILES(result.molecule!);
    expect(smiles).toMatch(/CCO|OCC/);
  });

  it('round-trips charged nitrogen V2000 → SMILES', () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
M  CHG  1   1   1
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.charge).toBe(1);

    const smiles = generateSMILES(result.molecule!);
    expect(smiles).toContain('[N+]');
  });

  it('round-trips isotope carbon V2000 → SMILES', () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  ISO  1   1  13
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.isotope).toBe(13);

    const smiles = generateSMILES(result.molecule!);
    expect(smiles).toContain('[13C');
  });
});
