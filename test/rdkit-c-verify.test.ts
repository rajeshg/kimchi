import { describe, it } from 'bun:test';
import { initializeRDKit, getSubstructMatches } from './smarts/rdkit-comparison/rdkit-smarts-api';

describe('Verify RDKit C pattern behavior', () => {
  it('should check how RDKit matches C vs c', async () => {
    const rdkit = await initializeRDKit();
    
    const smiles = "CC1COc2ccccc2N1";
    
    console.log("\n=== RDKit Verification ===");
    console.log("Molecule:", smiles);
    console.log("  Atom 0: C (aliphatic)");
    console.log("  Atom 1: C (aromatic, in ring)");
    console.log("  Atom 2: C (aromatic, in ring)");
    console.log("  Atom 3: O (aromatic, in ring)");
    console.log("  Atoms 4-9: C (aromatic, in ring)");
    console.log("  Atom 10: N (aromatic, in ring)");
    
    const cMatches = getSubstructMatches(rdkit, smiles, "C");
    console.log("\nPattern 'C' (aliphatic) matches:", cMatches);
    
    const cAromMatches = getSubstructMatches(rdkit, smiles, "c");
    console.log("Pattern 'c' (aromatic) matches:", cAromMatches);
    
    const cBracket = getSubstructMatches(rdkit, smiles, "[C]");
    console.log("Pattern '[C]' (any carbon) matches:", cBracket);
    
    const cAliphaticBracket = getSubstructMatches(rdkit, smiles, "[C;!a]");
    console.log("Pattern '[C;!a]' (carbon NOT aromatic) matches:", cAliphaticBracket);
    
    const cAromaticBracket = getSubstructMatches(rdkit, smiles, "[C;a]");
    console.log("Pattern '[C;a]' (carbon AND aromatic) matches:", cAromaticBracket);
  });
});
