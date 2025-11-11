import { parseSMILES } from './index';
import { RuleEngine } from './src/iupac-engine/engine';

const smiles = 'CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C';
const result = parseSMILES(smiles);
const mol = result.molecules[0]!;
const engine = new RuleEngine();
const iupacResult = engine.generateName(mol);

console.log('\n=== CONTEXT PARENT STRUCTURE ===');
const parentRing = iupacResult.context?.parentStructure;
if (parentRing && parentRing.type === 'ring') {
  console.log('Numbering system:', parentRing.numberingSystem);
  console.log('Heteroatoms:', parentRing.heteroatoms);
  
  console.log('\n=== KEY ATOM POSITIONS ===');
  const ketones = [3, 13];  // ketone carbons
  const ringOxygens = [9, 10];  // ring oxygens
  
  ketones.forEach(atomId => {
    const pos = parentRing.numberingSystem?.indexOf(atomId);
    console.log(`Ketone carbon (atom ${atomId}) → position ${pos !== undefined && pos >= 0 ? pos + 1 : 'NOT FOUND'}`);
  });
  
  ringOxygens.forEach(atomId => {
    const pos = parentRing.numberingSystem?.indexOf(atomId);
    console.log(`Ring oxygen (atom ${atomId}) → position ${pos !== undefined && pos >= 0 ? pos + 1 : 'NOT FOUND'}`);
  });
}

console.log('\n=== CURRENT VS EXPECTED ===');
console.log('Generated:', iupacResult.name);
console.log('Expected: 4,4,11,11-tetramethyl-3,12-dioxatricyclo[6.4.0.02,7]dodecane-6,9-dione');
