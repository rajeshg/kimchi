import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { generateIUPACName } from 'src/utils/iupac/iupac-generator';

describe('Polycyclic IUPAC Naming', () => {
  describe('Fused Ring Systems', () => {
    it('should name naphthalene correctly', () => {
      const result = parseSMILES('c1ccc2ccccc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBe('naphthalene');
    });

    it('should name 1-methylnaphthalene', () => {
      const result = parseSMILES('Cc1ccc2ccccc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toMatch(/1-methyl.*naphthalene/);
    });

    it('should name 2-methylnaphthalene', () => {
      const result = parseSMILES('c1c(C)cc2ccccc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toMatch(/2-methyl.*naphthalene/);
    });

    it('should name anthracene correctly', () => {
      const result = parseSMILES('c1ccc2cc3ccccc3cc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBe('anthracene');
    });

    it('should name phenanthrene correctly', () => {
      const result = parseSMILES('c1ccc2c(c1)cccc3c2ccc3');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBe('phenanthrene');
    });

    it('should name 9-methylanthracene', () => {
      const result = parseSMILES('Cc1ccc2cc3ccccc3cc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toMatch(/1-methyl.*anthracene/);
    });
  });

  describe('Benzene Fused to Heterocycles', () => {
    it('should name indole correctly', () => {
      const result = parseSMILES('c1ccc2c(c1)[nH]c2');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBe('indole');
    });

    it('should name benzofuran correctly', () => {
      const result = parseSMILES('c1ccc2oc(c1)c2');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBe('benzofuran');
    });

    it('should name benzothiophene correctly', () => {
      const result = parseSMILES('c1ccc2sc(c1)c2');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBe('benzothiophene');
    });

    it('should name 1-methylindole', () => {
      const result = parseSMILES('c1ccc2c(c1)[n](C)cc2');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toMatch(/1-methyl.*indole/);
    });
  });

  describe('Substituted Fused Systems', () => {
    it('should name 1,8-dimethylnaphthalene', () => {
      const result = parseSMILES('Cc1ccc2ccccc2c1C');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toMatch(/1,8-dimethyl.*naphthalene/);
    });

    it('should name 2-chloronaphthalene', () => {
      const result = parseSMILES('c1c(Cl)cc2ccccc2c1');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toMatch(/2-chloro.*naphthalene/);
    });

    it('should name 5-bromoindole', () => {
      const result = parseSMILES('c1ccc2c(c1)[nH]c2Br');
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toMatch(/5-bromo.*indole/);
    });
  });

  describe('Fallback for Complex Systems', () => {
    it('should handle complex polycyclic systems gracefully', () => {
      const result = parseSMILES('C1CC2CCC1C2'); // Norbornane-like structure
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
      // Should fall back to generic naming if pattern not recognized
      expect(iupac.name).toMatch(/polycyclic/);
    });

    it('should handle three fused rings with heteroatoms', () => {
      const result = parseSMILES('c1ccc2c(c1)ncc2'); // Complex heterocyclic fusion
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
      expect(iupac.name.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle partially aromatic fused systems', () => {
      const result = parseSMILES('C1=CC2=CC=CC2=C1'); // Partially aromatic naphthalene
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should handle fused systems with charges', () => {
      const result = parseSMILES('c1ccc2ccccc2c1[O-]'); // Naphtholate
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });

    it('should handle fused systems with isotopes', () => {
      const result = parseSMILES('[13C]c1ccc2ccccc2c1'); // 13C-naphthalene
      const mol = result.molecules[0]!;
      const iupac = generateIUPACName(mol);

      expect(iupac.errors).toHaveLength(0);
      expect(iupac.name).toBeDefined();
    });
  });
});