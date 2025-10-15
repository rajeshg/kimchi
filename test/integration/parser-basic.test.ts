import { describe, expect, it } from 'bun:test';
import { parseSMILES, generateSMILES } from 'index';
import { BondType, StereoType } from 'types';

describe('SMILES Parser', () => {
  it('parses simple molecule C', () => {
    const result = parseSMILES('C');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(1);
    const atom = result.molecules[0]!!.atoms[0]!;
    expect(atom.symbol).toBe('C');
    expect(atom.hydrogens).toBe(4); // methane
    expect(result.molecules[0]!!.bonds).toHaveLength(0);
  });

  it('parses CC (ethane)', () => {
    const result = parseSMILES('CC');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(2);
    expect(result.molecules[0]!!.bonds).toHaveLength(1);
    const bond = result.molecules[0]!!.bonds[0]!;
    expect(bond.type).toBe(BondType.SINGLE);
    expect(result.molecules[0]!!.atoms[0]!.hydrogens).toBe(3);
    expect(result.molecules[0]!!.atoms[1]!.hydrogens).toBe(3);
  });

  it('parses C=C (ethene)', () => {
    const result = parseSMILES('C=C');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(2);
    expect(result.molecules[0]!!.bonds).toHaveLength(1);
    const bond = result.molecules[0]!!.bonds[0]!;
    expect(bond.type).toBe(BondType.DOUBLE);
    expect(result.molecules[0]!!.atoms[0]!.hydrogens).toBe(2);
    expect(result.molecules[0]!!.atoms[1]!.hydrogens).toBe(2);
  });

  it('parses C#N (hydrogen cyanide)', () => {
    const result = parseSMILES('C#N');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(2);
    expect(result.molecules[0]!!.bonds).toHaveLength(1);
    const bond = result.molecules[0]!!.bonds[0]!;
    expect(bond.type).toBe(BondType.TRIPLE);
    expect(result.molecules[0]!!.atoms[0]!.symbol).toBe('C');
    expect(result.molecules[0]!!.atoms[1]!.symbol).toBe('N');
    expect(result.molecules[0]!!.atoms[0]!.hydrogens).toBe(1);
    expect(result.molecules[0]!!.atoms[1]!.hydrogens).toBe(0);
  });

  it('parses CC(C)C (isobutane)', () => {
    const result = parseSMILES('CC(C)C');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(4);
    expect(result.molecules[0]!!.bonds).toHaveLength(3);
    // All C, all single bonds, hydrogens: central C has 1 H, others 3
    expect(result.molecules[0]!!.atoms.every(a => a.symbol === 'C')).toBe(true);
    expect(result.molecules[0]!!.bonds.every(b => b.type === BondType.SINGLE)).toBe(true);
    const hydrogens = result.molecules[0]!!.atoms.map(a => a.hydrogens);
    expect(hydrogens.sort()).toEqual([1, 3, 3, 3]); // one with 1 H
  });

  it('parses disconnected structures CC.O (ethane + water)', () => {
    const result = parseSMILES('CC.O');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules).toHaveLength(2);
    const ethane = result.molecules[0]!;
    const water = result.molecules[1]!;
    expect(ethane.atoms).toHaveLength(2);
    expect(ethane.bonds).toHaveLength(1);
    expect(ethane.atoms.every(a => a.symbol === 'C')).toBe(true);
    expect(water.atoms).toHaveLength(1);
    expect(water.atoms[0]!.symbol).toBe('O');
    expect(water.atoms[0]!.hydrogens).toBe(2);
  });

  it('parses [OH-] (hydroxide)', () => {
    const result = parseSMILES('[OH-]');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(1);
    const atom = result.molecules[0]!!.atoms[0]!;
    expect(atom.symbol).toBe('O');
    expect(atom.charge).toBe(-1);
    expect(atom.hydrogens).toBe(1);
    expect(result.molecules[0]!!.bonds).toHaveLength(0);
  });

  it('parses c1ccccc1 (benzene)', () => {
    const result = parseSMILES('c1ccccc1');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(6);
    expect(result.molecules[0]!!.bonds).toHaveLength(6);
    expect(result.molecules[0]!!.atoms.every(a => a.symbol === 'C' && a.aromatic)).toBe(true);
    expect(result.molecules[0]!!.bonds.every(b => b.type === BondType.AROMATIC)).toBe(true);
    expect(result.molecules[0]!!.atoms.every(a => a.hydrogens === 1)).toBe(true);
  });

  it('parses C[C@H] (chiral carbon)', () => {
    const result = parseSMILES('C[C@H]');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!!.atoms).toHaveLength(2);
    const chiralAtom = result.molecules[0]!!.atoms.find(a => a.chiral === '@')!;
    expect(chiralAtom.symbol).toBe('C');
    expect(chiralAtom.hydrogens).toBe(1);
  });

  it('generates SMILES from parsed molecule', () => {
    const result = parseSMILES('CC');
    expect(result.errors).toHaveLength(0);
    const generated = generateSMILES(result.molecules[0]!);
    expect(generated).toBe('CC'); // simple case
  });

  it('round trip for [OH-]', () => {
    const result = parseSMILES('[OH-]');
    expect(result.errors).toHaveLength(0);
    const generated = generateSMILES(result.molecules[0]!);
    expect(generated).toBe('[OH-]');
  });

  it('parses double-bond stereo F/C=C/F (E/Z style)', () => {
    const result = parseSMILES('F/C=C/F');
    expect(result.errors).toHaveLength(0);
    const mol = result.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    expect(mol.bonds).toHaveLength(3);
    const dbl = mol.bonds.find(b => b.type === 'double');
    expect(dbl).toBeDefined();
    expect(dbl!.stereo).toBe(StereoType.UP);
    // generator preserves markers
    const gen = generateSMILES(mol);
    expect(gen).toBe('F/C=C/F');
  });

  it('parses double-bond stereo F\\C=C\\F (down markers)', () => {
    const result = parseSMILES('F\\C=C\\F');
    expect(result.errors).toHaveLength(0);
    const mol = result.molecules[0]!;
    const dbl = mol.bonds.find(b => b.type === 'double');
    expect(dbl).toBeDefined();
    expect(dbl!.stereo).toBe(StereoType.DOWN);
    const gen = generateSMILES(mol);
    expect(gen).toBe('F/C=C/F');
  });

  it('parses mixed stereo markers F/C=C\\F (opposite sides)', () => {
    const result = parseSMILES('F/C=C\\F');
    expect(result.errors).toHaveLength(0);
    const mol = result.molecules[0]!;
    expect(mol.atoms).toHaveLength(4);
    expect(mol.bonds).toHaveLength(3);
    const gen = generateSMILES(mol);
    expect(gen).toBe('F/C=C\\F');
  });

  it('parses tri-substituted alkene with stereo Cl/C=C(\\F)Br', () => {
    const result = parseSMILES('Cl/C=C(\\F)Br');
    expect(result.errors).toHaveLength(0);
    const mol = result.molecules[0]!;
    expect(mol.atoms).toHaveLength(5);
    const dbl = mol.bonds.find(b => b.type === 'double');
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    // Should preserve stereo markers
    expect(gen).toContain('=');
    expect(gen.match(/[/\\]/g)).toBeTruthy();
  });

  it('parses tetra-substituted alkene Cl/C(F)=C(\\Br)I', () => {
    const result = parseSMILES('Cl/C(F)=C(\\Br)I');
    expect(result.errors).toHaveLength(0);
    const mol = result.molecules[0]!;
    expect(mol.atoms).toHaveLength(6);
    const dbl = mol.bonds.find(b => b.type === 'double');
    expect(dbl).toBeDefined();
    const gen = generateSMILES(mol);
    expect(gen).toContain('=');
  });

  it('parses conjugated diene with multiple stereo centers', () => {
    const result = parseSMILES('F/C=C/C=C/F');
    expect(result.errors).toHaveLength(0);
    const mol = result.molecules[0]!;
    expect(mol.atoms).toHaveLength(6);
    const doubles = mol.bonds.filter(b => b.type === 'double');
    expect(doubles).toHaveLength(2);
    const gen = generateSMILES(mol);
    expect(gen).toBe('F/C=C/C=C/F');
  });

  it('preserves stereo in branched structures', () => {
    const result = parseSMILES('C(/C)=C/C');
    expect(result.errors).toHaveLength(0);
    const mol = result.molecules[0]!;
    const gen = generateSMILES(mol);
    // Should preserve the stereo information
    expect(gen).toMatch(/[/\\]/);
  });
});

// TODO: Add rdkit comparison tests once setup is done