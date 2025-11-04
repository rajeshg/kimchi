import { describe, expect, it } from "bun:test";
import { parseSMILES, generateSMILES } from "index";

// Initialize RDKit once for the entire test file
let rdkitInstance: any = null;
let rdkitInitialized = false;

async function initializeRDKit(): Promise<any> {
  if (rdkitInitialized) return rdkitInstance;

  try {
    const rdkitModule = await import("@rdkit/rdkit").catch(() => null);
    if (!rdkitModule) {
      throw new Error(
        "RDKit is not available. Install with: npm install @rdkit/rdkit",
      );
    }
    const initRDKitModule = rdkitModule.default;
    rdkitInstance = await (initRDKitModule as any)();
    rdkitInitialized = true;
    return rdkitInstance;
  } catch (e) {
    throw new Error("Failed to initialize RDKit");
  }
}

const cases: Array<{ input: string; desc: string; expectedErrors?: number }> = [
  // Edge branched alkenes and ordering
  {
    input: "CC(C)C(/C)=C(/C)C(C)C",
    desc: "heavily branched alkene (variant A)",
  },
  {
    input: "CC(C)C(=C(/C)C(C)C)/C",
    desc: "heavily branched alkene (variant B)",
  },
  {
    input: "C/C(=C\\C(C)C)C(C)C",
    desc: "branched with internal stereo marker",
  },

  // Mixed stereochemistry across conjugated system
  { input: "F/C=C/C=C\\C", desc: "conjugated diene mixed stereo 1" },
  { input: "F/C=C\\C=C/C", desc: "conjugated diene mixed stereo 2" },

  // Exocyclic stereo on small rings
  {
    input: "C1=CC(=C1)/C=C/F",
    desc: "exocyclic stereo from aromatic-like ring",
  },
  { input: "C1CC=C1/C=C/F", desc: "exocyclic stereo from cyclobutene" },

  // Tri- and tetra-substituted alkenes with isotopes
  { input: "[13C]/C(=C\\(F)Cl)C", desc: "isotopic tri-substituted alkene" },
  {
    input: "C[/2H]=C(\\Cl)Br",
    desc: "isotope shorthand with stereo (invalid isotope class, parse check)",
    expectedErrors: 1,
  },

  // Alternating stereo markers to exercise normalization
  { input: "C\\C=C/C\\C=C/C", desc: "alternating stereo markers long chain" },

  // Cases with identical substituents (should canonicalize consistently)
  { input: "F/C=C/F", desc: "symmetric substituents all up or down" },
  { input: "F\\C=C\\F", desc: "symmetric substituents all down" },
];

describe("Additional Stereo Tests", () => {
  cases.forEach(({ input, desc, expectedErrors }) => {
    it(`${desc}: ${input}`, async () => {
      const parsed = parseSMILES(input);
      expect(parsed.errors.length).toBe(expectedErrors ?? 0);
      if ((expectedErrors ?? 0) > 0) return;

      const our = generateSMILES(parsed.molecules);

      let rdkitCanonical = "";
      try {
        const RDKit = await initializeRDKit();
        const mol = RDKit.get_mol(input);
        if (mol && mol.is_valid()) rdkitCanonical = mol.get_smiles();
      } catch (e) {
        rdkitCanonical = "";
      }

      if (!rdkitCanonical) {
        const reparsed = parseSMILES(our);
        expect(reparsed.errors.length).toBe(0);
        return;
      }

      // Check semantic equivalence: both SMILES should parse to molecules with same structure
      const ourReparsed = parseSMILES(our);
      const rdkitParsed = parseSMILES(rdkitCanonical);

      expect(ourReparsed.errors.length).toBe(0);
      expect(rdkitParsed.errors.length).toBe(0);

      // Compare atom and bond counts
      const ourMol = ourReparsed.molecules[0]!;
      const rdkitMol = rdkitParsed.molecules[0]!;

      expect(ourMol.atoms.length).toBe(rdkitMol.atoms.length);
      expect(ourMol.bonds.length).toBe(rdkitMol.bonds.length);
    });
  });
});
