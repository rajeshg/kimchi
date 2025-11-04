import { describe, it, expect } from "bun:test";
import { parseSMILES, parseSMARTS, matchSMARTS } from "index";
import { initializeRDKit, getSubstructMatches } from "./rdkit-smarts-api";
import { assertMatchesEqual } from "./comparison-framework";

function testPattern(rdkit: any, pattern: string, smiles: string) {
  const smartsPattern = parseSMARTS(pattern);
  if (smartsPattern.errors && smartsPattern.errors.length > 0) {
    throw new Error(
      `Failed to parse SMARTS pattern ${pattern}: ${smartsPattern.errors}`,
    );
  }

  const parsed = parseSMILES(smiles);
  if (parsed.errors && parsed.errors.length > 0) {
    throw new Error(`Failed to parse SMILES ${smiles}: ${parsed.errors}`);
  }

  const rdkitResult = getSubstructMatches(rdkit, smiles, pattern);
  const openchemResult = matchSMARTS(
    smartsPattern.pattern!,
    parsed.molecules[0]!,
    { uniqueMatches: true },
  );
  const openchemMatches = openchemResult.matches.map((match) =>
    match.atoms.map((a) => a.moleculeIndex),
  );

  assertMatchesEqual(openchemMatches, rdkitResult.matches, pattern, smiles);
}

const TEST_MOLECULES = [
  "C",
  "CC",
  "CCC",
  "C=C",
  "C#C",
  "c1ccccc1",
  "c1ccncc1",
  "CCO",
  "CC(=O)O",
  "CC(=O)N",
];

