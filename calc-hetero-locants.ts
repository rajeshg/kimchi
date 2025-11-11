console.log('Original von Baeyer numbering:');
console.log('atom 9 (O) -> position 9');
console.log('atom 10 (O) -> position 6');
console.log('Hetero locants: [6, 9]');

console.log('\nReversed von Baeyer numbering (12 - pos + 1):');
console.log('atom 9 (O) -> position 12 - 9 + 1 = 4');
console.log('atom 10 (O) -> position 12 - 6 + 1 = 7');
console.log('Hetero locants: [4, 7]');

console.log('\nComparison:');
console.log('Original hetero: [6, 9]');
console.log('Reversed hetero: [4, 7]');
console.log('Reversed is LOWER, so should be chosen!');

console.log('\nBUT the reversal is choosing based on principal locants:');
console.log('Original principal: [3, 12]');
console.log('Reversed principal: [1, 10]');
console.log('Reversed is LOWER for principal, so it gets chosen');

console.log('\nThe BUG: reversal logic should check heteroatoms BEFORE principal!');
console.log('With correct priority:');
console.log('1. Compare hetero: [6,9] vs [4,7] → reversed wins');
console.log('2. Then use reversed for everything');
console.log('3. Result: hetero [4,7], principal... wait that\'s still wrong!');

console.log('\n\n=== WAIT - Let me recalculate ===');
console.log('If we keep ORIGINAL numbering (not reversed):');
console.log('Hetero at [6, 9], Principal at [3, 12]');
console.log('Expected: Hetero at [3, 12], Principal at [6, 9]');
console.log('These are SWAPPED!');

console.log('\nSo even the ORIGINAL numbering has them swapped.');
console.log('This means the problem is earlier - in how we identify heteroatoms vs principal groups!');
