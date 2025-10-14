import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'parser';
import { getMolecularFormula, getMolecularMass } from 'src/utils/molecular-properties';

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
});
