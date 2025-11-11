import { describe, expect, it } from "bun:test";
import { parseSMILES } from "index";
import { generateIUPACName } from "src/iupac-engine";

describe("Diamine backbone chain selection", () => {
  it("should select 2-carbon ethane backbone over single-carbon hydroxymethyl chains in formyl diamines", () => {
    // N,N'-diformyl-N,N'-bis(hydroxymethyl)ethane-1,2-diamine
    // This molecule has two amine nitrogens connected by a 2-carbon chain
    // Each nitrogen also has single-carbon hydroxymethyl substituents
    // The 2-carbon chain connecting the two amines should be selected as parent
    const mol = parseSMILES("C(CN(CO)C=O)N(CO)C=O").molecules[0]!;
    const name = generateIUPACName(mol);

    // Before fix: selected single-carbon hydroxymethyl chains (priority=10, alcohol)
    // After fix: correctly selects 2-carbon ethane backbone (priority=13, amine)
    // via isDiamineBackbone() helper that detects chains connecting two amine nitrogens
    expect(name).toBe(
      "N,N'-diformyl-N,N'-bis(hydroxymethyl)ethane-1,2-diamine",
    );
  });

  it("should handle simple diamines correctly", () => {
    // Basic ethane-1,2-diamine
    const mol = parseSMILES("NCCN").molecules[0]!;
    const name = generateIUPACName(mol);
    expect(name).toBe("ethane-1,2-diamine");
  });

  it("should handle propane-1,3-diamine", () => {
    // Propane-1,3-diamine
    const mol = parseSMILES("NCCCN").molecules[0]!;
    const name = generateIUPACName(mol);
    expect(name).toBe("propane-1,3-diamine");
  });

  it("should not apply diamine backbone override when there are no competing single-carbon alcohol chains", () => {
    // N,N'-dimethylethane-1,2-diamine
    // Two nitrogens connected by 2-carbon chain, but no competing alcohol chains
    const mol = parseSMILES("CN(C)CCN(C)C").molecules[0]!;
    const name = generateIUPACName(mol);
    expect(name).toBe("N,N,N',N'-tetramethylethane-1,2-diamine");
  });

  it("should not apply diamine backbone when chain connects to same nitrogen", () => {
    // Single nitrogen with multiple single-carbon chains should not be treated as diamine
    const mol = parseSMILES("N(C)C").molecules[0]!;
    const name = generateIUPACName(mol);
    // N(C)C is dimethylamine, not methanamine
    expect(name).toBe("N-methylmethanamine");
  });

  it("should handle diamine with one formyl and one hydroxymethyl per nitrogen", () => {
    // Similar to main test case but verifying the specific pattern
    const mol = parseSMILES("C(CN(CO)C=O)N(CO)C=O").molecules[0]!;
    const result = parseSMILES("C(CN(CO)C=O)N(CO)C=O");

    expect(result.molecules).toHaveLength(1);
    // SMILES: C(CN(CO)C=O)N(CO)C=O
    // Atoms: C-C-N(-C-O)(-C=O), N(-C-O)(-C=O)
    // Count: 2 ethane carbons + 2 nitrogens + 2 hydroxymethyl groups (2C+2O) + 2 formyl groups (2C+2O) = 12 atoms
    expect(result.molecules[0]!.atoms).toHaveLength(12);

    const name = generateIUPACName(mol);
    expect(name).toContain("ethane-1,2-diamine");
    expect(name).toContain("diformyl");
    expect(name).toContain("hydroxymethyl");
  });
});
