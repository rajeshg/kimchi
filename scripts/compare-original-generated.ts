import { parseSMILES, generateSMILES } from '../index';
const inp = 'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5';
const p = parseSMILES(inp);
console.log('--- ORIGINAL ---');
if (p.molecules && p.molecules[0]) {
  const mol = p.molecules[0];
  console.log('atoms:', mol.atoms.length, 'bonds:', mol.bonds.length);
  for (const a of mol.atoms) console.log(`atom ${a.id}: ${a.symbol} h:${a.hydrogens} bracket:${a.isBracket} aromatic:${a.aromatic}`);
  console.log('--- bonds ---');
  for (const b of mol.bonds) console.log(`bond ${b.atom1}-${b.atom2} type:${b.type} stereo:${b.stereo}`);
}
const gen = generateSMILES(p.molecules);
console.log('\ngenerated SMILES:', gen);
const rt = parseSMILES(gen);
console.log('\n--- GENERATED PARSE ---');
if (rt.molecules && rt.molecules[0]) {
  const mol2 = rt.molecules[0];
  console.log('atoms:', mol2.atoms.length, 'bonds:', mol2.bonds.length);
  for (const a of mol2.atoms) console.log(`atom ${a.id}: ${a.symbol} h:${a.hydrogens} bracket:${a.isBracket} aromatic:${a.aromatic}`);
  console.log('--- bonds ---');
  for (const b of mol2.bonds) console.log(`bond ${b.atom1}-${b.atom2} type:${b.type} stereo:${b.stereo}`);
}
