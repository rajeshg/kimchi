import { parseSMILES, generateSMILES } from '../index';
const inp = 'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5';
const p = parseSMILES(inp);
const gen = generateSMILES(p.molecules);
console.log('generated:', gen);
const rt = parseSMILES(gen);
if (rt.errors && rt.errors.length) {
  console.log('roundtrip errors:', rt.errors.map((e:any)=>e.message));
}
const mol = rt.molecules && rt.molecules[0];
if (mol) {
  console.log('atoms count:', mol.atoms.length);
  console.log('bonds count:', mol.bonds.length);
  for (const a of mol.atoms) {
    console.log(`atom id:${a.id} symbol:${a.symbol} hyd:${a.hydrogens} charge:${a.charge} isotope:${a.isotope} explicitBracket:${a.isBracket} aromatic:${a.aromatic}`);
  }
  console.log('--- bonds ---');
  for (const b of mol.bonds) {
    console.log(`bond ${b.atom1}-${b.atom2} type:${b.type} stereo:${b.stereo}`);
  }
} else {
  console.log('No molecule parsed from generated SMILES');
}
