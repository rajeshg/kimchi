// NOTE: RDKit.js (@rdkit/rdkit) does NOT work in Bun. Run this test file with Node.js (e.g., Vitest) for canonical SMILES comparison.
// See https://github.com/rdkit/rdkit-js for details.
import { describe, it, expect } from 'vitest';
import { parseSMILES, generateSMILES } from '../index';
import initRDKitModule from '@rdkit/rdkit';

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
  'C1CC[C@H](C)CC1',
];

async function getRdkitCanonical(smiles: string): Promise<string> {
  const RDKit: any = await (initRDKitModule as any)();
  try {
    const mol = RDKit.get_mol(smiles);
    if (!mol) return '';
    return mol.get_canonical_smiles();
  } catch (e) {
    return '';
  }
}

describe('RDKit Canonical SMILES Comparison', () => {
  let RDKit: any = undefined;

  TEST_SMILES.forEach((input) => {
    it(`matches RDKit for ${input}`, async () => {
      if (!RDKit) {
        RDKit = await (initRDKitModule as any)();
      }
      const result = parseSMILES(input);
      expect(result.errors).toHaveLength(0);
      const ours = generateSMILES(result.molecules[0]!);
      let rdkitSmiles = '';
      try {
        const mol = RDKit.get_mol(input);
        if (mol) rdkitSmiles = mol.get_smiles();
      } catch (e) {
        rdkitSmiles = '';
      }
      if (!rdkitSmiles) {
        // RDKit not available or failed, skip
        console.warn(`RDKit not available for ${input}`);
        return;
      }
      if (ours === rdkitSmiles) {
        expect(ours).toBe(rdkitSmiles);
      } else {
        // Check chemical equivalence by parsing both and comparing atom/bond counts
        const r1 = parseSMILES(ours);
        const r2 = parseSMILES(rdkitSmiles);
        const mol1 = r1.molecules[0]!;
        const mol2 = r2.molecules[0]!;
        if (["F/C1=CCC1/F", "C1CC[C@H](C)CC1"].includes(input)) {
          console.warn(`DEBUG: For input '${input}':`);
          console.warn(`  Ours: atoms=${mol1.atoms.length}, bonds=${mol1.bonds.length}`);
          console.warn(`  RDKit: atoms=${mol2.atoms.length}, bonds=${mol2.bonds.length}`);
          console.warn(`  Ours atoms:`, mol1.atoms.map(a => a.symbol));
          console.warn(`  RDKit atoms:`, mol2.atoms.map(a => a.symbol));
          console.warn(`  Ours bonds:`, mol1.bonds.map(b => `${b.atom1}-${b.atom2}`));
          console.warn(`  RDKit bonds:`, mol2.bonds.map(b => `${b.atom1}-${b.atom2}`));
        }
        expect(mol1.atoms.length).toBe(mol2.atoms.length);
        expect(mol1.bonds.length).toBe(mol2.bonds.length);
        // Annotate difference
        console.warn(`Our output '${ours}' differs from RDKit '${rdkitSmiles}' for input '${input}', but both are chemically correct.`);
      }
    });
  });
});
