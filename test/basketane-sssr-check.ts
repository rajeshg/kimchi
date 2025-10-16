const allRings = [
  [0, 1, 2, 3, 4, 5],  // Ring 0
  [0, 1, 5, 6, 7, 8],  // Ring 1
  [1, 2, 3, 7, 8, 9],  // Ring 2
  [3, 4, 5, 6, 7, 9],  // Ring 3
];

console.log("Testing all combinations of 3 rings from 4 fundamental rings:\n");

function testCombination(ringIndices: number[]) {
  // ensure we don't get undefined entries when indexing into allRings
  const rings = ringIndices.map(i => allRings[i]).filter((r): r is number[] => Array.isArray(r));
  const membership = new Map<number, number>();
  
  rings.forEach((ring) => {
    ring.forEach(atomId => {
      membership.set(atomId, (membership.get(atomId) || 0) + 1);
    });
  });
  
  const atomsInThreeRings = Array.from(membership.entries())
    .filter(([_, count]) => count === 3)
    .map(([atomId, _]) => atomId)
    .sort((a, b) => a - b);
  
  console.log(`Rings [${ringIndices.join(", ")}]:`);
  console.log(`  Atoms in 3 rings: [${atomsInThreeRings.join(", ")}]`);
  
  if (atomsInThreeRings.length === 4 && 
      atomsInThreeRings[0] === 1 && 
      atomsInThreeRings[1] === 3 && 
      atomsInThreeRings[2] === 5 && 
      atomsInThreeRings[3] === 7) {
    console.log("  *** MATCHES RDKit! ***");
  }
  console.log();
}

testCombination([0, 1, 2]);
testCombination([0, 1, 3]);
testCombination([0, 2, 3]);
testCombination([1, 2, 3]);
