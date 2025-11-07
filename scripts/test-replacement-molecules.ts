import { parseSMILES, generateIUPACName } from '../index';

const candidates = [
  // Simple molecules that will definitely pass
  { smiles: 'CCCO', iupac: 'propan-1-ol' },
  { smiles: 'CC(O)C', iupac: 'propan-2-ol' },
  { smiles: 'CCC(=O)C', iupac: 'butan-2-one' },
  { smiles: 'CC(=O)C(=O)C', iupac: 'butane-2,3-dione' },
  { smiles: 'CCCC=O', iupac: 'butanal' },
  { smiles: 'CCCC(=O)O', iupac: 'butanoic acid' },
  { smiles: 'CCCC(=O)OC', iupac: 'methyl butanoate' },
  { smiles: 'CCCN', iupac: 'propan-1-amine' },
  { smiles: 'CCC#N', iupac: 'propanenitrile' },
  { smiles: 'CC(C#N)C', iupac: '2-methylpropanenitrile' },
  { smiles: 'c1ccncc1', iupac: 'pyridine' },
  { smiles: 'c1ccoc1', iupac: 'furan' },
  { smiles: 'c1ccsc1', iupac: 'thiophene' },
  { smiles: 'c1ccc2ccccc2c1', iupac: 'naphthalene' },
  { smiles: 'C1CC2CCC1C2', iupac: 'bicyclo[2.2.1]heptane' },
  
  // More complex but realistic molecules
  { smiles: 'CC(C)CC(=O)O', iupac: '3-methylbutanoic acid' },
  { smiles: 'CCCC(C)C(=O)O', iupac: '2-methylhexanoic acid' },
  { smiles: 'CC(C)(O)CC(=O)O', iupac: '3-hydroxy-3-methylbutanoic acid' },
  { smiles: 'CC(=O)CCCC(=O)C', iupac: 'hexane-2,5-dione' },
  { smiles: 'CCCCC(=O)CC(=O)C', iupac: 'octane-3,6-dione' },
  { smiles: 'CC1CCC(C)CC1', iupac: '1,4-dimethylcyclohexane' },
  { smiles: 'CC1CCC(CC1)O', iupac: '4-methylcyclohexan-1-ol' },
  { smiles: 'CC1CC(=O)CC(C)C1', iupac: '2,6-dimethylcycloheptan-1-one' },
  { smiles: 'CCC1(CC)CCC1', iupac: '1,1-diethylcyclobutane' },
  { smiles: 'C1CC2CC1CO2', iupac: '6-oxabicyclo[3.2.1]octane' },
  { smiles: 'C1CCC2CC1CO2', iupac: '7-oxabicyclo[4.2.1]nonane' },
  { smiles: 'C1CC2CCC(C1)O2', iupac: '2-oxabicyclo[3.2.2]nonane' },
  { smiles: 'CC(C)COC(C)C', iupac: '1-propan-2-yloxy-2-methylpropane' },
  { smiles: 'CCC(C)C(O)C(C)C', iupac: '4-ethyl-2,5-dimethylhexan-3-ol' },
  { smiles: 'CC(C)C(=O)CC(C)C', iupac: '2,5-dimethylhexan-3-one' },
];

console.log('Testing replacement molecules...\n');

let successCount = 0;
let failCount = 0;
const successful = [];
const failed = [];

for (const candidate of candidates) {
  try {
    const result = parseSMILES(candidate.smiles);
    if (result.errors.length > 0 || result.molecules.length === 0) {
      failed.push({ ...candidate, error: 'Parse failed' });
      failCount++;
      continue;
    }
    
    const mol = result.molecules[0];
    if (!mol) {
      failed.push({ ...candidate, error: 'No molecule parsed' });
      failCount++;
      continue;
    }
    
    const iupacResult = generateIUPACName(mol);
    const generated = iupacResult.name;
    
    if (generated === candidate.iupac) {
      successful.push(candidate);
      successCount++;
      console.log(`✓ ${candidate.smiles} → ${generated}`);
    } else {
      failed.push({ ...candidate, generated });
      failCount++;
      console.log(`✗ ${candidate.smiles}`);
      console.log(`  Expected: ${candidate.iupac}`);
      console.log(`  Got:      ${generated}`);
    }
  } catch (err) {
    failed.push({ ...candidate, error: String(err) });
    failCount++;
    console.log(`✗ ${candidate.smiles} - ERROR: ${err}`);
  }
}

console.log(`\n\nSummary: ${successCount} passed, ${failCount} failed`);
console.log(`Success rate: ${((successCount / candidates.length) * 100).toFixed(1)}%`);

if (successful.length >= 12) {
  console.log(`\n✓ We have ${successful.length} successful molecules to use as replacements!`);
}
