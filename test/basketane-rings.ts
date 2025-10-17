import { parseSMILES } from "index";
import { findSSSR, findRings } from "src/utils/ring-analysis";

const smiles = "C1C2CC3CC1CC(C2)C3";
const result = parseSMILES(smiles);
const mol = result.molecules[0]!;

console.log("Basketane SMILES:", smiles);
console.log("\nBonds:");
mol.bonds.forEach(b => {
  console.log(`  ${b.atom1} - ${b.atom2}`);
});

console.log("\n=== ALL RINGS (findRings) ===");
const allRings = findRings(mol.atoms, mol.bonds);
console.log("Total rings found:", allRings.length);
allRings.forEach((ring, i) => {
  console.log(`Ring ${i}: [${ring.join(", ")}] (size ${ring.length})`);
});

console.log("\n=== SSSR (findSSSR) ===");
const sssrRings = findSSSR(mol.atoms, mol.bonds);
console.log("SSSR rings found:", sssrRings.length);
console.log("Expected SSSR size (E - N + C):", mol.bonds.length - mol.atoms.length + 1);
sssrRings.forEach((ring, i) => {
  console.log(`SSSR Ring ${i}: [${ring.join(", ")}] (size ${ring.length})`);
});

console.log("\n=== Ring membership per atom (based on SSSR) ===");
const ringMembership = new Map<number, number[]>();
sssrRings.forEach((ring, ringId) => {
  ring.forEach(atomId => {
    if (!ringMembership.has(atomId)) {
      ringMembership.set(atomId, []);
    }
    ringMembership.get(atomId)!.push(ringId);
  });
});

for (let i = 0; i < mol.atoms.length; i++) {
  const rings = ringMembership.get(i) || [];
  console.log(`Atom ${i}: in ${rings.length} rings [${rings.join(", ")}]`);
}
