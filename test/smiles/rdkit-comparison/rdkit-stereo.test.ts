import { describe, expect, it } from 'bun:test';
import { parseSMILES, generateSMILES } from 'index';

// Initialize RDKit once for the entire test file
let rdkitInstance: any = null;
let rdkitInitialized = false;

async function initializeRDKit(): Promise<any> {
  if (rdkitInitialized) return rdkitInstance;
  
  try {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
    }
    const initRDKitModule = rdkitModule.default;
    rdkitInstance = await (initRDKitModule as any)();
    rdkitInitialized = true;
    return rdkitInstance;
  } catch (e) {
    throw new Error('Failed to initialize RDKit');
  }
}

const testCases = [
  // Stereo normalization - equivalent representations
  { input: 'C\\C=C\\C', description: 'trans with all down markers' },
  { input: 'C/C=C/C', description: 'trans with all up markers' },
  { input: 'C/C=C\\C', description: 'cis with mixed markers' },
  
  // Tri-substituted alkenes
  { input: 'Cl/C=C(\\F)Br', description: 'tri-substituted with Cl, F, Br' },
  { input: 'F/C=C(\\Br)Cl', description: 'tri-substituted reordered' },
  
  // Tetra-substituted alkenes
  { input: 'CC(/F)=C(\\Cl)C', description: 'tetra-substituted alkene' },
  { input: 'Cl/C(F)=C(\\Br)I', description: 'tetra-substituted with halogens' },
  
  // Conjugated systems
  { input: 'F/C=C/C=C/F', description: 'conjugated diene all trans' },
  { input: 'C/C=C\\C=C/C', description: 'conjugated diene mixed stereo' },
  
  // Heteroatoms
  { input: 'N/C=C/O', description: 'double bond between heteroatoms' },
  { input: '[O-]/C=C/[O-]', description: 'charged heteroatoms' },
  
  // Heavy halogens
  { input: 'Br/C=C/I', description: 'heavy halogens' },
  { input: 'F/C=C/Cl', description: 'light halogens' },
  
  // Complex branching
  { input: 'CC(C)/C=C/C(C)C', description: 'branched substituents' },
  { input: 'CC(C)C(/C)=C(/C)C(C)C', description: 'heavily branched alkene' },
  
  // With triple bonds
  { input: 'C#C/C=C/C', description: 'triple bond adjacent to stereo' },
  
  // With aromatic rings
  { input: 'c1ccccc1/C=C/C', description: 'aromatic ring with exocyclic stereo' },
  
  // Cyclic systems
  { input: 'F/C1=CCC1/F', description: 'ring with exocyclic stereo' },
  { input: 'C1CC=C1/C=C/C', description: 'cyclic with exocyclic stereo chain' },
  
  // With isotopes
  { input: '[2H]/C=C/[2H]', description: 'deuterium stereo' },
  { input: '[13C]/C=C/C', description: 'carbon-13 with stereo' },
];

describe('RDKit Stereo SMILES Comparison', () => {
  testCases.forEach(({ input, description }) => {
    it(`matches RDKit canonical SMILES for ${description}: ${input}`, async () => {
      const RDKit = await initializeRDKit();
      
      // Parse with openchem
      const result = parseSMILES(input);
      expect(result.errors).toHaveLength(0);
      
      // Generate canonical SMILES with openchem
      const ourCanonical = generateSMILES(result.molecules);
      
      // Get RDKit canonical SMILES
      let rdkitCanonical = '';
      try {
        const mol = RDKit.get_mol(input);
        if (mol && mol.is_valid()) {
          rdkitCanonical = mol.get_smiles();
        }
      } catch (e) {
        console.error(`RDKit error for ${input}:`, e);
        rdkitCanonical = '';
      }
      
      if (!rdkitCanonical) {
        throw new Error(`RDKit failed to parse ${input}`);
      }
      
      // Compare
      expect(ourCanonical).toBe(rdkitCanonical);
    });
  });
});
