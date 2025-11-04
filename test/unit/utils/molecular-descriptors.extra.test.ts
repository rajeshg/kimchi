import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import {
  computeDescriptors,
  getAtomCount,
  getBondCount,
  getFormalCharge,
  getElementCounts,
  getHeavyAtomFraction,
} from "src/utils/molecular-descriptors";

describe("molecular-descriptors (extra cases)", () => {
  it("handles empty molecule in computeDescriptors", () => {
    const empty: any = { atoms: [], bonds: [] };
    const desc = computeDescriptors(empty);

    expect(desc.atomCount).toBe(0);
    expect(desc.bondCount).toBe(0);
    expect(desc.formalCharge).toBe(0);
    expect(desc.elementCounts).toEqual({});
    expect(desc.heavyAtomFraction).toBe(0);
  });

  it("handles multi-fragment SMILES by returning separate molecules", () => {
    const result = parseSMILES("C.CC");
    expect(result.errors).toEqual([]);
    expect(result.molecules.length).toBe(2);

    const m1 = result.molecules[0]!;
    const m2 = result.molecules[1]!;
    expect(getAtomCount(m1)).toBe(1);
    expect(getAtomCount(m2)).toBe(2);
    expect(getBondCount(m1)).toBe(0);
    expect(getBondCount(m2)).toBe(1);
  });

  it("preserves explicit hydrogen atoms", () => {
    const result = parseSMILES("[H]");
    expect(result.errors).toEqual([]);
    const mol = result.molecules[0]!;
    expect(getAtomCount(mol)).toBe(1);
    expect(getElementCounts(mol)).toEqual({ H: 1 });
    expect(getHeavyAtomFraction(mol)).toBe(0);
  });

  it("includes isotopic labels when option enabled in computeDescriptors", () => {
    const result = parseSMILES("[13CH4]");
    expect(result.errors).toEqual([]);
    const mol = result.molecules[0]!;
    const desc = computeDescriptors(mol, { includeIsotopes: true });
    expect(desc.elementCounts).toEqual({ "13C": 1, H: 4 });
  });

  it("computeDescriptors respects includeImplicitH for element counts", () => {
    const result = parseSMILES("CCO");
    expect(result.errors).toEqual([]);
    const mol = result.molecules[0]!;
    const desc = computeDescriptors(mol, { includeImplicitH: false });
    expect(desc.elementCounts).toEqual({ C: 2, O: 1 });
  });
});
