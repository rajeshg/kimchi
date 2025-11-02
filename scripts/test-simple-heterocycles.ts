import { generateIUPACNameFromSMILES } from '../index';

const tests = [
  ['c1ccccc1', 'benzene'],
  ['c1ccncc1', 'pyridine'],
  ['c1cncnc1', 'pyrimidine'],
  ['c1ccoc1', 'furan'],
  ['c1ccsc1', 'thiophene'],
  ['c1cc[nH]c1', 'pyrrole'],
  ['C1CCCO1', 'oxolane'],
  ['C1CCCN1', 'pyrrolidine'],
];

console.log('\n=== Simple Heterocycle Test ===\n');
let passed = 0;
let failed = 0;

for (const [smiles, expected] of tests) {
  if (!smiles || !expected) continue;
  const result = generateIUPACNameFromSMILES(smiles);
  const match = result.name === expected;
  const icon = match ? '✓' : '✗';
  console.log(`${icon} ${smiles.padEnd(15)} → ${result.name.padEnd(20)} (expected: ${expected})`);
  if (match) passed++;
  else failed++;
}

console.log(`\nResults: ${passed}/${tests.length} passed (${(passed/tests.length*100).toFixed(0)}%)\n`);
