import { parseSMILES } from './index.js';

// Test with a very large complex molecule from PubChem
const testSMILES = 'C[C@@H]1CC[C@@]2([C@H]([C@H]3[C@@H](O2)C[C@@H]4[C@@]3(CC[C@H]5[C@H]4CC=C6[C@@]5(CCC7=C6SC(=N7)NC8=CC(=C(C=C8)C)Cl)C)C)C)OC1';

console.log('Testing large SMILES parsing...');
console.log(`SMILES length: ${testSMILES.length} characters`);

const startTime = performance.now();
const result = parseSMILES(testSMILES);
const endTime = performance.now();

console.log(`Parsing completed in ${(endTime - startTime).toFixed(2)}ms`);
console.log(`Parsed ${result.molecules[0].atoms.length} atoms and ${result.molecules[0].bonds.length} bonds`);