import { initializeRDKit, getSubstructMatches } from "test/smarts/rdkit-comparison/rdkit-smarts-api";
import { parseSMILES, parseSMARTS, matchSMARTS } from "index";
import { findSSSR } from "src/utils/ring-analysis";

const RDKit = await initializeRDKit();

const testMolecules = [
  { name: "Naphthalene", smiles: "c1ccc2ccccc2c1", expectedSSSR: 2 },
  { name: "Bicyclo[2.2.1]heptane", smiles: "C1CC2CCC1C2", expectedSSSR: 2 },
  { name: "Adamantane", smiles: "C1CCC2CC3CCC(C1)C32", expectedSSSR: 3 },
  { name: "Cubane", smiles: "C12C3C4C1C5C2C3C45", expectedSSSR: 5 },
  { name: "Basketane", smiles: "C1C2CC3CC1CC(C2)C3", expectedSSSR: 3 },
];

for (const { name, smiles, expectedSSSR } of testMolecules) {
  console.log(`\n=== ${name} (${smiles}) ===`);
  
  const result = parseSMILES(smiles);
  const mol = result.molecules[0]!;
  const sssrSize = mol.bonds.length - mol.atoms.length + 1;
  const sssrRings = findSSSR(mol.atoms, mol.bonds);
  
  console.log(`Expected SSSR: ${expectedSSSR}, Computed: ${sssrSize}, Found: ${sssrRings.length}`);
  
  const rdkitR3 = getSubstructMatches(RDKit, smiles, "[R3]");
  const smartsResult = parseSMARTS("[R3]");
  const kimchiR3 = matchSMARTS(smartsResult.pattern!, mol, { uniqueMatches: true });
  
  console.log(`[R3] matches - RDKit: ${rdkitR3.matches.length}, kimchi: ${kimchiR3.matches.length}`);
  
    if (rdkitR3.matches.length !== kimchiR3.matches.length) {
      const rdkitAtoms = rdkitR3.matches.map((m: any) => m?.[0]).filter((x: any) => x != null).sort((a: number, b: number) => a - b);
      const kimchiAtoms = kimchiR3.matches.map(m => m.atoms?.[0]?.moleculeIndex ?? -1).filter(x => x >= 0).sort((a, b) => a - b);
      console.log(`  RDKit atoms: ${rdkitAtoms}`);
      console.log(`  kimchi atoms: ${kimchiAtoms}`);
    }
}
