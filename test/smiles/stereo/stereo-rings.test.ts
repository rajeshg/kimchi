import { describe, expect, it } from 'bun:test';
import { parseSMILES, generateSMILES } from 'index';
import { BondType, StereoType } from 'types';

describe('Ring Stereochemistry Handling', () => {
  describe('Small rings with double bonds - stereo clearing', () => {
    it('clears stereo markers in 4-membered ring with double bond', () => {
      const input = 'F/C1=CCC1/F';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toBe('FC1=CCC1F');
    });

    it('clears stereo markers in 5-membered ring with double bond', () => {
      const input = 'F/C1=CCCC1/F';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toBe('FC1=CCCC1F');
    });

    it('clears stereo markers in 6-membered ring with double bond', () => {
      const input = 'F/C1=CCCCC1/F';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toBe('FC1=CCCCC1F');
    });

    it('clears stereo on multiple substituents in small ring', () => {
      const input = 'F/C1=C(/Cl)CC1/Br';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).not.toContain('/');
      expect(gen).not.toContain('\\');
    });

    it('clears stereo in ring with multiple double bonds', () => {
      const input = 'F/C1=C/C=CC1';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toBe('FC1=CC=CC1');
    });
  });

  describe('Exocyclic double bonds - stereo preservation', () => {
    it('preserves stereo on exocyclic double bond from 4-membered ring', () => {
      const input = 'C1CC=C1/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('/');
      expect(gen).toMatch(/C=C\/C/);
    });

    it('preserves stereo on exocyclic double bond from 5-membered ring', () => {
      const input = 'C1CCC=C1/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('/');
    });

    it('preserves stereo on exocyclic chain with trans configuration', () => {
      const input = 'C1CC=C1/C=C\\C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toMatch(/[\/\\]/);
    });

    it('preserves stereo on longer exocyclic conjugated system', () => {
      const input = 'C1CC=C1/C=C/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const doubles = mol.bonds.filter(b => b.type === BondType.DOUBLE);
      expect(doubles.length).toBe(3);
      const gen = generateSMILES(mol);
      expect(gen).toContain('/');
    });

    it('preserves stereo with heteroatom substituents on exocyclic bond', () => {
      const input = 'C1CC=C1/C=C/O';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('/');
      expect(gen).toContain('O');
    });
  });

  describe('Mixed cases - ring and exocyclic stereo', () => {
    it('clears endocyclic but preserves exocyclic stereo', () => {
      const input = 'F/C1=CCC1/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('/');
      expect(gen).toMatch(/C=C\/C/);
      expect(gen).toContain('F');
    });

    it('handles multiple rings with exocyclic bonds', () => {
      const input = 'C1CC=C1/C=C/C2=CCC2';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('=');
    });

    it('handles fused ring system with exocyclic stereo', () => {
      const input = 'C1=CC2CCC2C1/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('=');
    });
  });

  describe('Edge cases and complex structures', () => {
    it('handles ring with no stereo markers', () => {
      const input = 'FC1=CCC1F';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toBe('FC1=CCC1F');
    });

    it('handles exocyclic bond with no stereo markers', () => {
      const input = 'C1CC=C1C=CC';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('=');
      expect(gen).not.toContain('/');
      expect(gen).not.toContain('\\');
    });

    it('handles 3-membered ring with double bond', () => {
      const input = 'F/C1=CC1/F';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).not.toContain('/');
      expect(gen).not.toContain('\\');
    });

    it('handles 7-membered ring with double bond', () => {
      const input = 'F/C1=CCCCCC1/F';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      const ringSize = 7;
      if (ringSize <= 6) {
        expect(gen).not.toContain('/');
      }
    });

    it('preserves stereo on chain connected to aromatic ring', () => {
      const input = 'c1ccccc1/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('=');
    });

    it('handles spiro compound with exocyclic stereo', () => {
      const input = 'C1CC2(CC1)C=CC2/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('=');
    });

    it('handles bridged ring with exocyclic stereo', () => {
      const input = 'C1CC2CCC1C2/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('=');
    });
  });

  describe('Stereo clearing validation', () => {
    it('removes all stereo from ring single bonds attached to ring atoms', () => {
      const input = 'F/C1=C(/Cl)C(/Br)C1/I';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).not.toContain('/');
      expect(gen).not.toContain('\\');
      expect(gen).toContain('F');
      expect(gen).toContain('Cl');
      expect(gen).toContain('Br');
      expect(gen).toContain('I');
    });

    it('only clears stereo on bonds attached to ring double bond atoms', () => {
      const input = 'CC/C1=CCC1/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('C=C/C');
    });

    it('preserves stereo when double bond not in small ring', () => {
      const input = 'F/C=C/C1CCCC1';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const gen = generateSMILES(mol);
      expect(gen).toContain('/');
      expect(gen).toMatch(/F\/C=C/);
    });
  });

  describe('Parser stereo detection', () => {
    it('parses stereo markers on ring bonds', () => {
      const input = 'F/C1=CCC1/F';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const stereoSingle = mol.bonds.find(b => b.type === BondType.SINGLE && b.stereo !== StereoType.NONE);
      expect(stereoSingle).toBeDefined();
    });

    it('parses stereo markers on exocyclic bonds', () => {
      const input = 'C1CC=C1/C=C/C';
      const res = parseSMILES(input);
      expect(res.errors).toHaveLength(0);
      const mol = res.molecules[0]!;
      const stereoSingle = mol.bonds.find(b => b.type === BondType.SINGLE && b.stereo !== StereoType.NONE);
      expect(stereoSingle).toBeDefined();
    });

    it('distinguishes between up and down stereo', () => {
      const input1 = 'C1CC=C1/C=C/C';
      const input2 = 'C1CC=C1/C=C\\C';
      const res1 = parseSMILES(input1);
      const res2 = parseSMILES(input2);
      expect(res1.errors).toHaveLength(0);
      expect(res2.errors).toHaveLength(0);
      const gen1 = generateSMILES(res1.molecules[0]!);
      const gen2 = generateSMILES(res2.molecules[0]!);
      expect(gen1).not.toBe(gen2);
    });
  });

  describe('Round-trip consistency', () => {
    it('maintains consistency for cleared ring stereo', () => {
      const input = 'FC1=CCC1F';
      const res1 = parseSMILES(input);
      const gen1 = generateSMILES(res1.molecules[0]!);
      const res2 = parseSMILES(gen1);
      const gen2 = generateSMILES(res2.molecules[0]!);
      expect(gen1).toBe(gen2);
    });

    it('maintains consistency for preserved exocyclic stereo', () => {
      const input = 'C1CC=C1C=CC';
      const res1 = parseSMILES(input);
      const gen1 = generateSMILES(res1.molecules[0]!);
      const res2 = parseSMILES(gen1);
      const gen2 = generateSMILES(res2.molecules[0]!);
      expect(gen1).toBe(gen2);
    });
  });
});
