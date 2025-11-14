import { parseSMILES, generateSMILES } from './index';

const expected = 'c1c[nH]cc1';
const got = 'C1CCNC1';

const expMol = parseSMILES(expected).molecules[0];
const gotMol = parseSMILES(got).molecules[0];

if (!expMol || !gotMol) {
  console.log("Parse failed");
  process.exit(1);
}

console.log("Expected: c1c[nH]cc1");
console.log("  Canonical:", generateSMILES(expMol));
console.log("  Atoms:", expMol.atoms.length, "Aromatic:", expMol.atoms.filter(a => a.aromatic).length);

console.log("\nGot: C1CCNC1");
console.log("  Canonical:", generateSMILES(gotMol));
console.log("  Atoms:", gotMol.atoms.length, "Aromatic:", gotMol.atoms.filter(a => a.aromatic).length);

console.log("\nSame?", generateSMILES(expMol) === generateSMILES(gotMol));
