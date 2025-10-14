import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES } from '../index';

const TEST_SMILES = [
  // Simple
  'C',
  'CC',
  'C=C',
  'C#N',
  'CC(C)C',
  'CC.O',
  '[OH-]',
  'c1ccccc1',
  'C[C@H]',
  // Stereo
  'F/C=C/F',
  'F\C=C\F',
  // Ring closure stereo
  'F/C1=CCC1/F',
  // Branches/aromatic
  'CC(C)C',
  'c1ccncc1',
  // Charges
  '[NH4+]',
  '[O-]C=O',
  // Complex
  'CC(C)C(=O)O',
  ];

describe('RDKit Canonical SMILES Comparison', () => {
  TEST_SMILES.forEach((input) => {
    it(`matches RDKit canonical SMILES for ${input}`, async () => {
      const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
      if (!rdkitModule) {
        console.warn(`RDKit not available for ${input}`);
        return;
      }
      const initRDKitModule = rdkitModule.default;
      const RDKit: any = await (initRDKitModule as any)();
      const result = parseSMILES(input);
      expect(result.errors).toHaveLength(0);
      const ours = generateSMILES(result.molecules);
      let rdkitCanonical = '';
      try {
        const mol = RDKit.get_mol(input);
        if (mol && mol.is_valid()) {
          rdkitCanonical = mol.get_smiles();
        }
      } catch (e) {
        console.error(`RDKit error for ${input}:`, e);
        rdkitCanonical = '';
      }
      if (!rdkitCanonical) {
        console.warn(`RDKit failed to parse ${input}`);
        return;
      }
      expect(ours).toBe(rdkitCanonical);
    });
  });
});
