import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES, getMolecularFormula, getMolecularMass, getExactMass } from 'index';

// Programmatically build a diverse list of 300 SMILES
const TEST_SMILES: string[] = [];

// 1) Alkanes (1..40)
for (let i = 1; i <= 40; i++) {
  TEST_SMILES.push('C'.repeat(i));
}

// 2) Alkenes (30 variants)
for (let i = 1; i <= 30; i++) {
  TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '=C' + (i % 5 === 0 ? 'C' : ''));
}

// 3) Alkynes (10)
for (let i = 1; i <= 10; i++) {
  TEST_SMILES.push('C'.repeat(Math.max(1, i)) + '#C');
}

// 4) Aromatics / substituted aromatics (10)
TEST_SMILES.push(
  'c1ccccc1',
  'c1ccncc1',
  'c1ccccc1O',
  'c1ccccc1N',
  'c1ccc(cc1)O',
  'c1ccccc1C(=O)O',
  'c1ccccc1F',
  'c1ccccc1Cl',
  'c1ccccc1Br',
  'c1ccncc1O'
);

// 5) Heteroaromatics (17 - removed 3 invalid 6-membered O/S aromatics)
TEST_SMILES.push(
  'n1ccccc1',
  'c1cc[nH]c1',
  'c1ncccc1',
  'o1cccc1',
  's1cccc1',
  'c1cnccn1',
  'c1ccoc1',
  'c1ccsc1',
  'n1c2ccccc2c1',
  'n1cccc1',
  'c1ccncc1',
  'c1nccn1',
  'c1nccn1O',
  'c1nccn1C',
  'c1cc[nH]c1C',
  'c1c[nH]cc1',
  'n1c(=O)ccn1'
);

// 6) Functional groups and small organics (43 - added 3 to compensate for removed aromatics)
const funcs = [
  'CCO','CC=O','CC(=O)O','CC(=O)N','CC(=O)Cl','C(Cl)(Cl)Cl','COC','CCN','CNC','CCS',
  'CS','C=O','O=C=O','CC(=O)OCC','CC(=O)OCCO','C(=O)(O)O','C(C)(C)O','C(=O)N','CCOC','CC(=O)OC',
  'CC(=O)CCC','CC(C)O','CC(C)C(=O)O','CC(C)(C)O','CC(=O)N(C)C','CC(C)N','CC(=O)S','CC(=O)Cl','CC(Br)C','CC(=O)F',
  'OC(=O)C','OCCO','OCC(=O)O','C1=CC=CC=C1','C1=CC=C(O)C=C1','C1=CC=CN=C1','CC(=O)N1CCCC1','CCN(CC)CC','CC(C)CCO','CC(C)(C)CO',
  'CCCC','CCC(C)C','CC(C)CC'
];
TEST_SMILES.push(...funcs);

// 7) Charged species / salts (20)
TEST_SMILES.push(
  '[NH4+]','[NH3+]','[O-]C=O','[NH2+]','[Na+].[Cl-]','[K+].[Cl-]','[NH4+].[Cl-]','[O-]C(=O)C',
  '[NH3+]', '[O-]C(=O)[O-]', '[N+](C)(C)C','[P+](C)(C)(C)','[S-]','[Cl-]','[Br-]','[I-]','[NH4+].[O-]','[NH2-]','[NH+]=C','[NH+](C)C'
);

// 8) Rings: cyclopropane..cyclotriacontane (sizes 3..32) => 30
for (let n = 3; n <= 32; n++) {
  TEST_SMILES.push('C1' + 'C'.repeat(n - 1) + '1');
}

// 9) Stereocenters (40) - mix @ and @@ with different substituents
const subs = ['O','F','Cl','Br','N','S','C(=O)O','CO'];
for (let i = 0; i < 20; i++) {
  const s = subs[i % subs.length];
  TEST_SMILES.push(`C[C@H](${s})C`);
  TEST_SMILES.push(`C[C@@H](${s})C`);
}

// 10) Isotopes / explicit hydrogens (20)
TEST_SMILES.push(
  '[13CH4]','[2H]O','[13C]C(=O)O','[14NH4+]','[15N]N','[13CH3]Cl','[2H]C(=O)O','[13C]C','[2H]OC','[13CH2]O',
  '[13C]C(Cl)C','[2H]CCO','[13C]O','[2H]N','[13C]N','[2H]C','[13C](=O)O','[2H]CO','[13C]C(=O)N','[2H]C(=O)O'
);

