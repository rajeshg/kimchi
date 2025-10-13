import { parseSMILES, generateSMILES } from '../index';
import fs from 'fs';

// Recreate the same TEST_SMILES list as the test
const TEST_SMILES: string[] = [];
for (let i = 1; i <= 40; i++) TEST_SMILES.push('C'.repeat(i));
for (let i = 1; i <= 30; i++) TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '=C' + (i % 5 === 0 ? 'C' : ''));
for (let i = 1; i <= 10; i++) TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '#C');
TEST_SMILES.push(
  'c1ccccc1','c1ccncc1','c1ccccc1O','c1ccccc1N','c1ccc(cc1)O','c1ccccc1C(=O)O','c1ccccc1F','c1ccccc1Cl','c1ccccc1Br','c1ccncc1O'
);
TEST_SMILES.push(
  'n1ccccc1','c1cc[nH]c1','c1ncccc1','o1cccc1','s1cccc1','c1cnccn1','c1ccoc1','c1ccsc1','n1c2ccccc2c1','n1cccc1','c1ccncc1','c1nccn1','c1nccn1O','c1nccn1C','c1cc[nH]c1C','o1ccccc1O','s1ccccc1','c1csc(cc1)O','c1c[nH]cc1','n1c(=O)ccn1'
);
const funcs = [
  'CCO','CC=O','CC(=O)O','CC(=O)N','CC(=O)Cl','C(Cl)(Cl)Cl','COC','CCN','CNC','CCS',
  'CS','C=O','O=C=O','CC(=O)OCC','CC(=O)OCCO','C(=O)(O)O','C(C)(C)O','C(=O)N','CCOC','CC(=O)OC',
  'CC(=O)CCC','CC(C)O','CC(C)C(=O)O','CC(C)(C)O','CC(=O)N(C)C','CC(C)N','CC(=O)S','CC(=O)Cl','CC(Br)C','CC(=O)F',
  'OC(=O)C','OCCO','OCC(=O)O','C1=CC=CC=C1','C1=CC=C(O)C=C1','C1=CC=CN=C1','CC(=O)N1CCCC1','CCN(CC)CC','CC(C)CCO','CC(C)(C)CO'
];
TEST_SMILES.push(...funcs);
TEST_SMILES.push(
  '[NH4+]','[NH3+]','[O-]C=O','[NH2+]','[Na+].[Cl-]','[K+].[Cl-]','[NH4+].[Cl-]','[O-]C(=O)C',
  '[NH3+]', '[O-]C(=O)[O-]', '[N+](C)(C)C','[P+](C)(C)(C)','[S-]','[Cl-]','[Br-]','[I-]','[NH4+].[O-]','[NH2-]','[NH+]=C','[NH+](C)C'
);
for (let n = 3; n <= 32; n++) TEST_SMILES.push('C1' + 'C'.repeat(n - 1) + '1');
const subs = ['O','F','Cl','Br','N','S','C(=O)O','CO'];
for (let i = 0; i < 20; i++) {
  const s = subs[i % subs.length];
  TEST_SMILES.push(`C[C@H](${s})C`);
  TEST_SMILES.push(`C[C@@H](${s})C`);
}
TEST_SMILES.push(
  '[13CH4]','[2H]O','[13C]C(=O)O','[14NH4+]','[15N]N','[13CH3]Cl','[2H]C(=O)O','[13C]C','[2H]OC','[13CH2]O',
  '[13C]C(Cl)C','[2H]CCO','[13C]O','[2H]N','[13C]N','[2H]C','[13C](=O)O','[2H]CO','[13C]C(=O)N','[2H]C(=O)O'
);
const bio = [
  'NCC(=O)O','N[C@@H](C)C(=O)O','N[C@@H](C)C(=O)N','N[C@@H](C)C(=O)O','C(C(=O)O)N','C(C(=O)O)O','OCC(O)C(O)C','C1OC(O)C(O)C1O',
  'C(C(=O)O)N(C)C','CC(=O)NC1=CC=CC=C1','CC(=O)NCC(=O)O','CC(C)C(=O)O','C(C(=O)O)C(=O)O','C(CO)N','C(CO)O','C(C(=O)O)S',
  'C(C(=O)N)O','O=C(N)C(=O)O','N[C@@H](CC1=CC=CC=C1)C(=O)O','CC(O)C(=O)O','CC(C)C(=O)O','CC(=O)OCC(O)C','CC(C)C(=O)N','OC(CO)C(O)C',
  'C1CC(=O)NC1','C1CC(=O)OCC1','C1CC(CO)OC1','C(C(=O)O)C(=O)O','C(C(=O)O)CC(=O)O','N[C@H](C)C(=O)N','N[C@@H](C)C(=O)O','CC(=O)N(C)C(=O)C',
  'CC(C)C(=O)N(C)C(=O)C','C(C(=O)O)C(O)C(=O)O','CC(C)C(=O)OCC','CCC(=O)O','CC(C)C(O)C(=O)O'
];
TEST_SMILES.push(...bio);
while (TEST_SMILES.length < 300) {
  const n = (TEST_SMILES.length % 12) + 1;
  TEST_SMILES.push('C'.repeat(n));
}

(async function main() {
  const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
  if (!rdkitModule) {
    console.warn('RDKit not available; aborting report generation');
    process.exit(0);
  }
  const initRDKitModule = rdkitModule.default;
  const RDKit: any = await (initRDKitModule as any)();

  const report: any[] = [];

  for (const smiles of TEST_SMILES) {
    const entry: any = { input: smiles };
    const parsed = parseSMILES(smiles);
    entry.parsed = {
      errors: parsed.errors || [],
      moleculesPresent: !!parsed.molecules
    };
    try {
      entry.ours = parsed.molecules ? generateSMILES(parsed.molecules) : null;
    } catch (e) {
      entry.ours = null;
      entry.oursError = e instanceof Error ? e.message : String(e);
    }

    // RDKit parse original
    try {
      const mol = RDKit.get_mol(smiles);
      entry.rdkitOriginal = (mol && mol.is_valid()) ? mol.get_smiles() : null;
    } catch (e) {
      entry.rdkitOriginal = null;
      entry.rdkitOriginalError = e instanceof Error ? e.message : String(e);
    }

    // RDKit parse ours
    if (entry.ours) {
      try {
        const mol2 = RDKit.get_mol(entry.ours);
        entry.rdkitOurs = (mol2 && mol2.is_valid()) ? mol2.get_smiles() : null;
      } catch (e) {
        entry.rdkitOurs = null;
        entry.rdkitOursError = e instanceof Error ? e.message : String(e);
      }
    }

    report.push(entry);
  }

  fs.writeFileSync('rdkit-bulk-report.json', JSON.stringify(report, null, 2));
  console.log('Wrote rdkit-bulk-report.json with', report.length, 'entries');
})();
