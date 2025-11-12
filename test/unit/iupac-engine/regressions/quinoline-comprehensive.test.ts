import { describe, it, expect } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("Quinoline numbering - comprehensive position test", () => {
  it("should correctly number all positions 2-8 with canonical SMILES", () => {
    const positions = [
      { pos: 2, smiles: "n1c(C)ccc2ccccc12", expected: "2-methylquinoline" },
      { pos: 3, smiles: "n1cc(C)cc2ccccc12", expected: "3-methylquinoline" },
      { pos: 4, smiles: "n1ccc(C)c2ccccc12", expected: "4-methylquinoline" },
      { pos: 5, smiles: "n1cccc2c(C)cccc12", expected: "5-methylquinoline" },
      { pos: 6, smiles: "n1cccc2cc(C)ccc12", expected: "6-methylquinoline" },
      { pos: 7, smiles: "n1cccc2ccc(C)cc12", expected: "7-methylquinoline" },
      { pos: 8, smiles: "n1cccc2cccc(C)c12", expected: "8-methylquinoline" },
    ];
    
    for (const test of positions) {
      const mol = parseSMILES(test.smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe(test.expected);
    }
  });
  
  it("should correctly number all positions 2-8 with chloro substituents", () => {
    const positions = [
      { pos: 2, smiles: "n1c(Cl)ccc2ccccc12", expected: "2-chloroquinoline" },
      { pos: 3, smiles: "n1cc(Cl)cc2ccccc12", expected: "3-chloroquinoline" },
      { pos: 4, smiles: "n1ccc(Cl)c2ccccc12", expected: "4-chloroquinoline" },
      { pos: 5, smiles: "n1cccc2c(Cl)cccc12", expected: "5-chloroquinoline" },
      { pos: 6, smiles: "n1cccc2cc(Cl)ccc12", expected: "6-chloroquinoline" },
      { pos: 7, smiles: "n1cccc2ccc(Cl)cc12", expected: "7-chloroquinoline" },
      { pos: 8, smiles: "n1cccc2cccc(Cl)c12", expected: "8-chloroquinoline" },
    ];
    
    for (const test of positions) {
      const mol = parseSMILES(test.smiles).molecules[0];
      expect(mol).toBeDefined();
      
      const result = generateIUPACName(mol!);
      expect(result.name).toBe(test.expected);
    }
  });
});
