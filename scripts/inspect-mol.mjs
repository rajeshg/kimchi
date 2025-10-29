import { parseSMILES } from '../index';
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: bun ./scripts/inspect-mol.mjs "SMILES"');
  process.exit(1);
}
const smi = args[0];
const res = parseSMILES(smi);
if (res.errors && res.errors.length > 0) {
  console.error('Parse errors:', res.errors);
  process.exit(2);
}
const mol = res.molecules[0];
console.log('SMILES:', smi);
console.log('Atoms:');
mol.atoms.forEach((a, idx) => {
  console.log(idx, a.symbol, 'aromatic=' + !!a.aromatic);
});
console.log('\nBonds:');
mol.bonds.forEach((b, idx) => {
  console.log(idx, b.atom1, '<->', b.atom2, 'type=', b.type);
});
console.log('\nNeighbors:');
for (let i = 0; i < mol.atoms.length; i++) {
  const neigh = mol.bonds.filter(b => b.atom1 === i || b.atom2 === i).map(b => (b.atom1 === i ? b.atom2 : b.atom1));
  console.log(i, ':', neigh);
}
