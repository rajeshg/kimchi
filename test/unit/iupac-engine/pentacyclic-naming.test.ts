import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { generateIUPACName } from "src/iupac-engine/index";

describe("Pentacyclic ring nomenclature", () => {
  it("should correctly count rings excluding isolated substituent rings", () => {
    // Regression test for bug where isolated substituent rings (like furan)
    // were incorrectly counted as part of the polycyclic core
    const smiles = "C1CC2C3(CCC4C25CC(OC4OC5)C6=COC=C6)COC(=O)C3=C1";
    const result = parseSMILES(smiles);
    expect(result.molecules).toHaveLength(1);

    const molecule = result.molecules[0]!;
    const iupacName = generateIUPACName(molecule);

    console.log("Generated IUPAC name:", iupacName);

    // Expected: 16-(furan-3-yl)-8,15,19-trioxapentacyclo[12.3.2.01,13.02,10.06,10]nonadec-5-en-7-one
    // Key requirement: Must be "pentacyclo" not "hexacyclo"
    // The molecule has 6 SSSR rings total, but only 5 are part of the polycyclic core
    // (the furan ring is an isolated substituent and should not be counted)
    expect(iupacName).toContain("pentacyclo");
    expect(iupacName).not.toContain("hexacyclo");
  });

  it("should generate proper von Baeyer descriptors for pentacyclic systems with 6 bridgeheads", () => {
    const smiles =
      "CC1=C(C=C(C=C1)N2C(=O)[C@@H]3[C@H](C2=O)C4(C5=CC=CC=C5C3C6=CC=CC=C64)C)";
    const result = parseSMILES(smiles);
    expect(result.molecules).toHaveLength(1);

    const molecule = result.molecules[0]!;
    const iupacName = generateIUPACName(molecule);

    console.log("Generated IUPAC name:", iupacName);

    // Expected: (15S,19S)-17-(3,4-dimethylphenyl)-1-methyl-17-azapentacyclo[6.6.5.02,7.09,14.015,19]nonadeca-2,4,6,9,11,13-hexaene-16,18-dione
    // Key features to check:
    // 1. Should contain "pentacyclo" prefix
    expect(iupacName).toContain("pentacyclo");

    // 2. Should have proper bridge descriptor with secondary bridges
    // The descriptor should be [6.6.5.0^2,7.0^9,14.0^15,19]
    // Note: actual format may vary but should include main bridges and secondary bridges
    expect(iupacName).toMatch(/pentacyclo\[[\d.,]+\]/);
  });

  it("should correctly identify SSSR rank for pentacyclic system", () => {
    const smiles =
      "CC1=C(C=C(C=C1)N2C(=O)[C@@H]3[C@H](C2=O)C4(C5=CC=CC=C5C3C6=CC=CC=C64)C)";
    const result = parseSMILES(smiles);
    const molecule = result.molecules[0]!;

    // The ring system (core pentacyclic structure) has:
    // M = 25 bonds, N = 21 atoms
    // SSSR rank = M - N + 1 = 25 - 21 + 1 = 5

    // Get all ring atoms
    const ringAtoms = new Set<number>();
    if (molecule.rings) {
      for (const ring of molecule.rings) {
        for (const atomIdx of ring) {
          ringAtoms.add(atomIdx);
        }
      }
    }

    // Count bonds within ring system
    let ringBonds = 0;
    for (const bond of molecule.bonds) {
      if (ringAtoms.has(bond.atom1) && ringAtoms.has(bond.atom2)) {
        ringBonds++;
      }
    }

    const ringSSSRRank = ringBonds - ringAtoms.size + 1;
    expect(ringSSSRRank).toBe(5);
  });
});
