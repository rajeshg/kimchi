import { parseSMILES } from './index';
import { findRings, findSSSR } from './src/utils/ring-analysis';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0];

const allRings = findRings(mol.atoms, mol.bonds);
const sssr = findSSSR(allRings);

console.log('\n=== ALL RINGS (Elementary cycles) ===');
console.log('Total:', allRings.length);
allRings.forEach((ring, idx) => {
  console.log(`  Ring ${idx}: size=${ring.length}, atoms=${ring.join(',')}`);
});

console.log('\n=== SSSR (Minimum Cycle Basis) ===');
console.log('Total:', sssr.length);
sssr.forEach((ring, idx) => {
  console.log(`  SSSR Ring ${idx}: size=${ring.length}, atoms=${ring.join(',')}`);
});

// Expected: M - N + 1 = 18 bonds - 12 atoms + 1 = 7? Let me count bonds
const ringAtoms = new Set<number>();
mol.atoms.forEach((atom, idx) => {
  if (atom.isInRing) ringAtoms.add(idx);
});

const ringBonds = mol.bonds.filter(b => ringAtoms.has(b.atom1) && ringAtoms.has(b.atom2));
console.log(`\n=== SSSR Calculation ===`);
console.log(`Ring atoms (N): ${ringAtoms.size}`);
console.log(`Ring bonds (M): ${ringBonds.length}`);
console.log(`Expected SSSR count (M - N + 1): ${ringBonds.length - ringAtoms.size + 1}`);
