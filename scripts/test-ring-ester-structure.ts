import { parseSMILES } from '../index';

const smiles = 'CCCCCCCC(=O)OC(C)C1CCCO1';
console.log('SMILES:', smiles);
console.log('\nAtom numbering:');
console.log('CCCCCCCC(=O)OC(C)C1CCCO1');
console.log('01234567 8 9 1011 12131415 16');

const result = parseSMILES(smiles);
const mol = result.molecules[0]!;

console.log('\nRing atoms:', mol.rings);
console.log('\nBonds involving ring atoms:');
for (const bond of mol.bonds) {
  const ring = mol.rings![0];
  if (ring.includes(bond.atom1) || ring.includes(bond.atom2)) {
    const atom1 = mol.atoms[bond.atom1];
    const atom2 = mol.atoms[bond.atom2];
    console.log(`  Bond ${bond.atom1}(${atom1.symbol})-${bond.atom2}(${atom2.symbol})`);
  }
}
