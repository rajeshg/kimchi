import { describe, it, expect } from "bun:test";
import { parseSMILES, parseSMARTS, matchSMARTS } from "index";
let rdkitInstance: any = null;
let rdkitInitialized = false;

describe("Pyrimidine SMARTS Test - Aromaticity Case Sensitivity", () => {
  it("should match [n&R&D2] (aromatic N) in pyrimidine (c1ncccn1)", async () => {
    const result = parseSMILES("c1ncccn1");
    expect(result.errors).toHaveLength(0);
    expect(result.molecules).toHaveLength(1);

    const mol = result.molecules[0]!;
    expect(mol).toBeDefined();

    // Parse SMARTS pattern - lowercase n for aromatic nitrogen
    const smartsPattern = parseSMARTS("[n&R&D2]");
    expect(smartsPattern.errors).toEqual([]);
    expect(smartsPattern.pattern).toBeDefined();

    // Log the parsed SMARTS structure
    if (process.env.RUN_VERBOSE)
      console.log("\n=== SMARTS PATTERN STRUCTURE (aromatic) ===");
    if (process.env.RUN_VERBOSE)
      console.log("Pattern:", JSON.stringify(smartsPattern.pattern, null, 2));

    // Match pattern against molecule
    const matches = matchSMARTS(smartsPattern.pattern!, mol, {
      uniqueMatches: true,
    });

    if (process.env.RUN_VERBOSE) console.log("\n=== OPENCHEM ANALYSIS ===");
    if (process.env.RUN_VERBOSE) console.log("Pyrimidine SMILES: c1ncccn1");
    if (process.env.RUN_VERBOSE) console.log("Pattern: [n&R&D2]");
    if (process.env.RUN_VERBOSE)
      console.log("Matches:", matches.matches.length);

    // Check atom properties in detail
    if (process.env.RUN_VERBOSE) console.log("\nAtom properties:");
    mol.atoms.forEach((atom, idx) => {
      if (process.env.RUN_VERBOSE) console.log(`  Atom ${idx}: ${atom.symbol}`);
      if (process.env.RUN_VERBOSE)
        console.log(`    aromatic: ${atom.aromatic}`);
      if (process.env.RUN_VERBOSE) console.log(`    degree: ${atom.degree}`);
      if (process.env.RUN_VERBOSE)
        console.log(`    isInRing: ${atom.isInRing}`);
      if (process.env.RUN_VERBOSE)
        console.log(`    ringIds: ${JSON.stringify(atom.ringIds)}`);
    });

    // Check bonds
    if (process.env.RUN_VERBOSE) console.log("\nBonds:");
    mol.bonds.forEach((bond, idx) => {
      if (process.env.RUN_VERBOSE)
        console.log(
          `  Bond ${idx}: ${bond.atom1} -> ${bond.atom2}, type: ${bond.type}`,
        );
    });

    // Test with RDKit for comparison
    if (process.env.RUN_VERBOSE) console.log("\n=== RDKIT COMPARISON ===");
    try {
      const rdkit = await initializeRDKit();

      const rdkitMol = rdkit.get_mol("c1ncccn1");
      const rdkitMatches = JSON.parse(
        rdkitMol.get_substruct_matches("[n&R&D2]"),
      );
      if (process.env.RUN_VERBOSE) console.log("RDKit matches:", rdkitMatches);
      if (process.env.RUN_VERBOSE)
        console.log("RDKit match count:", rdkitMatches.length);

      // Get canonical SMILES from RDKit to see aromaticity
      const canonSmiles = rdkitMol.get_smiles();
      if (process.env.RUN_VERBOSE)
        console.log("RDKit canonical SMILES:", canonSmiles);

      rdkitMol.delete();
    } catch (err) {
      if (process.env.RUN_VERBOSE)
        console.log("RDKit comparison skipped:", err);
    }

    expect(matches.matches.length).toBe(2); // Should match both N atoms
  });

  it("should NOT match [N&R&D2] (aliphatic N) in pyrimidine - expected behavior", () => {
    const result = parseSMILES("c1ncccn1");
    expect(result.errors).toHaveLength(0);
    expect(result.molecules).toHaveLength(1);

    const mol = result.molecules[0]!;

    // Parse SMARTS pattern - uppercase N for aliphatic nitrogen
    const smartsPattern = parseSMARTS("[N&R&D2]");
    expect(smartsPattern.errors).toEqual([]);
    expect(smartsPattern.pattern).toBeDefined();

    // Match pattern against molecule
    const matches = matchSMARTS(smartsPattern.pattern!, mol, {
      uniqueMatches: true,
    });

    if (process.env.RUN_VERBOSE)
      console.log("\n=== ALIPHATIC NITROGEN TEST ===");
    if (process.env.RUN_VERBOSE) console.log("Pyrimidine SMILES: c1ncccn1");
    if (process.env.RUN_VERBOSE)
      console.log("Pattern: [N&R&D2] (uppercase = aliphatic)");
    if (process.env.RUN_VERBOSE)
      console.log("Matches:", matches.matches.length);
    if (process.env.RUN_VERBOSE)
      console.log("Expected: 0 (pyrimidine has aromatic nitrogens)");

    // Uppercase N means aliphatic, pyrimidine has aromatic nitrogens
    expect(matches.matches.length).toBe(0);
  });
});

export async function initializeRDKit(): Promise<any> {
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
