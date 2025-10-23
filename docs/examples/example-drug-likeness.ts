import { parseSMILES, checkLipinskiRuleOfFive, checkVeberRules, checkBBBPenetration, computeLogP } from 'index';

console.log('openchem Drug-Likeness Assessment Examples');
console.log('=========================================\n');

// Test molecules with varying drug-likeness properties
const testMolecules = [
  {
    name: 'Aspirin',
    smiles: 'CC(=O)Oc1ccccc1C(=O)O',
    description: 'Common NSAID - should pass all rules'
  },
  {
    name: 'Caffeine',
    smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
    description: 'CNS stimulant - should pass all rules'
  },
  {
    name: 'Ibuprofen',
    smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O',
    description: 'NSAID - should pass all rules'
  },
  {
    name: 'Chloramphenicol',
    smiles: 'O[C@H]([C@H](NC(=O)C(Cl)Cl)C1=CC=C(C=C1)Cl)CO',
    description: 'Antibiotic - may violate some rules'
  },
  {
    name: 'Vancomycin',
    smiles: 'CC[C@H](C)[C@@H](NC(=O)[C@@H]1[C@H]2CCCC[C@H]2CN(C1=O)C(=O)[C@H](NC(=O)[C@@H]3[C@H]4CCCC[C@H]4CN(C3=O)C(=O)[C@H](NC(=O)[C@@H]5[C@H]6CCCC[C@H]6CN(C5=O)C(=O)[C@H](NC(=O)[C@@H]7[C@H]8CCCC[C@H]8CN(C7=O)C(=O)[C@H](NC(=O)[C@@H]9[C@H]%10CCCC[C@H]%10CN(C9=O)C(=O)C)C(C)C)C(C)C)C(C)C)C(=O)O',
    description: 'Large antibiotic - likely violates MW and other rules'
  },
  {
    name: 'Highly lipophilic compound',
    smiles: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    description: 'Long hydrocarbon chain - violates LogP rule'
  }
];

console.log('Evaluating drug-likeness for test molecules...\n');

for (const testMol of testMolecules) {
  console.log(`📊 ${testMol.name}`);
  console.log(`   ${testMol.description}`);
  console.log(`   SMILES: ${testMol.smiles}`);

  const result = parseSMILES(testMol.smiles);

  if (result.errors.length > 0) {
    console.log(`   ❌ Parse errors: ${result.errors.join(', ')}`);
    console.log();
    continue;
  }

  const molecule = result.molecules[0]!;
  const logP = computeLogP(molecule);
  const lipinski = checkLipinskiRuleOfFive(molecule);
  const veber = checkVeberRules(molecule);
  const bbb = checkBBBPenetration(molecule);

  console.log(`   LogP: ${logP.toFixed(3)}`);
  console.log(`   Lipinski: ${lipinski.passes ? '✅ PASS' : '❌ FAIL'}`);
  if (!lipinski.passes) {
    console.log(`     Violations: ${lipinski.violations.join(', ')}`);
  }
  console.log(`   Veber: ${veber.passes ? '✅ PASS' : '❌ FAIL'}`);
  if (!veber.passes) {
    console.log(`     Violations: ${veber.violations.join(', ')}`);
  }
  console.log(`   BBB Penetration: ${bbb.likelyPenetration ? '✅ Likely' : '❌ Unlikely'} (TPSA: ${bbb.tpsa.toFixed(2)} Å²)`);
  console.log();
}

console.log('Drug-Likeness Rule Summaries:');
console.log('=============================\n');

console.log('Lipinski\'s Rule of Five:');
console.log('- Molecular Weight ≤ 500 Da');
console.log('- H-bond Donors ≤ 5');
console.log('- H-bond Acceptors ≤ 10');
console.log('- LogP ≤ 5');
console.log('- All rules must pass for good oral bioavailability\n');

console.log('Veber Rules:');
console.log('- Rotatable Bonds ≤ 10');
console.log('- TPSA ≤ 140 Å²');
console.log('- Both rules must pass for good oral bioavailability\n');

console.log('Blood-Brain Barrier Penetration:');
console.log('- TPSA < 90 Å² suggests likely CNS penetration');
console.log('- TPSA > 90 Å² suggests poor CNS penetration\n');

console.log('Note: These are empirical rules and should be used as guidelines,');
console.log('not absolute requirements. Many successful drugs violate one or more rules.');