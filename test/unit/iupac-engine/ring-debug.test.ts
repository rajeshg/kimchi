import { describe, it } from "bun:test";
import { parseSMILES } from "src/parsers/smiles-parser";
import { analyzeRings, findRings, findSSSR } from "src/utils/ring-analysis";

const cases = [
  { name: "cyclohexane", smiles: "C1CCCCC1" },
  { name: "benzene", smiles: "c1ccccc1" },
  { name: "methylcyclohexane", smiles: "CC1CCCCC1" },
  { name: "3-methylbutane", smiles: "CCC(C)C" },
  { name: "buta-1,3-diene", smiles: "C=CC=C" },
];

describe("Ring debug", () => {
  it("prints ring detection info for sample SMILES", () => {
    for (const c of cases) {
      try {
        const res = parseSMILES(c.smiles);
        const mol = res.molecules[0];
        console.log("\n===", c.name, c.smiles, "===");
        if (!mol) {
          console.log("  parse failed", res.errors);
          continue;
        }
        console.log("  atoms:", mol.atoms.length, "bonds:", mol.bonds.length);
        // Parser-provided rings (enrichment) if present
        console.log(
          "  parser.rings:",
          Array.isArray(mol.rings) ? mol.rings.map((r) => r.length) : mol.rings,
        );
        // Atom aromatic flags
        const aromaticAtoms = mol.atoms
          .filter((a) => a.aromatic)
          .map((a) => a.id);
        console.log("  aromatic atom ids:", aromaticAtoms);
        // SSSR via analyzeRings
        const ringInfo = analyzeRings(mol as any);
        console.log(
          "  SSSR count:",
          ringInfo.rings.length,
          "SSSR sizes:",
          ringInfo.rings.map((r) => r.length),
        );
        // All elementary rings
        const all = findRings(mol.atoms as any, mol.bonds as any);
        console.log(
          "  all cycles count:",
          all.length,
          "sizes:",
          all.map((r) => r.length),
        );
        // MCB/SSSR via findSSSR
        const sssr = findSSSR(mol.atoms as any, mol.bonds as any);
        console.log(
          "  findSSSR count:",
          sssr.length,
          "sizes:",
          sssr.map((r) => r.length),
        );
      } catch (err) {
        console.log("Error for", c.smiles, err);
      }
    }
  });
});
