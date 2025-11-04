import { parseSMILES } from "index";
import { renderSVG } from "src/generators/svg-renderer";
import fs from "fs";
import path from "path";

const outDir = path.resolve("output/svg");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const smilesList = [
  { s: "C1=CC=C2C(=C1)C=CC=C2", file: "naphthalene-kekule.svg" },
  { s: "c1cc2ccccc2cc1", file: "naphthalene-aromatic.svg" },
];

for (const item of smilesList) {
  const result = parseSMILES(item.s);
  if (!result || !result.molecules || result.molecules.length === 0) {
    console.error("Parsing failed for", item.s, result && result.errors);
    continue;
  }
  const mol = result.molecules[0];
  const out = renderSVG(mol, { width: 400, height: 300, deterministic: true });
  const svg = typeof out === "string" ? out : (out && out.svg) || "";
  const fname = path.join(outDir, item.file);
  fs.writeFileSync(fname, svg);
  console.log("Wrote", fname);
}
