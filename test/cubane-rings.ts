import { parseSMILES } from "index";
import { findSSSR, findRings } from "src/utils/ring-analysis";

const smiles = "C12C3C4C1C5C2C3C45";
const result = parseSMILES(smiles);
const mol = result.molecules[0]!;

console.log("Cubane:");
console.log("Atoms:", mol.atoms.length);
console.log("Bonds:", mol.bonds.length);
console.log("Expected SSSR:", mol.bonds.length - mol.atoms.length + 1);

const allRings = findRings(mol.atoms, mol.bonds);
console.log("\nAll rings found:", allRings.length);
allRings.forEach((ring, i) => {
  console.log(`Ring ${i}: [${ring.join(", ")}] (size ${ring.length})`);
});

const sssrRings = findSSSR(mol.atoms, mol.bonds);
console.log("\nSSSR rings found:", sssrRings.length);
sssrRings.forEach((ring, i) => {
  console.log(`SSSR Ring ${i}: [${ring.join(", ")}] (size ${ring.length})`);
});

console.log("\n=== Ring membership per atom (SSSR) ===");
const sssrMembership = new Map<number, number>();
sssrRings.forEach((ring) => {
  ring.forEach(atomId => {
    sssrMembership.set(atomId, (sssrMembership.get(atomId) || 0) + 1);
  });
});
for (let i = 0; i < 8; i++) {
  console.log(`Atom ${i}: in ${sssrMembership.get(i) || 0} SSSR rings`);
}

console.log("\n=== Ring membership per atom (all rings) ===");
const allMembership = new Map<number, number>();
allRings.forEach((ring) => {
  ring.forEach(atomId => {
    allMembership.set(atomId, (allMembership.get(atomId) || 0) + 1);
  });
});
for (let i = 0; i < 8; i++) {
  console.log(`Atom ${i}: in ${allMembership.get(i) || 0} total rings`);
}

console.log("\n=== 4-membered rings only ===");
const fourRings = allRings.filter(r => r.length === 4);
console.log("Number of 4-membered rings:", fourRings.length);
fourRings.forEach((ring, i) => {
  console.log(`4-ring ${i}: [${ring.join(", ")}]`);
});

const fourMembership = new Map<number, number>();
fourRings.forEach((ring) => {
  ring.forEach(atomId => {
    fourMembership.set(atomId, (fourMembership.get(atomId) || 0) + 1);
  });
});

console.log("\nRing membership (4-membered only):");
for (let i = 0; i < 8; i++) {
  console.log(`Atom ${i}: in ${fourMembership.get(i) || 0} 4-rings`);
}
