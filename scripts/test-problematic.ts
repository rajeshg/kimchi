import { parseSMILES } from '../index';

const PROBLEMATIC_SMILES = 'CC(C)Cc1ccc(cc1)C(C)C(=O)O';

console.log('Testing problematic molecule (Ibuprofen)...');
const start = performance.now();
const result = parseSMILES(PROBLEMATIC_SMILES);
const end = performance.now();

console.log(`Parsing time: ${(end - start).toFixed(2)}ms`);
console.log(`Molecules parsed: ${result.molecules.length}`);
console.log(`Errors: ${result.errors.length}`);
