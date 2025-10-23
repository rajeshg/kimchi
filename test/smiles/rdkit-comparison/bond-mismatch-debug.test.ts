import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';

// The 11 SMILES that showed bond-count mismatches in the last run
const failing = [
  "CC(C)(C)OC(=O)CCC(CO)NC(=O)C1=CC=CC(=C1)CNC(=O)C23CC4C5C(C2ON(C3C(=O)O4)CC6=CC=C(C=C6)C=CC7CCC8C(C7)O8)OC9(O5)CC1=CC=CC=C1C9",
  "CN(CC#CC1=CC2=C(C=C1)NC(=O)C23C(C4C(=O)OC(C(N4C3C5=CC=C(C=C5)O)C6=CC=CC=C6)C7=CC=CC=C7)C(=O)N8CCC9=CC(=C(C=C9C8)OC)OC)CC1=CC=CC=C1",
  "C1=CC=C(C=C1)C2C(OC(=O)C3N2C(C4(C3C(=O)NCC(C5=CC=CC=C5)O)C6=C(C=CC(=C6)C#CCN7C8=CC=CC=C8N=N7)NC4=O)C9=CC=C(C=C9)O)C1=CC=CC=C1",
  "C1COC(C(OCC2=CC(=CC(=C2[O-])COC(C(OCCO1)C3=CC=CC=C3)C4=CC=CC=C4)[N+]5=C(C=C(C=C5C6=CC=CC=C6)C7=CC=CC=C7)C8=CC=CC=C8)C9=CC=CC=C9)C1=CC=CC=C1",
  "CC1(CC2C1CCC3(C(O3)CCC2=CC4=CC=CC=C4CN5C6C(=O)OC7CC6(C(O5)C8C7OC9(O8)CC1=CC=CC=C1C9)C(=O)N1CCCC1C(=O)NCCO)C)C",
  "COC1=CC(=C(C=C1)OC)C=CC2=CC=C(C=C2)N3C(=O)C4CC=C5C(C4C3=O)CC6C(=O)N(C(=O)C6(C5C7=C(C=C(C=C7)OCC8=CC=CC=C8)O)C9=CC=C(C=C9)Cl)NC1=CC=C(C=C1)F",
  "CC1C(C(C(C(O1)OC2C(C(COC2OC(=O)C34CCC(CC3C5=CCC6C7(CCC(C(C7CCC6(C5(CC4)C)C)(C)C)OC8C(C(C(C(O8)CO)O)O)OC9C(C(C(C(O9)CO)O)O)O)C)(C)C)O)O)O)O)OC1C(C(C(CO1)O)OC1C(C(C(CO1)O)O)O)O",
  "CC1(CC2C1CCC3(C(O3)CCC2=CC4=CC=C(C=C4)CN5C6C(=O)OC7CC6(C(O5)C8C7OC9(O8)CC1=CC=CC=C1C9)C(=O)NCCC(=O)NC(CCC(=O)OC(C)(C)C)CO)C)C",
  "C1CCC(CC1)C23CC(C2)(C3)C4=CC(=CC(=C4)C56CC(C5)(C6)C7CCCCC7)C89CC(C8)(C9)C1CCCCC1",
  "C1C=C2C(CC3C(=O)C(=CC(=O)C3(C2C4=C(C=CC5=CC=CC=C54)O)C6=CC=CC=C6)C7=CC=CC=C7)C8C1C(=O)N(C8=O)C9=CC=C(C=C9)NC1=CC=CC=C1"
];

describe('Bond mismatch debug', () => {
  it('prints openchem vs RDKit bond counts and openchem bond lists', async () => {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
    }
    const initRDKitModule = rdkitModule.default;
    const RDKit: any = await (initRDKitModule as any)();

    for (const s of failing) {
      const parsed = parseSMILES(s);
      if (parsed.errors && parsed.errors.length) {
        // suppressed detailed openchem parse errors in debug run
        continue;
      }
      const openchemAtoms = parsed.molecules.reduce((sum, mol) => sum + mol.atoms.length, 0);
      const openchemBonds = parsed.molecules.reduce((sum, mol) => sum + mol.bonds.length, 0);
      const bondList: string[] = [];
      for (const mol of parsed.molecules) {
        for (const b of mol.bonds) {
          bondList.push(`${b.atom1}-${b.atom2}:${b.type}`);
        }
      }

      let rdkitAtoms = 0;
      let rdkitBonds = 0;
      try {
        const mol = RDKit.get_mol(s);
        if (mol && mol.is_valid && mol.is_valid()) {
          rdkitAtoms = mol.get_num_atoms();
          rdkitBonds = mol.get_num_bonds();
        }
        if (mol && mol.delete) mol.delete();
      } catch (_e) {
        // RDKit parsing failed; treat as zero counts
      }

      if (openchemBonds !== rdkitBonds) {
        // Only print concise summary for mismatches when verbose
        if (process.env.RUN_VERBOSE) {
          console.log(`${s} -> openchem ${openchemAtoms}/${openchemBonds} vs RDKit ${rdkitAtoms}/${rdkitBonds}`);
        }
      }
      // continue to next without failing the test to capture all cases
    }

  }, 120000);
});
