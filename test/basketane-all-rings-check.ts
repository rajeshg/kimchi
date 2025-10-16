const allRings = [
  [0, 1, 2, 3, 4, 5],  // Ring 0 - 6-membered
  [0, 1, 5, 6, 7, 8],  // Ring 1 - 6-membered
  [1, 2, 3, 7, 8, 9],  // Ring 2 - 6-membered
  [3, 4, 5, 6, 7, 9],  // Ring 3 - 6-membered
  [0, 1, 2, 3, 5, 6, 7, 9], // Ring 4 - 8-membered
  [0, 1, 3, 4, 5, 7, 8, 9], // Ring 5 - 8-membered
  [1, 2, 3, 4, 5, 6, 7, 8], // Ring 6 - 8-membered
];

console.log("Testing with ALL 7 rings:\n");

const membership = new Map<number, number>();

allRings.forEach((ring, ringId) => {
  ring.forEach(atomId => {
    membership.set(atomId, (membership.get(atomId) || 0) + 1);
  });
});

console.log("Ring membership per atom:");
for (let i = 0; i < 10; i++) {
  const count = membership.get(i) || 0;
  console.log(`Atom ${i}: in ${count} rings`);
}

const atomsInThreeRings = Array.from(membership.entries())
  .filter(([_, count]) => count >= 3)
  .map(([atomId, _]) => atomId)
  .sort((a, b) => a - b);

console.log(`\nAtoms in 3+ rings: [${atomsInThreeRings.join(", ")}]`);

console.log("\nTesting with only 4 fundamental 6-membered rings:");
const fundamentalRings = [
  [0, 1, 2, 3, 4, 5],
  [0, 1, 5, 6, 7, 8],
  [1, 2, 3, 7, 8, 9],
  [3, 4, 5, 6, 7, 9],
];

const fundamentalMembership = new Map<number, number>();
fundamentalRings.forEach((ring) => {
  ring.forEach(atomId => {
    fundamentalMembership.set(atomId, (fundamentalMembership.get(atomId) || 0) + 1);
  });
});

console.log("\nRing membership with 4 fundamental rings:");
for (let i = 0; i < 10; i++) {
  const count = fundamentalMembership.get(i) || 0;
  console.log(`Atom ${i}: in ${count} rings`);
}

const fundamentalAtomsInThreeRings = Array.from(fundamentalMembership.entries())
  .filter(([_, count]) => count >= 3)
  .map(([atomId, _]) => atomId)
  .sort((a, b) => a - b);

console.log(`\nAtoms in 3+ rings (fundamental): [${fundamentalAtomsInThreeRings.join(", ")}]`);
if (fundamentalAtomsInThreeRings.length === 4 &&
    fundamentalAtomsInThreeRings[0] === 1 &&
    fundamentalAtomsInThreeRings[1] === 3 &&
    fundamentalAtomsInThreeRings[2] === 5 &&
    fundamentalAtomsInThreeRings[3] === 7) {
  console.log("*** MATCHES RDKit! ***");
}
