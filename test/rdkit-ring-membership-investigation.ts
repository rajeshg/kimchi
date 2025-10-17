import { initializeRDKit, getSubstructMatches } from './smarts/rdkit-comparison/rdkit-smarts-api';
import { parseSMILES, parseSMARTS, matchSMARTS } from 'index';

console.log('=== INVESTIGATING RDKIT RING MEMBERSHIP ===\n');
console.log('According to Daylight SMARTS spec:');
console.log('  R<n> = ring membership - in <n> SSSR rings\n');

const RDKit = await initializeRDKit();

interface TestCase {
  smiles: string;
  name: string;
  expectedSSSR: number;
}

const testCases: TestCase[] = [
  { smiles: 'C1C2CC3CC1CC(C2)C3', name: 'Adamantane', expectedSSSR: 3 },
  { smiles: 'C12C3C4C5C1C6C2C5C3C46', name: 'Basketane', expectedSSSR: 6 },
  { smiles: 'C12C3C4C1C5C2C3C45', name: 'Cubane', expectedSSSR: 5 },
  { smiles: 'C1CC2CCC1C2', name: 'Bicyclo[2.2.1]heptane (norbornane)', expectedSSSR: 2 },
  { smiles: 'C1CCC2(CC1)CCC1(CC2)CCCC1', name: 'Spiro[5.5]undecane', expectedSSSR: 2 },
];

for (const { smiles, name, expectedSSSR } of testCases) {
  console.log(`\n=== ${name} ===`);
  console.log(`SMILES: ${smiles}`);
  
  const molResult = parseSMILES(smiles);
  const mol = molResult.molecules[0]!;
  
  const sssrRings = mol.rings?.length || 0;
  console.log(`SSSR rings: ${sssrRings} (expected: ${expectedSSSR})`);
  
  if (sssrRings !== expectedSSSR) {
    console.log('⚠️  SSSR count mismatch!');
  }
  
  console.log('\nRing membership count (chemkit using SSSR):');
  const ringMembership = new Map<number, number[]>();
  mol.atoms.forEach((atom, i) => {
    const count = mol.rings?.filter(r => r.includes(atom.id)).length || 0;
    if (!ringMembership.has(count)) {
      ringMembership.set(count, []);
    }
    ringMembership.get(count)!.push(i);
  });
  
  Array.from(ringMembership.keys()).sort((a, b) => a - b).forEach(count => {
    const atoms = ringMembership.get(count)!;
    console.log(`  ${count} rings: ${atoms.length} atoms - ${atoms.join(', ')}`);
  });
  
  console.log('\nRDKit [Rn] matches:');
  for (let n = 0; n <= 6; n++) {
    const result = getSubstructMatches(RDKit, smiles, `[R${n}]`);
    if (result.matches.length > 0) {
      const atoms = result.matches.map(m => m[0]);
      console.log(`  [R${n}]: ${result.matches.length} matches - ${atoms.join(', ')}`);
    }
  }
  
  console.log('\nComparison:');
  for (let n = 0; n <= 6; n++) {
    const chemkitResult = parseSMARTS(`[R${n}]`);
    const chemkitMatches = matchSMARTS(chemkitResult.pattern!, mol, { uniqueMatches: true });
    const chemkitCount = chemkitMatches.matches.length;
    
    const rdkitResult = getSubstructMatches(RDKit, smiles, `[R${n}]`);
    const rdkitCount = rdkitResult.matches.length;
    
    if (chemkitCount !== rdkitCount) {
      console.log(`  [R${n}]: chemkit=${chemkitCount}, RDKit=${rdkitCount} ❌`);
    }
  }
}

console.log('\n\n=== CONCLUSION ===');
console.log('If there are mismatches, RDKit is likely NOT using SSSR for [Rn] primitives.');
console.log('RDKit may be using "relevant cycles" or all simple cycles instead of SSSR.');
