import { parseSMILES, generateSMILES } from '../index';
const inp = 'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5';
const p = parseSMILES(inp);
const gen = generateSMILES(p.molecules);
const rt = parseSMILES(gen);
function tally(mol:any) {
  const counts: Record<string, number> = {};
  for (const a of mol.atoms) counts[a.symbol] = (counts[a.symbol]||0)+1;
  return counts;
}
console.log('original counts', p.molecules && p.molecules[0] ? tally(p.molecules[0]) : null);
console.log('generated counts', rt.molecules && rt.molecules[0] ? tally(rt.molecules[0]) : null);
console.log('generated SMILES:', gen);
