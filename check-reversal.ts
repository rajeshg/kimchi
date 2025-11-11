import { parseSMILES } from './index';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0];

console.log('\n=== ORIGINAL NUMBERING ===');
console.log('Position 3 → atom 13 (ketone C)');
console.log('Position 6 → atom 10 (ring O)');
console.log('Position 9 → atom 9 (ring O)');
console.log('Position 12 → atom 3 (ketone C)');

console.log('\n=== REVERSED NUMBERING (12 atoms) ===');
console.log('Position 1 → Position 12');
console.log('Position 2 → Position 11');
console.log('Position 3 → Position 10');
console.log('Position 6 → Position 7');
console.log('Position 9 → Position 4');
console.log('Position 12 → Position 1');

console.log('\nReversed:');
console.log('Position 10 → atom 13 (ketone) - was position 3');
console.log('Position 7 → atom 10 (ring O) - was position 6');
console.log('Position 4 → atom 9 (ring O) - was position 9');
console.log('Position 1 → atom 3 (ketone) - was position 12');

console.log('\nSo reversed numbering gives:');
console.log('Hetero at [4, 7]');
console.log('Principal at [1, 10]');

console.log('\nExpected from reference:');
console.log('Hetero at [3, 12]');
console.log('Principal at [6, 9]');
