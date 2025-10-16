import { parseSMILES } from "index";
import { findMCB } from "src/utils/ring-finder";

const testMolecules = [
  { name: "Naphthalene", smiles: "c1ccc2ccccc2c1" },
  { name: "Bicyclo[2.2.1]heptane", smiles: "C1CC2CCC1C2" },
  { name: "Basketane", smiles: "C1C2CC3CC1CC(C2)C3" },
  { name: "Cubane", smiles: "C12C3C4C1C5C2C3C45" },
];

for (const { name, smiles } of testMolecules) {
  console.log(`\n=== ${name} ===`);
  const result = parseSMILES(smiles);
  const mol = result.molecules[0]!;
  
  const mcbRings = findMCB(mol.atoms, mol.bonds);
  console.log(`MCB size: ${mcbRings.length}`);
  mcbRings.forEach((ring, i) => {
    console.log(`  Ring ${i}: [${ring.join(", ")}] (size ${ring.length})`);
  });
  
  const membership = new Map<number, number>();
  mcbRings.forEach((ring) => {
    ring.forEach(atomId => {
      membership.set(atomId, (membership.get(atomId) || 0) + 1);
    });
  });
  
  const atomsInThreeRings = Array.from(membership.entries())
    .filter(([_, count]) => count === 3)
    .map(([atomId, _]) => atomId)
    .sort((a, b) => a - b);
  
  console.log(`  Atoms in 3+ rings: [${atomsInThreeRings.join(", ")}]`);
}
