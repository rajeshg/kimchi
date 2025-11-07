import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import {
  findMainChain,
  getChainFunctionalGroupPriority,
} from "src/iupac-engine/naming/iupac-chains";

describe("IUPAC functional-group priority (extended)", () => {
  const cases: { smiles: string; name: string; maxPriority: number }[] = [
    { smiles: "CC(=O)OCC", name: "ester (ethyl acetate)", maxPriority: 4 },
    { smiles: "CCC#N", name: "nitrile (propionitrile)", maxPriority: 7 },
    { smiles: "CC(=O)N", name: "amide (acetamide)", maxPriority: 6 },
    {
      smiles: "CC(=O)Cl",
      name: "acid chloride (acetyl chloride)",
      maxPriority: 5,
    },
    {
      smiles: "CP(=O)(O)O",
      name: "phosphonic acid (methylphosphonic acid)",
      maxPriority: 1,
    },
    // Note: sulfonamide and nitro groups are excluded from the parent chain,
    // so getChainFunctionalGroupPriority cannot detect them by examining chain atoms alone
  ];

  for (const c of cases) {
    it(`detects ${c.name}`, () => {
      const result = parseSMILES(c.smiles);
      const mol = result.molecules[0]!;
      const main = findMainChain(mol);
      expect(main.length).toBeGreaterThanOrEqual(1);
      const priority = getChainFunctionalGroupPriority(main, mol);
      expect(priority).toBeLessThanOrEqual(c.maxPriority);
    });
  }
});
