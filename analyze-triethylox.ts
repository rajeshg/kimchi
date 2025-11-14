import { parseSMILES } from './index';

const smiles = 'CCC1C(O1)(CC)CC';
const result = parseSMILES(smiles);
const mol = result.molecules[0];

if (!mol) {
  console.log("Parse failed");
  process.exit(1);
}

console.log("Structure of CCC1C(O1)(CC)CC:");
console.log(`Total atoms: ${mol.atoms.length}`);
console.log("\nAtoms:");
for (let i = 0; i < mol.atoms.length; i++) {
  const atom = mol.atoms[i];
  if (!atom) continue;
  const bonds = mol.bonds.filter(b => b.atom1 === i || b.atom2 === i);
  const neighbors = bonds.map(b => b.atom1 === i ? b.atom2 : b.atom1);
  console.log(`  ${i}: ${atom.symbol} - bonded to [${neighbors.join(', ')}]`);
}

// Find the ring manually
console.log("\nFinding 3-membered ring:");
for (let i = 0; i < mol.atoms.length; i++) {
  const atom1 = mol.atoms[i];
  if (!atom1) continue;
  const bonds1 = mol.bonds.filter(b => b.atom1 === i || b.atom2 === i);
  
  // Check if part of 3-ring
  if (bonds1.length >= 2) {
    const neighbors = bonds1.map(b => b.atom1 === i ? b.atom2 : b.atom1);
    for (let j = 0; j < neighbors.length - 1; j++) {
      for (let k = j + 1; k < neighbors.length; k++) {
        const n1 = neighbors[j];
        const n2 = neighbors[k];
        if (n1 === undefined || n2 === undefined) continue;
        // Check if n1 and n2 are bonded
        const bondExists = mol.bonds.some(b => 
          (b.atom1 === n1 && b.atom2 === n2) || (b.atom1 === n2 && b.atom2 === n1)
        );
        if (bondExists) {
          console.log(`  Found ring: ${i} - ${n1} - ${n2} - ${i}`);
          console.log(`  Symbols: ${atom1.symbol} - ${mol.atoms[n1]?.symbol} - ${mol.atoms[n2]?.symbol}`);
        }
      }
    }
  }
}
