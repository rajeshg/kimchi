import { parseSMILES } from '../index';
import { analyzeRings } from '../src/utils/ring-analysis';
import { isRingAromatic } from '../src/utils/iupac/iupac-rings/aromatic-naming';

const smi = process.argv[2];
if (!smi) {
  console.error('Usage: bun ./scripts/check-aromatic.mjs "SMILES"');
  process.exit(1);
}
const res = parseSMILES(smi);
if (res.errors && res.errors.length) {
  console.error('Parse errors:', res.errors);
  process.exit(2);
}
const mol = res.molecules[0];
const ringInfo = analyzeRings(mol);
console.log('Rings detected:', ringInfo.rings);
for (const r of ringInfo.rings) {
  console.log('Ring', r, 'isAromatic?', isRingAromatic(r, mol));
}
