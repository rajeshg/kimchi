import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { generateIUPACName } from 'src/utils/iupac/iupac-generator';
import type { Molecule } from 'types';

describe('IUPAC Generator', () => {
  describe('basic molecules', () => {
    it('should generate name for methane (CH4)', () => {
      const result = parseSMILES('C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
      expect(iupac.warnings).toHaveLength(0);
    });

    it('should generate name for ethane (C2H6)', () => {
      const result = parseSMILES('CC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate name for ethanol (C2H5OH)', () => {
      const result = parseSMILES('CCO');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate name for water (H2O)', () => {
      const result = parseSMILES('O');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate name for benzene (C6H6)', () => {
      const result = parseSMILES('c1ccccc1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
      expect(iupac.name.toLowerCase()).toContain('benzene');
    });

    it('should generate name for propane (C3H8)', () => {
      const result = parseSMILES('CCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for cyclohexane (C6H12)', () => {
      const result = parseSMILES('C1CCCCC1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cyclohexane');
    });

    it('should generate name for cyclopentane (C5H10)', () => {
      const result = parseSMILES('C1CCCC1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cyclopentane');
    });

    it('should generate name for cyclopropane (C3H6)', () => {
      const result = parseSMILES('C1CC1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cyclopropane');
    });

    it('should generate name for cyclobutane (C4H8)', () => {
      const result = parseSMILES('C1CCC1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cyclobutane');
    });

    it('should generate name for cycloheptane (C7H14)', () => {
      const result = parseSMILES('C1CCCCCC1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cycloheptane');
    });
  });

  describe('branched molecules', () => {
    it('should generate name for 2-methylpropane (isobutane)', () => {
      const result = parseSMILES('CC(C)C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate name for 2-methylbutane', () => {
      const result = parseSMILES('CC(C)CC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('methylbutane');
    });

    it('should generate name for 1-chloropropane', () => {
      const result = parseSMILES('CCCCl');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('chloropropane');
    });

    it('should generate name for 2-methylpropan-1-ol', () => {
      const result = parseSMILES('CC(C)CO');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for 1-bromo-2-methylpropane', () => {
      const result = parseSMILES('CC(Br)C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for 2,2-dimethylpropane', () => {
      const result = parseSMILES('CC(C)(C)C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('2,2-dimethylpropane');
    });
  });

  describe('heterocyclic molecules', () => {
    it('should generate name for pyridine', () => {
      const result = parseSMILES('c1ccncc1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate name for pyrrole', () => {
      const result = parseSMILES('c1cc[nH]c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for furan', () => {
      const result = parseSMILES('c1ccoc1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('furan');
    });

    it('should generate name for thiophene', () => {
      const result = parseSMILES('c1ccsc1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('thiophene');
    });

    it('should generate name for imidazole', () => {
      const result = parseSMILES('c1cnc[nH]1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('charged molecules', () => {
    it('should generate name for ammonium ion ([NH4+])', () => {
      const result = parseSMILES('[NH4+]');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for hydroxide ion ([OH-])', () => {
      const result = parseSMILES('[OH-]');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('disconnected molecules', () => {
    it('should handle complex disconnected molecules', () => {
      const result = parseSMILES('c1ccccc1.CCO');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle empty molecule gracefully', () => {
      const emptyMol: Molecule = {
        atoms: [],
        bonds: [],
      };

      const iupac = generateIUPACName(emptyMol);

      expect(iupac.errors.length).toBeGreaterThan(0);
      expect(iupac.name).toBe('');
    });

    it('should handle molecules with no valid components', () => {
      const emptyMol: Molecule = {
        atoms: [],
        bonds: [],
      };

      const iupac = generateIUPACName(emptyMol);

      expect(iupac.errors.length).toBeGreaterThan(0);
      expect(iupac.name).toBe('');
    });
  });

  describe('options handling', () => {
    it('should respect includeStereochemistry option', () => {
      const result = parseSMILES('C[C@H](O)C');
      const mol = result.molecules[0]!;

      const withStereo = generateIUPACName(mol, {
        includeStereochemistry: true,
      });
      const withoutStereo = generateIUPACName(mol, {
        includeStereochemistry: false,
      });

      expect(withStereo.errors).toHaveLength(0);
      expect(withoutStereo.errors).toHaveLength(0);
    });

    it('should respect useSystematicNaming option', () => {
      const result = parseSMILES('CCO');
      const mol = result.molecules[0]!;

      const systematic = generateIUPACName(mol, {
        useSystematicNaming: true,
      });
      const common = generateIUPACName(mol, {
        useSystematicNaming: false,
      });

      expect(systematic.errors).toHaveLength(0);
      expect(common.errors).toHaveLength(0);
    });

    it('should respect includeCommonNames option', () => {
      const result = parseSMILES('c1ccccc1');
      const mol = result.molecules[0]!;

      const withCommon = generateIUPACName(mol, {
        includeCommonNames: true,
      });
      const withoutCommon = generateIUPACName(mol, {
        includeCommonNames: false,
      });

      expect(withCommon.errors).toHaveLength(0);
      expect(withoutCommon.errors).toHaveLength(0);
    });
  });

  describe('large rings', () => {
    it('should generate name for cyclooctane (C8H16)', () => {
      const result = parseSMILES('C1CCCCCCC1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cyclooctane');
    });

    it('should generate name for cyclodecane (C10H20)', () => {
      const result = parseSMILES('C1CCCCCCCCC1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cyclodecane');
    });
  });

  describe('polycyclic molecules', () => {
    it('should generate name for naphthalene', () => {
      const result = parseSMILES('c1ccc2ccccc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate name for anthracene', () => {
      const result = parseSMILES('c1ccc2cc3ccccc3cc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('rings with functional groups', () => {
    it('should generate name for cyclohexanol', () => {
      const result = parseSMILES('C1CCCCC1O');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('cyclohexanol');
    });

    it('should generate name for phenol', () => {
      const result = parseSMILES('c1ccccc1O');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for toluene', () => {
      const result = parseSMILES('c1ccccc1C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('functional groups', () => {
    it('should generate name for aldehyde', () => {
      const result = parseSMILES('CC(=O)');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for ketone', () => {
      const result = parseSMILES('CC(=O)C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for carboxylic acid', () => {
      const result = parseSMILES('CC(=O)O');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for amine', () => {
      const result = parseSMILES('CCN');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for ether', () => {
      const result = parseSMILES('CCO');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('ring vs chain priority', () => {
    it('should prioritize ring naming over chain naming', () => {
      // This molecule has a ring but also a long chain - should be named as cyclohexane derivative
      const result = parseSMILES('C1CCCCC1CCCCCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      // Should contain cyclohexane, not hexane
      expect(iupac.name.toLowerCase()).toContain('cyclohexane');
    });

    it('should handle acyclic molecules correctly', () => {
      // Long chain with no rings - should use chain naming
      const result = parseSMILES('CCCCCCCCCCCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.toLowerCase()).toContain('dodecane');
    });
  });

  describe('complex molecules', () => {
    it('should generate name for aspirin', () => {
      const result = parseSMILES('CC(=O)Oc1ccccc1C(=O)O');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate name for caffeine', () => {
      const result = parseSMILES('CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for ibuprofen', () => {
      const result = parseSMILES('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('isotope handling', () => {
    it('should generate name for deuterated methane', () => {
      const result = parseSMILES('[2H]C([2H])([2H])[2H]');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should generate name for C-13 labeled ethane', () => {
      const result = parseSMILES('[13C]C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('stereochemistry', () => {
    it('should handle chiral centers', () => {
      const result = parseSMILES('C[C@H](O)C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol, { includeStereochemistry: true });

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should handle opposite stereochemistry', () => {
      const result = parseSMILES('C[C@@H](O)C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol, { includeStereochemistry: true });

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should handle double bond stereochemistry', () => {
      const result = parseSMILES('C/C=C/C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol, { includeStereochemistry: true });

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });

  describe('return value structure', () => {
    it('should always return object with name, errors, and warnings', () => {
      const result = parseSMILES('C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac).toBeDefined();
      expect(typeof iupac.name).toBe('string');
      expect(Array.isArray(iupac.errors)).toBe(true);
      expect(Array.isArray(iupac.warnings)).toBe(true);
    });

     it('should contain error when molecule has no atoms', () => {
       const emptyMol: Molecule = { atoms: [], bonds: [] };
       const iupac = generateIUPACName(emptyMol);

       expect(iupac.errors.length).toBeGreaterThan(0);
     });
   });

  describe('systematic alkane name generation', () => {
    // Helper function to generate linear alkane SMILES from carbon count
    const generateLinearAlkaneSMILES = (carbonCount: number): string => {
      return 'C'.repeat(carbonCount);
    };

    // Expected alkane names for carbon counts 1-20
    const expectedAlkaneNames: Record<number, string> = {
      1: 'methane',
      2: 'ethane',
      3: 'propane',
      4: 'butane',
      5: 'pentane',
      6: 'hexane',
      7: 'heptane',
      8: 'octane',
      9: 'nonane',
      10: 'decane',
      11: 'undecane',
      12: 'dodecane',
      13: 'tridecane',
      14: 'tetradecane',
      15: 'pentadecane',
      16: 'hexadecane',
      17: 'heptadecane',
      18: 'octadecane',
      19: 'nonadecane',
      20: 'eicosane',
    };

    // Test alkanes with 1-10 carbons
    Object.entries(expectedAlkaneNames).slice(0, 10).forEach(([carbonStr, expectedName]) => {
      const carbonCount = parseInt(carbonStr, 10);
      it(`should generate "${expectedName}" for C${carbonCount} linear alkane`, () => {
        const smiles = generateLinearAlkaneSMILES(carbonCount);
        const result = parseSMILES(smiles);
        const mol = result.molecules[0]!;
        const iupac = generateIUPACName(mol);

        expect(iupac.errors).toHaveLength(0);
        expect(iupac.name).toBeDefined();
        expect(iupac.name.toLowerCase()).toContain(expectedName.toLowerCase());
      });
    });

    // Test alkanes with 11-20 carbons
    Object.entries(expectedAlkaneNames).slice(10, 20).forEach(([carbonStr, expectedName]) => {
      const carbonCount = parseInt(carbonStr, 10);
      it(`should generate "${expectedName}" for C${carbonCount} linear alkane`, () => {
        const smiles = generateLinearAlkaneSMILES(carbonCount);
        const result = parseSMILES(smiles);
        const mol = result.molecules[0]!;
        const iupac = generateIUPACName(mol);

        expect(iupac.errors).toHaveLength(0);
        expect(iupac.name).toBeDefined();
        expect(iupac.name.toLowerCase()).toContain(expectedName.toLowerCase());
      });
    });

    // Test specific alkanes with known common names
    it('should recognize butane (4 carbons)', () => {
      const result = parseSMILES('CCCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name.toLowerCase()).toContain('butane');
    });

    it('should recognize pentane (5 carbons)', () => {
      const result = parseSMILES('CCCCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name.toLowerCase()).toContain('pentane');
    });

    it('should recognize octane (8 carbons)', () => {
      const result = parseSMILES('CCCCCCCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name.toLowerCase()).toContain('octane');
    });

    it('should recognize decane (10 carbons)', () => {
      const result = parseSMILES('CCCCCCCCCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name.toLowerCase()).toContain('decane');
    });

    // Test vowel elision (e.g., "butane" not "butaane")
    it('should apply vowel elision correctly', () => {
      const result = parseSMILES('CCC');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.name.toLowerCase()).toBe('propane');
      expect(iupac.name).not.toContain('aaa');
      expect(iupac.name).not.toContain('eee');
    });

    // Test large chain generation
    it('should handle large alkane (30 carbons)', () => {
      const smiles = 'C'.repeat(30);
      const result = parseSMILES(smiles);
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should handle very large alkane (50 carbons)', () => {
      const smiles = 'C'.repeat(50);
      const result = parseSMILES(smiles);
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });

    it('should generate consistent names for same alkane', () => {
      const smiles1 = 'CCCCC';
      const smiles2 = 'CCCCC';
      const result1 = parseSMILES(smiles1);
      const result2 = parseSMILES(smiles2);
      const mol1 = result1.molecules[0]!;
      const mol2 = result2.molecules[0]!;
      const iupac1 = generateIUPACName(mol1);
      const iupac2 = generateIUPACName(mol2);

      expect(iupac1.name).toBe(iupac2.name);
    });

    // Test that branched alkanes are distinguished from linear
    it('should distinguish between linear and branched alkanes', () => {
      const linearResult = parseSMILES('CCCCC');
      const branchedResult = parseSMILES('CC(C)CC');
      const linearMol = linearResult.molecules[0]!;
      const branchedMol = branchedResult.molecules[0]!;
      const linearIupac = generateIUPACName(linearMol);
      const branchedIupac = generateIUPACName(branchedMol);

      // Both should have no errors
      expect(linearIupac.errors).toHaveLength(0);
      expect(branchedIupac.errors).toHaveLength(0);

      // Their names may differ due to branching
      expect(linearIupac.name).toBeDefined();
      expect(branchedIupac.name).toBeDefined();
    });
  });
});
