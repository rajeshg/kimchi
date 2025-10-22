import { parseSMILES } from 'index';
import { parseSMARTS } from 'src/parsers/smarts-parser';
import { matchSMARTS } from 'src/matchers/smarts-matcher';

const SMARTS_PATTERNS = [
  'C',
  'N',
  'O',
  'C-C',
  'C=C',
];

const TEST_SMILES = [
  'n1c2ccccc2c1',
  'n1c(=O)ccn1',
  'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5',
];

async function main() {
  if (!process.env.RUN_RDKIT_BULK) {
    console.log('Set RUN_RDKIT_BULK=1 to collect failures');
    return;
  }

  const RDKitModule = await import('@rdkit/rdkit');
  const RDKit: any = RDKitModule.default ?? RDKitModule;
  if (typeof RDKit.initRDKitModule === 'function') {
    await RDKit.initRDKitModule();
  }

  const failures: Array<{
    pattern: string;
    smiles: string;
    opencodeCount: number;
    rdkitCount: number;
    opencodeMatches: string;
    rdkitMatches: string;
  }> = [];

  for (const pattern of SMARTS_PATTERNS) {
    for (const smiles of TEST_SMILES) {
      const molResult = parseSMILES(smiles);
      const mol = molResult.molecules?.[0];
      if (!mol) continue;

      const smartsResult = parseSMARTS(pattern);
      if (!smartsResult.pattern) continue;

      const opencodeResult = matchSMARTS(smartsResult.pattern, mol, { uniqueMatches: true });
      
      const rdkitMol = typeof RDKit.get_mol === 'function' ? RDKit.get_mol(smiles) : null;
      if (!rdkitMol) continue;
      
      const rdkitQuery = typeof RDKit.get_qmol === 'function' ? RDKit.get_qmol(pattern) : null;
      if (!rdkitQuery) {
        rdkitMol.delete();
        continue;
      }

      const rdkitMatchJson = rdkitMol.get_substruct_matches(rdkitQuery);
      const rdkitMatches = JSON.parse(rdkitMatchJson);
      
      rdkitMol.delete();
      rdkitQuery.delete();

      if (opencodeResult.matches.length !== rdkitMatches.length) {
        failures.push({
          pattern,
          smiles,
          opencodeCount: opencodeResult.matches.length,
          rdkitCount: rdkitMatches.length,
          opencodeMatches: JSON.stringify(opencodeResult.matches.map((m: any) => m.map((am: any) => am.moleculeAtomIndex))),
          rdkitMatches: JSON.stringify(rdkitMatches)
        });
      }
    }
  }

  console.log('export const FAILURE_CASES = [');
  failures.forEach(f => {
    console.log(`  {`);
    console.log(`    pattern: '${f.pattern}',`);
    console.log(`    smiles: '${f.smiles}',`);
    console.log(`    opencodeCount: ${f.opencodeCount},`);
    console.log(`    rdkitCount: ${f.rdkitCount},`);
    console.log(`    opencodeMatches: ${f.opencodeMatches},`);
    console.log(`    rdkitMatches: ${f.rdkitMatches},`);
    console.log(`  },`);
  });
  console.log('];');
}

main();
