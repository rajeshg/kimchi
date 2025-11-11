import { parseSMILES } from './index';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0]!;

console.log('=== ATOM STRUCTURE ===');
mol.atoms.forEach((atom, idx) => {
  const bonds = mol.bonds.filter(b => b.start === idx || b.end === idx);
  const neighbors = bonds.map(b => b.start === idx ? b.end : b.start);
  const isKetone = atom.element === 'C' && bonds.some(b => 
    b.type === 2 && mol.atoms[b.start === idx ? b.end : b.start]?.element === 'O' &&
    mol.bonds.filter(bb => bb.start === (b.start === idx ? b.end : b.start) || bb.end === (b.start === idx ? b.end : b.start)).length === 1
  );
  console.log(`Atom ${idx}: ${atom.element}, neighbors: [${neighbors.join(',')}]${isKetone ? ' ← KETONE' : ''}${atom.element === 'O' && neighbors.length === 2 ? ' ← RING O' : ''}`);
});

console.log('\n=== KEY ATOMS ===');
console.log('Ketone carbons: 3, 13');
console.log('Ring oxygens: 9, 10');
console.log('Quaternary carbons with methyls: 1, 11');

console.log('\n=== EXPECTED NUMBERING REQUIREMENT ===');
console.log('Position 3 must be: ring O (currently atom 9 or 10)');
console.log('Position 6 must be: ketone C (currently atom 3 or 13)');
console.log('Position 9 must be: ketone C (currently atom 3 or 13)');
console.log('Position 12 must be: ring O (currently atom 9 or 10)');
console.log('Secondary bridge [2,7] must still exist');

console.log('\n=== HYPOTHESIS ===');
console.log('We need to find an alpha/omega pair where:');
console.log('- Path numbering puts ring O at position 3');
console.log('- Path numbering puts ketone C at position 6');
console.log('- Path numbering puts ketone C at position 9');
console.log('- Path numbering puts ring O at position 12');
console.log('- Bridgeheads are at positions 2 and 7');
