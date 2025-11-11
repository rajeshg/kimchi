import { parseSMILES } from './index.ts';
import { generateIUPACName } from './src/iupac-engine/index.ts';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0];
const iupacName = generateIUPACName(mol);
console.log('\n=== FINAL RESULT ===');
console.log('SMILES:', smiles);
console.log('Generated:', iupacName);
console.log('Expected:  4,4,11,11-tetramethyl-3,12-dioxatricyclo[6.4.0.02,7]dodecane-6,9-dione');
