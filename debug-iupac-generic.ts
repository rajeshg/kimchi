import { parseSMILES } from "index";
import { IUPACNamer } from "src/iupac-engine";

// Generic IUPAC naming debug script
// Usage:
//   bun debug-iupac-generic.ts "SMILES" ["Expected Name"] ["Description"]
//   or modify the testCases array below

interface TestCase {
  smiles: string;
  expected?: string;
  description: string;
}

// Parse command-line arguments
const args = process.argv.slice(2);
let testCases: TestCase[] = [];

if (args.length > 0) {
  // Use command-line arguments
  const smiles = args[0]!;
  const expected = args[1];
  const description = args[2] || "command-line test";

  testCases = [
    {
      smiles,
      expected,
      description,
    },
  ];
} else {
  // Use default test cases
  testCases = [
    {
      smiles: "CC(C)Cc1ccccc1",
      expected: "(2-methylpropyl)benzene",
      description: "benzene with alkyl substituent",
    },
    // Add more test cases here as needed
  ];
}

// Set to '1' for verbose output, '' for clean output
process.env.VERBOSE = process.env.VERBOSE || "";

function runTest(testCase: TestCase): boolean {
  console.log("=".repeat(80));
  console.log("Testing:", testCase.description);
  console.log("SMILES:", testCase.smiles);
  if (testCase.expected) {
    console.log("Expected:", testCase.expected);
  }
  console.log("=".repeat(80));
  console.log("");

  const result = parseSMILES(testCase.smiles);
  const mol = result.molecules[0]!;

  console.log("Molecule structure:");
  console.log("Atoms:", mol.atoms.map((a, i) => `${i}:${a.symbol}`).join(", "));
  console.log(
    "Bonds:",
    mol.bonds.map((b) => `${b.atom1}-${b.atom2}(${b.type})`).join(", "),
  );
  console.log("Rings:", mol.rings);
  console.log("");

  const namer = new IUPACNamer();
  const namingResult = namer.generateName(mol);

  console.log("");
  console.log("=".repeat(80));
  console.log("FINAL RESULT:", namingResult.name);
  if (testCase.expected) {
    console.log("Expected:    ", testCase.expected);
  }
  console.log("=".repeat(80));
  console.log("");

  if (testCase.expected) {
    const matches = namingResult.name === testCase.expected;
    if (matches) {
      console.log("✓ SUCCESS: Name matches expected output!");
    } else {
      console.log("✗ FAILED: Name does not match");
    }
    console.log("");
    return matches;
  } else {
    console.log("(No expected name provided for comparison)");
    console.log("");
    return true;
  }
}

// Run all test cases
let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  if (runTest(testCase)) {
    passCount++;
  } else {
    failCount++;
  }
}

// Summary
console.log("=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
console.log(`Total: ${testCases.length} tests`);
console.log(`✓ Pass: ${passCount}`);
console.log(`✗ Fail: ${failCount}`);
console.log("=".repeat(80));
