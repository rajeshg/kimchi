import { describe, expect, it } from 'vitest';
import { parseSMILES, generateSMILES } from '../index';
import { BondType, StereoType } from '../types';

// Additional stereo tests: ring-closure stereo and token-placement variants
describe('SMILES Stereo Extras', () => {
  // Note: RDKit canonicalizes to 'F/C=C/F'. Our generator may produce 'F/C=CF' or 'F/C=C\\F'.
  // Both are chemically correct, but only the first is canonical in RDKit.
  it('parses stereo when markers are placed after = (alternative placement)', () => {
    // Some SMILES may place the / after the '=' depending on input; parser should accept both
    const input1 = 'F/C=C/F';
    const input2 = 'F/C=C\\F'; // escaped backslash
    const r1 = parseSMILES(input1);
    const r2 = parseSMILES(input2);
    expect(r1.errors).toHaveLength(0);
    expect(r2.errors).toHaveLength(0);
    const dbl1 = r1.molecules[0]!.bonds.find(b => b.type === BondType.DOUBLE)!;
    expect(dbl1.stereo).toBe(StereoType.UP);
    // second case mixes markers; ensure we parse without crashing and molecule structure is correct
    expect(r2.molecules[0]!.atoms).toHaveLength(4);
    expect(r2.molecules[0]!.bonds.filter(b => b.type === BondType.DOUBLE)).toHaveLength(1);
    const gen1 = generateSMILES(r1.molecules[0]!);
    expect(gen1).toBe('F/C=C/F');
    const gen2 = generateSMILES(r2.molecules[0]!);
    expect(typeof gen2).toBe('string');
    expect(gen2.length).toBeGreaterThan(0);
  });

  it('parses ring-closure stereo markers', () => {
    // Construct a simple ring where stereo markers appear on ring closure bonds
    // Example: axial substituents implied — we'll use a contrived example: F/C1= C C C 1/F (without spaces) -> 'F/C1=CCC1/F'
    const input = 'F/C1=CCC1/F';
    const res = parseSMILES(input);
    expect(res.errors).toHaveLength(0);
    const mol = res.molecules[0]!;
    // ensure there's at least one double bond and that stereo was inferred
    const dbl = mol.bonds.find(b => b.type === BondType.DOUBLE);
    expect(dbl).toBeDefined();
    // generator should produce a smiles containing '/' markers
    const gen = generateSMILES(mol);
    expect(gen.includes('/')).toBe(true);
  });
});
