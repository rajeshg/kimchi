import { describe, expect, it } from 'bun:test';
import { parseSMILES } from 'parser';
import { generateSMILES } from 'src/generators/smiles-generator';

describe('Extended Stereochemistry', () => {
  describe('Square Planar (@SP1, @SP2, @SP3)', () => {
    it('should parse @SP1 (U shape)', () => {
      const result = parseSMILES('[Pt@SP1](Cl)(NH3)(NH2)Br');
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);
      const ptAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Pt');
      expect(ptAtom?.chiral).toBe('@SP1');
    });

    it('should parse @SP2 (4 shape)', () => {
      const result = parseSMILES('[Pt@SP2](Cl)(NH3)(NH2)Br');
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);
      const ptAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Pt');
      expect(ptAtom?.chiral).toBe('@SP2');
    });

    it('should parse @SP3 (Z shape)', () => {
      const result = parseSMILES('[Pt@SP3](Cl)(NH3)(NH2)Br');
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);
      const ptAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Pt');
      expect(ptAtom?.chiral).toBe('@SP3');
    });

    it('should generate @SP1 correctly', () => {
      const parsed = parseSMILES('[Pt@SP1](Cl)(N)(C)Br');
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      expect(generated).toContain('@SP1');
    });

    it('should round-trip @SP2', () => {
      const input = '[Pt@SP2](Cl)(N)(C)Br';
      const parsed = parseSMILES(input);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const ptAtom = reparsed.molecules[0]!.atoms.find(a => a.symbol === 'Pt');
      expect(ptAtom?.chiral).toBe('@SP2');
    });

    it('should round-trip @SP3', () => {
      const input = '[Pt@SP3](Cl)(N)(C)Br';
      const parsed = parseSMILES(input);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const ptAtom = reparsed.molecules[0]!.atoms.find(a => a.symbol === 'Pt');
      expect(ptAtom?.chiral).toBe('@SP3');
    });
  });

  describe('Trigonal Bipyramidal (@TB1 through @TB20)', () => {
    it('should parse @TB1 (from a to e, anti-clockwise)', () => {
      const result = parseSMILES('S[As@TB1](F)(Cl)(Br)N');
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);
      const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB1');
    });

    it('should parse @TB2 (from a to e, clockwise)', () => {
      const result = parseSMILES('S[As@TB2](Br)(Cl)(F)N');
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);
      const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB2');
    });

    it('should parse @TB5', () => {
      const result = parseSMILES('S[As@TB5](F)(N)(Cl)Br');
      expect(result.errors).toEqual([]);
      const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB5');
    });

    it('should parse @TB10', () => {
      const result = parseSMILES('F[As@TB10](S)(Cl)(N)Br');
      expect(result.errors).toEqual([]);
      const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB10');
    });

    it('should parse @TB15', () => {
      const result = parseSMILES('F[As@TB15](Cl)(S)(Br)N');
      expect(result.errors).toEqual([]);
      const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB15');
    });

    it('should parse @TB20', () => {
      const result = parseSMILES('Br[As@TB20](Cl)(S)(F)N');
      expect(result.errors).toEqual([]);
      const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB20');
    });

    it('should parse all TB numbers from 1-20', () => {
      for (let i = 1; i <= 20; i++) {
        const result = parseSMILES(`S[As@TB${i}](F)(Cl)(Br)N`);
        expect(result.errors).toEqual([]);
        const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
        expect(asAtom?.chiral).toBe(`@TB${i}`);
      }
    });

    it('should reject invalid TB numbers (@TB21, @TB0)', () => {
      const result1 = parseSMILES('S[As@TB21](F)(Cl)(Br)N');
      const asAtom1 = result1.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom1?.chiral).toBe('@');

      const result2 = parseSMILES('S[As@TB0](F)(Cl)(Br)N');
      const asAtom2 = result2.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom2?.chiral).toBe('@');
    });

    it('should round-trip @TB1', () => {
      const input = 'S[As@TB1](F)(Cl)(Br)N';
      const parsed = parseSMILES(input);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const asAtom = reparsed.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB1');
    });

    it('should round-trip @TB15', () => {
      const input = 'F[As@TB15](Cl)(S)(Br)N';
      const parsed = parseSMILES(input);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const asAtom = reparsed.molecules[0]!.atoms.find(a => a.symbol === 'As');
      expect(asAtom?.chiral).toBe('@TB15');
    });
  });

  describe('Octahedral (@OH1 through @OH30)', () => {
    it('should parse @OH1 (U shape, from a to f, anti-clockwise)', () => {
      const result = parseSMILES('C[Co@OH1](F)(Cl)(Br)(I)S');
      expect(result.errors).toEqual([]);
      expect(result.molecules).toHaveLength(1);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH1');
    });

    it('should parse @OH2 (U shape, from a to f, clockwise)', () => {
      const result = parseSMILES('F[Co@OH2](S)(I)(C)(Cl)Br');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH2');
    });

    it('should parse @OH5 (Z shape)', () => {
      const result = parseSMILES('S[Co@OH5](F)(I)(Cl)(C)Br');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH5');
    });

    it('should parse @OH9 (4 shape)', () => {
      const result = parseSMILES('Br[Co@OH9](C)(S)(Cl)(F)I');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH9');
    });

    it('should parse @OH12', () => {
      const result = parseSMILES('Br[Co@OH12](Cl)(I)(F)(S)C');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH12');
    });

    it('should parse @OH15', () => {
      const result = parseSMILES('Cl[Co@OH15](C)(Br)(F)(I)S');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH15');
    });

    it('should parse @OH19', () => {
      const result = parseSMILES('Cl[Co@OH19](C)(I)(F)(S)Br');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH19');
    });

    it('should parse @OH27', () => {
      const result = parseSMILES('I[Co@OH27](Cl)(Br)(F)(S)C');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH27');
    });

    it('should parse @OH30', () => {
      const result = parseSMILES('C[Co@OH30](F)(Cl)(Br)(I)S');
      expect(result.errors).toEqual([]);
      const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH30');
    });

    it('should parse all OH numbers from 1-30', () => {
      for (let i = 1; i <= 30; i++) {
        const result = parseSMILES(`C[Co@OH${i}](F)(Cl)(Br)(I)S`);
        expect(result.errors).toEqual([]);
        const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
        expect(coAtom?.chiral).toBe(`@OH${i}`);
      }
    });

    it('should reject invalid OH numbers (@OH31, @OH0)', () => {
      const result1 = parseSMILES('C[Co@OH31](F)(Cl)(Br)(I)S');
      const coAtom1 = result1.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom1?.chiral).toBe('@');

      const result2 = parseSMILES('C[Co@OH0](F)(Cl)(Br)(I)S');
      const coAtom2 = result2.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom2?.chiral).toBe('@');
    });

    it('should round-trip @OH1', () => {
      const input = 'C[Co@OH1](F)(Cl)(Br)(I)S';
      const parsed = parseSMILES(input);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const coAtom = reparsed.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH1');
    });

    it('should round-trip @OH15', () => {
      const input = 'Cl[Co@OH15](C)(Br)(F)(I)S';
      const parsed = parseSMILES(input);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const coAtom = reparsed.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH15');
    });

    it('should round-trip @OH30', () => {
      const input = 'C[Co@OH30](F)(Cl)(Br)(I)S';
      const parsed = parseSMILES(input);
      expect(parsed.errors).toEqual([]);
      const generated = generateSMILES(parsed.molecules[0]!);
      const reparsed = parseSMILES(generated);
      expect(reparsed.errors).toEqual([]);
      const coAtom = reparsed.molecules[0]!.atoms.find(a => a.symbol === 'Co');
      expect(coAtom?.chiral).toBe('@OH30');
    });
  });

  describe('Equivalent SMILES (from OpenSMILES spec)', () => {
    it('should parse equivalent TB forms correctly', () => {
      const equivalentSMILES = [
        'S[As@TB1](F)(Cl)(Br)N',
        'S[As@TB2](Br)(Cl)(F)N',
        'S[As@TB5](F)(N)(Cl)Br',
        'F[As@TB10](S)(Cl)(N)Br',
        'F[As@TB15](Cl)(S)(Br)N',
        'Br[As@TB20](Cl)(S)(F)N'
      ];

      for (const smiles of equivalentSMILES) {
        const result = parseSMILES(smiles);
        expect(result.errors).toEqual([]);
        expect(result.molecules).toHaveLength(1);
        const asAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'As');
        expect(asAtom).toBeDefined();
        expect(asAtom?.chiral).toMatch(/@TB\d+/);
      }
    });

    it('should parse equivalent OH forms correctly', () => {
      const equivalentSMILES = [
        'S[Co@OH5](F)(I)(Cl)(C)Br',
        'Br[Co@OH9](C)(S)(Cl)(F)I',
        'Br[Co@OH12](Cl)(I)(F)(S)C',
        'Cl[Co@OH15](C)(Br)(F)(I)S',
        'Cl[Co@OH19](C)(I)(F)(S)Br',
        'I[Co@OH27](Cl)(Br)(F)(S)C'
      ];

      for (const smiles of equivalentSMILES) {
        const result = parseSMILES(smiles);
        expect(result.errors).toEqual([]);
        expect(result.molecules).toHaveLength(1);
        const coAtom = result.molecules[0]!.atoms.find(a => a.symbol === 'Co');
        expect(coAtom).toBeDefined();
        expect(coAtom?.chiral).toBeTruthy();
      }
    });
  });

  describe('Legacy chirality still works', () => {
    it('should parse @ and @@ for tetrahedral', () => {
      const result1 = parseSMILES('N[C@H](C)O');
      expect(result1.errors).toEqual([]);
      const cAtom1 = result1.molecules[0]!.atoms.find(a => a.symbol === 'C');
      expect(cAtom1?.chiral).toBe('@');

      const result2 = parseSMILES('N[C@@H](C)O');
      expect(result2.errors).toEqual([]);
      const cAtom2 = result2.molecules[0]!.atoms.find(a => a.symbol === 'C');
      expect(cAtom2?.chiral).toBe('@@');
    });

    it('should parse @TH1 and @TH2', () => {
      const result1 = parseSMILES('N[C@TH1H](C)O');
      expect(result1.errors).toEqual([]);
      const cAtom1 = result1.molecules[0]!.atoms.find(a => a.symbol === 'C');
      expect(cAtom1?.chiral).toBe('@TH1');

      const result2 = parseSMILES('N[C@TH2H](C)O');
      expect(result2.errors).toEqual([]);
      const cAtom2 = result2.molecules[0]!.atoms.find(a => a.symbol === 'C');
      expect(cAtom2?.chiral).toBe('@TH2');
    });

    it('should parse @AL1 and @AL2 for allene-like', () => {
      const result1 = parseSMILES('N[C@AL1](C)=C=C(O)C');
      expect(result1.errors).toEqual([]);
      const cAtom1 = result1.molecules[0]!.atoms.find(a => a.symbol === 'C' && a.chiral);
      expect(cAtom1?.chiral).toBe('@AL1');

      const result2 = parseSMILES('N[C@AL2](C)=C=C(O)C');
      expect(result2.errors).toEqual([]);
      const cAtom2 = result2.molecules[0]!.atoms.find(a => a.symbol === 'C' && a.chiral);
      expect(cAtom2?.chiral).toBe('@AL2');
    });
  });
});
