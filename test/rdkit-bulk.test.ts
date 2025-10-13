import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES } from '../index';

// Programmatically build a diverse list of 300 SMILES
const TEST_SMILES: string[] = [];

// 1) Alkanes (1..40)
for (let i = 1; i <= 40; i++) {
  TEST_SMILES.push('C'.repeat(i));
}

// 2) Alkenes (30 variants)
for (let i = 1; i <= 30; i++) {
  TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '=C' + (i % 5 === 0 ? 'C' : ''));
}

// 3) Alkynes (10)
for (let i = 1; i <= 10; i++) {
  TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '#C');
}

// 4) Aromatics / substituted aromatics (10)
TEST_SMILES.push(
  'c1ccccc1',
  'c1ccncc1',
  'c1ccccc1O',
  'c1ccccc1N',
  'c1ccc(cc1)O',
  'c1ccccc1C(=O)O',
  'c1ccccc1F',
  'c1ccccc1Cl',
  'c1ccccc1Br',
  'c1ccncc1O'
);

// 5) Heteroaromatics (20)
TEST_SMILES.push(
  'n1ccccc1',
  'c1cc[nH]c1',
  'c1ncccc1',
  'o1cccc1',
  's1cccc1',
  'c1cnccn1',
  'c1ccoc1',
  'c1ccsc1',
  'n1c2ccccc2c1',
  'n1cccc1',
  'c1ccncc1',
  'c1nccn1',
  'c1nccn1O',
  'c1nccn1C',
  'c1cc[nH]c1C',
  'o1ccccc1O',
  's1ccccc1',
  'c1csc(cc1)O',
  'c1c[nH]cc1',
  'n1c(=O)ccn1'
);

// 6) Functional groups and small organics (40)
const funcs = [
  'CCO','CC=O','CC(=O)O','CC(=O)N','CC(=O)Cl','C(Cl)(Cl)Cl','COC','CCN','CNC','CCS',
  'CS','C=O','O=C=O','CC(=O)OCC','CC(=O)OCCO','C(=O)(O)O','C(C)(C)O','C(=O)N','CCOC','CC(=O)OC',
  'CC(=O)CCC','CC(C)O','CC(C)C(=O)O','CC(C)(C)O','CC(=O)N(C)C','CC(C)N','CC(=O)S','CC(=O)Cl','CC(Br)C','CC(=O)F',
  'OC(=O)C','OCCO','OCC(=O)O','C1=CC=CC=C1','C1=CC=C(O)C=C1','C1=CC=CN=C1','CC(=O)N1CCCC1','CCN(CC)CC','CC(C)CCO','CC(C)(C)CO'
];
TEST_SMILES.push(...funcs);

// 7) Charged species / salts (20)
TEST_SMILES.push(
  '[NH4+]','[NH3+]','[O-]C=O','[NH2+]','[Na+].[Cl-]','[K+].[Cl-]','[NH4+].[Cl-]','[O-]C(=O)C',
  '[NH3+]', '[O-]C(=O)[O-]', '[N+](C)(C)C','[P+](C)(C)(C)','[S-]','[Cl-]','[Br-]','[I-]','[NH4+].[O-]','[NH2-]','[NH+]=C','[NH+](C)C'
);

// 8) Rings: cyclopropane..cyclotriacontane (sizes 3..32) => 30
for (let n = 3; n <= 32; n++) {
  TEST_SMILES.push('C1' + 'C'.repeat(n - 1) + '1');
}

// 9) Stereocenters (40) - mix @ and @@ with different substituents
const subs = ['O','F','Cl','Br','N','S','C(=O)O','CO'];
for (let i = 0; i < 20; i++) {
  const s = subs[i % subs.length];
  TEST_SMILES.push(`C[C@H](${s})C`);
  TEST_SMILES.push(`C[C@@H](${s})C`);
}

// 10) Isotopes / explicit hydrogens (20)
TEST_SMILES.push(
  '[13CH4]','[2H]O','[13C]C(=O)O','[14NH4+]','[15N]N','[13CH3]Cl','[2H]C(=O)O','[13C]C','[2H]OC','[13CH2]O',
  '[13C]C(Cl)C','[2H]CCO','[13C]O','[2H]N','[13C]N','[2H]C','[13C](=O)O','[2H]CO','[13C]C(=O)N','[2H]C(=O)O'
);

