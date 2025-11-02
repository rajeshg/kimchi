import { parseSMILES, generateIUPACName } from '../index';

const testCases = [
  { smiles: 'c1ccccc1', expected: 'benzene' },
  { smiles: 'c1ccncc1', expected: 'pyridine' },
  { smiles: 'c1cncnc1', expected: 'pyrimidine' },
  { smiles: 'c1cnncn1', expected: 'triazine' },
  { smiles: 'c1ccoc1', expected: 'furan' },
  { smiles: 'c1ccsc1', expected: 'thiophene' },
  { smiles: 'c1cc[nH]c1', expected: 'pyrrole' },
];

console.log('=== Heterocycle Detection Test ===\n');

for (const { smiles, expected } of testCases) {
  const result = parseSMILES(smiles);
  if (result.errors.length > 0 || result.molecules.length === 0) {
    console.log(`✗ ${smiles} - Parse error`);
    continue;
  }
  
  const iupacResult = generateIUPACName(result.molecules[0]!);
  const iupac = iupacResult.name;
  const match = iupac === expected ? '✓' : '✗';
  console.log(`${match} ${smiles} → "${iupac}" (expected: "${expected}")`);
}
