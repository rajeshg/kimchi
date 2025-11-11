import { parseSMILES } from './index';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0]!;

console.log('\n=== MOLECULE STRUCTURE ===');
mol.atoms.forEach((atom, idx) => {
  console.log(`Atom ${idx}: ${atom.symbol}, rings: [${atom.ringIds}], degree: ${atom.degree}, inRing: ${atom.isInRing}`);
});

console.log('\n=== KETONE GROUPS ===');
// Find ketone C=O groups
mol.atoms.forEach((atom, idx) => {
  if (atom.symbol === 'C' && atom.hybridization === 'sp2') {
    const bonds = mol.bonds.filter(b => b.atom1 === idx || b.atom2 === idx);
    const hasDoubleO = bonds.some(b => {
      const other = b.atom1 === idx ? b.atom2 : b.atom1;
      return mol.atoms[other]?.symbol === 'O' && b.type === 'double';
    });
    if (hasDoubleO) {
      console.log(`Ketone carbon at atom ${idx}, rings: [${atom.ringIds}]`);
    }
  }
});

console.log('\n=== RING OXYGEN ATOMS ===');
mol.atoms.forEach((atom, idx) => {
  if (atom.symbol === 'O' && atom.isInRing) {
    console.log(`Ring oxygen at atom ${idx}, rings: [${atom.ringIds}]`);
  }
});
