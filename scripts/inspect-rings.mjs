import { parseSMILES } from '../index.js';
import { analyzeRings } from '../src/utils/ring-analysis.js';

const smiList = [
  'C1CCC2CCCCC2C1', // case 6
  'C1CCC2C(C1)CCCC2', // case 7
  'C1CC2C3CCCCC3CC2C1', // case 8
  'c1ccccc1', // benzene
  'C1CCCCC1', // cyclohexane
];

for (const smi of smiList) {
  console.log('SMILES:', smi);
  const parsed = parseSMILES(smi);
  const mol = parsed.molecules[0];
  console.log(' atoms:', mol.atoms.map(a => ({ id: a.id, symbol: a.symbol, aromatic: a.aromatic }))); 
  console.log(' bonds:', mol.bonds.map(b => ({ a1: b.atom1, a2: b.atom2, order: b.order })));
  const info = analyzeRings(mol);
  console.log(' sssr length:', info.rings.length);
  console.log(' sssr:', info.rings);
  console.log(' ringAtomSet:', Array.from(info.ringAtomSet).sort((x,y)=>x-y));
  console.log('---');
}
