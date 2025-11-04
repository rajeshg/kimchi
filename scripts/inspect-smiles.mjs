import { parseSMILES } from "index";

const smilesList = ["C1=CC=C2C(=C1)C=CC=C2", "c1cc2ccccc2cc1"];

for (const s of smilesList) {
  const result = parseSMILES(s);
  console.log("SMILES:", s);
  if (result.errors && result.errors.length) {
    console.log("Errors:", result.errors);
  }
  const mol = result.molecules && result.molecules[0];
  if (!mol) {
    console.log("No molecule");
    continue;
  }
  const summary = {
    atomCount: mol.atoms.length,
    bondCount: mol.bonds.length,
    atoms: mol.atoms.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      aromatic: !!a.aromatic,
      hydrogens: a.hydrogens,
    })),
    bonds: mol.bonds.map((b, i) => ({
      index: i,
      atom1: b.atom1,
      atom2: b.atom2,
      type: b.type,
      stereo: b.stereo,
    })),
    ringInfo: mol.ringInfo
      ? {
          ringCount: mol.ringInfo.rings.length,
          rings: mol.ringInfo.rings.map((r) => Array.from(r)),
        }
      : null,
  };
  console.log(JSON.stringify(summary, null, 2));
}
