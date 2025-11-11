console.log('ORIGINAL numbering (as generated):');
console.log('Position 1: atom 5 (C)');
console.log('Position 2: atom 6 (C) ← bridgehead');
console.log('Position 3: atom 13 (C=O) ← ketone');
console.log('Position 4: atom 12 (C)');
console.log('Position 5: atom 11 (C)');
console.log('Position 6: atom 10 (O) ← ring oxygen');
console.log('Position 7: atom 7 (C) ← bridgehead');
console.log('Position 8: atom 8 (C)');
console.log('Position 9: atom 9 (O) ← ring oxygen');
console.log('Position 10: atom 1 (C)');
console.log('Position 11: atom 2 (C)');
console.log('Position 12: atom 3 (C=O) ← ketone');
console.log('Hetero: [6, 9], Principal: [3, 12]');
console.log('Secondary bridge: [2, 7]');

console.log('\n\nREVERSED numbering (pos -> 13 - pos):');
console.log('Position 12: atom 5 (C)');
console.log('Position 11: atom 6 (C) ← bridgehead');
console.log('Position 10: atom 13 (C=O) ← ketone');
console.log('Position 9: atom 12 (C)');
console.log('Position 8: atom 11 (C)');
console.log('Position 7: atom 10 (O) ← ring oxygen');
console.log('Position 6: atom 7 (C) ← bridgehead');
console.log('Position 5: atom 8 (C)');
console.log('Position 4: atom 9 (O) ← ring oxygen');
console.log('Position 3: atom 1 (C)');
console.log('Position 2: atom 2 (C)');
console.log('Position 1: atom 3 (C=O) ← ketone');
console.log('Hetero: [4, 7], Principal: [1, 10]');
console.log('Secondary bridge: [6, 11]');

console.log('\n\nEXPECTED:');
console.log('Hetero: [3, 12], Principal: [6, 9]');
console.log('Secondary bridge: [2, 7]');

console.log('\n\nNEITHER matches the expected!');
console.log('The problem must be in the INITIAL configuration selection or path ordering');
