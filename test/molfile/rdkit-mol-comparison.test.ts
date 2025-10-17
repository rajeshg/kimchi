import { describe, expect, it } from 'bun:test';
import { parseSMILES, generateMolfile } from 'index';
// RDKit's module export typing is not callable in this environment; cast to any where used

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

/**
 * Parse a MOL file string and extract basic structural information
 */
function parseMolfileBasic(molfile: string): {
  numAtoms: number;
  numBonds: number;
  atoms: Array<{symbol: string, charge: number}>;
  bonds: Array<{type: number, stereo: number}>;
} {
  const lines = molfile.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Find counts line (should be around line 3-4)
  let countsLine = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes('V2000')) {
      countsLine = lines[i]!;
      break;
    }
  }

  if (!countsLine) {
    throw new Error('Could not find counts line in MOL file');
  }

  const countsParts = countsLine.split(/\s+/);
  const numAtoms = parseInt(countsParts[0] || '0');
  const numBonds = parseInt(countsParts[1] || '0');

  // Find atom block (starts after counts line)
  const atomStartIndex = lines.findIndex(line => line.includes('V2000')) + 1;
  const atoms = [];
  for (let i = 0; i < numAtoms; i++) {
    const atomLine = lines[atomStartIndex + i];
    if (!atomLine) break;

    const parts = atomLine.split(/\s+/);
    const symbol = (parts[3] || '').replace(/\d/g, ''); // Remove any trailing digits
    const charge = 0; // For basic comparison, ignore charges in atom block
    atoms.push({ symbol, charge });
  }

  // Find bond block (starts after atom block)
  const bondStartIndex = atomStartIndex + numAtoms;
  const bonds = [];
  for (let i = 0; i < numBonds; i++) {
    const bondLine = lines[bondStartIndex + i];
    if (!bondLine) break;

    const parts = bondLine.split(/\s+/);
    const type = parseInt(parts[2] || '1');
    const stereo = parseInt(parts[3] || '0');
    bonds.push({ type, stereo });
  }

  return { numAtoms, numBonds, atoms, bonds };
}

