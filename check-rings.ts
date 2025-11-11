import { parseSMILES } from './index';
import { findRings } from './src/utils/ring-analysis';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0];

const rings = findRings(mol.atoms, mol.bonds);

console.log('\n=== RING INFO ===');
console.log('Total rings:', rings.length);
console.log('Rings:');
rings.forEach((ring, idx) => {
  console.log(`  Ring ${idx}: atoms ${ring.join(',')}`);
});

console.log('\n=== RING MEMBERSHIP PER ATOM ===');
const ringAtoms = new Set<number>();
mol.atoms.forEach((atom, idx) => {
  if (atom.isInRing) ringAtoms.add(idx);
});

// Count ring membership for each atom
const ringMembership = new Map<number, number>();
for (const atomIdx of Array.from(ringAtoms).sort((a,b) => a-b)) {
  let count = 0;
  for (const ring of rings) {
    if (ring.includes(atomIdx)) count++;
  }
  ringMembership.set(atomIdx, count);
  const atom = mol.atoms[atomIdx];
  console.log(`Atom ${atomIdx} (${atom.symbol}): in ${count} ring(s)`);
}

console.log('\n=== POTENTIAL BRIDGEHEADS (atoms in 2+ rings) ===');
for (const [atomIdx, count] of ringMembership.entries()) {
  if (count >= 2) {
    const atom = mol.atoms[atomIdx];
    console.log(`Atom ${atomIdx} (${atom.symbol}): in ${count} rings`);
  }
}
