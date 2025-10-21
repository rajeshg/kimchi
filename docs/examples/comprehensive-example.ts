import {
  parseSMILES,
  generateSMILES,
  generateMolfile,
  writeSDF,
  parseSMARTS,
  matchSMARTS,
  getMolecularFormula,
  getMolecularMass,
  computeLogP,
  checkLipinskiRuleOfFive,
  checkVeberRules,
  checkBBBPenetration,
  getHBondDonorCount,
  getHBondAcceptorCount,
  getTPSA,
  getRotatableBondCount,
  getHeavyAtomCount,
  getRingCount,
  getAromaticRingCount,
  getFractionCSP3,
} from 'index';

console.log('Kimchi Comprehensive Capabilities Demo');
console.log('=====================================\n');

// 1. SMILES Parsing and Generation
console.log('1. SMILES Parsing and Generation');
console.log('---------------------------------');

const smilesString = 'CC(=O)Oc1ccccc1C(=O)O'; // Aspirin
const parseResult = parseSMILES(smilesString);

if (parseResult.errors.length > 0) {
  console.log('Parse errors:', parseResult.errors);
} else {
  const molecule = parseResult.molecules[0]!;
  console.log(`✓ Parsed SMILES: ${smilesString}`);
  console.log(`  Atoms: ${molecule.atoms.length}, Bonds: ${molecule.bonds.length}`);

  // Generate different SMILES variants
  const canonicalSMILES = generateSMILES(molecule, true);
  const simpleSMILES = generateSMILES(molecule, false);
  console.log(`  Canonical SMILES: ${canonicalSMILES}`);
  console.log(`  Simple SMILES: ${simpleSMILES}`);
}

// 2. Molecular Properties and Descriptors
console.log('\n2. Molecular Properties and Descriptors');
console.log('--------------------------------------');

if (parseResult.molecules.length > 0) {
  const molecule = parseResult.molecules[0]!;
  const formula = getMolecularFormula(molecule);
  const mass = getMolecularMass(molecule);
  const logP = computeLogP(molecule);
  const lipinski = checkLipinskiRuleOfFive(molecule);
  const veber = checkVeberRules(molecule);
  const bbb = checkBBBPenetration(molecule);
  const hBondDonors = getHBondDonorCount(molecule);
  const hBondAcceptors = getHBondAcceptorCount(molecule);
  const tpsa = getTPSA(molecule);
  const rotatableBonds = getRotatableBondCount(molecule);
  const ringCount = getRingCount(molecule);
  const aromaticRingCount = getAromaticRingCount(molecule);
  const fractionCSP3 = getFractionCSP3(molecule);

  console.log(`✓ Molecular Formula: ${formula}`);
  console.log(`  Molecular Mass: ${mass.toFixed(3)} Da`);
  console.log(`  LogP: ${logP.toFixed(3)}`);
  console.log(`  Heavy Atoms: ${getHeavyAtomCount(molecule)}`);
  console.log(`  Rings: ${ringCount} (Aromatic: ${aromaticRingCount})`);
  console.log(`  Fraction sp³ carbons: ${(fractionCSP3 * 100).toFixed(1)}%`);
  console.log(`  H-bond Donors: ${hBondDonors}`);
  console.log(`  H-bond Acceptors: ${hBondAcceptors}`);
  console.log(`  Rotatable Bonds: ${rotatableBonds}`);
  console.log(`  TPSA: ${tpsa.toFixed(2)} Å²`);
  console.log(`  Lipinski Rule of Five: ${lipinski.passes ? 'PASS' : 'FAIL'}`);
  if (!lipinski.passes) {
    console.log(`    Violations: ${lipinski.violations.join(', ')}`);
  }
  console.log(`  Veber Rules: ${veber.passes ? 'PASS' : 'FAIL'}`);
  if (!veber.passes) {
    console.log(`    Violations: ${veber.violations.join(', ')}`);
  }
  console.log(`  BBB Penetration: ${bbb.likelyPenetration ? 'Likely' : 'Unlikely'} (TPSA: ${bbb.tpsa.toFixed(2)} Å²)`);
}

// 3. MOL File Generation
console.log('\n3. MOL File Generation');
console.log('----------------------');

if (parseResult.molecules.length > 0) {
  const molecule = parseResult.molecules[0]!;
  const molfile = generateMolfile(molecule, {
    title: 'Aspirin',
    programName: 'kimchi-demo',
    comment: 'Generated from SMILES',
  });

  console.log('✓ Generated MOL file');
  console.log('  First few lines:');
  console.log(molfile.split('\n').slice(0, 5).join('\n'));
}

// 4. SDF File Handling
console.log('\n4. SDF File Handling');
console.log('--------------------');

// Create sample SDF records
const sampleMolecules = [
  { smiles: 'CCO', name: 'Ethanol' },
  { smiles: 'CC(=O)O', name: 'Acetic Acid' },
];

const sdfRecords = sampleMolecules.map(({ smiles, name }) => {
  const result = parseSMILES(smiles);
  if (result.errors.length > 0 || !result.molecules[0]) return null;

  const molecule = result.molecules[0]!;

  return {
    molecule,
    properties: {
      NAME: name,
      SMILES: smiles,
      FORMULA: getMolecularFormula(molecule),
      MASS: getMolecularMass(molecule).toFixed(3),
      LOGP: computeLogP(molecule).toFixed(3),
    },
  };
}).filter(Boolean) as any[];

const sdfResult = writeSDF(sdfRecords, {
  title: 'Sample Molecules',
  programName: 'kimchi-demo',
});

if (sdfResult.errors.length > 0) {
  console.log('SDF generation errors:', sdfResult.errors);
} else {
  console.log('✓ Generated SDF with', sdfRecords.length, 'records');
  console.log('  SDF size:', sdfResult.sdf.length, 'characters');
}

// 5. SMARTS Pattern Matching
console.log('\n5. SMARTS Pattern Matching');
console.log('--------------------------');

// Parse a SMARTS pattern for carboxylic acids
const smartsResult = parseSMARTS('[CX3](=O)[OX2H]');
if (smartsResult.errors.length > 0) {
  console.log('SMARTS parse errors:', smartsResult.errors);
} else {
  console.log('✓ Parsed SMARTS pattern: [CX3](=O)[OX2H] (carboxylic acid)');

  // Test matching against molecules
  const testMolecules = ['CC(=O)O', 'CCO', 'CC(=O)Oc1ccccc1C(=O)O'];
  for (const testSMILES of testMolecules) {
    const parseRes = parseSMILES(testSMILES);
    if (parseRes.errors.length > 0 || !parseRes.molecules[0]) continue;

    const molecule = parseRes.molecules[0]!;
    const matchResult = matchSMARTS(smartsResult.pattern!, molecule);
    console.log(`  ${testSMILES}: ${matchResult.matches.length > 0 ? 'MATCH' : 'NO MATCH'}`);
  }
}

console.log('\nDemo completed! Kimchi supports:');
console.log('- SMILES parsing and generation');
console.log('- Molecular property calculations');
console.log('- Drug-likeness assessment');
console.log('- MOL and SDF file I/O');
console.log('- SMARTS pattern matching');
console.log('- And much more!');