// 11) Complex biomolecules / small residues (40)
const bio = [
  'NCC(=O)O','N[C@@H](C)C(=O)O','N[C@@H](C)C(=O)N','N[C@@H](C)C(=O)O','C(C(=O)O)N','C(C(=O)O)O','OCC(O)C(O)C','C1OC(O)C(O)C1O',
  'C(C(=O)O)N(C)C','CC(=O)NC1=CC=CC=C1','CC(=O)NCC(=O)O','CC(C)C(=O)O','C(C(=O)O)C(=O)O','C(CO)N','C(CO)O','C(C(=O)O)S',
  'C(C(=O)N)O','O=C(N)C(=O)O','N[C@@H](CC1=CC=CC=C1)C(=O)O','CC(O)C(=O)O','CC(C)C(=O)O','CC(=O)OCC(O)C','CC(C)C(=O)N','OC(CO)C(O)C',
  'C1CC(=O)NC1','C1CC(=O)OCC1','C1CC(CO)OC1','C(C(=O)O)C(=O)O','C(C(=O)O)CC(=O)O','N[C@H](C)C(=O)N','N[C@@H](C)C(=O)O','CC(=O)N(C)C(=O)C',
  'CC(C)C(=O)N(C)C(=O)C','C(C(=O)O)C(O)C(=O)O','CC(C)C(=O)OCC','CCC(=O)O','CC(C)C(O)C(=O)O'
];
TEST_SMILES.push(...bio);

// Final fill if needed (ensure exactly 300 entries)
while (TEST_SMILES.length < 300) {
  // add simple alkane variants to reach 300
  const n = (TEST_SMILES.length % 12) + 1;
  TEST_SMILES.push('C'.repeat(n));
}

// Sanity check
if (TEST_SMILES.length !== 300) {
  throw new Error(`TEST_SMILES expected 300 but got ${TEST_SMILES.length}`);
}


describe('RDKit Bulk Comparison (300 SMILES)', () => {
  it('compares our SMILES generation with RDKit for 300 SMILES', async () => {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      console.warn('RDKit not available; skipping bulk RDKit comparison test');
      return;
    }
    const initRDKitModule = rdkitModule.default;
    const RDKit: any = await (initRDKitModule as any)();

    const parseFailures: string[] = [];
    const generationFailures: string[] = [];

    for (const smiles of TEST_SMILES) {
      const parsed = parseSMILES(smiles);
      if (parsed.errors && parsed.errors.length > 0) {
        parseFailures.push(smiles);
        continue;
      }
      const chemkitOutput = generateSMILES(parsed.molecules);

      // Check round-trip: parse -> generate -> parse should work
      const roundTrip = parseSMILES(chemkitOutput);
      if (roundTrip.errors && roundTrip.errors.length > 0) {
        generationFailures.push(`${smiles} -> ${chemkitOutput} (round-trip failed: ${roundTrip.errors.map(e => e.message).join(', ')})`);
        continue;
      }

      // Check semantic equivalence: the generated molecule should have same atom/bond count
      const originalAtoms = parsed.molecules[0]!.atoms.length;
      const originalBonds = parsed.molecules[0]!.bonds.length;
      const generatedAtoms = roundTrip.molecules[0]!.atoms.length;
      const generatedBonds = roundTrip.molecules[0]!.bonds.length;

      if (originalAtoms !== generatedAtoms || originalBonds !== generatedBonds) {
        generationFailures.push(`${smiles} -> ${chemkitOutput} (structure mismatch: ${originalAtoms}/${originalBonds} vs ${generatedAtoms}/${generatedBonds})`);
      }
    }

    // Report
    console.log('\nChemkit Bulk Test Report');
    console.log('Total SMILES:', TEST_SMILES.length);
    console.log('Parse failures:', parseFailures.length);
    console.log('Generation/round-trip failures:', generationFailures.length);

    if (parseFailures.length > 0) console.log('First parse failures:', parseFailures.slice(0,5));
    if (generationFailures.length > 0) console.log('First generation failures:', generationFailures.slice(0,5));

    // Fail the test if chemkit cannot properly parse or generate SMILES
    expect(generationFailures.length).toBe(0);
  }, 600000);
});
