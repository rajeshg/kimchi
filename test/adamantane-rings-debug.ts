import { initializeRDKit, getSubstructMatches } from './smarts/rdkit-comparison/rdkit-smarts-api';
import { parseSMILES, parseSMARTS, matchSMARTS } from 'index';

console.log('=== ADAMANTANE RING ANALYSIS ===\n');

const smiles = 'C1C2CC3CC1CC(C2)C3';
console.log('SMILES:', smiles);
console.log('Note: This is adamantane (10 carbons, 12 bonds)\n');

console.log('--- kimchi Analysis ---');
const molResult = parseSMILES(smiles);
const mol = molResult.molecules[0]!;
console.log('Atoms:', mol.atoms.length);
console.log('Bonds:', mol.bonds.length);
console.log('SSSR rings:', mol.rings?.length);
mol.rings?.forEach((ring, i) => {
  console.log(`  Ring ${i}:`, ring);
});

console.log('\nRing membership (kimchi):');
mol.atoms.forEach((atom, i) => {
  const count = mol.rings?.filter(r => r.includes(atom.id)).length || 0;
  console.log(`  Atom ${i}: in ${count} SSSR rings`);
});

const smartsResult = parseSMARTS('[R3]');
const result = matchSMARTS(smartsResult.pattern!, mol, { uniqueMatches: true });
console.log('\n[R3] matches (kimchi):', result.matches.map(m => m.atoms.map(a => a.moleculeIndex)));

console.log('\n--- RDKit Analysis ---');
const RDKit = await initializeRDKit();
const r3Matches = getSubstructMatches(RDKit, smiles, '[R3]');
console.log('[R3] matches (RDKit):', r3Matches.matches);

console.log('\nTesting individual atoms with RDKit:');
for (let i = 0; i < 10; i++) {
  const r0 = getSubstructMatches(RDKit, smiles, `[R0]`);
  const r1 = getSubstructMatches(RDKit, smiles, `[R1]`);
  const r2 = getSubstructMatches(RDKit, smiles, `[R2]`);
  const r3 = getSubstructMatches(RDKit, smiles, `[R3]`);
  const r4 = getSubstructMatches(RDKit, smiles, `[R4]`);
  
  console.log('[R0] count:', r0.matches.length);
  console.log('[R1] count:', r1.matches.length);
  console.log('[R2] count:', r2.matches.length);
  console.log('[R3] count:', r3.matches.length);
  console.log('[R4] count:', r4.matches.length);
  break;
}

console.log('\n=== BASKETANE RING ANALYSIS ===\n');
const basketaneSmiles = 'C12C3C4C5C1C6C2C5C3C46';
console.log('SMILES:', basketaneSmiles);
console.log('Note: This is actual basketane (10 carbons)\n');

console.log('--- kimchi Analysis ---');
const basketaneMolResult = parseSMILES(basketaneSmiles);
const basketaneMol = basketaneMolResult.molecules[0]!;
console.log('Atoms:', basketaneMol.atoms.length);
console.log('Bonds:', basketaneMol.bonds.length);
console.log('SSSR rings:', basketaneMol.rings?.length);
basketaneMol.rings?.forEach((ring, i) => {
  console.log(`  Ring ${i}:`, ring);
});

console.log('\nRing membership (kimchi):');
basketaneMol.atoms.forEach((atom, i) => {
  const count = basketaneMol.rings?.filter(r => r.includes(atom.id)).length || 0;
  console.log(`  Atom ${i}: in ${count} SSSR rings`);
});

const basketaneResult = matchSMARTS(smartsResult.pattern!, basketaneMol, { uniqueMatches: true });
console.log('\n[R3] matches (kimchi):', basketaneResult.matches.map(m => m.atoms.map(a => a.moleculeIndex)));

const basketaneR3 = getSubstructMatches(RDKit, basketaneSmiles, '[R3]');
console.log('[R3] matches (RDKit):', basketaneR3.matches);
