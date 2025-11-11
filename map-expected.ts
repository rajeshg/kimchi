console.log('Expected: 4,4,11,11-tetramethyl-3,12-dioxatricyclo[6.4.0.02,7]dodecane-6,9-dione');
console.log('\nThis means:');
console.log('Position 2: bridgehead C');
console.log('Position 3: heteroatom O');
console.log('Position 4: quaternary C with 2 methyls');
console.log('Position 6: ketone C');
console.log('Position 7: bridgehead C');
console.log('Position 9: ketone C');
console.log('Position 11: quaternary C with 2 methyls');
console.log('Position 12: heteroatom O');

console.log('\nOur molecule has:');
console.log('- 2 quaternary carbons with methyls: atoms 1 and 11');
console.log('- 2 ring oxygens: atoms 9 and 10');
console.log('- 2 ketone carbons: atoms 3 and 13');
console.log('- Bridgeheads: should be at positions 2 and 7');

console.log('\nCurrent numbering (WRONG):');
console.log('Position 2: atom 6');
console.log('Position 3: atom 13 (ketone) ← should be O');
console.log('Position 6: atom 10 (O) ← should be ketone');
console.log('Position 7: atom 7');
console.log('Position 9: atom 9 (O) ← should be ketone');
console.log('Position 10: atom 1 (quaternary C)');
console.log('Position 12: atom 3 (ketone) ← should be O');

console.log('\nExpected atom assignments:');
console.log('Position 2: bridgehead (atom 6 or 7)');
console.log('Position 3: oxygen (atom 9 or 10)');
console.log('Position 4: quaternary C (atom 1 or 11)');
console.log('Position 6: ketone (atom 3 or 13)');
console.log('Position 7: bridgehead (atom 6 or 7)');
console.log('Position 9: ketone (atom 3 or 13)');
console.log('Position 11: quaternary C (atom 1 or 11)');
console.log('Position 12: oxygen (atom 9 or 10)');

console.log('\nShift needed: hetero [6,9] -> [3,12] is a shift of -3');
console.log('But principal [3,12] -> [6,9] is also a shift of +3');
console.log('They are SWAPPED, suggesting wrong path or different alpha/omega');
