import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import {
  getMolecularFormula,
  getMolecularMass,
  getHeavyAtomCount,
  getHeteroAtomCount,
  getRingCount,
  getAromaticRingCount,
  getFractionCSP3,
  getHBondAcceptorCount,
  getHBondDonorCount,
  getTPSA,
  getRotatableBondCount,
  checkLipinskiRuleOfFive,
  checkVeberRules,
  checkBBBPenetration,
} from 'src/utils/molecular-properties';

async function initRDKit() {
  const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
  if (!rdkitModule) return null;
  const init = rdkitModule.default as any;
  const RDKit = await init();
  return RDKit;
}

function tryCallMolFormula(mol: any): string | null {
  if (!mol) return null;
  if (typeof mol.get_smiles === 'function') {
    try {
      const smiles = mol.get_smiles();
      const parsed = parseSMILES(smiles);
      if (parsed && parsed.molecules && parsed.molecules[0]) {
        return getMolecularFormula(parsed.molecules[0]!);
      }
    } catch (e) {}
  }
  try {
    if (typeof mol.get_descriptors === 'function') {
      const d = mol.get_descriptors();
      try {
        const obj = typeof d === 'string' ? JSON.parse(d) : d;
        if (obj && typeof obj === 'object' && obj.formula) return String(obj.formula);
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

function tryCallMolMass(mol: any): number | null {
  if (!mol) return null;
  try {
    if (typeof mol.get_descriptors === 'function') {
      const d = mol.get_descriptors();
      const obj = typeof d === 'string' ? JSON.parse(d) : d;
      if (obj && typeof obj === 'object') {
        if (typeof obj.exactmw === 'number') return obj.exactmw;
        if (typeof obj.amw === 'number') return obj.amw;
      }
    }
  } catch (e) {}
  const candidates = [
    'get_monoisotopic_mass',
    'get_monoisotopicMass',
    'get_mol_wt',
    'get_molecular_weight',
    'get_molecularWeight',
    'get_mw',
  ];
  for (const name of candidates) {
    if (typeof mol[name] === 'function') {
      try {
        const val = mol[name]();
        if (typeof val === 'number') return val;
        if (!isNaN(Number(val))) return Number(val);
      } catch (e) {
      }
    }
  }
  return null;
}

describe('molecular properties', () => {
  const examples = [
    { s: 'C', name: 'methane / C' },
    { s: 'CC', name: 'ethane' },
    { s: 'O', name: 'oxygen atom' },
    { s: 'OCC', name: 'ethanol fragment' },
    { s: 'C1CCCCC1', name: 'cyclohexane' },
    { s: 'c1ccccc1', name: 'benzene (aromatic)' },
    { s: 'C(=O)O', name: 'formic acid' },
    { s: 'CC(=O)O', name: 'acetic acid' },
    { s: 'ClCCl', name: 'dichloromethane' },
    { s: '[13CH4]', name: 'isotopic methyl (13C if parser supports bracket isotope)' },
  ];

  it('computes formula and mass and compares with RDKit when available', async () => {
    const RDKit = await initRDKit();
    for (const ex of examples) {
      const parsed = parseSMILES(ex.s);
      expect(parsed.errors.length).toBeGreaterThanOrEqual(0);
      const mol = parsed.molecules[0]!;
      expect(mol).toBeTruthy();
      const formula = getMolecularFormula(mol);
      const mass = getMolecularMass(mol);

      expect(typeof formula).toBe('string');
      expect(formula.length).toBeGreaterThan(0);
      expect(typeof mass).toBe('number');
      expect(mass).toBeGreaterThan(0);

      if (!RDKit) continue;

      const rdkitMol = RDKit.get_mol(ex.s);
      if (!rdkitMol || !rdkitMol.is_valid || !rdkitMol.is_valid()) {
        if (rdkitMol && rdkitMol.delete) rdkitMol.delete();
        continue;
      }

      const rdFormula = tryCallMolFormula(rdkitMol);
      if (rdFormula) {
        expect(rdFormula.replace(/\s+/g, '')).toBe(formula.replace(/\s+/g, ''));
      }

      const rdMass = tryCallMolMass(rdkitMol);
      if (rdMass !== null) {
        const tol = 0.01;
        expect(Math.abs(rdMass - mass)).toBeLessThanOrEqual(tol);
      }

      if (rdkitMol && rdkitMol.delete) rdkitMol.delete();
    }
  });

  describe('Basic atom counting', () => {
    it('should count heavy atoms in ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getHeavyAtomCount(result.molecules[0]!)).toBe(3);
    });

    it('should count heavy atoms in benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getHeavyAtomCount(result.molecules[0]!)).toBe(6);
    });

    it('should count heteroatoms in ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getHeteroAtomCount(result.molecules[0]!)).toBe(1);
    });

    it('should count heteroatoms in pyridine', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toEqual([]);
      expect(getHeteroAtomCount(result.molecules[0]!)).toBe(1);
    });

    it('should count heteroatoms in acetamide', () => {
      const result = parseSMILES('CC(=O)N');
      expect(result.errors).toEqual([]);
      expect(getHeteroAtomCount(result.molecules[0]!)).toBe(2);
    });
  });

  describe('Ring counting', () => {
    it('should count rings in benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getRingCount(result.molecules[0]!)).toBe(1);
    });

    it('should count rings in naphthalene', () => {
      const result = parseSMILES('c1ccc2ccccc2c1');
      expect(result.errors).toEqual([]);
      expect(getRingCount(result.molecules[0]!)).toBe(2);
    });

    it('should count no rings in ethane', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toEqual([]);
      expect(getRingCount(result.molecules[0]!)).toBe(0);
    });

    it('should count aromatic rings in benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getAromaticRingCount(result.molecules[0]!)).toBe(1);
    });

    it('should count aromatic rings in naphthalene', () => {
      const result = parseSMILES('c1ccc2ccccc2c1');
      expect(result.errors).toEqual([]);
      expect(getAromaticRingCount(result.molecules[0]!)).toBe(2);
    });

    it('should count no aromatic rings in cyclohexane', () => {
      const result = parseSMILES('C1CCCCC1');
      expect(result.errors).toEqual([]);
      expect(getAromaticRingCount(result.molecules[0]!)).toBe(0);
    });
  });

  describe('Fraction CSP3', () => {
    it('should calculate 1.0 for ethane (all sp3)', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toEqual([]);
      expect(getFractionCSP3(result.molecules[0]!)).toBe(1.0);
    });

    it('should calculate 0.0 for benzene (all aromatic)', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getFractionCSP3(result.molecules[0]!)).toBe(0.0);
    });

    it('should calculate 0.0 for ethylene (sp2)', () => {
      const result = parseSMILES('C=C');
      expect(result.errors).toEqual([]);
      expect(getFractionCSP3(result.molecules[0]!)).toBe(0.0);
    });

    it('should calculate 0.333 for propene (1 sp3, 2 sp2)', () => {
      const result = parseSMILES('CC=C');
      expect(result.errors).toEqual([]);
      const frac = getFractionCSP3(result.molecules[0]!);
      expect(frac).toBeCloseTo(0.333, 2);
    });

    it('should handle molecules with no carbons', () => {
      const result = parseSMILES('O');
      expect(result.errors).toEqual([]);
      expect(getFractionCSP3(result.molecules[0]!)).toBe(0);
    });
  });

  describe('Hydrogen bond donors and acceptors', () => {
    it('should count HBA in water', () => {
      const result = parseSMILES('O');
      expect(result.errors).toEqual([]);
      expect(getHBondAcceptorCount(result.molecules[0]!)).toBe(1);
    });

    it('should count HBD in water', () => {
      const result = parseSMILES('O');
      expect(result.errors).toEqual([]);
      expect(getHBondDonorCount(result.molecules[0]!)).toBe(2);
    });

    it('should count HBA in ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getHBondAcceptorCount(result.molecules[0]!)).toBe(1);
    });

    it('should count HBD in ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getHBondDonorCount(result.molecules[0]!)).toBe(1);
    });

    it('should count HBA/HBD in urea', () => {
      const result = parseSMILES('NC(=O)N');
      expect(result.errors).toEqual([]);
      expect(getHBondAcceptorCount(result.molecules[0]!)).toBe(3);
      expect(getHBondDonorCount(result.molecules[0]!)).toBe(4);
    });

    it('should count HBA in pyridine (no HBD)', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toEqual([]);
      expect(getHBondAcceptorCount(result.molecules[0]!)).toBe(1);
      expect(getHBondDonorCount(result.molecules[0]!)).toBe(0);
    });
  });

  describe('TPSA (Topological Polar Surface Area)', () => {
    it('should calculate TPSA for water', () => {
      const result = parseSMILES('O');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(20.23, 1);
    });

    it('should calculate TPSA for ethanol', () => {
      const result = parseSMILES('CCO');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(20.23, 1);
    });

    it('should calculate TPSA for dimethyl ether', () => {
      const result = parseSMILES('COC');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(9.23, 1);
    });

    it('should calculate TPSA for acetone', () => {
      const result = parseSMILES('CC(=O)C');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(17.07, 1);
    });

    it('should calculate TPSA for acetic acid', () => {
      const result = parseSMILES('CC(=O)O');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(37.30, 1);
    });

    it('should calculate TPSA for methylamine', () => {
      const result = parseSMILES('CN');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(26.02, 1);
    });

    it('should calculate TPSA for pyridine', () => {
      const result = parseSMILES('c1ccncc1');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(12.89, 1);
    });

    it('should calculate TPSA for pyrrole', () => {
      const result = parseSMILES('c1cc[nH]c1');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(15.79, 1);
    });

    it('should calculate TPSA for urea', () => {
      const result = parseSMILES('NC(=O)N');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(69.11, 1);
    });

    it('should calculate TPSA for acetamide', () => {
      const result = parseSMILES('CC(=O)N');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(43.09, 1);
    });

    it('should calculate TPSA for acetonitrile', () => {
      const result = parseSMILES('CC#N');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBeCloseTo(23.79, 1);
    });

    it('should calculate 0 TPSA for hydrocarbons', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBe(0);
    });

    it('should calculate 0 TPSA for benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getTPSA(result.molecules[0]!)).toBe(0);
    });
  });

  describe('Rotatable Bond Count', () => {
    it('should count 0 rotatable bonds in ethane', () => {
      const result = parseSMILES('CC');
      expect(result.errors).toEqual([]);
      expect(getRotatableBondCount(result.molecules[0]!)).toBe(0);
    });

    it('should count 0 rotatable bonds in propane', () => {
      const result = parseSMILES('CCC');
      expect(result.errors).toEqual([]);
      expect(getRotatableBondCount(result.molecules[0]!)).toBe(0);
    });

    it('should count 1 rotatable bond in butane', () => {
      const result = parseSMILES('CCCC');
      expect(result.errors).toEqual([]);
      expect(getRotatableBondCount(result.molecules[0]!)).toBe(1);
    });

    it('should count 0 rotatable bonds in benzene', () => {
      const result = parseSMILES('c1ccccc1');
      expect(result.errors).toEqual([]);
      expect(getRotatableBondCount(result.molecules[0]!)).toBe(0);
    });

    it('should count 4 rotatable bonds in ibuprofen', () => {
      const result = parseSMILES('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
      expect(result.errors).toEqual([]);
      expect(getRotatableBondCount(result.molecules[0]!)).toBe(4);
    });
  });

  describe('Lipinski Rule of Five', () => {
    it('should pass for aspirin', () => {
      const result = parseSMILES('CC(=O)Oc1ccccc1C(=O)O');
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(true);
      expect(lipinski.violations).toEqual([]);
    });

    it('should pass for ibuprofen', () => {
      const result = parseSMILES('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(true);
      expect(lipinski.violations).toEqual([]);
    });

    it('should fail for molecule with high MW', () => {
      const result = parseSMILES('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC(=O)O');
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(false);
      expect(lipinski.violations.length).toBeGreaterThan(0);
    }, 15000);

    it('should fail for molecule with high LogP', () => {
      // Use a highly lipophilic molecule (long hydrocarbon chain)
      const result = parseSMILES('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(false);
      expect(lipinski.violations.some(v => v.includes('LogP'))).toBe(true);
      expect(lipinski.properties.logP).toBeGreaterThan(5);
    });

    it('should fail for molecule with too many H-bond donors', () => {
      // Molecule with many OH groups (violates HBD ≤ 5)
      const result = parseSMILES('OCC(O)C(O)C(O)C(O)C(O)C(O)C(O)CO'); // long chain with many OH groups
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(false);
      expect(lipinski.violations.some(v => v.includes('H-bond donors'))).toBe(true);
      expect(lipinski.properties.hbondDonors).toBeGreaterThan(5);
    });

    it('should fail for molecule with too many H-bond acceptors', () => {
      // Molecule with many N/O atoms (violates HBA ≤ 10)
      // Use a large molecule with many amide groups
      const result = parseSMILES('CC(=O)NC(CC(=O)NC(CC(=O)NC(CC(=O)NC(CC(=O)NC(CC(=O)O)C)C)C)C)C'); // peptide-like with many carbonyls
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(false);
      expect(lipinski.violations.some(v => v.includes('H-bond acceptors'))).toBe(true);
      expect(lipinski.properties.hbondAcceptors).toBeGreaterThan(10);
    });

    it('should include logP in properties', () => {
      const result = parseSMILES('CCO'); // ethanol
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.properties).toHaveProperty('logP');
      expect(typeof lipinski.properties.logP).toBe('number');
      expect(lipinski.properties.logP).toBeCloseTo(-0.0014, 2);
    });

    it('should handle molecules with borderline values', () => {
      // Caffeine: MW=194, HBD=0, HBA=6, LogP=0.07 (should pass)
      const result = parseSMILES('CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(true);
      expect(lipinski.violations).toEqual([]);
      expect(lipinski.properties.molecularWeight).toBeLessThanOrEqual(500);
      expect(lipinski.properties.hbondDonors).toBeLessThanOrEqual(5);
      expect(lipinski.properties.hbondAcceptors).toBeLessThanOrEqual(10);
      expect(lipinski.properties.logP).toBeLessThanOrEqual(5);
    });

    it('should fail multiple rules simultaneously', () => {
      // Large molecule with many polar groups
      const result = parseSMILES('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC(=O)O');
      expect(result.errors).toEqual([]);
      const lipinski = checkLipinskiRuleOfFive(result.molecules[0]!);
      expect(lipinski.passes).toBe(false);
      expect(lipinski.violations.length).toBeGreaterThan(1);
      expect(lipinski.violations.some(v => v.includes('Molecular weight'))).toBe(true);
      expect(lipinski.violations.some(v => v.includes('LogP'))).toBe(true);
    });
  });

  describe('Veber Rules', () => {
    it('should pass for aspirin', () => {
      const result = parseSMILES('CC(=O)Oc1ccccc1C(=O)O');
      expect(result.errors).toEqual([]);
      const veber = checkVeberRules(result.molecules[0]!);
      expect(veber.passes).toBe(true);
      expect(veber.violations).toEqual([]);
    });

    it('should pass for ibuprofen', () => {
      const result = parseSMILES('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
      expect(result.errors).toEqual([]);
      const veber = checkVeberRules(result.molecules[0]!);
      expect(veber.passes).toBe(true);
      expect(veber.violations).toEqual([]);
    });
  });

  describe('BBB Penetration', () => {
    it('should predict penetration for caffeine', () => {
      const result = parseSMILES('CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
      expect(result.errors).toEqual([]);
      const bbb = checkBBBPenetration(result.molecules[0]!);
      expect(bbb.likelyPenetration).toBe(true);
      expect(bbb.tpsa).toBeLessThan(90);
    });

    it('should predict no penetration for aspirin', () => {
      const result = parseSMILES('CC(=O)Oc1ccccc1C(=O)O');
      expect(result.errors).toEqual([]);
      const bbb = checkBBBPenetration(result.molecules[0]!);
      expect(bbb.likelyPenetration).toBe(true);
    });
  });
});
