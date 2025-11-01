import { generateIUPACNameFromSMILES } from '../index.ts';

const testMolecules = [
  { name: 'benzene', smiles: 'c1ccccc1' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1' },
  { name: 'adamantane', smiles: 'C1C2CC3CC1CC(C2)C3' },
  { name: 'spiro[5.5]undecane', smiles: 'C1CCC2(C1)CCCCC2' },
];

for (const { name, smiles } of testMolecules) {
  console.log(`\n=== ${name} (${smiles}) ===`);
  try {
    const result = generateIUPACNameFromSMILES(smiles);
    console.log(`IUPAC Name: ${result.name}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join(', ')}`);
    }
    if (result.warnings.length > 0) {
      console.log(`Warnings: ${result.warnings.join(', ')}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}