import { parseSMILES, generateIUPACName } from '../index';

const testCases = [
  { smiles: 'C1CCCO1', expected: 'oxolane' },
  { smiles: 'CC(C)C1(CC(C(O1)(C)C)C(=O)C)OC(=O)C', expected: '(4-acetyl-5,5-dimethyl-2-propan-2-yloxolan-2-yl)acetate' },
];

console.log('\n=== Oxolane Detection Debug ===\n');

for (const { smiles, expected } of testCases) {
  console.log(`SMILES: ${smiles}`);
  console.log(`Expected: ${expected}`);
  
  const parseResult = parseSMILES(smiles);
  if (parseResult.errors.length > 0 || !parseResult.molecules[0]) {
    console.log('❌ Parse failed');
    continue;
  }
  
  const mol = parseResult.molecules[0];
  console.log(`Atoms: ${mol.atoms.length}, Bonds: ${mol.bonds.length}`);
  console.log(`Rings detected: ${mol.rings?.length || 0}`);
  
  if (mol.rings && mol.rings.length > 0) {
    mol.rings.forEach((ring, idx) => {
      console.log(`  Ring ${idx}: size=${ring.length}, atoms=[${ring.join(',')}]`);
      const ringAtoms = ring.map(i => mol.atoms[i]);
      console.log(`    Ring atoms details:`);
      ringAtoms.forEach((a, i) => {
        if (a) {
          console.log(`      Atom ${ring[i]}: symbol=${a.symbol}, atomicNumber=${a.atomicNumber}`);
        }
      });
      const heteroatoms = ringAtoms.filter(a => a && a.symbol !== 'C' && a.symbol !== 'H');
      console.log(`    Heteroatoms: ${heteroatoms.length} found`);
      heteroatoms.forEach(a => {
        if (a) console.log(`      - ${a.symbol} (atomicNumber=${a.atomicNumber})`);
      });
    });
  }
  
  const iupacResult = generateIUPACName(mol);
  console.log(`Generated: ${iupacResult.name}`);
  console.log(`Match: ${iupacResult.name === expected ? '✓' : '✗'}`);
  console.log('');
}
