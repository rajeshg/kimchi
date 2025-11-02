import { parseSMILES, generateIUPACName } from '../index';

const testCase = {
  smiles: 'CC1=C(N=C(N=N1)SC)SC',
  expected: '6-methyl-3,5-bis(methylsulfanyl)-1,2,4-triazine'
};

console.log(`\n=== Testing: ${testCase.smiles} ===\n`);
console.log(`Expected: ${testCase.expected}\n`);

const parseResult = parseSMILES(testCase.smiles);
if (parseResult.errors.length > 0 || !parseResult.molecules[0]) {
  console.log('❌ Parse failed');
  process.exit(1);
}

const mol = parseResult.molecules[0];

console.log('=== Atoms ===');
mol.atoms.forEach((a, i) => {
  console.log(`  ${i}: ${a.symbol} (aromatic=${a.aromatic})`);
});

console.log('\n=== Rings ===');
if (mol.rings) {
  mol.rings.forEach((ring, idx) => {
    console.log(`  Ring ${idx}: size=${ring.length}, atoms=[${ring.join(',')}]`);
    const ringAtoms = ring.map(i => mol.atoms[i]);
    const heteroatoms = ringAtoms.filter(a => a && a.symbol !== 'C' && a.symbol !== 'H');
    console.log(`    Heteroatoms: ${heteroatoms.map(a => a?.symbol).join(', ')}`);
  });
}

const result = generateIUPACName(mol);
console.log(`\n=== Generated: ${result.name} ===`);
console.log(`Match: ${result.name === testCase.expected ? '✓' : '✗'}`);
