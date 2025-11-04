import { describe, it, expect } from "bun:test";
import { parseSMILES, parseSMARTS, matchSMARTS } from "index";

describe("Benzene Ring Failures", () => {
  const testCases = [
    "COc1ccc2nc(C)c(CCN(C)C)c(C)c2c1",
    "N1C(=NN=C1)C",
    "Cn1c2c(c3ccccc13)CCCC2",
    "CCCCCCCCCCCCCCCCCCCCCCCCCCCC(c1ccc2c(c1)ccc(c1ccccc1)c1c2cccc1)CCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    "CCN(CC)c1ccc(C=C2C(=O)Nc3ccc4nc5ccccc5nc4c3C2=O)cc1",
    "CC(C)(C)c1cc(O)c2C(=O)C(=C(Oc2c1)c1ccc(O)c(c1)C(C)(C)C)C(O)=O",
  ];

  testCases.forEach((smiles, idx) => {
    it(`should match benzene in molecule ${idx + 1}`, () => {
      const pattern = parseSMARTS("c1ccccc1");
      const parsed = parseSMILES(smiles);
      const result = matchSMARTS(pattern.pattern!, parsed.molecules[0]!, {
        uniqueMatches: true,
      });

      console.log(`\nMolecule ${idx + 1}: ${smiles}`);
      console.log(`Matches: ${result.matches.length}`);
      result.matches.forEach((m) => {
        const indices = m.atoms.map((a) => a.moleculeIndex);
        console.log(`  [${indices}]`);
      });
    });
  });
});