describe('RDKit MOL File Comparison', () => {
  it('compares MOL file structure for methane', async () => {
    const RDKit = await initializeRDKit();

    // Get RDKit MOL file
    const rdkitMol = RDKit.get_mol('C');
    const rdkitMolfile = rdkitMol.get_molblock();
    const rdkitStructure = parseMolfileBasic(rdkitMolfile);

    // Get kimchi MOL file
    const result = parseSMILES('C');
    expect(result.errors).toHaveLength(0);
    const kimchiMolfile = generateMolfile(result.molecules[0]!);
    const kimchiStructure = parseMolfileBasic(kimchiMolfile);

    // Compare structure
    expect(kimchiStructure.numAtoms).toBe(rdkitStructure.numAtoms);
    expect(kimchiStructure.numBonds).toBe(rdkitStructure.numBonds);
    expect(kimchiStructure.atoms).toHaveLength(rdkitStructure.atoms.length);
    expect(kimchiStructure.bonds).toHaveLength(rdkitStructure.bonds.length);

    // Check atoms (should all be C)
    for (let i = 0; i < kimchiStructure.atoms.length; i++) {
      expect(kimchiStructure.atoms[i]!.symbol).toBe(rdkitStructure.atoms[i]!.symbol);
    }
  });

  it('compares MOL file structure for ethanol', async () => {
    const RDKit = await initializeRDKit();

    // Get RDKit MOL file
    const rdkitMol = RDKit.get_mol('CCO');
    const rdkitMolfile = rdkitMol.get_molblock();
    const rdkitStructure = parseMolfileBasic(rdkitMolfile);

    // Get kimchi MOL file
    const result = parseSMILES('CCO');
    expect(result.errors).toHaveLength(0);
    const kimchiMolfile = generateMolfile(result.molecules[0]!);
    const kimchiStructure = parseMolfileBasic(kimchiMolfile);

    // Compare structure
    expect(kimchiStructure.numAtoms).toBe(rdkitStructure.numAtoms);
    expect(kimchiStructure.numBonds).toBe(rdkitStructure.numBonds);
    expect(kimchiStructure.atoms).toHaveLength(rdkitStructure.atoms.length);
    expect(kimchiStructure.bonds).toHaveLength(rdkitStructure.bonds.length);

    // Check atoms
    expect(kimchiStructure.atoms[0]!.symbol).toBe('C');
    expect(kimchiStructure.atoms[1]!.symbol).toBe('C');
    expect(kimchiStructure.atoms[2]!.symbol).toBe('O');

    // Check bonds (should be 2 single bonds)
    expect(kimchiStructure.bonds[0]!.type).toBe(1); // single
    expect(kimchiStructure.bonds[1]!.type).toBe(1); // single
  });

  it('compares MOL file structure for benzene', async () => {
    const RDKit = await initializeRDKit();

    // Get RDKit MOL file
    const rdkitMol = RDKit.get_mol('c1ccccc1');
    const rdkitMolfile = rdkitMol.get_molblock();
    const rdkitStructure = parseMolfileBasic(rdkitMolfile);

    // Get kimchi MOL file
    const result = parseSMILES('c1ccccc1');
    expect(result.errors).toHaveLength(0);
    const kimchiMolfile = generateMolfile(result.molecules[0]!);
    const kimchiStructure = parseMolfileBasic(kimchiMolfile);

    // Compare structure
    expect(kimchiStructure.numAtoms).toBe(rdkitStructure.numAtoms);
    expect(kimchiStructure.numBonds).toBe(rdkitStructure.numBonds);

    // Check atoms (should all be C)
    for (const atom of kimchiStructure.atoms) {
      expect(atom.symbol).toBe('C');
    }

    // Check bonds (should be alternating single and double for aromatic)
    expect(kimchiStructure.bonds.some(b => b.type === 4)).toBe(true); // aromatic bonds
  });

  it('compares MOL file structure for charged molecule', async () => {
    const RDKit = await initializeRDKit();

    // Get RDKit MOL file
    const rdkitMol = RDKit.get_mol('[NH4+]');
    const rdkitMolfile = rdkitMol.get_molblock();
    const rdkitStructure = parseMolfileBasic(rdkitMolfile);

    // Get kimchi MOL file
    const result = parseSMILES('[NH4+]');
    expect(result.errors).toHaveLength(0);
    const kimchiMolfile = generateMolfile(result.molecules[0]!);
    const kimchiStructure = parseMolfileBasic(kimchiMolfile);

    // Compare structure
    expect(kimchiStructure.numAtoms).toBe(rdkitStructure.numAtoms);
    expect(kimchiStructure.numBonds).toBe(rdkitStructure.numBonds);

    // Check atoms
    expect(kimchiStructure.atoms[0]!.symbol).toBe('N');
  });

  it('compares MOL file structure for isotope', async () => {
    const RDKit = await initializeRDKit();

    // Get RDKit MOL file
    const rdkitMol = RDKit.get_mol('[13CH4]');
    const rdkitMolfile = rdkitMol.get_molblock();
    const rdkitStructure = parseMolfileBasic(rdkitMolfile);

    // Get kimchi MOL file
    const result = parseSMILES('[13CH4]');
    expect(result.errors).toHaveLength(0);
    const kimchiMolfile = generateMolfile(result.molecules[0]!);
    const kimchiStructure = parseMolfileBasic(kimchiMolfile);

    // Compare structure
    expect(kimchiStructure.numAtoms).toBe(rdkitStructure.numAtoms);
    expect(kimchiStructure.numBonds).toBe(rdkitStructure.numBonds);

    // Check atoms (should all be C)
    for (const atom of kimchiStructure.atoms) {
      expect(atom.symbol).toBe('C');
    }
  });

  it('compares MOL file structure for chiral molecule', async () => {
    const RDKit = await initializeRDKit();

    // Get RDKit MOL file
    const rdkitMol = RDKit.get_mol('C[C@H](O)N');
    const rdkitMolfile = rdkitMol.get_molblock();
    const rdkitStructure = parseMolfileBasic(rdkitMolfile);

    // Get kimchi MOL file
    const result = parseSMILES('C[C@H](O)N');
    expect(result.errors).toHaveLength(0);
    const kimchiMolfile = generateMolfile(result.molecules[0]!);
    const kimchiStructure = parseMolfileBasic(kimchiMolfile);

    // Compare structure
    expect(kimchiStructure.numAtoms).toBe(rdkitStructure.numAtoms);
    expect(kimchiStructure.numBonds).toBe(rdkitStructure.numBonds);

    // Check atoms
    expect(kimchiStructure.atoms[0]!.symbol).toBe('C');
    expect(kimchiStructure.atoms[1]!.symbol).toBe('C');
    expect(kimchiStructure.atoms[2]!.symbol).toBe('O');
    expect(kimchiStructure.atoms[3]!.symbol).toBe('N');
  });

  it('verifies MOL file format compliance', async () => {
    const RDKit = await initializeRDKit();

    const testCases = [
      'C',      // methane
      'CC',     // ethane
      'CCO',    // ethanol
      'c1ccccc1', // benzene
      '[NH4+]', // ammonium
      '[13CH4]', // isotope
      'C[C@H](O)N', // chiral
    ];

    for (const smiles of testCases) {
      // Get kimchi MOL file
      const result = parseSMILES(smiles);
      expect(result.errors).toHaveLength(0);
      const kimchiMolfile = generateMolfile(result.molecules[0]!);

      // Verify MOL file structure
      const lines = kimchiMolfile.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      // Should have at least header, counts line, atoms, and M END
      expect(lines.length).toBeGreaterThanOrEqual(4);

      // Should contain V2000
      expect(kimchiMolfile).toContain('V2000');

      // Should end with M END
      expect(kimchiMolfile.trim().endsWith('M  END')).toBe(true);

      // Should be parseable by our basic parser
      const structure = parseMolfileBasic(kimchiMolfile);
      expect(structure.numAtoms).toBeGreaterThan(0);
    }
  });
});