import { parseSMILES } from '../index';
import selectPrincipalChain from '../src/utils/iupac/chain-selection';
import { analyzeRings } from '../src/utils/ring-analysis';
import { generateIUPACName } from '../src/utils/iupac/iupac-generator';

const cases: string[] = [
  'CC(C)(C(C)(C)C)C(C)(C)C',
  'CCC(C)(CCC(C)C)CC',
  'CC(C)(C(C)(C(C)(C)C)C)C',
  'CC(C)C(C(C(C)C)C)C',
  'CCC(C(C)C)(C(C)C)C',
  'C1CCC2CCCCC2C1',
  'C1CCC2C(C1)CCCC2',
  'C1CC2C3CCCCC3CC2C1',
  'C1=CC=C(C=C1)C2=CC=CC=C2',
  'CC(C1=CC=CC=C1)C2=CC=CC=C2',
  'CC1=CC=CC=C1C(C)C',
  'CC1CC(C)C(C(C)C)C1',
  'C1CC(C2CCCCC2)CCCC1',
  'CC(C(=O)O)CC(=O)O',
  'OC(=O)CC(=O)O',
  'CC(C(=O)O)C(=O)O',
  'CCC(=O)C(=O)O',
  'CC(C(=O)OC)C(=O)O',
  'CCN(CC)CC',
  'CC(=O)NC(=O)C',
  'CC(=O)OC(=O)C',
  'CC(C)(C(=O)O)C(=O)O',
  'C1CCC(C(C)C(=O)O)CC1',
  'C1=CC(=CC=C1C(=O)O)O',
  'C1CC(=O)CCC1',
  'C1CCC(C(=O)O)CC1',
  'C1=CC=C(C=C1)C(=O)O',
  'CC1=CC=CC=C1C(=O)O',
  'C1=CC=C(C=C1)C2=CC=CC=C2C(=O)O',
  'CC(C)=CC(C)=CC',
  'CC(C)=CC=C(C)C',
  'CC(C(=O)O)C(C)(C)C',
  'C1C(C2CCCCC2)CCCC1',
  'C1CC2(CC1)CCCCC2',
  'CC1=C(C(=O)O)C=CC=C1',
  'C1=CC=C2C(=C1)C=CC=C2',
  'C1=CC=C2C3=CC=CC=C3C=C12',
  'C1=CC=C2C3=CC=CC=C3C=C2C=C1',
  'CC(C(=O)O)C1=CC=CC=C1',
  'CC(C)C1=CC=CC=C1C(=O)O',
];

for (const s of cases) {
  console.log('=== SMILES:', s);
  const parsed = parseSMILES(s);
  if (parsed.errors && parsed.errors.length > 0) console.log('parse errors:', parsed.errors);
  const mol = parsed.molecules[0];
  if (!mol) {
    console.log('  no molecule parsed, skipping');
    continue;
  }
  console.log('atoms length:', mol.atoms.length);
  mol.atoms.forEach((a, i) => console.log(` idx=${i} id=${a.id} symbol=${a.symbol} aromatic=${!!a.aromatic}`));
  console.log('bonds length:', mol.bonds.length);
  mol.bonds.forEach((b, i) => console.log(` bond ${i}: ${b.atom1}-${b.atom2} type=${b.type}`));
  try {
    const ringInfo = analyzeRings(mol);
    console.log('analyzeRings.rings count:', ringInfo.rings.length);
    console.log('rings:', ringInfo.rings.map(r => r.join('-')));
  } catch (e) {
    console.error('analyzeRings error:', e && (e as Error).stack || e);
  }
  try {
    const sel = selectPrincipalChain(mol);
    console.log('selectPrincipalChain result:', sel);
  } catch (e) {
    console.error('selectPrincipalChain error:', e && (e as Error).stack || e);
  }
  try {
    const gen = generateIUPACName(mol);
    console.log('generateIUPACName.errors:', gen.errors);
    console.log('generateIUPACName.name:', gen.name);
  } catch (e) {
    console.error('generateIUPACName error:', e && (e as Error).stack || e);
  }
  console.log('\n');
}
