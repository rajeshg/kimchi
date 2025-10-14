import { describe, expect, it } from 'bun:test';
import { parseSMILES, generateSMILES } from 'index';
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

describe('RDKit Comparison', () => {
  it('compares CC with rdkit', async () => {
    const RDKit = await initializeRDKit();
    const mol = RDKit.get_mol('CC');
    expect(mol.get_num_atoms()).toBe(2);
    expect(mol.get_num_bonds()).toBe(1);

    const result = parseSMILES('CC');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms).toHaveLength(2);
    expect(result.molecules[0]!.bonds).toHaveLength(1);
  });

  it('compares C1CCCCC1 with rdkit', async () => {
    const RDKit = await initializeRDKit();
    const mol = RDKit.get_mol('C1CCCCC1');
    expect(mol.get_num_atoms()).toBe(6);
    expect(mol.get_num_bonds()).toBe(6);

    const result = parseSMILES('C1CCCCC1');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms).toHaveLength(6);
    expect(result.molecules[0]!.bonds).toHaveLength(6);
  });
});