// Expected: 4,4,11,11-tetramethyl-3,12-dioxatricyclo[6.4.0.02,7]dodecane-6,9-dione
// This means:
// - Position 2,7 are bridgehead carbons (secondary bridge)
// - Position 3,12 are oxygen atoms
// - Position 6,9 are ketone carbons
// - Position 4,4,11,11 are methyl-bearing carbons

console.log('Expected numbering implies:');
console.log('Position 2: bridgehead C');
console.log('Position 3: oxygen');
console.log('Position 6: ketone C');
console.log('Position 7: bridgehead C');
console.log('Position 9: ketone C');
console.log('Position 12: oxygen');
console.log('Positions 4,11: quaternary C with 2 methyls each');

console.log('\nOur current numbering:');
console.log('Position 1: atom 5 (C)');
console.log('Position 2: atom 6 (C) - bridgehead');
console.log('Position 3: atom 13 (C with =O) - ketone');
console.log('Position 6: atom 10 (O) - ring oxygen');
console.log('Position 7: atom 7 (C) - bridgehead');
console.log('Position 9: atom 9 (O) - ring oxygen');
console.log('Position 12: atom 3 (C with =O) - ketone');

console.log('\nComparison:');
console.log('Expected pos 3 = O, we have C=O (WRONG)');
console.log('Expected pos 6 = C=O, we have O (SWAPPED)');
console.log('Expected pos 9 = C=O, we have O (SWAPPED)');
console.log('Expected pos 12 = O, we have C=O (WRONG)');

console.log('\nThis confirms: hetero and principal locants are completely swapped!');