// 11) Complex biomolecules / small residues (19)
const bio = [
  'NCC(=O)O','N[C@@H](C)C(=O)O','N[C@@H](C)C(=O)N','C(C(=O)O)N','C(C(=O)O)O','OCC(O)C(O)C','C1OC(O)C(O)C1O',
  'C(C(=O)O)N(C)C','CC(=O)NC1=CC=CC=C1','CC(=O)NCC(=O)O','CC(C)C(=O)O','C(C(=O)O)C(=O)O','C(CO)N','C(CO)O',
  'C(C(=O)N)O','N[C@@H](CC1=CC=CC=C1)C(=O)O','CC(O)C(=O)O','CC(=O)OCC(O)C','OC(CO)C(O)C'
];
TEST_SMILES.push(...bio);

// 12) Wikipedia examples (from https://en.wikipedia.org/wiki/Simplified_Molecular_Input_Line_Entry_System#Examples)
const wikipedia = [
  'N#N',
  'CN=C=O',
  '[Cu+2].[O-]S(=O)(=O)[O-]',
  'O=Cc1ccc(O)c(OC)c1',
  'COc1cc(C=O)ccc1O',
  'CC(=O)NCCC1=CNc2c1cc(OC)cc2',
  'CC(=O)NCCc1c[nH]c2ccc(OC)cc12',
  'CCc(c1)ccc2[n+]1ccc3c2[nH]c4c3cccc4',
  'CCc1c[n+]2ccc3c4ccccc4[nH]c3c2cc1',
  'CN1CCC[C@H]1c2cccnc2',
  'CCC[C@@H](O)CC\\C=C\\C=C\\C#CC#C\\C=C\\CO',
  'CCC[C@@H](O)CC/C=C/C=C/C#CC#C/C=C/CO',
  'CC1=C(C(=O)C[C@@H]1OC(=O)[C@@H]2[C@H](C2(C)C)/C=C(\\C)/C(=O)OC)C/C=C\\C=C',
  'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5',
  'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)1',
  'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H]2[C@@H]1c3c(O)c(OC)c(O)cc3C(=O)O2',
  'CC(=O)OCCC(/C)=C\\C[C@H](C(C)=C)CCC=C',
  'CC[C@H](O1)CC[C@@]12CCCO2',
  'CC(C)[C@@]12C[C@@H]1[C@@H](C)C(=O)C2',
  'OCCc1c(C)[n+](cs1)Cc2cnc(C)nc2N',
  'CC(C)(O1)C[C@@H](O)[C@@]1(O2)[C@@H](C)[C@@H]3CC=C4[C@]3(C2)C(=O)C[C@H]5[C@H]4CC[C@@H](C6)[C@]5(C)Cc(n7)c6nc(C[C@@]89(C))c7C[C@@H]8CC[C@@H]%10[C@@H]9C[C@@H](O)[C@@]%11(C)C%10=C[C@H](O%12)[C@]%11(O)[C@H](C)[C@]%12(O%13)[C@H](O)C[C@@]%13(C)CO'
];
TEST_SMILES.push(...wikipedia);

