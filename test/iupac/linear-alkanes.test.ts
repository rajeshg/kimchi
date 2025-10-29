import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateIUPACName } from 'index';

describe('Linear Alkanes C1-C20', () => {
  // Expected names for linear alkanes C1-C20
  const expectedAlkaneNames = [
    'methane',      // C1
    'ethane',       // C2
    'propane',      // C3
    'butane',       // C4
    'pentane',      // C5
    'hexane',       // C6
    'heptane',      // C7
    'octane',       // C8
    'nonane',       // C9
    'decane',       // C10
    'undecane',     // C11
    'dodecane',     // C12
    'tridecane',    // C13
    'tetradecane',  // C14
    'pentadecane',  // C15
    'hexadecane',   // C16
    'heptadecane',  // C17
    'octadecane',   // C18
    'nonadecane',   // C19
    'eicosane'      // C20
  ];

  it('should correctly name all linear alkanes C1-C20', () => {
    for (let carbonCount = 1; carbonCount <= 20; carbonCount++) {
      // Generate SMILES for linear alkane
      const smiles = 'C'.repeat(carbonCount);
      
      // Parse and generate IUPAC name
      const parseResult = parseSMILES(smiles);
      expect(parseResult.molecules).toHaveLength(1);
      
      const molecule = parseResult.molecules[0]!;
      const iupacResult = generateIUPACName(molecule);
      
      const expectedName = expectedAlkaneNames[carbonCount - 1]!;
      
      expect(iupacResult.name).toBe(expectedName);
      expect(iupacResult.errors).toHaveLength(0);
    }
  });

  it('should handle constitutional isomers correctly', () => {
    // Test n-butane vs isobutane (2-methylpropane)
    const nButaneParse = parseSMILES('CCCC');
    expect(nButaneParse.molecules).toHaveLength(1);
    const nButane = nButaneParse.molecules[0]!;
    const nButaneResult = generateIUPACName(nButane);
    expect(nButaneResult.name).toBe('butane');

    const isobutaneParse = parseSMILES('CC(C)C');
    expect(isobutaneParse.molecules).toHaveLength(1);
    const isobutane = isobutaneParse.molecules[0]!;
    const isobutaneResult = generateIUPACName(isobutane);
    expect(isobutaneResult.name).toBe('2-methylpropane');
  });

  it('should handle cycloalkanes correctly', () => {
    // Cyclopropane should not be called just "cyclobutane" etc.
    const cyclopropaneParse = parseSMILES('C1CC1');
    expect(cyclopropaneParse.molecules).toHaveLength(1);
    const cyclopropane = cyclopropaneParse.molecules[0]!;
    const cyclopropaneResult = generateIUPACName(cyclopropane);
    expect(cyclopropaneResult.name).toBe('cyclopropane');

    const cyclohexaneParse = parseSMILES('C1CCCCC1');
    expect(cyclohexaneParse.molecules).toHaveLength(1);
    const cyclohexane = cyclohexaneParse.molecules[0]!;
    const cyclohexaneResult = generateIUPACName(cyclohexane);
    expect(cyclohexaneResult.name).toBe('cyclohexane');
  });

  it('should correctly identify atoms for each alkane', () => {
    const methaneParse = parseSMILES('C');
    expect(methaneParse.molecules).toHaveLength(1);
    const methane = methaneParse.molecules[0]!;
    expect(methane.atoms).toHaveLength(1);

    const ethaneParse = parseSMILES('CC');
    expect(ethaneParse.molecules).toHaveLength(1);
    const ethane = ethaneParse.molecules[0]!;
    expect(ethane.atoms).toHaveLength(2);

    const propaneParse = parseSMILES('CCC');
    expect(propaneParse.molecules).toHaveLength(1);
    const propane = propaneParse.molecules[0]!;
    expect(propane.atoms).toHaveLength(3);
  });
});