import { describe, it, expect } from "bun:test";
import { parseSMILES, parseSMARTS, matchSMARTS } from "index";
import { initializeRDKit, getSubstructMatches } from "./rdkit-smarts-api";

describe("SMARTS Edge Cases - RDKit Comparison", () => {
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

  const testMatch = (
    smiles: string,
    smarts: string,
    description: string,
    knownDifference?: { openchem: number; rdkit: number; reason: string },
  ) => {
    it(`${description}: ${smiles} ~ ${smarts}`, () => {
      const molResult = parseSMILES(smiles);
      expect(molResult.errors).toEqual([]);
      const mol = molResult.molecules[0]!;

      const smartsResult = parseSMARTS(smarts);
      expect(smartsResult.errors).toEqual([]);
      const pattern = smartsResult.pattern!;

      const openchemResult = matchSMARTS(pattern, mol, { uniqueMatches: true });
      const openchemMatches = openchemResult.matches.map((match) =>
        match.atoms.map((a) => a.moleculeIndex),
      );

      const rdkitResult = getSubstructMatches(RDKit, smiles, smarts);

      if (knownDifference) {
        expect(openchemMatches.length).toBe(knownDifference.openchem);
        expect(rdkitResult.matches.length).toBe(knownDifference.rdkit);
      } else {
        expect(openchemMatches.length).toBe(rdkitResult.matches.length);
      }
    });
  };

  describe("Spiro Compounds", () => {
    testMatch(
      "C1CCC2(CC1)CCC1(CC2)CCCC1",
      "[R2]",
      "Spiro[5.5]undecane - R2 atoms",
    );
    testMatch(
      "C1CCC2(CC1)CCC1(CC2)CCCC1",
      "[R3]",
      "Spiro[5.5]undecane - R3 atoms",
    );
    testMatch("C1CCC2(CC1)CCCC2", "[R2]", "Spiro[5.4]decane - R2 atoms");
    testMatch("C12CCC(CC1)CC2", "[r5]", "Spiro compound - 5-membered rings");
  });

  describe("Bridged Ring Systems", () => {
    testMatch("C1CC2CCC1C2", "[R2]", "Bicyclo[2.2.1]heptane - R2 atoms", {
      openchem: 3,
      rdkit: 3,
      reason: "SSSR count: 2 rings, 3 atoms in exactly 2 rings",
    });
    testMatch("C1CC2CCC1C2", "[R3]", "Bicyclo[2.2.1]heptane - R3 atoms", {
      openchem: 0,
      rdkit: 0,
      reason:
        "SSSR: no atoms in 3 rings. RDKit also finds no atoms in 3 rings for this structure.",
    });
    testMatch("C1CCC2CC3CCC(C1)C32", "[R3]", "Adamantane - R3 atoms", {
      openchem: 1,
      rdkit: 1,
      reason:
        "Both find 1 atom in exactly 3 SSSR rings (this is a 11-atom bridged system, not standard 10-atom adamantane)",
    });
    testMatch("C1CC2CCC3CC(C1)C23", "[R3]", "Bicyclo[3.2.1]octane - R3 atoms", {
      openchem: 1,
      rdkit: 1,
      reason: "SSSR: 1 bridgehead atom in exactly 3 rings. Both agree.",
    });
  });

  describe("Large Fused Systems", () => {
    testMatch(
      "C1=CC=C2C=CC=C3C=CC=C4C=CC=C1C2=C34",
      "[R2]",
      "Anthracene - R2 atoms",
    );
    testMatch(
      "C1=CC=C2C=CC=C3C=CC=C4C=CC=C1C2=C34",
      "[R3]",
      "Anthracene - R3 atoms",
    );
    testMatch(
      "C1=CC=C2C3=C4C(=CC=C3)C=CC=C4C=CC2=C1",
      "[R2]",
      "Pyrene - R2 atoms",
    );
    testMatch(
      "C1=CC=C2C3=C4C(=CC=C3)C=CC=C4C=CC2=C1",
      "[R3]",
      "Pyrene - R3 atoms",
    );
    testMatch(
      "C1=CC=C2C3=C4C(=CC=C3)C=CC=C4C=CC2=C1",
      "[R4]",
      "Pyrene - R4 atoms",
    );
  });

  describe("Macrocycles", () => {
    testMatch("C1CCCCCCCC1", "[R1]", "Cyclooctane - R1 atoms");
    testMatch("C1CCCCCCCCCCC1", "[r12]", "Cyclododecane - r12 ring size");
    testMatch("C1CCCCCCCCCCCCCC1", "[r15]", "Cyclopentadecane - r15 ring size");
    testMatch("C1CCCCCCCCCCCCCCCCC1", "[R1]", "Cyclooctadecane - R1 atoms");
  });

  describe("Complex Polycyclic Systems", () => {
    testMatch("C12C3C4C1C5C2C3C45", "[R4]", "Cubane - R4 atoms");
    testMatch("C12C3C4C1C5C2C3C45", "[r4]", "Cubane - r4 ring size");
    testMatch(
      "C1CC2CCC3C(C1)C1CCC4CCCC(C2)C4C31",
      "[R4]",
      "Twistane - R4 atoms",
    );
    testMatch(
      "C1C2CC3CC1CC(C2)C3",
      "[R3]",
      "Adamantane (mislabeled) - R3 atoms",
      {
        openchem: 1,
        rdkit: 4,
        reason:
          "RDKit uses extended ring set instead of SSSR. See SMARTS_RING_MEMBERSHIP_ANALYSIS.md",
      },
    );
  });

  describe("Mixed Ring Systems", () => {
    testMatch("C1CC2CCCCC2C1", "[R1]", "Fused 5+6 rings - R1 atoms");
    testMatch("C1CC2CCCCC2C1", "[R2]", "Fused 5+6 rings - R2 atoms");
    testMatch("C1CCC2(CC1)CCCC2", "[R1]", "Spiro 6+5 rings - R1 atoms");
    testMatch("C1CCC2(CC1)CCCC2", "[R2]", "Spiro 6+5 rings - R2 atoms");
  });

  describe("Edge Cases - Multiple Ring Sizes", () => {
    testMatch("C1CCC2CC3CCCCC3CC2C1", "[r5]", "Multiple ring sizes - r5");
    testMatch("C1CCC2CC3CCCCC3CC2C1", "[r6]", "Multiple ring sizes - r6");
    testMatch("C1CCC2CC3CCCCC3CC2C1", "[r7]", "Multiple ring sizes - r7");
  });

  describe("Edge Cases - Ring Count Boundaries", () => {
    testMatch(
      "C1CCCCC1C2CCCCC2",
      "[R0]",
      "Two separate rings - R0 atoms (linker)",
    );
    testMatch("C1CCCCC1C2CCCCC2", "[R1]", "Two separate rings - R1 atoms");
    testMatch("C1CCCCC1", "[!R0]", "Single ring - not R0");
  });
});