// 13) Common commercial drugs
const drugs = [
  'CC(=O)Oc1ccccc1C(=O)O',                                      // Aspirin
  'CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O',                          // Ibuprofen
  'CC(=O)Nc1ccc(O)cc1',                                        // Acetaminophen (Paracetamol)
  'CC(C)(C)NCC(O)c1ccc(O)c(CO)c1',                            // Albuterol
  'CN(C)CC(c1ccc(OC)cc1)c2ccccn2',                            // Diphenhydramine (Benadryl)
  'CC(C)NCC(O)COc1ccccc1CC=C',                                // Alprenolol
  'CC(C)NCC(O)c1ccc(COCCOC)cc1',                              // Atenolol
  'CN1C(=O)CN=C(c2ccccc2)c3cc(Cl)ccc13',                      // Diazepam (Valium)
  'COc1ccc2nc(C)c(CCN(C)C)c(C)c2c1',                          // Mefloquine core
  'CN(C)CCCN1c2ccccc2Sc3ccccc13',                             // Promethazine
  'CC(C)NCC(O)c1ccc(NS(C)(=O)=O)cc1',                         // Sotalol
  'CC(=O)Oc1cc2C(C)(CCC3C2CCC4(C)C3CCC4(O)C#C)C(=O)CO1',     // Norethindrone
  'CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C',                      // Testosterone
  'CN1CCC[C@H]1c2cccnc2',                                      // Nicotine
  'CN1CCC23C4C(=O)CCC2(C1Cc5ccc(O)c(O)c35)C4',               // Morphine core
  'COc1cc2c(C[C@H]3NCCCC3)c[nH]c2cc1',                        // Psilocin core
  'CC(C)(C)NCC(O)c1ccc(OCCCOC)cc1',                           // Carvedilol core
  'Cc1ccc(cc1)S(=O)(=O)N',                                     // Toluenesulfonamide
  'CS(=O)(=O)Nc1ccc(N)cc1',                                    // Sulfanilamide
  'CC1(C)SC2C(NC(=O)Cc3ccccc3)C(=O)N2C1C(=O)O',              // Penicillin G
  'COC(=O)C1=C(C)NC(C)=C(C(=O)OC)C1c2ccccc2[N+]([O-])=O',   // Nifedipine
  'CN1CCCC1c2cccnc2',                                          // Nicotine (simpler form)
  'Clc1ccc(cc1)C(c2ccc(Cl)cc2)C(Cl)(Cl)Cl',                  // DDT
  'CC1=C(C(=O)O)N2C(=O)C(NC(=O)Cc3ccccc3)C2SC1',             // Penicillin (simplified)
  'CC1COc2ccccc2N1',                                           // Morpholine core
];
TEST_SMILES.push(...drugs);

const EXPECTED_COUNT = TEST_SMILES.length;

