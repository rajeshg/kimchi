import { describe, it, expect } from 'bun:test';
import { parseSMILES, generateSMILES } from 'index';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('RDKit 10k SMILES Comparison', () => {
  // Gate long-running RDKit tests behind RUN_RDKIT_BULK
  const runFull = !!process.env.RUN_RDKIT_BULK;
  if (!runFull) {
    it('skipped (set RUN_RDKIT_BULK=1 to run)', () => {
      // Long-running RDKit 10k test skipped by default
    });
    return;
  }

  it('validates 10k SMILES against RDKit', async () => {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
    }
    const initRDKitModule = rdkitModule.default;
    const RDKit: any = await (initRDKitModule as any)();

    const filePath = join(__dirname, 'smiles-10k.txt');
    const content = readFileSync(filePath, 'utf-8');
    const smilesLines = content.trim().split('\n').filter(line => line.trim());

    if (process.env.RUN_VERBOSE) {
      console.log(`\nLoaded ${smilesLines.length} SMILES from ${filePath}`);
    }

    const stats = {
      total: smilesLines.length,
      opencodeParseFailures: 0,
      rdkitParseFailures: 0,
      atomCountMismatches: 0,
      bondCountMismatches: 0,
      roundTripFailures: 0,
      bothFailed: 0,
      success: 0
    };

    const opencodeFailures: string[] = [];
    const rdkitFailures: string[] = [];
    const mismatchDetails: string[] = [];
    const roundTripFailures: string[] = [];

    for (let i = 0; i < smilesLines.length; i++) {
      const smiles = smilesLines[i]!.trim();
      if (!smiles) continue;

      let rdkitMol: any = null;
      let rdkitFailed = false;
      let rdkitAtoms = 0;
      let rdkitBonds = 0;

      try {
        rdkitMol = RDKit.get_mol(smiles);
        if (!rdkitMol || !rdkitMol.is_valid()) {
          rdkitFailed = true;
          stats.rdkitParseFailures++;
          if (rdkitFailures.length < 10) rdkitFailures.push(smiles);
        } else {
          rdkitAtoms = rdkitMol.get_num_atoms();
          rdkitBonds = rdkitMol.get_num_bonds();
        }
      } catch (e) {
        rdkitFailed = true;
        stats.rdkitParseFailures++;
        if (rdkitFailures.length < 10) rdkitFailures.push(smiles);
      } finally {
        if (rdkitMol && rdkitMol.delete) rdkitMol.delete();
      }

      const parsed = parseSMILES(smiles);
      const opencodeFailed = parsed.errors && parsed.errors.length > 0;

      if (opencodeFailed) {
        stats.opencodeParseFailures++;
        if (opencodeFailures.length < 10) {
          opencodeFailures.push(`${smiles} (${parsed.errors?.map(e => e.message).join(', ')})`);
        }
      }

      if (rdkitFailed && opencodeFailed) {
        stats.bothFailed++;
        continue;
      }

      if (opencodeFailed) {
        continue;
      }

       const opencodeAtoms = parsed.molecules.reduce((sum, mol) => sum + mol.atoms.length, 0);
       const opencodeBonds = parsed.molecules.reduce((sum, mol) => sum + mol.bonds.length, 0);

      if (!rdkitFailed) {
        if (opencodeAtoms !== rdkitAtoms) {
          stats.atomCountMismatches++;
          if (mismatchDetails.length < 10) {
            mismatchDetails.push(`${smiles}: atoms ${opencodeAtoms} vs ${rdkitAtoms}`);
          }
        }
        if (opencodeBonds !== rdkitBonds) {
          stats.bondCountMismatches++;
          if (mismatchDetails.length < 10 && opencodeAtoms === rdkitAtoms) {
            mismatchDetails.push(`${smiles}: bonds ${opencodeBonds} vs ${rdkitBonds}`);
          }
        }
      }

       const generated = generateSMILES(parsed.molecules);
       const roundTrip = parseSMILES(generated);

       if (roundTrip.errors && roundTrip.errors.length > 0) {
         stats.roundTripFailures++;
         if (roundTripFailures.length < 10) {
           roundTripFailures.push(`${smiles} -> ${generated}`);
         }
       } else {
         const rtAtoms = roundTrip.molecules.reduce((sum, mol) => sum + mol.atoms.length, 0);
         const rtBonds = roundTrip.molecules.reduce((sum, mol) => sum + mol.bonds.length, 0);

         if (rtAtoms !== opencodeAtoms || rtBonds !== opencodeBonds) {
           stats.roundTripFailures++;
           if (roundTripFailures.length < 10) {
             roundTripFailures.push(`${smiles} -> ${generated} (${opencodeAtoms}/${opencodeBonds} -> ${rtAtoms}/${rtBonds})`);
           }
         }
       }

      if (!opencodeFailed && !rdkitFailed && 
          opencodeAtoms === rdkitAtoms && 
          opencodeBonds === rdkitBonds &&
          (!roundTrip.errors || roundTrip.errors.length === 0)) {
        stats.success++;
      }

      if ((i + 1) % 10000 === 0) {
        if (process.env.RUN_VERBOSE) console.log(`Processed ${i + 1}/${stats.total}...`);
      }
    }

    const successRate = stats.success / stats.total;

    if (process.env.RUN_VERBOSE) {
      console.log('\n=== RDKit 10k Validation Results ===');
      console.log(`Total SMILES: ${stats.total}`);
      console.log(`Success (full parity): ${stats.success} (${(stats.success/stats.total*100).toFixed(2)}%)`);
      console.log(`opencode parse failures: ${stats.opencodeParseFailures} (${(stats.opencodeParseFailures/stats.total*100).toFixed(2)}%)`);
      console.log(`RDKit parse failures: ${stats.rdkitParseFailures} (${(stats.rdkitParseFailures/stats.total*100).toFixed(2)}%)`);
      console.log(`Both failed: ${stats.bothFailed} (${(stats.bothFailed/stats.total*100).toFixed(2)}%)`);
      console.log(`Atom count mismatches: ${stats.atomCountMismatches} (${(stats.atomCountMismatches/stats.total*100).toFixed(2)}%)`);
      console.log(`Bond count mismatches: ${stats.bondCountMismatches} (${(stats.bondCountMismatches/stats.total*100).toFixed(2)}%)`);
      console.log(`Round-trip failures: ${stats.roundTripFailures} (${(stats.roundTripFailures/stats.total*100).toFixed(2)}%)`);

      if (opencodeFailures.length > 0) {
        console.log('\nFirst opencode parse failures:');
        opencodeFailures.forEach(f => console.log(`  ${f}`));
      }

      if (rdkitFailures.length > 0 && stats.rdkitParseFailures > stats.bothFailed) {
        console.log('\nFirst RDKit-only parse failures (opencode succeeded):');
        rdkitFailures.slice(0, 5).forEach(f => console.log(`  ${f}`));
      }

      if (mismatchDetails.length > 0) {
        console.log('\nFirst atom/bond count mismatches:');
        mismatchDetails.forEach(m => console.log(`  ${m}`));
      }

      if (roundTripFailures.length > 0) {
        console.log('\nFirst round-trip failures:');
        roundTripFailures.forEach(f => console.log(`  ${f}`));
      }

      console.log(`\nOverall Success Rate: ${(successRate * 100).toFixed(2)}%`);
    }

    expect(successRate).toBeGreaterThan(0.95);
  }, 600000);
});
