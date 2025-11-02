import { parseSMILES, generateIUPACName } from '../index';

const smiles = 'CCCCCCCC(=O)OC(C)C1CCCO1';
console.log('Testing:', smiles);

const result = parseSMILES(smiles);
if (result.errors.length > 0) {
  console.log('Parse errors:', result.errors);
  process.exit(1);
}

const mol = result.molecules[0];
if (!mol) {
  console.log('No molecule parsed');
  process.exit(1);
}

const iupacResult = generateIUPACName(mol);
console.log('\nIUPAC name:', iupacResult.name);
console.log('Expected:   1-(oxolan-2-yl)ethyl octanoate');
console.log('\nConfidence:', iupacResult.confidence);
console.log('Errors:', iupacResult.errors);
console.log('Warnings:', iupacResult.warnings);
