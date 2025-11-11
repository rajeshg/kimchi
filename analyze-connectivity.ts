import { parseSMILES } from './index';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0];

console.log('\n=== ATOM LIST ===');
mol.atoms.forEach((atom, idx) => {
  const neighbors = mol.bonds
    .filter(b => b.atom1 === idx || b.atom2 === idx)
    .map(b => b.atom1 === idx ? b.atom2 : b.atom1);
  console.log(`Atom ${idx}: ${atom.symbol} (neighbors: ${neighbors.join(',')})`);
});

console.log('\n=== BONDS ===');
mol.bonds.forEach((bond, idx) => {
  const a1 = mol.atoms[bond.atom1];
  const a2 = mol.atoms[bond.atom2];
  console.log(`Bond ${idx}: ${bond.atom1}(${a1.symbol}) -- ${bond.atom2}(${a2.symbol}) [${bond.type}]`);
});

// Identify ring atoms
const ringAtoms = new Set<number>();
mol.atoms.forEach((atom, idx) => {
  if (atom.isInRing) ringAtoms.add(idx);
});

console.log('\n=== RING ATOMS ===');
console.log(Array.from(ringAtoms).sort((a,b) => a-b).join(', '));

// Identify ketones
console.log('\n=== KETONES ===');
mol.atoms.forEach((atom, idx) => {
  if (atom.symbol === 'C' && atom.hybridization === 'sp2' && ringAtoms.has(idx)) {
    const carbonylBond = mol.bonds.find(b => {
      const otherIdx = b.atom1 === idx ? b.atom2 : (b.atom2 === idx ? b.atom1 : -1);
      if (otherIdx < 0) return false;
      const otherAtom = mol.atoms[otherIdx];
      return otherAtom && otherAtom.symbol === 'O' && b.type === 'double';
    });
    if (carbonylBond) {
      console.log(`Ketone C at atom ${idx}, O at atom ${carbonylBond.atom1 === idx ? carbonylBond.atom2 : carbonylBond.atom1}`);
    }
  }
});

// Identify oxygens in ring
console.log('\n=== RING HETEROATOMS ===');
mol.atoms.forEach((atom, idx) => {
  if (atom.symbol === 'O' && ringAtoms.has(idx)) {
    console.log(`Ring oxygen at atom ${idx}`);
  }
});
