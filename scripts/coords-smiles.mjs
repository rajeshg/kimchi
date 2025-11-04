import { parseSMILES } from "index";
import { generateCoordinates } from "src/utils/coordinate-generator";

const smilesList = ["C1=CC=C2C(=C1)C=CC=C2", "c1cc2ccccc2cc1"];
for (const s of smilesList) {
  const res = parseSMILES(s);
  const mol = res.molecules[0];
  console.log("SMILES:", s);
  console.log(
    "Rings:",
    mol.ringInfo ? mol.ringInfo.rings.map((r) => Array.from(r)) : null,
  );
  const coords = generateCoordinates(mol, { deterministic: true });
  console.log("Raw coords:");
  console.log(
    coords
      .map((c, i) => ` ${i}: ${c.x.toFixed(3)}, ${c.y.toFixed(3)}`)
      .join("\n"),
  );
  console.log("---");
}
