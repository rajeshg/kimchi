import { parseSMILES } from './index';
import { analyzeRings } from './src/utils/ring-analysis';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
console.log('SMILES:', smiles);

const result = parseSMILES(smiles);
const mol = result.molecules[0]!;
const ringInfo = analyzeRings(mol);

console.log('\n=== Structure Analysis ===');
console.log('Atoms:', mol.atoms.length);
console.log('Rings:', ringInfo.ringCount);

console.log('\n=== Ketones (C=O in ring) ===');
mol.atoms.forEach((atom, idx) => {
  if (atom.symbol === 'C' && atom.hybridization === 'sp2' && atom.isInRing) {
    console.log(`Ketone carbon at atom ${idx}`);
  }
});

console.log('\n=== Ring Oxygens ===');
mol.atoms.forEach((atom, idx) => {
  if (atom.symbol === 'O' && atom.isInRing) {
    console.log(`Ring oxygen at atom ${idx}`);
  }
});
