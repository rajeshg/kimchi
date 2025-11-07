import { parseSMILES } from "index";
import { RuleEngine } from "src/iupac-engine/engine";

const testCases = [
  // Mismatch #3 - phosphorus compound giving wrong result
  { smiles: "CCCP(=O)(OC1CCCCCCC1)SCCN(C)C", expected: "2-[cyclooctyloxy(propyl)phosphoryl]sulfanyl-N,N-dimethylethanamine" },
  
  // Mismatch #7 - borane compound (minor difference)
  { smiles: "B(CC)(CC)C(=C(CC)COC)CC", expected: "diethyl-[4-(methoxymethyl)hex-3-en-3-yl]borane" },
  
  // Mismatch #10 - formamide getting simplified
  { smiles: "C(CN(CO)C=O)N(CO)C=O", expected: "N-[2-[formyl(hydroxymethyl)amino]ethyl]-N-(hydroxymethyl)formamide" },
  
  // Mismatch #11 - thiazole
  { smiles: "C=C1CN=C(S1)NC2=CC(=C(C=C2)F)Cl", expected: "N-(3-chloro-4-fluorophenyl)-5-methylidene-4H-1,3-thiazol-2-amine" },
];

const engine = new RuleEngine();

testCases.forEach((test, i) => {
  console.log(`\n=== Test #${i + 1} ===`);
  console.log(`SMILES: ${test.smiles}`);
  const result = parseSMILES(test.smiles);
  const mol = result.molecules[0];
  if (!mol) {
    console.log("ERROR: Failed to parse");
    return;
  }
  const iupacResult = engine.generateName(mol);
  console.log(`Generated: ${iupacResult.name}`);
  console.log(`Expected:  ${test.expected}`);
  console.log(`Match: ${iupacResult.name.toLowerCase() === test.expected.toLowerCase()}`);
});
