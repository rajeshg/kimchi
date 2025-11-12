import { describe, expect, test } from "bun:test";
import { generateIUPACName, parseSMILES } from "index";

describe("IUPAC Sulfur Compounds - Sulfoxides and Sulfones", () => {
  test("dimethyl sulfoxide (DMSO) - CS(=O)C", () => {
    const mol = parseSMILES("CS(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("methylsulfinylmethane");
    expect(result.errors).toEqual([]);
  });

  test("dimethyl sulfone - CS(=O)(=O)C", () => {
    const mol = parseSMILES("CS(=O)(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("methylsulfonylmethane");
    expect(result.errors).toEqual([]);
  });

  test("ethyl methyl sulfoxide - CCS(=O)C", () => {
    const mol = parseSMILES("CCS(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("1-(methylsulfinyl)ethane");
    expect(result.errors).toEqual([]);
  });

  test("diphenyl sulfone - c1ccccc1S(=O)(=O)c2ccccc2", () => {
    const mol = parseSMILES("c1ccccc1S(=O)(=O)c2ccccc2").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("(phenylsulfonyl)benzene");
    expect(result.errors).toEqual([]);
  });

  test("diphenyl sulfoxide - c1ccccc1S(=O)c2ccccc2", () => {
    const mol = parseSMILES("c1ccccc1S(=O)c2ccccc2").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("(phenylsulfinyl)benzene");
    expect(result.errors).toEqual([]);
  });

  test("propyl sulfoxide - CCCS(=O)CCC", () => {
    const mol = parseSMILES("CCCS(=O)CCC").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("1-(propylsulfinyl)propane");
    expect(result.errors).toEqual([]);
  });

  test("propyl sulfone - CCCS(=O)(=O)CCC", () => {
    const mol = parseSMILES("CCCS(=O)(=O)CCC").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("1-(propylsulfonyl)propane");
    expect(result.errors).toEqual([]);
  });

  test("isopropyl methyl sulfoxide - CC(C)S(=O)C", () => {
    const mol = parseSMILES("CC(C)S(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("2-(methylsulfinyl)propane");
    expect(result.errors).toEqual([]);
  });

  test("isopropyl methyl sulfone - CC(C)S(=O)(=O)C", () => {
    const mol = parseSMILES("CC(C)S(=O)(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("2-(methylsulfonyl)propane");
    expect(result.errors).toEqual([]);
  });

  test("tert-butyl methyl sulfoxide - CC(C)(C)S(=O)C", () => {
    const mol = parseSMILES("CC(C)(C)S(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("2-methyl-2-(methylsulfinyl)propane");
    expect(result.errors).toEqual([]);
  });

  test("tert-butyl methyl sulfone - CC(C)(C)S(=O)(=O)C", () => {
    const mol = parseSMILES("CC(C)(C)S(=O)(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("2-methyl-2-(methylsulfonyl)propane");
    expect(result.errors).toEqual([]);
  });

  test("allyl methyl sulfoxide - C=CCS(=O)C", () => {
    const mol = parseSMILES("C=CCS(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("3-(methylsulfinyl)propene");
    expect(result.errors).toEqual([]);
  });

  test("allyl methyl sulfone - C=CCS(=O)(=O)C", () => {
    const mol = parseSMILES("C=CCS(=O)(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("3-(methylsulfonyl)propene");
    expect(result.errors).toEqual([]);
  });

  test("benzyl methyl sulfoxide - c1ccccc1CS(=O)C", () => {
    const mol = parseSMILES("c1ccccc1CS(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("phenyl-(methylsulfinyl)methane");
    expect(result.errors).toEqual([]);
  });

  test("benzyl methyl sulfone - c1ccccc1CS(=O)(=O)C", () => {
    const mol = parseSMILES("c1ccccc1CS(=O)(=O)C").molecules[0];
    if (!mol) throw new Error("Failed to parse SMILES");
    const result = generateIUPACName(mol);
    expect(result.name).toBe("phenyl-(methylsulfonyl)methane");
    expect(result.errors).toEqual([]);
  });
});
