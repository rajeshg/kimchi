import { parseSMILES } from './index';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0]!;

console.log('All atoms:');
mol.atoms.forEach((atom, idx) => {
  console.log(`  ${idx}: ${atom.symbol} (isInRing=${atom.isInRing}, rings=${atom.ringIds})`);
});

console.log('\nRing atoms specifically:');
mol.atoms.filter(a => a.isInRing).forEach((atom, idx) => {
  const realIdx = mol.atoms.indexOf(atom);
  console.log(`  ${realIdx}: ${atom.symbol} (rings=${atom.ringIds.join(',')})`);
});

console.log('\nBonds involving oxygens:');
mol.bonds.forEach(bond => {
  const a1 = mol.atoms[bond.atom1];
  const a2 = mol.atoms[bond.atom2];
  if (a1.symbol === 'O' || a2.symbol === 'O') {
    console.log(`  ${bond.atom1}-${bond.atom2}: ${a1.symbol}-${a2.symbol} (type=${bond.type})`);
  }
});
