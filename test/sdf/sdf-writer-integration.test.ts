import { describe, expect, it } from 'bun:test';
import { parseSMILES } from 'src/parsers/smiles-parser';
import { parseMolfile } from 'src/parsers/molfile-parser';
import { writeSDF } from 'src/generators/sdf-writer';

describe('SDF Integration Tests', () => {
  it('exports and re-imports complex molecules', () => {
    const testCases = [
      { smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O', name: 'Ibuprofen' },
      { smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O', name: 'Aspirin' },
      { smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', name: 'Caffeine' },
      { smiles: 'C1=CC=C(C=C1)C(=O)O', name: 'Benzoic acid' },
      { smiles: 'c1ccc2c(c1)ccc3c2ccc4c3cccc4', name: 'Anthracene' },
    ];

    for (const { smiles, name } of testCases) {
      const parseResult = parseSMILES(smiles);
      expect(parseResult.errors).toEqual([]);
      expect(parseResult.molecules.length).toBe(1);

      const molecule = parseResult.molecules[0]!;
      const sdfResult = writeSDF({
        molecule,
        properties: {
          NAME: name,
          SMILES: smiles,
        },
      });

      expect(sdfResult.errors).toEqual([]);
      expect(sdfResult.sdf).toContain('$$$$');
      expect(sdfResult.sdf).toContain(name);
      expect(sdfResult.sdf).toContain(smiles);

      const lines = sdfResult.sdf.split('\n');
      const mEndIndex = lines.findIndex(line => line.trim() === 'M  END');
      expect(mEndIndex).toBeGreaterThan(0);

      const molblock = lines.slice(0, mEndIndex + 1).join('\n');
      const reimportResult = parseMolfile(molblock);

      expect(reimportResult.errors).toEqual([]);
      expect(reimportResult.molecule).not.toBeNull();
      expect(reimportResult.molecule?.atoms.length).toBe(molecule.atoms.length);
      expect(reimportResult.molecule?.bonds.length).toBe(molecule.bonds.length);
    }
  });

  it('handles multi-molecule SDF files', () => {
    const smilesList = [
      'C',
      'CC',
      'CCC',
      'CCCC',
      'c1ccccc1',
    ];

    const molecules = smilesList.map(s => parseSMILES(s).molecules[0]!);
    const records = molecules.map((molecule, i) => ({
      molecule,
      properties: {
        ID: `MOL_${i + 1}`,
        ATOMS: molecule.atoms.length,
      },
    }));

    const sdfResult = writeSDF(records);
    expect(sdfResult.errors).toEqual([]);

    const recordSeparators = (sdfResult.sdf.match(/\$\$\$\$/g) || []).length;
    expect(recordSeparators).toBe(5);

    for (let i = 1; i <= 5; i++) {
      expect(sdfResult.sdf).toContain(`MOL_${i}`);
    }
  });

  it('exports stereochemistry information to MOL format', () => {
    const parseResult = parseSMILES('C[C@H](O)CC');
    expect(parseResult.errors).toEqual([]);

    const molecule = parseResult.molecules[0]!;
    expect(molecule.atoms.some(a => a.chiral)).toBe(true);

    const sdfResult = writeSDF({ molecule });
    expect(sdfResult.errors).toEqual([]);

    const lines = sdfResult.sdf.split('\n');
    const atomBlockStart = 3;
    const atomLines = lines.slice(atomBlockStart, atomBlockStart + molecule.atoms.length);
    
    const hasStereoParity = atomLines.some(line => {
      const stereoParity = parseInt(line.substring(39, 42).trim());
      return stereoParity !== 0;
    });
    expect(hasStereoParity).toBe(true);
  });

  it('handles aromatic systems correctly', () => {
    const parseResult = parseSMILES('c1ccc2ccccc2c1');
    expect(parseResult.errors).toEqual([]);

    const molecule = parseResult.molecules[0]!;
    const aromaticAtoms = molecule.atoms.filter(a => a.aromatic).length;
    expect(aromaticAtoms).toBe(10);

    const sdfResult = writeSDF({ molecule });
    expect(sdfResult.errors).toEqual([]);

    const lines = sdfResult.sdf.split('\n');
    const mEndIndex = lines.findIndex(line => line.trim() === 'M  END');
    const molblock = lines.slice(0, mEndIndex + 1).join('\n');

    const reimportResult = parseMolfile(molblock);
    expect(reimportResult.errors).toEqual([]);
    expect(reimportResult.molecule?.bonds.some(b => b.type === 'aromatic')).toBe(true);
  });

  it('exports disconnected fragments', () => {
    const parseResult = parseSMILES('C.CC.CCC');
    expect(parseResult.errors).toEqual([]);
    expect(parseResult.molecules.length).toBe(3);

    const sdfResult = writeSDF(
      parseResult.molecules.map((molecule, i) => ({
        molecule,
        properties: { FRAGMENT: i + 1 },
      }))
    );

    expect(sdfResult.errors).toEqual([]);
    const recordCount = (sdfResult.sdf.match(/\$\$\$\$/g) || []).length;
    expect(recordCount).toBe(3);
  });

  it('preserves charge distribution within molecules', () => {
    const parseResult = parseSMILES('[NH4+]');
    expect(parseResult.errors).toEqual([]);

    const molecule = parseResult.molecules[0]!;
    expect(molecule.atoms[0]?.charge).toBe(1);

    const sdfResult = writeSDF({ molecule });
    expect(sdfResult.errors).toEqual([]);

    const lines = sdfResult.sdf.split('\n');
    const mEndIndex = lines.findIndex(line => line.trim() === 'M  END');
    const molblock = lines.slice(0, mEndIndex + 1).join('\n');

    const reimportResult = parseMolfile(molblock);
    expect(reimportResult.errors).toEqual([]);
    expect(reimportResult.molecule?.atoms[0]?.charge).toBe(1);
  });

  it('round-trips with custom options', () => {
    const parseResult = parseSMILES('c1ccccc1');
    expect(parseResult.errors).toEqual([]);

    const molecule = parseResult.molecules[0]!;
    const sdfResult = writeSDF(
      { molecule, properties: { NAME: 'Benzene' } },
      {
        title: 'CUSTOM_TITLE',
        programName: 'testprog',
        comment: 'Test comment',
      }
    );

    expect(sdfResult.errors).toEqual([]);
    expect(sdfResult.sdf).toContain('CUSTOM_TITLE');
    expect(sdfResult.sdf).toContain('testprog');
    expect(sdfResult.sdf).toContain('Test comment');
  });
});
