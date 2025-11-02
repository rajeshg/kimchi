import { parseSMILES, generateIUPACName } from '../index';
import type { Molecule } from '../types';
import { BondType } from '../types';

const smiles = 'CC(C)C1(CC(C(O1)(C)C)C(=O)C)OC(=O)C';
console.log(`\n=== Analyzing: ${smiles} ===\n`);

const parseResult = parseSMILES(smiles);
if (parseResult.errors.length > 0 || !parseResult.molecules[0]) {
  console.log('❌ Parse failed');
  process.exit(1);
}

const mol: Molecule = parseResult.molecules[0];

console.log('=== Molecule Structure ===');
mol.atoms.forEach((a, i) => {
  const bonds = mol.bonds.filter(b => b.atom1 === i || b.atom2 === i);
  console.log(`Atom ${i}: ${a.symbol} (bonds to: ${bonds.map(b => b.atom1 === i ? b.atom2 : b.atom1).join(',')})`);
});

console.log('\n=== Ester Groups ===');
// Look for C(=O)O patterns
mol.bonds.forEach((b, idx) => {
  if (b.type === BondType.DOUBLE) { // double bond
    const a1 = mol.atoms[b.atom1];
    const a2 = mol.atoms[b.atom2];
    
    if ((a1?.symbol === 'C' && a2?.symbol === 'O') || (a1?.symbol === 'O' && a2?.symbol === 'C')) {
      const carbonIdx = a1?.symbol === 'C' ? b.atom1 : b.atom2;
      const oxygenIdx = a1?.symbol === 'O' ? b.atom1 : b.atom2;
      
      // Check if carbon is bonded to another oxygen (single bond)
      const carbonBonds = mol.bonds.filter(bond => 
        (bond.atom1 === carbonIdx || bond.atom2 === carbonIdx) && bond.type === BondType.SINGLE
      );
      
      carbonBonds.forEach(cb => {
        const otherAtom = cb.atom1 === carbonIdx ? cb.atom2 : cb.atom1;
        if (mol.atoms[otherAtom]?.symbol === 'O') {
          console.log(`  Ester found: C${carbonIdx}(=O${oxygenIdx})O${otherAtom}`);
        }
      });
    }
  }
});

console.log('\n=== Generated IUPAC Name ===');
const result = generateIUPACName(mol);
console.log(`Result: ${result.name}`);
console.log(`Expected: (4-acetyl-5,5-dimethyl-2-propan-2-yloxolan-2-yl)acetate`);
