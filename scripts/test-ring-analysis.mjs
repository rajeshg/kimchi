import { parseSMILES } from '../index.ts';
import { findSSSR, analyzeRings, classifyRingSystems } from '../src/utils/ring-analysis.ts';

// Test molecules
const testMolecules = [
  { name: 'benzene', smiles: 'c1ccccc1' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1' },
  { name: 'anthracene', smiles: 'c1ccc2cc3ccccc3cc2c1' },
  { name: 'phenanthrene', smiles: 'c1ccc2c(c1)ccc3ccccc23' },
  { name: 'adamantane', smiles: 'C1C2CC3CC1CC(C2)C3' },
  { name: 'cubane', smiles: 'C12C3C4C1C5C4C3C25' },
  { name: 'spiro[5.5]undecane', smiles: 'C1CCC2(C1)CCCCC2' },
  { name: 'steroid-like', smiles: 'C1CCC2C3CCC4CCCCC4C3CCC12' },
];

for (const { name, smiles } of testMolecules) {
  console.log(`\n=== ${name} (${smiles}) ===`);
  try {
    const result = parseSMILES(smiles);
    const mol = result.molecules[0];
    if (!mol) {
      console.log('Failed to parse');
      continue;
    }

    const sssr = findSSSR(mol.atoms, mol.bonds);
    const ringInfo = analyzeRings(mol);
    const classification = classifyRingSystems(mol.atoms, mol.bonds);

    console.log(`Atoms: ${mol.atoms.length}, Bonds: ${mol.bonds.length}`);
    console.log(`SSSR rings: ${sssr.length}`);
    console.log(`Ring atoms: ${ringInfo.ringAtomSet.size}`);
    console.log(`Classification: isolated=${classification.isolated.length}, fused=${classification.fused.length}, spiro=${classification.spiro.length}, bridged=${classification.bridged.length}`);

    // Check rank: M - N + C = number of rings
    const M = mol.bonds.length;
    const N = mol.atoms.length;
    const C = 1; // assuming connected
    const expectedRank = M - N + C;
    console.log(`Expected rank (M-N+C): ${expectedRank}, Actual SSSR: ${sssr.length}`);

    if (sssr.length !== expectedRank) {
      console.log('WARNING: SSSR count does not match expected rank!');
    }

    // Show ring sizes
    const ringSizes = sssr.map(r => r.length).sort((a,b) => a-b);
    console.log(`Ring sizes: ${ringSizes.join(', ')}`);

    // Check ring membership for [Rn] primitives
    const atomRingCounts = new Map();
    for (const ring of sssr) {
      for (const atomId of ring) {
        atomRingCounts.set(atomId, (atomRingCounts.get(atomId) || 0) + 1);
      }
    }
    const ringMembershipCounts = Array.from(atomRingCounts.values()).sort((a, b) => b - a);
    console.log(`Ring membership counts: ${ringMembershipCounts.join(', ')}`);

  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}