import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateIUPACName } from 'index';

describe('IUPAC Aromatic Substituent Edge Cases', () => {
  describe('Simple aromatic derivatives (ortho/meta/para)', () => {
    it('should name ortho-dimethylbenzene (1,2-dimethylbenzene / o-xylene)', () => {
      const result = parseSMILES('c1ccc(C)c(C)c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('ortho-xylene SMILES: c1ccc(C)c(C)c1 => IUPAC:', nameResult.name);
      expect(nameResult.name).toContain('dimethylbenzene');
    });

    it('should name meta-dimethylbenzene (1,3-dimethylbenzene / m-xylene)', () => {
      const result = parseSMILES('c1cc(C)cc(C)c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('meta-xylene: c1cc(C)cc(C)c1 => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('1,3-dimethylbenzene');
    });

    it('should name para-dimethylbenzene (1,4-dimethylbenzene / p-xylene)', () => {
      const result = parseSMILES('c1cc(C)ccc1C');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('para-xylene: c1cc(C)ccc1C => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('1,4-dimethylbenzene');
    });
  });

  describe('Triple-substituted benzenes', () => {
    it('should handle 1,2,3-trimethylbenzene', () => {
      const result = parseSMILES('c1c(C)c(C)c(C)cc1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('1,2,3-trimethylbenzene => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('1,2,3-trimethylbenzene');
    });

    it('should handle 1,2,4-trimethylbenzene', () => {
      const result = parseSMILES('c1c(C)cc(C)c(C)c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('1,2,4-trimethylbenzene => IUPAC:', nameResult.name);
      // CURRENTLY FAILING: generates "1,2,5-trimethylbenzene" instead of "1,2,4-trimethylbenzene"
      expect(nameResult.name).toBe('1,2,4-trimethylbenzene');
    });

    it('should handle 1,3,5-trimethylbenzene', () => {
      const result = parseSMILES('c1c(C)cc(C)cc(C)1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('1,3,5-trimethylbenzene (mesitylene) => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('1,3,5-trimethylbenzene');
    });
  });

  describe('Complex substituents on benzene', () => {
    it('should handle benzene with ethyl group', () => {
      const result = parseSMILES('c1ccccc1CC');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('ethylbenzene => IUPAC:', nameResult.name);
      expect(nameResult.name).toContain('ethylbenzene');
    });

    it('should handle 1-ethyl-2-methylbenzene', () => {
      const result = parseSMILES('c1ccc(CC)c(C)c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('1-ethyl-2-methylbenzene => IUPAC:', nameResult.name);
      expect(nameResult.name).toBeDefined();
    });

    it('should handle chlorobenzene', () => {
      const result = parseSMILES('c1ccc(Cl)cc1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('chlorobenzene => IUPAC:', nameResult.name);
      expect(nameResult.name).toContain('chlorobenzene');
    });

    it('should handle 1-methyl-2-chlorobenzene', () => {
      const result = parseSMILES('c1ccc(C)c(Cl)c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('1-methyl-2-chlorobenzene => IUPAC:', nameResult.name);
      expect(nameResult.name).toBeDefined();
    });
  });

  describe('Aromatic substituents on aliphatic chains', () => {
    it('should handle phenylpropane', () => {
      const result = parseSMILES('CCCc1ccccc1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('phenylpropane => IUPAC:', nameResult.name);
      expect(nameResult.name).toBeDefined();
    });

    it('should handle 2-phenylpropane (cumene)', () => {
      const result = parseSMILES('CC(C)c1ccccc1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('2-phenylpropane (cumene) => IUPAC:', nameResult.name);
      expect(nameResult.name).toBeDefined();
    });

    it('should handle 1-phenylethane', () => {
      const result = parseSMILES('CC(c1ccccc1)');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('1-phenylethane => IUPAC:', nameResult.name);
      expect(nameResult.name).toBeDefined();
    });
  });

  describe('Fused aromatic systems', () => {
    it('should handle naphthalene (fused 2x benzene)', () => {
      const result = parseSMILES('c1ccc2ccccc2c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('naphthalene => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('naphthalene');
    });

    it('should handle anthracene (fused 3x benzene)', () => {
      const result = parseSMILES('c1ccc2cc3ccccc3cc2c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('anthracene => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('anthracene');
    });

    it('should handle 1-methylnaphthalene', () => {
      const result = parseSMILES('Cc1ccc2ccccc2c1');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('1-methylnaphthalene => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('1-methylnaphthalene');
    });
  });

  describe('Known working cases - verify still working', () => {
    it('should correctly name ibuprofen', () => {
      const result = parseSMILES('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('Ibuprofen => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('2-(4-isobutylphenyl)propanoic acid');
    });

    it('should correctly name simple phenylacetic acid', () => {
      const result = parseSMILES('c1ccccc1CC(=O)O');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('Phenylacetic acid => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('2-phenylethanoic acid');
    });

    it('should correctly name methylbenzene (toluene)', () => {
      const result = parseSMILES('c1ccccc1C');
      expect(result.molecules).toHaveLength(1);
      const mol = result.molecules[0]!;
      const nameResult = generateIUPACName(mol);
      console.log('Toluene => IUPAC:', nameResult.name);
      expect(nameResult.name).toBe('methylbenzene');
    });
  });
});
