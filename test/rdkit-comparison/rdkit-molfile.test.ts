import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES, generateMolfile, parseMolfile } from 'index';

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

const TEST_MOLECULES = [
  { smiles: 'C', name: 'methane' },
  { smiles: 'CC', name: 'ethane' },
  { smiles: 'CCO', name: 'ethanol' },
  { smiles: 'CC(=O)O', name: 'acetic acid' },
  { smiles: 'CC(C)C', name: 'isobutane' },
  { smiles: 'C=C', name: 'ethene' },
  { smiles: 'C#N', name: 'hydrogen cyanide' },
  { smiles: 'CCCC', name: 'butane' },
  { smiles: 'CCC(C)C', name: 'isopentane' },
  { smiles: '[O-]C=O', name: 'formate' },
];

describe('RDKit MOL File Round-Trip Comparison', () => {
  TEST_MOLECULES.forEach(({ smiles, name }) => {
    it(`round-trips ${name} (${smiles}) through MOL format`, async () => {
      const RDKit = await initializeRDKit();
      
      const parseResult = parseSMILES(smiles);
      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.molecules).toHaveLength(1);
      
      const originalCanonical = generateSMILES(parseResult.molecules[0]!);
      
      const molfile = generateMolfile(parseResult.molecules[0]!, { title: name });
      expect(molfile).toBeTruthy();
      expect(molfile).toContain('M  END');
      
      const molParseResult = parseMolfile(molfile);
      expect(molParseResult.errors).toHaveLength(0);
      expect(molParseResult.molecule).toBeTruthy();
      
      const roundtripCanonical = generateSMILES(molParseResult.molecule!);
      expect(roundtripCanonical).toBe(originalCanonical);
      
      let rdkitMol: any = null;
      let rdkitCanonical = '';
      try {
        rdkitMol = RDKit.get_mol(molfile);
        if (rdkitMol && rdkitMol.is_valid()) {
          rdkitCanonical = rdkitMol.get_smiles();
        }
      } catch (e) {
        console.error(`RDKit MOL parse error for ${name}:`, e);
      } finally {
        if (rdkitMol) {
          try {
            rdkitMol.delete();
          } catch (e) {
          }
        }
      }
      
      if (rdkitCanonical) {
        expect(roundtripCanonical).toBe(rdkitCanonical);
      }
    });
  });
});

describe('RDKit MOL File Generation Comparison', () => {
  const testCases = [
    { smiles: 'CCO', name: 'ethanol' },
    { smiles: 'c1ccccc1', name: 'benzene' },
    { smiles: 'CC(=O)O', name: 'acetic acid' },
  ];
  
  testCases.forEach(({ smiles, name }) => {
    it(`generates MOL file for ${name} parseable by RDKit`, async () => {
      const RDKit = await initializeRDKit();
      
      const parseResult = parseSMILES(smiles);
      const molfile = generateMolfile(parseResult.molecules[0]!);
      
      let rdkitMol: any = null;
      let rdkitCanonical = '';
      let isValid = false;
      
      try {
        rdkitMol = RDKit.get_mol(molfile);
        isValid = rdkitMol && rdkitMol.is_valid();
        if (isValid) {
          rdkitCanonical = rdkitMol.get_smiles();
        }
      } catch (e) {
        console.error(`RDKit failed to parse generated MOL file for ${name}:`, e);
      } finally {
        if (rdkitMol) {
          try {
            rdkitMol.delete();
          } catch (e) {
          }
        }
      }
      
      expect(isValid).toBe(true);
      expect(rdkitCanonical).toBeTruthy();
      
      const ourCanonical = generateSMILES(parseResult.molecules[0]!);
      expect(rdkitCanonical).toBe(ourCanonical);
    });
  });
});

describe('RDKit MOL File Parsing Comparison', () => {
  it('parses RDKit-generated MOL files correctly', async () => {
    const RDKit = await initializeRDKit();
    const testSmiles = 'CC(=O)O';
    
    let rdkitMol: any = null;
    let rdkitMolfile = '';
    let rdkitCanonical = '';
    
    try {
      rdkitMol = RDKit.get_mol(testSmiles);
      if (rdkitMol && rdkitMol.is_valid()) {
        rdkitMolfile = rdkitMol.get_molblock();
        rdkitCanonical = rdkitMol.get_smiles();
      }
    } catch (e) {
      console.error('RDKit MOL generation failed:', e);
    } finally {
      if (rdkitMol) {
        try {
          rdkitMol.delete();
        } catch (e) {
        }
      }
    }
    
    expect(rdkitMolfile).toBeTruthy();
    
    const parseResult = parseMolfile(rdkitMolfile);
    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.molecule).toBeTruthy();
    
    const ourCanonical = generateSMILES(parseResult.molecule!);
    expect(ourCanonical).toBe(rdkitCanonical);
  });
  
  it('handles multiple RDKit-generated MOL files', async () => {
    const RDKit = await initializeRDKit();
    const testCases = ['CCO', 'c1ccccc1', 'CC(C)C'];
    
    for (const smiles of testCases) {
      let rdkitMol: any = null;
      let rdkitMolfile = '';
      let rdkitCanonical = '';
      
      try {
        rdkitMol = RDKit.get_mol(smiles);
        if (rdkitMol && rdkitMol.is_valid()) {
          rdkitMolfile = rdkitMol.get_molblock();
          rdkitCanonical = rdkitMol.get_smiles();
        }
      } catch (e) {
        console.error(`RDKit MOL generation failed for ${smiles}:`, e);
        continue;
      } finally {
        if (rdkitMol) {
          try {
            rdkitMol.delete();
          } catch (e) {
          }
        }
      }
      
      const parseResult = parseMolfile(rdkitMolfile);
      expect(parseResult.errors).toHaveLength(0);
      
      const ourCanonical = generateSMILES(parseResult.molecule!);
      expect(ourCanonical).toBe(rdkitCanonical);
    }
  });
});
