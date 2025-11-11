import { describe, expect, it } from "bun:test";
import { parseSMILES } from "index";
import { generateIUPACName } from "src/iupac-engine";

describe("Chain orientation with terminus amine groups", () => {
  it("should correctly orient chains with primary amine terminus", () => {
    // Simple primary amine
    const mol = parseSMILES("CCN").molecules[0]!;
    const name = generateIUPACName(mol);
    expect(name).toBe("ethanamine");
  });

  it("should correctly orient chains with secondary amine terminus", () => {
    // Secondary amine
    const mol = parseSMILES("CCNC").molecules[0]!;
    const name = generateIUPACName(mol);
    expect(name).toBe("N-methylethanamine");
  });

  it("should correctly orient chains with tertiary amine terminus", () => {
    // Tertiary amine without formyl groups
    const mol = parseSMILES("CCN(C)C").molecules[0]!;
    const name = generateIUPACName(mol);
    expect(name).toBe("N,N-dimethylethanamine");
  });

  it("should correctly number phosphorus compound with amine terminus - regression test", () => {
    // This was broken before: sulfur was incorrectly at position 1 instead of 2
    // The issue was that getFunctionalGroupPositions() returned empty array for amine-derived chains
    // causing chain orientation to fall back to substituent position comparison
    const mol = parseSMILES("CCCP(=O)(OC1CCCCCCC1)SCCN(C)C").molecules[0]!;
    const name = generateIUPACName(mol);

    // Expected: sulfur at position 2 (counting from amine terminus)
    // Before fix: 1-[cyclooctyloxy(propyl)phosphoryl]sulfanyl-N,N-dimethylethanamine
    // After fix: 2-[cyclooctyloxy(propyl)phosphoryl]sulfanyl-N,N-dimethylethanamine
    expect(name).toBe(
      "2-[cyclooctyloxy(propyl)phosphoryl]sulfanyl-N,N-dimethylethanamine",
    );
  });

  it("should NOT treat tertiary amines with formyl as simple amine terminus", () => {
    // Tertiary amine with formyl group - should not orient toward nitrogen
    // This test verifies that formyl-substituted nitrogen with diamine backbone
    // correctly selects the 2-carbon ethane chain as parent structure
    const mol = parseSMILES("C(CN(CO)C=O)N(CO)C=O").molecules[0]!;
    const name = generateIUPACName(mol);

    // Fixed by diamine backbone detection (isDiamineBackbone helper)
    // The 2-carbon chain connecting the two amine nitrogens is now correctly
    // selected as the parent structure over single-carbon hydroxymethyl chains
    expect(name).toBe(
      "N,N'-diformyl-N,N'-bis(hydroxymethyl)ethane-1,2-diamine",
    );
  });
});
