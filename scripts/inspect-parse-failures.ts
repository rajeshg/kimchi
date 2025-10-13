import { parseSMILES } from '../index';

const failures = [
  'n1c2ccccc2c1', 'c1nccn1', 'c1nccn1O', 'c1nccn1C', 'o1ccccc1O', 's1ccccc1',
  'c1csc(cc1)O', 'n1c(=O)ccn1'
];

for (const smi of failures) {
  try {
    const res = parseSMILES(smi);
    console.log('SMILES:', smi);
    if (res.errors && res.errors.length > 0) {
      console.log('  errors:', JSON.stringify(res.errors, null, 2));
    } else {
      console.log('  parsed OK');
      console.log('  generated:', (res.molecules ? require('../index').generateSMILES(res.molecules) : 'N/A'));
    }
  } catch (e) {
    console.log('SMILES:', smi, 'threw', e instanceof Error ? e.message : e);
  }
}
