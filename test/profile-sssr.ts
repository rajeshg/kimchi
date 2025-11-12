import { parseSMILES } from "index";

const slowSMILES =
  "CC(C)(C)C1=CC2=C(C=C1)N3C4=CC(=C5C=CC6=C7C5=C4C=CC7=CC(=C6)C(C)(C)C)N8C9=C(C=C(C=C9)C(C)(C)C)C1=CC4=C(C=C18)N(C1=C4C=C(C=C1)C(C)(C)C)C1=C4C=CC5=C6C4=C(C=CC6=CC(=C5)C(C)(C)C)C(=C1)N1C4=C(C=C(C=C4)C(C)(C)C)C4=C1C=C3C2=C4";

const startTotal = performance.now();
const result = parseSMILES(slowSMILES);
const endTotal = performance.now();

const mol = result.molecules[0]!;
console.log(`Total parse time: ${(endTotal - startTotal).toFixed(2)}ms`);
console.log(`Atoms: ${mol.atoms.length}, Bonds: ${mol.bonds.length}`);
console.log(`Rings: ${mol.rings?.length || 0}`);

// Calculate graph density
const density = mol.bonds.length / mol.atoms.length;
console.log(`Graph density: ${density.toFixed(3)} (typical PAH: 1.2-1.3)`);
