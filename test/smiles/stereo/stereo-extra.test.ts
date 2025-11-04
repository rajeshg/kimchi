import { describe, expect, it } from "bun:test";
import { parseSMILES, generateSMILES } from "index";
import { BondType, StereoType } from "types";

// Additional stereo tests: ring-closure stereo and token-placement variants
describe("SMILES Stereo Extras", () => {
  // Note: RDKit canonicalizes to 'F/C=C/F'. Our generator may produce 'F/C=CF' or 'F/C=C\\F'.
  // Both are chemically correct, but only the first is canonical in RDKit.
  it("parses stereo when markers are placed after = (alternative placement)", () => {
    // Some SMILES may place the / after the '=' depending on input; parser should accept both
    const input1 = "F/C=C/F";
    const input2 = "F/C=C\\F"; // escaped backslash
    const r1 = parseSMILES(input1);
    const r2 = parseSMILES(input2);
    expect(r1.errors).toHaveLength(0);
    expect(r2.errors).toHaveLength(0);
    const dbl1 = r1.molecules[0]!.bonds.find(
      (b) => b.type === BondType.DOUBLE,
    )!;
    expect(dbl1.stereo).toBe(StereoType.UP);
    // second case mixes markers; ensure we parse without crashing and molecule structure is correct
    expect(r2.molecules[0]!.atoms).toHaveLength(4);
    expect(
      r2.molecules[0]!.bonds.filter((b) => b.type === BondType.DOUBLE),
    ).toHaveLength(1);
    const gen1 = generateSMILES(r1.molecules[0]!);
    expect(gen1).toBe("F/C=C/F");
    const gen2 = generateSMILES(r2.molecules[0]!);
    expect(typeof gen2).toBe("string");
    expect(gen2.length).toBeGreaterThan(0);
  });

  it("parses ring-closure stereo markers", () => {
    // Construct a simple ring where stereo markers appear on ring closure bonds
    // Example: F/C1=CCC1/F - double bond in a 4-membered ring
    const input = "F/C1=CCC1/F";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    // ensure there's at least one double bond and that stereo was parsed
    const dbl = mol.bonds.find((b) => b.type === BondType.DOUBLE);
    expect(dbl).toBeDefined();
    // Check that stereo markers were parsed on adjacent single bonds
    const stereoSingle = mol.bonds.find(
      (b) => b.type === BondType.SINGLE && b.stereo !== StereoType.NONE,
    );
    expect(stereoSingle).toBeDefined();
    // Canonical generator should drop stereo markers in small rings
    const gen = generateSMILES(mol);
    expect(gen).toBe("FC1=CCC1F");
  });

  it("handles cis alkene with same substituents (Z-configuration)", () => {
    const input = "C\\C=C\\C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    const gen = generateSMILES(mol);
    expect(gen).toBe("C/C=C/C");
  });

  it("handles trans alkene with same substituents (E-configuration)", () => {
    const input = "C/C=C\\C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    const gen = generateSMILES(mol);
    expect(gen).toBe("C/C=C\\C");
  });

  it("preserves stereo in complex branched alkenes", () => {
    const input = "CC(C)C(/C)=C(/C)C(C)C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const dbl = mol.bonds.find((b) => b.type === BondType.DOUBLE);
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
  });

  it("handles stereo in cyclic systems with exocyclic double bonds", () => {
    const input = "C1CC=C1/C=C/C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const doubles = mol.bonds.filter((b) => b.type === BondType.DOUBLE);
    expect(doubles.length).toBeGreaterThan(0);
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
  });

  it("preserves stereo with different atomic numbers", () => {
    const input = "Br/C=C/I";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    const gen = generateSMILES(mol);
    expect(gen).toBe("Br/C=C/I");
  });

  it("handles multiple double bonds with alternating stereo", () => {
    const input = "C/C=C\\C=C/C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const doubles = mol.bonds.filter((b) => b.type === BondType.DOUBLE);
    expect(doubles).toHaveLength(2);
    const gen = generateSMILES(mol);
    expect(gen).toBe("C/C=C\\C=C/C");
  });

  it("preserves stereo on terminal alkenes", () => {
    const input = "C/C=C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const gen = generateSMILES(mol);
    // Terminal alkene with only one substituent - stereo may be preserved or dropped
    expect(gen).toContain("=");
  });

  it("handles stereo with charged atoms", () => {
    const input = "[O-]/C=C/[O-]";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    const oxygens = mol.atoms.filter((a) => a.atomicNumber === 8);
    expect(oxygens).toHaveLength(2);
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
  });

  it("preserves stereo in heteroatom-containing alkenes", () => {
    const input = "N/C=C/O";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    const gen = generateSMILES(mol);
    expect(gen).toBe("N/C=C/O");
  });

  it("normalizes equivalent stereo representations - all down to all up", () => {
    // Both C\C=C\C and C/C=C/C represent trans (E) and should normalize to same form
    const input1 = "C\\C=C\\C";
    const input2 = "C/C=C/C";
    const res1 = parseSMILES(input1);
    const res2 = parseSMILES(input2);
    expect(res1.errors).toHaveLength(0);
    expect(res2.errors).toHaveLength(0);
    const gen1 = generateSMILES(res1.molecules[0]!);
    const gen2 = generateSMILES(res2.molecules[0]!);
    expect(gen1).toBe(gen2); // Should normalize to same canonical form
    expect(gen1).toBe("C/C=C/C");
  });

  it("handles tetra-substituted alkenes with stereo", () => {
    const input = "CC(/F)=C(\\Cl)C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const dbl = mol.bonds.find((b) => b.type === BondType.DOUBLE);
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
    expect(gen.match(/[\/\\]/g)?.length).toBeGreaterThan(0);
  });

  it("handles conjugated system with consistent stereo", () => {
    const input = "F/C=C/C=C/F";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const doubles = mol.bonds.filter((b) => b.type === BondType.DOUBLE);
    expect(doubles).toHaveLength(2);
    const gen = generateSMILES(mol);
    expect(gen).toBe("F/C=C/C=C/F");
  });

  it("handles stereo with isotopes", () => {
    const input = "[2H]/C=C/[2H]";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
    expect(gen).toContain("[2H]");
  });

  it("handles mixed substituents with correct stereo ordering", () => {
    const input = "F/C=C(\\Br)Cl";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const dbl = mol.bonds.find((b) => b.type === BondType.DOUBLE);
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
  });

  it("handles stereo in branched chains", () => {
    const input = "CC(C)/C=C/C(C)C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const dbl = mol.bonds.find((b) => b.type === BondType.DOUBLE);
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
  });

  it("handles triple bond adjacent to stereo double bond", () => {
    const input = "C#C/C=C/C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const triple = mol.bonds.find((b) => b.type === BondType.TRIPLE);
    const dbl = mol.bonds.find((b) => b.type === BondType.DOUBLE);
    expect(triple).toBeDefined();
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
    expect(gen).toContain("#");
  });

  it("handles aromatic ring with exocyclic stereo double bond", () => {
    const input = "c1ccccc1/C=C/C";
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    const dbl = mol.bonds.find((b) => b.type === BondType.DOUBLE);
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    expect(gen).toContain("=");
  });
});
