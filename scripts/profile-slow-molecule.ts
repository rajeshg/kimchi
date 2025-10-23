import { parseSMILES } from 'index';

const slowSMILES = "CC(C)(C)C1=CC2=C(C=C1)N3C4=CC(=C5C=CC6=C7C5=C4C=CC7=CC(=C6)C(C)(C)C)N8C9=C(C=C(C=C9)C(C)(C)C)C1=CC4=C(C=C18)N(C1=C4C=C(C=C1)C(C)(C)C)C1=C4C=CC5=C6C4=C(C=CC6=CC(=C5)C(C)(C)C)C(=C1)N1C4=C(C=C(C=C4)C(C)(C)C)C4=C1C=C3C2=C4";

const timings = {
  tokenize: 0,
  buildGraph: 0,
  validateAromaticity: 0,
  validateValences: 0,
  validateStereo: 0,
  perceiveAromaticity: 0,
  enrichMolecule: 0,
  total: 0
};

console.time('Total parsing');
const result = parseSMILES(slowSMILES, timings);
console.timeEnd('Total parsing');

console.log(`\nParsing result:`);
console.log(`- Success: ${result.molecules.length > 0}`);
if (result.molecules[0]) {
  console.log(`- Atoms: ${result.molecules[0].atoms.length}`);
  console.log(`- Bonds: ${result.molecules[0].bonds.length}`);
}

console.log('\nDetailed timing breakdown:');
console.log(`- Tokenization: ${timings.tokenize.toFixed(2)}ms`);
console.log(`- Build graph: ${timings.buildGraph.toFixed(2)}ms`);
console.log(`- Validate aromaticity: ${timings.validateAromaticity.toFixed(2)}ms`);
console.log(`- Validate valences: ${timings.validateValences.toFixed(2)}ms`);
console.log(`- Validate stereo: ${timings.validateStereo.toFixed(2)}ms`);
console.log(`- Perceive aromaticity: ${timings.perceiveAromaticity.toFixed(2)}ms`);
console.log(`- Enrich molecule: ${timings.enrichMolecule.toFixed(2)}ms`);
console.log(`- Total tracked: ${timings.total.toFixed(2)}ms`);