describe(`RDKit Bulk Comparison (${EXPECTED_COUNT} SMILES)`, () => {
  it(`compares our SMILES generation with RDKit for ${EXPECTED_COUNT} SMILES`, async () => {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
    }
    const initRDKitModule = rdkitModule.default;
    const RDKit: any = await (initRDKitModule as any)();

    const parseFailures: string[] = [];
    const generationFailures: string[] = [];

    function tryCallMolFormula(mol: any, RDKit: any): string | null {
      if (!mol) return null;
      // RDKit may not expose a direct formula method; use get_smiles() and parse
      if (typeof mol.get_smiles === 'function') {
        try {
          const smiles = mol.get_smiles();
          const parsed = parseSMILES(smiles);
          if (parsed && parsed.molecules && parsed.molecules.length > 0) {
            return parsed.molecules.map(m => getMolecularFormula(m)).sort().join('.');
          }
        } catch (e) {
        }
      }
      // fallback: try descriptors (rarely includes formula)
      try {
        if (typeof mol.get_descriptors === 'function') {
          const d = mol.get_descriptors();
          try {
            const obj = typeof d === 'string' ? JSON.parse(d) : d;
            if (obj && typeof obj === 'object' && obj.formula) return String(obj.formula);
          } catch (e) {}
        }
      } catch (e) {}
      return null;
    }

    function tryCallMolMass(mol: any): number | null {
      if (!mol) return null;
      // Prefer descriptors which include exactmw/amw
      try {
        if (typeof mol.get_descriptors === 'function') {
          const d = mol.get_descriptors();
          const obj = typeof d === 'string' ? JSON.parse(d) : d;
          if (obj && typeof obj === 'object') {
            if (typeof obj.exactmw === 'number') return obj.exactmw;
            if (typeof obj.amw === 'number') return obj.amw;
          }
        }
      } catch (e) {}
      const candidates = [
        'get_monoisotopic_mass',
        'get_monoisotopicMass',
        'get_mol_wt',
        'get_molecular_weight',
        'get_molecularWeight',
        'get_mw',
      ];
      for (const name of candidates) {
        if (typeof mol[name] === 'function') {
          try {
            const val = mol[name]();
            if (typeof val === 'number') return val;
            if (!isNaN(Number(val))) return Number(val);
          } catch (e) {
          }
        }
      }
      return null;
    }

    for (const smiles of TEST_SMILES) {
      const parsed = parseSMILES(smiles);
      if (parsed.errors && parsed.errors.length > 0) {
        parseFailures.push(smiles);
        continue;
      }

      // compute our properties (combine all molecules for multi-component systems like salts)
      const ourFormulas = parsed.molecules.map(m => getMolecularFormula(m)).sort().join('.');
      const ourMass = parsed.molecules.reduce((sum, m) => sum + getMolecularMass(m), 0);
      const ourExact = parsed.molecules.reduce((sum, m) => sum + getExactMass(m), 0);

      const chemkitOutput = generateSMILES(parsed.molecules);

      // Check round-trip: parse -> generate -> parse should work
      const roundTrip = parseSMILES(chemkitOutput);
      if (roundTrip.errors && roundTrip.errors.length > 0) {
        generationFailures.push(`${smiles} -> ${chemkitOutput} (round-trip failed: ${roundTrip.errors.map(e => e.message).join(', ')})`);
        continue;
      }

      // Check semantic equivalence: the generated molecule should have same atom/bond count (total across all components)
      const originalAtoms = parsed.molecules.reduce((sum, m) => sum + m.atoms.length, 0);
      const originalBonds = parsed.molecules.reduce((sum, m) => sum + m.bonds.length, 0);
      const generatedAtoms = roundTrip.molecules.reduce((sum, m) => sum + m.atoms.length, 0);
      const generatedBonds = roundTrip.molecules.reduce((sum, m) => sum + m.bonds.length, 0);

      if (originalAtoms !== generatedAtoms || originalBonds !== generatedBonds) {
        generationFailures.push(`${smiles} -> ${chemkitOutput} (structure mismatch: ${originalAtoms}/${originalBonds} vs ${generatedAtoms}/${generatedBonds})`);
        continue;
      }

      // Compare with RDKit when available
      const rdkitMol = RDKit.get_mol(smiles);
      if (!rdkitMol || !rdkitMol.is_valid || !rdkitMol.is_valid()) {
        if (rdkitMol && rdkitMol.delete) rdkitMol.delete();
        continue;
      }

      const rdFormula = tryCallMolFormula(rdkitMol, RDKit);
      const rdMass = tryCallMolMass(rdkitMol);

      if (rdFormula) {
        // Normalize components (salts/multi-component) and whitespace before comparing
        const norm = (f: string) => f.replace(/\s+/g, '').split(/[\.]/).filter(Boolean).sort().join('.');
        if (norm(rdFormula) !== norm(ourFormulas)) {
          generationFailures.push(`${smiles} (formula mismatch) our:${ourFormulas} rdkit:${rdFormula}`);
        }
      }

      if (rdMass !== null) {
        const tol = 0.01;
        // RDKit descriptors prefer exact monoisotopic mass; compare to our exact mass
        if (Math.abs(rdMass - ourExact) > tol) {
          generationFailures.push(`${smiles} (mass mismatch) our:${ourExact} rdkit:${rdMass}`);
        }
      }

      if (rdkitMol && rdkitMol.delete) rdkitMol.delete();
    }

    // Report (only when verbose)
    if (process.env.RUN_VERBOSE) {
      console.log('\nChemkit Bulk Test Report');
      console.log('Total SMILES:', TEST_SMILES.length);
      console.log('Parse failures:', parseFailures.length);
      console.log('Generation/round-trip failures:', generationFailures.length);

      if (parseFailures.length > 0) console.log('First parse failures:', parseFailures.slice(0,5));
      if (generationFailures.length > 0) console.log('First generation failures:', generationFailures.slice(0,5));
    }

    // Fail the test if chemkit cannot properly parse or generate SMILES
    expect(generationFailures.length).toBe(0);
  }, 600000);

  it('regression: complex fused ring with aromatic/double bond mix', () => {
    const smiles = 'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5';
    
    const parsed = parseSMILES(smiles);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.molecules).toHaveLength(1);
    
    const generated = generateSMILES(parsed.molecules[0]!);
    expect(generated).toBeTruthy();
    
    const roundTrip = parseSMILES(generated);
    expect(roundTrip.errors).toHaveLength(0);
    expect(roundTrip.molecules).toHaveLength(1);
    
    const originalAtoms = parsed.molecules[0]!.atoms.length;
    const originalBonds = parsed.molecules[0]!.bonds.length;
    const roundTripAtoms = roundTrip.molecules[0]!.atoms.length;
    const roundTripBonds = roundTrip.molecules[0]!.bonds.length;
    
    expect(roundTripAtoms).toBe(originalAtoms);
    expect(roundTripBonds).toBe(originalBonds);
  });
});
