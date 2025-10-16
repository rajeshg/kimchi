import { describe, it } from 'bun:test';
import { parseSMILES, parseSMARTS, matchSMARTS } from 'index';
import { initializeRDKit, getSubstructMatches } from './rdkit-smarts-api';
import { assertMatchesEqual } from './comparison-framework';
import { writeFileSync } from 'fs';

describe('RDKit SMARTS Failures Collection', () => {
  const runCapture = !!process.env.RUN_RDKIT_BULK;
  if (!runCapture) {
    it('skipped (set RUN_RDKIT_BULK=1 to run)', () => {});
    return;
  }

  const SMARTS_PATTERNS = [
    'C',
    'N',
    'O',
    'C-C',
    'C=C',
    'C#C',
    'c1ccccc1',
    '[OH]',
    'C(=O)O',
    'C(=O)N',
    '[NH2]',
    '[R]',
    '[R0]',
    '[a]',
    '[A]',
    '[D1]',
    '[D2]',
    '[H1]',
    '[C&D2]',
    '[C,N]',
  ];

  const TEST_SMILES: string[] = [];

  for (let i = 1; i <= 40; i++) {
    TEST_SMILES.push('C'.repeat(i));
  }

  for (let i = 1; i <= 30; i++) {
    TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '=C' + (i % 5 === 0 ? 'C' : ''));
  }

  for (let i = 1; i <= 10; i++) {
    TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '#C');
  }

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
    'c1c[nH]cc1',
    'n1c(=O)ccn1'
  );

  const funcs = [
    'CCO','CC=O','CC(=O)O','CC(=O)N','CC(=O)Cl','C(Cl)(Cl)Cl','COC','CCN','CNC','CCS',
    'CS','C=O','O=C=O','CC(=O)OCC','CC(=O)OCCO','C(=O)(O)O','C(C)(C)O','C(=O)N','CCOC','CC(=O)OC',
    'CC(=O)CCC','CC(C)O','CC(C)C(=O)O','CC(C)(C)O','CC(=O)N(C)C','CC(C)N','CC(=O)S','CC(=O)Cl','CC(Br)C','CC(=O)F',
    'OC(=O)C','OCCO','OCC(=O)O','C1=CC=CC=C1','C1=CC=C(O)C=C1','C1=CC=CN=C1','CC(=O)N1CCCC1','CCN(CC)CC','CC(C)CCO','CC(C)(C)CO',
    'CCCC','CCC(C)C','CC(C)CC'
  ];
  TEST_SMILES.push(...funcs);

  TEST_SMILES.push(
    '[NH4+]','[NH3+]','[O-]C=O','[NH2+]','[Na+].[Cl-]','[K+].[Cl-]','[NH4+].[Cl-]','[O-]C(=O)C',
    '[NH3+]', '[O-]C(=O)[O-]', '[N+](C)(C)C','[P+](C)(C)(C)','[S-]','[Cl-]','[Br-]','[I-]','[NH4+].[O-]','[NH2-]','[NH+]=C','[NH+](C)C'
  );

  for (let n = 3; n <= 32; n++) {
    TEST_SMILES.push('C1' + 'C'.repeat(n - 1) + '1');
  }

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
    'NCC(=O)O','N[C@@H](C)C(=O)O','N[C@@H](C)C(=O)N','C(C(=O)O)N','C(C(=O)O)O','OCC(O)C(O)C','C1OC(O)C(O)C1O',
    'C(C(=O)O)N(C)C','CC(=O)NC1=CC=CC=C1','CC(=O)NCC(=O)O','CC(C)C(=O)O','C(C(=O)O)C(=O)O','C(CO)N','C(CO)O',
    'C(C(=O)N)O','N[C@@H](CC1=CC=CC=C1)C(=O)O','CC(O)C(=O)O','CC(=O)OCC(O)C','OC(CO)C(O)C'
  ];
  TEST_SMILES.push(...bio);

  const wikipedia = [
    'N#N',
    'CN=C=O',
    '[Cu+2].[O-]S(=O)(=O)[O-]',
    'O=Cc1ccc(O)c(OC)c1',
    'COc1cc(C=O)ccc1O',
    'CC(=O)NCCC1=CNc2c1cc(OC)cc2',
    'CC(=O)NCCc1c[nH]c2ccc(OC)cc12',
    'CCc(c1)ccc2[n+]1ccc3c2[nH]c4c3cccc4',
    'CCc1c[n+]2ccc3c4ccccc4[nH]c3c2cc1',
    'CN1CCC[C@H]1c2cccnc2',
    'CCC[C@@H](O)CC\\C=C\\C=C\\C#CC#C\\C=C\\CO',
    'CCC[C@@H](O)CC/C=C/C=C/C#CC#C/C=C/CO',
    'CC1=C(C(=O)C[C@@H]1OC(=O)[C@@H]2[C@H](C2(C)C)/C=C(\\C)/C(=O)OC)C/C=C\\C=C',
    'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5',
    'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)1',
    'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H]2[C@@H]1c3c(O)c(OC)c(O)cc3C(=O)O2',
    'CC(=O)OCCC(/C)=C\\C[C@H](C(C)=C)CCC=C',
    'CC[C@H](O1)CC[C@@]12CCCO2',
    'CC(C)[C@@]12C[C@@H]1[C@@H](C)C(=O)C2',
    'OCCc1c(C)[n+](cs1)Cc2cnc(C)nc2N',
    'CC(C)(O1)C[C@@H](O)[C@@]1(O2)[C@@H](C)[C@@H]3CC=C4[C@]3(C2)C(=O)C[C@H]5[C@H]4CC[C@@H](C6)[C@]5(C)Cc(n7)c6nc(C[C@@]89(C))c7C[C@@H]8CC[C@@H]%10[C@@H]9C[C@@H](O)[C@@]%11(C)C%10=C[C@H](O%12)[C@]%11(O)[C@H](C)[C@]%12(O%13)[C@H](O)C[C@@]%13(C)CO'
  ];
  TEST_SMILES.push(...wikipedia);

  const drugs = [
    'CC(=O)Oc1ccccc1C(=O)O',
    'CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O',
    'CC(=O)Nc1ccc(O)cc1',
    'CC(C)(C)NCC(O)c1ccc(O)c(CO)c1',
    'CN(C)CC(c1ccc(OC)cc1)c2ccccn2',
    'CC(C)NCC(O)COc1ccccc1CC=C',
    'CC(C)NCC(O)c1ccc(COCCOC)cc1',
    'CN1C(=O)CN=C(c2ccccc2)c3cc(Cl)ccc13',
    'COc1ccc2nc(C)c(CCN(C)C)c(C)c2c1',
    'CN(C)CCCN1c2ccccc2Sc3ccccc13',
    'CC(C)NCC(O)c1ccc(NS(C)(=O)=O)cc1',
    'CC(=O)Oc1cc2C(C)(CCC3C2CCC4(C)C3CCC4(O)C#C)C(=O)CO1',
    'CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C',
    'CN1CCC[C@H]1c2cccnc2',
    'CN1CCC23C4C(=O)CCC2(C1Cc5ccc(O)c(O)c35)C4',
    'COc1cc2c(C[C@H]3NCCCC3)c[nH]c2cc1',
    'CC(C)(C)NCC(O)c1ccc(OCCCOC)cc1',
    'Cc1ccc(cc1)S(=O)(=O)N',
    'CS(=O)(=O)Nc1ccc(N)cc1',
    'CC1(C)SC2C(NC(=O)Cc3ccccc3)C(=O)N2C1C(=O)O',
    'COC(=O)C1=C(C)NC(C)=C(C(=O)OC)C1c2ccccc2[N+]([O-])=O',
    'CN1CCCC1c2cccnc2',
    'Clc1ccc(cc1)C(c2ccc(Cl)cc2)C(Cl)(Cl)Cl',
    'CC1=C(C(=O)O)N2C(=O)C(NC(=O)Cc3ccccc3)C2SC1',
    'CC1COc2ccccc2N1',
  ];
  TEST_SMILES.push(...drugs);

  it('captures all failures to a file', async () => {
    const RDKit = await initializeRDKit();
    
    interface Failure {
      pattern: string;
      smiles: string;
      error: string;
      chemkitMatches: number[][];
      rdkitMatches: number[][];
    }
    
    const failures: Failure[] = [];
    let successCount = 0;
    
    for (const pattern of SMARTS_PATTERNS) {
      const smartsPattern = parseSMARTS(pattern);
      if (smartsPattern.errors && smartsPattern.errors.length > 0) {
        continue;
      }

      for (const smiles of TEST_SMILES) {
        const parsed = parseSMILES(smiles);
        if (parsed.errors && parsed.errors.length > 0) {
          continue;
        }

        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        if (!rdkitResult.success) {
          continue;
        }

        const allChemkitMatches: number[][] = [];
        let atomOffset = 0;
        for (const mol of parsed.molecules) {
          const chemkitResult = matchSMARTS(smartsPattern.pattern!, mol, { uniqueMatches: true });
          const chemkitMatches = chemkitResult.matches.map(match => 
            match.atoms.map(a => a.moleculeIndex + atomOffset)
          );
          allChemkitMatches.push(...chemkitMatches);
          atomOffset += mol.atoms.length;
        }
        const chemkitMatches = allChemkitMatches;

        try {
          assertMatchesEqual(chemkitMatches, rdkitResult.matches, pattern, smiles);
          successCount++;
        } catch (e) {
          failures.push({
            pattern,
            smiles,
            error: String(e),
            chemkitMatches,
            rdkitMatches: rdkitResult.matches
          });
        }
      }
    }

    console.log(`\nTotal: ${successCount + failures.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Failures: ${failures.length}`);
    
    writeFileSync(
      'test/smarts/rdkit-comparison/failures.json',
      JSON.stringify(failures, null, 2)
    );
    
    console.log('\nFailures written to test/smarts/rdkit-comparison/failures.json');
  }, 600000);
});
