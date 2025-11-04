import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import {
  computeMorganFingerprint,
  getBitsSet,
} from "src/utils/morgan-fingerprint";

describe("computeMorganFingerprint", () => {
  // Bulk test set for cross-validation with RDKit-JS
  const bulkSmiles = [
    "C", // methane
    "CC", // ethane
    "CCO", // ethanol
    "c1ccccc1", // benzene
    "CC(=O)O", // acetic acid
    "CCN(CC)CC", // triethylamine
    "O=C(C)Oc1ccccc1C(=O)O", // aspirin
    "C1CCCCC1", // cyclohexane
    "C1=CC=CC=C1", // benzene kekule
    "C1=CC=CN=C1", // pyridine
    "C1=CC=CC=N1", // pyridine alt
    "C1=CC2=CC=CC=C2C=C1", // naphthalene
    "CC(C)C(=O)O", // isobutyric acid
    "CC(C)CC(=O)O", // isovaleric acid
    "CC(C)C", // isobutane
    "CC(C)CO", // isobutanol
    "CC(C)C(=O)N", // isobutyramide
    "C1CC1", // cyclopropane
    "C1CCC1", // cyclobutane
    "C1CCCC1", // cyclopentane
    "C1CCCCC1", // cyclohexane
    "C1=CC=CC=C1", // benzene
    "C1=CC=CN=C1", // pyridine
    "C1=CC=CC=N1", // pyridine alt
    "C1=CC2=CC=CC=C2C=C1", // naphthalene
    "CC(C)C(=O)O", // isobutyric acid
    "CC(C)CC(=O)O", // isovaleric acid
    "CC(C)C", // isobutane
    "CC(C)CO", // isobutanol
    "CC(C)C(=O)N", // isobutyramide
    "C1CC1", // cyclopropane
    "C1CCC1", // cyclobutane
    "C1CCCC1", // cyclopentane
    "C1CC1C", // methylcyclopropane
    "C1CC1CC", // ethylcyclopropane
    "C1CC1CCC", // propylcyclopropane
    "C1CC1CCCC", // butylcyclopropane
    "C1CC1CCCCC", // pentylcyclopropane
    "C1CC1CCCCCC", // hexylcyclopropane
    "C1CC1CCCCCCC", // heptylcyclopropane
    "C1CC1CCCCCCCC", // octylcyclopropane
    "C1CC1CCCCCCCCC", // nonylcyclopropane
    "C1CC1CCCCCCCCCC", // decylcyclopropane
    "C1CC1CCCCCCCCCCC", // undecylcyclopropane
    "C1CC1CCCCCCCCCCCC", // dodecylcyclopropane
    "C1CC1CCCCCCCCCCCCC", // tridecylcyclopropane
    "C1CC1CCCCCCCCCCCCCC", // tetradecylcyclopropane
    "C1CC1CCCCCCCCCCCCCCC", // pentadecylcyclopropane
    "C1CC1CCCCCCCCCCCCCCCC", // hexadecylcyclopropane
    "C1CC1CCCCCCCCCCCCCCCCC", // heptadecylcyclopropane
    "C1CC1CCCCCCCCCCCCCCCCCC", // octadecylcyclopropane
    "C1CC1CCCCCCCCCCCCCCCCCCC", // nonadecylcyclopropane
    "C1CC1CCCCCCCCCCCCCCCCCCCC", // eicosylcyclopropane
    // Stereochemistry
    "F/C=C/F", // trans-difluoroethene
    // eslint-disable-next-line no-useless-escape -- backslash is SMILES cis stereochemistry notation
    "F/C=C\F", // cis-difluoroethene
    "N[C@H](C)C(=O)O", // L-alanine
    "N[C@@H](C)C(=O)O", // D-alanine
    // Aromatic with heteroatoms
    "c1ccncc1", // pyridine
    "c1ccncc1O", // 2-hydroxypyridine
    "c1ccncc1N", // 2-aminopyridine
    "c1ccncc1Cl", // 2-chloropyridine
    // Disconnected
    "[Na+].[Cl-]", // sodium chloride
    "C1CC1.C1CC1", // two cyclopropanes
    // Isotopes
    "[13CH4]", // methane-13C
    "[2H]O", // deuterated water
    // Charges
    "[NH4+]", // ammonium
    "[O-]C=O", // formate
    "[O-][N+](=O)O", // nitrate
    // Large/branched
    "CCCCCCCCCCCCCCCCCCCC", // eicosane
    "CC(C)C(C)C(C)C(C)C(C)C", // highly branched
  ];

  function fpToHex(fp: Uint8Array): string {
    // Convert bit array to hex string
    let hex = "";
    for (let i = 0; i < fp.length; i += 4) {
      let nibble =
        ((fp[i] ?? 0) << 3) |
        ((fp[i + 1] ?? 0) << 2) |
        ((fp[i + 2] ?? 0) << 1) |
        (fp[i + 3] ?? 0);
      hex += nibble.toString(16);
    }
    return hex;
  }

  it("outputs fingerprints for bulk set (for RDKit-JS comparison)", () => {
    for (const smi of bulkSmiles) {
      const result = parseSMILES(smi);
      if (result.errors.length > 0) {
        if (process.env.VERBOSE) {
          console.log(`# ERROR: ${smi} => ${result.errors.join("; ")}`);
        }
        continue;
      }
      const mol = result.molecules[0]!;
      const fp = computeMorganFingerprint(mol, 2, 2048);
      const hex = fpToHex(fp);
      if (process.env.VERBOSE) {
        console.log(`${smi}\t${hex}`);
      }
    }
  });

  it("generates a fingerprint for methane", () => {
    const result = parseSMILES("C");
    expect(result.errors).toEqual([]);
    const fp = computeMorganFingerprint(result.molecules[0]!);
    expect(fp.length).toBe(256);
    expect(getBitsSet(fp)).toBeGreaterThan(0);
  });

  it("generates a fingerprint for ethanol", () => {
    const result = parseSMILES("CCO");
    expect(result.errors).toEqual([]);
    const fp = computeMorganFingerprint(result.molecules[0]!);
    expect(fp.length).toBe(256);
    expect(getBitsSet(fp)).toBeGreaterThan(0);
  });

  it("generates a fingerprint for benzene", () => {
    const result = parseSMILES("c1ccccc1");
    expect(result.errors).toEqual([]);
    const fp = computeMorganFingerprint(result.molecules[0]!);
    expect(fp.length).toBe(256);
    expect(getBitsSet(fp)).toBeGreaterThan(0);
  });

  it("fingerprints are stable for the same molecule", () => {
    const result1 = parseSMILES("CCO");
    const result2 = parseSMILES("CCO");
    const fp1 = computeMorganFingerprint(result1.molecules[0]!);
    const fp2 = computeMorganFingerprint(result2.molecules[0]!);
    expect(fp1).toEqual(fp2);
  });

  it("different molecules have different fingerprints", () => {
    const result1 = parseSMILES("CCO");
    const result2 = parseSMILES("CCC");
    const fp1 = computeMorganFingerprint(result1.molecules[0]!);
    const fp2 = computeMorganFingerprint(result2.molecules[0]!);
    expect(fp1).not.toEqual(fp2);
  });
});
