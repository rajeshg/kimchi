let rdkitInstance: any = null;
let rdkitInitialized = false;

export async function initializeRDKit(): Promise<any> {
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

export interface SubstructMatchResult {
  success: boolean;
  matches: number[][];
  error?: string;
}

export function getSubstructMatches(
  rdkit: any,
  smiles: string,
  pattern: string
): SubstructMatchResult {
  let mol = null;
  let qmol = null;
  
  try {
    mol = rdkit.get_mol(smiles);
    if (!mol || !mol.is_valid || !mol.is_valid()) {
      return { success: false, matches: [], error: 'Invalid molecule' };
    }

    qmol = rdkit.get_qmol(pattern);
    if (!qmol || !qmol.is_valid || !qmol.is_valid()) {
      return { success: false, matches: [], error: 'Invalid pattern' };
    }

    const matchesJson = mol.get_substruct_matches(qmol);
    
    if (!matchesJson) {
      return { success: true, matches: [] };
    }

    const rawMatches = JSON.parse(matchesJson);
    const matches = Array.isArray(rawMatches)
      ? rawMatches.map((m: any) => {
          if (Array.isArray(m)) return m;
          if (m && Array.isArray(m.atoms)) return m.atoms;
          return [];
        })
      : [];
    
    return { success: true, matches };
  } catch (e) {
    return { success: false, matches: [], error: String(e) };
  } finally {
    if (mol && mol.delete) mol.delete();
    if (qmol && qmol.delete) qmol.delete();
  }
}

export function validatePattern(rdkit: any, pattern: string): { valid: boolean; error?: string } {
  try {
    const qmol = rdkit.get_qmol(pattern);
    if (!qmol || !qmol.is_valid || !qmol.is_valid()) {
      if (qmol && qmol.delete) qmol.delete();
      return { valid: false, error: 'Invalid SMARTS pattern' };
    }
    if (qmol.delete) qmol.delete();
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

export interface AromaticityResult {
  success: boolean;
  aromaticAtoms: boolean[];
  error?: string;
}

export function getRDKitAromaticity(rdkit: any, smiles: string): AromaticityResult {
  let mol = null;
  
  try {
    mol = rdkit.get_mol(smiles);
    if (!mol || !mol.is_valid || !mol.is_valid()) {
      return { success: false, aromaticAtoms: [], error: 'Invalid molecule' };
    }

    const jsonStr = mol.get_json();
    const molData = JSON.parse(jsonStr);
    
    const molecule = molData.molecules?.[0];
    if (!molecule || !molecule.atoms) {
      return { success: false, aromaticAtoms: [], error: 'No atoms in molecule data' };
    }
    
    const ext = molecule.extensions?.[0];
    const rdkitAromaticIndices = ext?.aromaticAtoms || [];
    
    const aromaticAtoms = molecule.atoms.map((_: any, index: number) => 
      rdkitAromaticIndices.includes(index)
    );
    
    return { success: true, aromaticAtoms };
  } catch (e) {
    return { success: false, aromaticAtoms: [], error: String(e) };
  } finally {
    if (mol && mol.delete) mol.delete();
  }
}
