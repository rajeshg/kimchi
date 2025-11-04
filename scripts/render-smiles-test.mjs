import { parseSMILES } from "index";
import { renderSVG } from "src/generators/svg-renderer";
import fs from "fs";

const smilesList = ["C1=CC=C2C(=C1)C=CC=C2", "c1cc2ccccc2cc1"];

for (const s of smilesList) {
  const result = parseSMILES(s);
  if (!result || !result.molecules || result.molecules.length === 0) {
    console.error("Parsing failed for", s, result && result.errors);
    continue;
  }
  const mol = result.molecules[0];
  const out = renderSVG(mol, { width: 300, height: 200, deterministic: true });
  const svg = typeof out === "string" ? out : (out && out.svg) || "";
  const fname = `/tmp/render-${s.replace(/[^a-z0-9]/gi, "")}.svg`;
  fs.writeFileSync(fname, svg);
  console.log("Wrote", fname);
  console.log("--- SVG FOR", s, "---");
  console.log(svg.slice(0, 1000));
}
