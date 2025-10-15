import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { generateSMILES } from 'src/generators/smiles-generator';

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

function getRDKitCanonical(smiles: string): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const RDKit = await initializeRDKit();
      
      const mol = RDKit.get_mol(smiles);
      if (mol && mol.is_valid()) {
        resolve(mol.get_smiles());
      } else {
        resolve('PARSE_ERROR');
      }
    } catch (e) {
      resolve('RDKIT_ERROR');
    }
  });
}

describe('RDKit Symmetry Detection Validation', () => {
  describe('Chiral centers with symmetric substituents - should remove chirality', () => {
    const testCases = [
      { name: 'CHBr2 (two bromines)', smiles: 'C[C@H](Br)Br' },
      { name: 'CHCl2 (two chlorines)', smiles: 'F[C@@H](Cl)Cl' },
      { name: 'CH(CH3)2 (two methyls)', smiles: 'Br[C@H](C)C' },
      { name: 'CH(Et)2 (two ethyls)', smiles: 'CC[C@H](CC)Br' },
      { name: 'CH(Ph)2 (two phenyls)', smiles: 'c1ccccc1[C@H](c2ccccc2)Br' },
      { name: 'CHF2 (two fluorines)', smiles: 'C[C@H](F)F' },
      { name: 'CH(OH)2 (two hydroxyls)', smiles: 'C[C@H](O)O' },
      { name: 'CH(NH2)2 (two amino groups)', smiles: 'C[C@H](N)N' },
      { name: 'CH(CH2CH3)2 (two ethyls alt)', smiles: 'O[C@@H](CC)CC' },
      { name: 'CH(nPr)2 (two n-propyls)', smiles: 'CCC[C@H](CCC)Br' },
      { name: 'CH(iPr)2 (two isopropyls)', smiles: 'CC(C)[C@H](C(C)C)Br' },
      { name: 'CH(tBu)2 (two tert-butyls)', smiles: 'CC(C)(C)[C@H](C(C)(C)C)Br' },
      { name: 'CH(CF3)2 (two trifluoromethyls)', smiles: 'FC(F)(F)[C@H](C(F)(F)F)Br' },
      { name: 'CH(benzyl)2 (two benzyls)', smiles: 'c1ccccc1C[C@H](Cc2ccccc2)Br' },
      { name: 'C(CH3)3 (three methyls)', smiles: 'C[C@](C)(C)Br' },
    ];

    testCases.forEach(({ name, smiles }) => {
      it(`should match RDKit for ${name}: ${smiles}`, async () => {
        const result = parseSMILES(smiles);
        expect(result.errors).toHaveLength(0);
        
        const ourCanonical = generateSMILES(result.molecules[0]!, true);
        
        // Our implementation should not contain chirality
        expect(ourCanonical).not.toContain('@');
        
        const rdkitCanonical = await getRDKitCanonical(smiles);
        
        if (rdkitCanonical === 'RDKIT_UNAVAILABLE') {
          throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
        }
        
        expect(rdkitCanonical).not.toBe('PARSE_ERROR');
        expect(rdkitCanonical).not.toBe('RDKIT_ERROR');
        
        // RDKit should also not contain chirality markers
        expect(rdkitCanonical).not.toContain('@');
      }, 10000);
    });
  });

  describe('Chiral centers with all different substituents - should preserve chirality', () => {
    const testCases = [
      { name: 'CHBrClF (all different halogens)', smiles: 'C[C@H](Br)F' },
      { name: 'CHBrClI (Br, Cl, I)', smiles: 'Cl[C@H](Br)I' },
      { name: 'Alanine', smiles: 'C[C@H](N)C(=O)O' },
      { name: 'CHMeEtPr (methyl, ethyl, propyl)', smiles: 'C[C@H](CC)CCC' },
      { name: 'CHPhBn (phenyl and benzyl different)', smiles: 'c1ccccc1[C@H](Cc2ccccc2)Br' },
      { name: 'CH(Ph)(Py) (phenyl and pyridyl)', smiles: 'c1ccccc1[C@H](c2ccncc2)Br' },
      { name: 'CHBrClNH2', smiles: 'N[C@H](Br)Cl' },
      { name: 'CHBrOHCl', smiles: 'O[C@H](Br)Cl' },
      { name: 'CHMeEtF', smiles: 'C[C@H](CC)F' },
      { name: 'Serine', smiles: 'OC[C@H](N)C(=O)O' },
      { name: 'Threonine', smiles: 'C[C@@H](O)[C@H](N)C(=O)O' },
      { name: 'CHBrCl-methoxy', smiles: 'CO[C@H](Br)Cl' },
      { name: 'CH(vinyl)EtBr', smiles: 'C=C[C@H](CC)Br' },
      { name: 'CH(acetyl)MeBr', smiles: 'CC(=O)[C@H](C)Br' },
    ];

    testCases.forEach(({ name, smiles }) => {
      it(`should match RDKit for ${name}: ${smiles}`, async () => {
        const result = parseSMILES(smiles);
        expect(result.errors).toHaveLength(0);
        
        const ourCanonical = generateSMILES(result.molecules[0]!, true);
        
        // Our implementation should preserve chirality
        expect(ourCanonical).toContain('@');
        
        const rdkitCanonical = await getRDKitCanonical(smiles);
        
        if (rdkitCanonical === 'RDKIT_UNAVAILABLE') {
          throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
        }
        
        expect(rdkitCanonical).not.toBe('PARSE_ERROR');
        expect(rdkitCanonical).not.toBe('RDKIT_ERROR');
        
        // RDKit should also preserve chirality
        expect(rdkitCanonical).toContain('@');
      }, 10000);
    });
  });

  describe('Double bond stereochemistry with geminal identical groups', () => {
    const testCases = [
      { name: 'CF2=CF (two F geminal)', smiles: 'F/C(F)=C/Br', shouldHaveStereo: false },
      { name: 'CCl2=CCl (two Cl geminal)', smiles: 'Cl/C(Cl)=C/Br', shouldHaveStereo: false },
      { name: 'C(CH3)2=CH2 (two methyl geminal)', smiles: 'C/C(C)=C', shouldHaveStereo: false },
      { name: 'FC(Br)=CCl (all different)', smiles: 'F/C(Br)=C/Cl', shouldHaveStereo: true },
      { name: 'trans-2-butene', smiles: 'C/C=C/C', shouldHaveStereo: true },
      { name: 'cis-2-butene', smiles: 'C/C=C\\C', shouldHaveStereo: true },
      { name: 'CHBr=CBr2 (two Br on one side)', smiles: 'Br/C=C(/Br)Br', shouldHaveStereo: false },
      { name: 'CH2=CH2 (ethylene both geminal H)', smiles: 'C/C=C', shouldHaveStereo: false },
      { name: 'CHF=CHBr (all different)', smiles: 'F/C=C/Br', shouldHaveStereo: true },
    ];

    testCases.forEach(({ name, smiles, shouldHaveStereo }) => {
      it(`should match RDKit for ${name}: ${smiles}`, async () => {
        const result = parseSMILES(smiles);
        expect(result.errors).toHaveLength(0);
        
        const ourCanonical = generateSMILES(result.molecules[0]!, true);
        const ourHasStereo = ourCanonical.includes('/') || ourCanonical.includes('\\');
        
        // Check our implementation matches expected
        expect(ourHasStereo).toBe(shouldHaveStereo);
        
        const rdkitCanonical = await getRDKitCanonical(smiles);
        
        if (rdkitCanonical === 'RDKIT_UNAVAILABLE') {
          throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
        }
        
        expect(rdkitCanonical).not.toBe('PARSE_ERROR');
        expect(rdkitCanonical).not.toBe('RDKIT_ERROR');
        
        const rdkitHasStereo = rdkitCanonical.includes('/') || rdkitCanonical.includes('\\');
        
        // Both should agree on stereo presence
        expect(rdkitHasStereo).toBe(shouldHaveStereo);
      }, 10000);
    });
  });

  describe('Ring systems with stereochemistry', () => {
    const testCases = [
      { name: 'Bromocyclopentane', smiles: 'C1C[C@H](Br)CC1', shouldHaveStereo: false }, // single substituent - no reference
      { name: 'Methylcyclohexane', smiles: 'C1CC[C@H](C)CC1', shouldHaveStereo: false }, // single substituent - no reference
      { name: 'Chlorocyclobutane', smiles: 'C1[C@H](Cl)CC1', shouldHaveStereo: false }, // single substituent - no reference
      { name: 'Bromocycloheptane', smiles: 'C1CCC[C@H](Br)CC1', shouldHaveStereo: false }, // single substituent - no reference
      { name: '1,2-dibromocyclopentane (trans)', smiles: 'Br[C@@H]1CCC[C@H]1Br', shouldHaveStereo: true },
      { name: '1,3-dimethylcyclobutane', smiles: 'C[C@H]1C[C@H](C)C1', shouldHaveStereo: true },
      { name: 'Fused ring with stereo', smiles: 'C1CC2CCC[C@H]2C1', shouldHaveStereo: false }, // single substituent on bridgehead
      { name: 'Bicyclo[2.2.1]heptane with substituent', smiles: 'C1C[C@H]2CC[C@@H]1C2', shouldHaveStereo: true },
    ];

    testCases.forEach(({ name, smiles, shouldHaveStereo }) => {
      it(`should match RDKit for ${name}: ${smiles}`, async () => {
        const result = parseSMILES(smiles);
        expect(result.errors).toHaveLength(0);
        
        const ourCanonical = generateSMILES(result.molecules[0]!, true);
        const ourHasStereo = ourCanonical.includes('@');
        
        // Check our implementation matches expected
        expect(ourHasStereo).toBe(shouldHaveStereo);
        
        const rdkitCanonical = await getRDKitCanonical(smiles);
        
        if (rdkitCanonical === 'RDKIT_UNAVAILABLE') {
          throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
        }
        
        expect(rdkitCanonical).not.toBe('PARSE_ERROR');
        expect(rdkitCanonical).not.toBe('RDKIT_ERROR');
        
        const rdkitHasStereo = rdkitCanonical.includes('@');
        
        // Both should agree on stereo presence
        expect(rdkitHasStereo).toBe(shouldHaveStereo);
      }, 10000);
    });
  });

  describe('Edge cases and complex structures', () => {
    const testCases = [
      { name: 'Quaternary carbon (no stereo possible)', smiles: 'C[C@](C)(C)C', shouldHaveStereo: false },
      { name: 'Quaternary nitrogen (charged N+ no stereo)', smiles: '[N@+](C)(C)(C)Br', shouldHaveStereo: false },
      { name: 'Two chiral centers - both valid', smiles: 'C[C@H](Br)[C@H](Cl)C', shouldHaveStereo: true },
      { name: 'Two identical chiral substituents on different centers', smiles: 'Br[C@H](C)[C@H](C)Br', shouldHaveStereo: true },
      { name: 'Meso compound (symmetric)', smiles: 'Br[C@H](C)[C@@H](C)Br', shouldHaveStereo: true },
      { name: 'Spirocyclic with stereo', smiles: 'C1CC[C@@]2(C1)CCC2', shouldHaveStereo: false }, // quaternary
      { name: 'Aromatic substitution (no stereo at sp2)', smiles: 'c1ccc(cc1)[C@H](Br)Cl', shouldHaveStereo: true },
    ];

    testCases.forEach(({ name, smiles, shouldHaveStereo }) => {
      it(`should match RDKit for ${name}: ${smiles}`, async () => {
        const result = parseSMILES(smiles);
        expect(result.errors).toHaveLength(0);
        
        const ourCanonical = generateSMILES(result.molecules[0]!, true);
        const ourHasStereo = ourCanonical.includes('@') || ourCanonical.includes('/') || ourCanonical.includes('\\');
        
        // Check our implementation matches expected
        expect(ourHasStereo).toBe(shouldHaveStereo);
        
        const rdkitCanonical = await getRDKitCanonical(smiles);
        
        if (rdkitCanonical === 'RDKIT_UNAVAILABLE') {
          throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
        }
        
        expect(rdkitCanonical).not.toBe('PARSE_ERROR');
        expect(rdkitCanonical).not.toBe('RDKIT_ERROR');
        
        const rdkitHasStereo = rdkitCanonical.includes('@') || rdkitCanonical.includes('/') || rdkitCanonical.includes('\\');
        
        // Both should agree on stereo presence
        expect(rdkitHasStereo).toBe(shouldHaveStereo);
      }, 10000);
    });
  });
});