describe("RDKit SMARTS Primitives Comparison", () => {
  const runTests = !!process.env.RUN_RDKIT_BULK;
  if (!runTests) {
    it("skipped (set RUN_RDKIT_BULK=1 to run)", () => {});
    return;
  }

  let RDKit: any;

  it("initializes RDKit", async () => {
    RDKit = await initializeRDKit();
    expect(RDKit).toBeDefined();
  });

  describe("Wildcards", () => {
    it("matches * (any atom)", async () => {
      const pattern = "*";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [*] (any atom bracket)", async () => {
      const pattern = "[*]";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches A (aliphatic atom)", async () => {
      const pattern = "A";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches a (aromatic atom)", async () => {
      const pattern = "a";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("does not match [!*] (negated any)", async () => {
      const pattern = "[!*]";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Elements", () => {
    it("matches C (carbon)", async () => {
      const pattern = "C";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches N (nitrogen)", async () => {
      const pattern = "N";
      for (const smiles of ["c1ccncc1", "CC(=O)N", "CCN"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches O (oxygen)", async () => {
      const pattern = "O";
      for (const smiles of ["CCO", "CC(=O)O", "COC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [C] (carbon bracket)", async () => {
      const pattern = "[C]";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [#6] (carbon by atomic number)", async () => {
      const pattern = "[#6]";
      for (const smiles of TEST_MOLECULES) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Aromaticity", () => {
    it("matches c (aromatic carbon)", async () => {
      const pattern = "c";
      for (const smiles of ["c1ccccc1", "c1ccncc1", "c1ccc2ccccc2c1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches n (aromatic nitrogen)", async () => {
      const pattern = "n";
      for (const smiles of ["c1ccncc1", "c1[nH]ccn1", "[nH]1cccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [a] (any aromatic)", async () => {
      const pattern = "[a]";
      for (const smiles of ["c1ccccc1", "c1ccncc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [A] (any aliphatic)", async () => {
      const pattern = "[A]";
      for (const smiles of ["CC", "CCC", "CCO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [c,n] (aromatic carbon or nitrogen)", async () => {
      const pattern = "[c,n]";
      for (const smiles of ["c1ccccc1", "c1ccncc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Degree", () => {
    it("matches [D1] (degree 1 - terminal)", async () => {
      const pattern = "[D1]";
      for (const smiles of ["CC", "CCC", "CCO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [D2] (degree 2 - linear)", async () => {
      const pattern = "[D2]";
      for (const smiles of ["CCC", "CCCC", "CCO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [D3] (degree 3 - branching)", async () => {
      const pattern = "[D3]";
      for (const smiles of ["CC(C)C", "CC(C)O", "C(C)(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [D4] (degree 4 - quaternary)", async () => {
      const pattern = "[D4]";
      for (const smiles of ["C(C)(C)(C)C", "CC(C)(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [!D1] (not degree 1)", async () => {
      const pattern = "[!D1]";
      for (const smiles of ["CCC", "CC(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Ring Membership", () => {
    it("matches [R] (in any ring)", async () => {
      const pattern = "[R]";
      for (const smiles of ["C1CCCCC1", "c1ccccc1", "C1CC1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [R0] (not in ring)", async () => {
      const pattern = "[R0]";
      for (const smiles of ["CC", "CCC", "CCO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [R1] (in exactly 1 ring)", async () => {
      const pattern = "[R1]";
      for (const smiles of ["C1CCCCC1", "c1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [R2] (in exactly 2 rings)", async () => {
      const pattern = "[R2]";
      // Test aliphatic first
      const smiles = "C1CC2CCC1C2";
      const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
      testPattern(RDKit, pattern, smiles);
    });

    it("matches [r5] (in 5-membered ring)", async () => {
      const pattern = "[r5]";
      for (const smiles of ["C1CCCC1", "c1ccoc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [r6] (in 6-membered ring)", async () => {
      const pattern = "[r6]";
      for (const smiles of ["C1CCCCC1", "c1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [x2] (ring connectivity 2)", async () => {
      const pattern = "[x2]";
      for (const smiles of ["C1CCCCC1", "c1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [X3] (total connectivity 3)", async () => {
      const pattern = "[X3]";
      for (const smiles of ["CC(C)C", "c1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Charge", () => {
    it("matches [+] (positive charge)", async () => {
      const pattern = "[+]";
      for (const smiles of ["[NH4+]", "[N+](C)(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [-] (negative charge)", async () => {
      const pattern = "[-]";
      for (const smiles of ["[O-]", "[Cl-]"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [+2] (charge +2)", async () => {
      const pattern = "[+2]";
      for (const smiles of ["[Cu+2]", "[Fe+2]"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [N+] (positive nitrogen)", async () => {
      const pattern = "[N+]";
      for (const smiles of ["[NH4+]", "[N+](C)(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Hydrogens", () => {
    it("matches [H0] (no hydrogens)", async () => {
      const pattern = "[H0]";
      for (const smiles of ["C(C)(C)(C)C", "C(F)(F)F"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [H1] (exactly 1 hydrogen)", async () => {
      const pattern = "[H1]";
      for (const smiles of ["CC", "CCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [H2] (exactly 2 hydrogens)", async () => {
      const pattern = "[H2]";
      for (const smiles of ["CC", "CCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [H3] (exactly 3 hydrogens)", async () => {
      const pattern = "[H3]";
      for (const smiles of ["C", "CC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [!H0] (has hydrogens)", async () => {
      const pattern = "[!H0]";
      for (const smiles of ["C", "CC", "CCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [CH2] (carbon with 2 hydrogens)", async () => {
      const pattern = "[CH2]";
      for (const smiles of ["CC", "CCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [CH3] (carbon with 3 hydrogens)", async () => {
      const pattern = "[CH3]";
      for (const smiles of ["C", "CC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [NH] (nitrogen with 1 hydrogen)", async () => {
      const pattern = "[NH]";
      for (const smiles of ["CNC", "c1cc[nH]c1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Valence", () => {
    it("matches [v3] (valence 3)", async () => {
      const pattern = "[v3]";
      for (const smiles of ["CN", "c1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [v4] (valence 4)", async () => {
      const pattern = "[v4]";
      for (const smiles of ["CC", "C=C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [X4] (connectivity 4)", async () => {
      const pattern = "[X4]";
      for (const smiles of ["C(C)(C)(C)C", "C(=O)(O)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Bonds", () => {
    it("matches C~C (any bond)", async () => {
      const pattern = "C~C";
      for (const smiles of ["CC", "C=C", "C#C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches C-C (single bond)", async () => {
      const pattern = "C-C";
      for (const smiles of ["CC", "CCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches C=C (double bond)", async () => {
      const pattern = "C=C";
      for (const smiles of ["C=C", "CC=C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches C#C (triple bond)", async () => {
      const pattern = "C#C";
      for (const smiles of ["C#C", "CC#C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches a~a (aromatic-aromatic bond)", async () => {
      const pattern = "a~a";
      for (const smiles of ["c1ccccc1", "c1ccncc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches A~A (aliphatic-aliphatic bond)", async () => {
      const pattern = "A~A";
      for (const smiles of ["CC", "CCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Logical Operators", () => {
    it("matches [C&D2] (carbon AND degree 2)", async () => {
      const pattern = "[C&D2]";
      for (const smiles of ["CCC", "CCCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [C,N] (carbon OR nitrogen)", async () => {
      const pattern = "[C,N]";
      for (const smiles of ["CC", "CN", "c1ccncc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [C&!R] (carbon NOT in ring)", async () => {
      const pattern = "[C&!R]";
      for (const smiles of ["CC", "CCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [N;D2] (nitrogen with degree 2)", async () => {
      const pattern = "[N;D2]";
      for (const smiles of ["CNC", "CNCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [O;H1] (oxygen with 1 hydrogen)", async () => {
      const pattern = "[O;H1]";
      for (const smiles of ["CO", "CCO", "CC(=O)O"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [C&H2&D2] (carbon with 2H and degree 2)", async () => {
      const pattern = "[C&H2&D2]";
      for (const smiles of ["CCC", "CCCC"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [n&R&D2] (aromatic nitrogen in ring with degree 2)", async () => {
      const pattern = "[n&R&D2]";
      for (const smiles of ["c1ccncc1", "c1nccnc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [C,N,O] (carbon OR nitrogen OR oxygen)", async () => {
      const pattern = "[C,N,O]";
      for (const smiles of ["CC", "CN", "CO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [!C&!H] (not carbon AND not hydrogen)", async () => {
      const pattern = "[!C&!H]";
      for (const smiles of ["CN", "CO", "CS"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [C&r6] (carbon in 6-membered ring)", async () => {
      const pattern = "[C&r6]";
      for (const smiles of ["C1CCCCC1", "c1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Connectivity Patterns", () => {
    it("matches [NX3] (nitrogen connectivity 3)", async () => {
      const pattern = "[NX3]";
      for (const smiles of ["CN(C)C", "c1ccccc1N"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [OX2] (oxygen connectivity 2)", async () => {
      const pattern = "[OX2]";
      for (const smiles of ["COC", "CCO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [CX4] (sp3 carbon)", async () => {
      const pattern = "[CX4]";
      for (const smiles of ["CC", "CCC", "C(C)(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [CX3] (sp2 carbon)", async () => {
      const pattern = "[CX3]";
      for (const smiles of ["C=C", "CC=O", "c1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [CX2] (sp carbon)", async () => {
      const pattern = "[CX2]";
      for (const smiles of ["C#C", "CC#C", "C#N"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [NX2] (sp2 nitrogen)", async () => {
      const pattern = "[NX2]";
      for (const smiles of ["C=N", "CC=N", "C#N"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [OX1] (carbonyl oxygen)", async () => {
      const pattern = "[OX1]";
      for (const smiles of ["C=O", "CC=O", "CC(=O)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Extended Element Tests", () => {
    it("matches S (sulfur)", async () => {
      const pattern = "S";
      for (const smiles of ["CS", "CSC", "CC(=O)S"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches P (phosphorus)", async () => {
      const pattern = "P";
      for (const smiles of ["CP", "CP(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches F (fluorine)", async () => {
      const pattern = "F";
      for (const smiles of ["CF", "C(F)(F)F", "CCF"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches Cl (chlorine)", async () => {
      const pattern = "Cl";
      for (const smiles of ["CCl", "C(Cl)(Cl)Cl", "CCCl"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches Br (bromine)", async () => {
      const pattern = "Br";
      for (const smiles of ["CBr", "CCBr", "c1ccccc1Br"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches I (iodine)", async () => {
      const pattern = "I";
      for (const smiles of ["CI", "CCI", "c1ccccc1I"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Ring Size Tests", () => {
    it("matches [r3] (in 3-membered ring)", async () => {
      const pattern = "[r3]";
      for (const smiles of ["C1CC1", "C1OC1", "C1NC1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [r4] (in 4-membered ring)", async () => {
      const pattern = "[r4]";
      for (const smiles of ["C1CCC1", "C1COC1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [r7] (in 7-membered ring)", async () => {
      const pattern = "[r7]";
      for (const smiles of ["C1CCCCCC1", "C1COCCCC1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Advanced Degree Tests", () => {
    it("matches [!D2] (not linear)", async () => {
      const pattern = "[!D2]";
      for (const smiles of ["CC", "CC(C)C", "C(C)(C)(C)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Complex Aromatic Tests", () => {
    it("matches [aD2] (aromatic with degree 2)", async () => {
      const pattern = "[aD2]";
      for (const smiles of ["c1ccccc1", "c1ccncc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [aD3] (aromatic with degree 3)", async () => {
      const pattern = "[aD3]";
      for (const smiles of ["c1ccccc1C", "c1cc(C)ccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches s (aromatic sulfur)", async () => {
      const pattern = "s";
      for (const smiles of ["c1sccc1", "c1ccsc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches o (aromatic oxygen)", async () => {
      const pattern = "o";
      for (const smiles of ["c1occc1", "c1ccoc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Multi-Pattern Tests", () => {
    it("matches [C,N,O,S] (common heteroatoms)", async () => {
      const pattern = "[C,N,O,S]";
      for (const smiles of ["CC", "CN", "CO", "CS", "CNOS"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [C,c] (any carbon)", async () => {
      const pattern = "[C,c]";
      for (const smiles of ["CC", "c1ccccc1", "CCc1ccccc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [#6,#7,#8] (C, N, or O by atomic number)", async () => {
      const pattern = "[#6,#7,#8]";
      for (const smiles of ["CC", "CN", "CO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Negation Tests", () => {
    it("matches [!C] (not carbon)", async () => {
      const pattern = "[!C]";
      for (const smiles of ["CN", "CO", "CS", "CF"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [!N] (not nitrogen)", async () => {
      const pattern = "[!N]";
      for (const smiles of ["CC", "CO", "CS", "CN"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [!R] (not in ring)", async () => {
      const pattern = "[!R]";
      for (const smiles of ["CC", "CCC", "CCO"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [!a] (not aromatic)", async () => {
      const pattern = "[!a]";
      for (const smiles of ["CC", "C=C", "C#C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Hydrogen Count Edge Cases", () => {
    it("matches [H4] (4 hydrogens - methane)", async () => {
      const pattern = "[H4]";
      for (const smiles of ["C", "[CH4]"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [NH2] (nitrogen with 2 hydrogens)", async () => {
      const pattern = "[NH2]";
      for (const smiles of ["CN", "CCN"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [NH3+] (ammonium)", async () => {
      const pattern = "[NH3+]";
      for (const smiles of ["[NH4+]", "C[NH3+]"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [OH] (hydroxyl)", async () => {
      const pattern = "[OH]";
      for (const smiles of ["CO", "CCO", "CC(O)C"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Valence Edge Cases", () => {
    it("matches [v2] (valence 2)", async () => {
      const pattern = "[v2]";
      for (const smiles of ["C=C", "CO", "CS"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [v5] (valence 5 - phosphorus)", async () => {
      const pattern = "[v5]";
      for (const smiles of ["CP(C)(C)C", "OP(O)(O)O"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Complex Bond Patterns", () => {
    it("matches c:c (aromatic bond explicit)", async () => {
      const pattern = "c:c";
      for (const smiles of ["c1ccccc1", "c1ccncc1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Charge Edge Cases", () => {
    it("matches [-2] (charge -2)", async () => {
      const pattern = "[-2]";
      for (const smiles of ["[O-2]", "[S-2]"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [+3] (charge +3)", async () => {
      const pattern = "[+3]";
      for (const smiles of ["[Fe+3]", "[Al+3]"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [O-] (negative oxygen)", async () => {
      const pattern = "[O-]";
      for (const smiles of ["[O-]", "CC([O-])=O"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });

  describe("Fused Ring Systems", () => {
    it("matches atoms in naphthalene", async () => {
      const pattern = "c";
      for (const smiles of ["c1ccc2ccccc2c1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });

    it("matches [r6] in fused rings", async () => {
      const pattern = "[r6]";
      for (const smiles of ["c1ccc2ccccc2c1"]) {
        const rdkitResult = getSubstructMatches(RDKit, smiles, pattern);
        testPattern(RDKit, pattern, smiles);
      }
    });
  });
});
