import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { initializeRDKit, getRDKitAromaticity } from 'test/smarts/rdkit-comparison/rdkit-smarts-api';

describe('Aromaticity Comparison with RDKit', () => {
  describe('Extended aromaticity cases', () => {
    it('should match RDKit aromaticity for complex conjugated system', async () => {
      const smiles = 'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5';
      
      // Get RDKit aromaticity
      const rdkit = await initializeRDKit();
      const rdkitResult = getRDKitAromaticity(rdkit, smiles);
      expect(rdkitResult.success).toBe(true);
      
      // Get Chemkit aromaticity
      const chemkitResult = parseSMILES(smiles);
      expect(chemkitResult.errors).toHaveLength(0);
      const molecule = chemkitResult.molecules[0]!;
      
      // Compare aromaticity arrays
      const chemkitAromaticity = molecule.atoms.map(atom => atom.aromatic);
      
      expect(chemkitAromaticity).toEqual(rdkitResult.aromaticAtoms);
    });
    
    it('should match RDKit aromaticity for acetophenone', async () => {
      const smiles = 'CC(=O)c1ccccc1';
      
      // Get RDKit aromaticity
      const rdkit = await initializeRDKit();
      const rdkitResult = getRDKitAromaticity(rdkit, smiles);
      expect(rdkitResult.success).toBe(true);
      
      // Get Chemkit aromaticity
      const chemkitResult = parseSMILES(smiles);
      expect(chemkitResult.errors).toHaveLength(0);
      const molecule = chemkitResult.molecules[0]!;
      
      // Compare aromaticity arrays
      const chemkitAromaticity = molecule.atoms.map(atom => atom.aromatic);
      
      expect(chemkitAromaticity).toEqual(rdkitResult.aromaticAtoms);
    });
    
    it('should match RDKit aromaticity for benzaldehyde', async () => {
      const smiles = 'O=Cc1ccccc1';
      
      // Get RDKit aromaticity
      const rdkit = await initializeRDKit();
      const rdkitResult = getRDKitAromaticity(rdkit, smiles);
      expect(rdkitResult.success).toBe(true);
      
      // Get Chemkit aromaticity
      const chemkitResult = parseSMILES(smiles);
      expect(chemkitResult.errors).toHaveLength(0);
      const molecule = chemkitResult.molecules[0]!;
      
      // Compare aromaticity arrays
      const chemkitAromaticity = molecule.atoms.map(atom => atom.aromatic);
      
      expect(chemkitAromaticity).toEqual(rdkitResult.aromaticAtoms);
    });
  });
});