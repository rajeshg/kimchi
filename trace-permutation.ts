// Selected config: alpha=5, omega=8, paths=[1,7,5] means path order is [path1, path3, path2]
// From verbose output:
// Path1: 5,6,13,12,11,10,7,8 (length=6)
// Path2: 5,3,2,1,9,8 (length=4)
// Path3: 5,8 (length=0)

console.log('Path ordering [1,7,5] means: path1, path3, path2');
console.log('\nVon Baeyer numbering algorithm:');
console.log('1. Position 1 = alpha = atom 5');
console.log('2. Number along path1 (except endpoints):');
console.log('   Path1 = 5,6,13,12,11,10,7,8');
console.log('   Position 2 = atom 6');
console.log('   Position 3 = atom 13');
console.log('   Position 4 = atom 12');
console.log('   Position 5 = atom 11');
console.log('   Position 6 = atom 10');
console.log('   Position 7 = atom 7 (omega, marks end of path1)');
console.log('3. Number along path3 (except endpoints):');
console.log('   Path3 = 5,8');
console.log('   No interior atoms, so position 8 = atom 8 (omega)');
console.log('4. Number along path2 (except endpoints):');
console.log('   Path2 = 5,3,2,1,9,8');
console.log('   Skip atom 5 (already numbered)');
console.log('   Position 9 = atom 3? NO WAIT...');

console.log('\nWAIT - I think the algorithm skips endpoints!');
console.log('Let me re-trace with correct logic...');

console.log('\nCORRECT algorithm:');
console.log('Position 1 = alpha = atom 5');
console.log('Path1 interior (5,6,13,12,11,10,7,8 minus 5,8): 6,13,12,11,10,7');
console.log('  Position 2 = atom 6');
console.log('  Position 3 = atom 13 ← KETONE');
console.log('  Position 4 = atom 12');
console.log('  Position 5 = atom 11');
console.log('  Position 6 = atom 10 ← OXYGEN');
console.log('  Position 7 = atom 7');
console.log('Position 8 = omega = atom 8');
console.log('Path2 interior (5,3,2,1,9,8 minus 5,8): 3,2,1,9');
console.log('  Position 9 = atom 3? But path2 is THIRD in order!');

console.log('\nI need to check the ACTUAL path order used...');
