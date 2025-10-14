import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES } from 'index';

// Initialize RDKit once for the entire test file
let rdkitInstance: any = null;
let rdkitInitialized = false;

async function initializeRDKit(): Promise<any> {
  if (rdkitInitialized) return rdkitInstance;
  
  try {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
    }
    const initRDKitModule = rdkitModule.default;
    rdkitInstance = await (initRDKitModule as any)();
    rdkitInitialized = true;
    return rdkitInstance;
  } catch (e) {
    throw new Error('Failed to initialize RDKit');
  }
}

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
  // Stereo - cis/trans alkenes
  'F/C=C/F',
  'F\C=C\F',
  'F/C=C\\F',
  'C/C=C/C',
  'C\\C=C\\C',
  'C/C=C\\C',
  // Stereo - tri/tetra-substituted
  'Cl/C=C(\\F)Br',
  'Br/C=C/I',
  // Stereo - conjugated systems
  'F/C=C/C=C/F',
  'C/C=C\\C=C/C',
  // Stereo - heteroatoms
  'N/C=C/O',
  '[O-]/C=C/[O-]',
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
      const RDKit = await initializeRDKit();
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
        throw new Error(`RDKit failed to parse ${input}`);
      }
      expect(ours).toBe(rdkitCanonical);
    });
  });
});
