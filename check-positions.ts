import { parseSMILES } from './index';
import { generateVonBaeyerName } from './src/iupac-engine/naming/iupac-rings/von-baeyer';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0]!;

// Get ring analysis
const ringInfo = mol.ringInfo;
if (!ringInfo) {
  console.log('No ring info');
  process.exit(1);
}

// Generate von Baeyer name
const vbResult = generateVonBaeyerName(mol, ringInfo.sssrRings);

console.log('\n=== VON BAEYER RESULT ===');
console.log('Name:', vbResult.name);
console.log('Numbering system:', vbResult.numberingSystem);

console.log('\n=== KEY ATOM POSITIONS ===');
const ketones = [3, 13];  // ketone carbons
const ringOxygens = [9, 10];  // ring oxygens

ketones.forEach(atomId => {
  const pos = vbResult.numberingSystem?.indexOf(atomId);
  console.log(`Ketone carbon (atom ${atomId}) → position ${pos !== undefined && pos >= 0 ? pos + 1 : 'NOT FOUND'}`);
});

ringOxygens.forEach(atomId => {
  const pos = vbResult.numberingSystem?.indexOf(atomId);
  console.log(`Ring oxygen (atom ${atomId}) → position ${pos !== undefined && pos >= 0 ? pos + 1 : 'NOT FOUND'}`);
});

console.log('\n=== CURRENT OUTPUT ===');
console.log('Generated: 5,5,11,11-tetramethyl-6,12-dioxatricyclo[6.4.0.02,7]dodecane-3,9-dione');
console.log('  Hetero (oxa): [6,12]');
console.log('  Principal (dione): [3,9]');

console.log('\n=== EXPECTED OUTPUT ===');
console.log('Expected: 4,4,11,11-tetramethyl-3,12-dioxatricyclo[6.4.0.02,7]dodecane-6,9-dione');
console.log('  Hetero (oxa): [3,12]');
console.log('  Principal (dione): [6,9]');
