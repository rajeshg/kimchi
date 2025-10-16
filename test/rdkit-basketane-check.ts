import { initializeRDKit, getSubstructMatches } from "./smarts/rdkit-comparison/rdkit-smarts-api";

const RDKit = await initializeRDKit();
const smiles = "C1C2CC3CC1CC(C2)C3";

console.log("Checking basketane with RDKit:");
const result = getSubstructMatches(RDKit, smiles, "[R3]");
console.log("RDKit [R3] matches:", result.matches.length);
console.log("Matching atoms:", result.matches);

console.log("\nTesting individual atoms:");
for (let i = 0; i < 10; i++) {
  const testResult = getSubstructMatches(RDKit, smiles, `[C&R3;#6&X*&H*;$(C(~[#6])(~[#6])~[#6]);a0:1]`);
}

const mol = RDKit.get_mol(smiles);
console.log("\nRDKit molecule:");
console.log("Num atoms:", mol.get_num_atoms());
console.log("Num bonds:", mol.get_num_bonds());

console.log("\nCheck each atom ring count:");
for (let i = 0; i < 10; i++) {
  const atomResult = getSubstructMatches(RDKit, smiles, `[#6:1]`);
  console.log(`Checking atom ${i} for R3...`);
}
mol.delete();
