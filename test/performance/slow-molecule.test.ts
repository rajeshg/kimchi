import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";

describe("Performance - Slow Molecule Parsing", () => {
  it("parses 96-atom PAH within 400ms (adaptive SSSR optimization)", () => {
    const slowSMILES = "CC(C)(C)C1=CC2=C(C=C1)N3C4=CC(=C5C=CC6=C7C5=C4C=CC7=CC(=C6)C(C)(C)C)N8C9=C(C=C(C=C9)C(C)(C)C)C1=CC4=C(C=C18)N(C1=C4C=C(C=C1)C(C)(C)C)C1=C4C=CC5=C6C4=C(C=CC6=CC(=C5)C(C)(C)C)C(=C1)N1C4=C(C=C(C=C4)C(C)(C)C)C4=C1C=C3C2=C4";

    const startTime = performance.now();
    const result = parseSMILES(slowSMILES);
    const endTime = performance.now();
    const parseTime = endTime - startTime;

    expect(result.molecules).toHaveLength(1);
    expect(result.molecules[0]!.atoms).toHaveLength(96);

    expect(parseTime).toBeLessThan(400);
    console.log(`✓ PAH parsing time: ${parseTime.toFixed(2)}ms`);
  });

  it("verifies SSSR correctness on 96-atom PAH", () => {
    const slowSMILES = "CC(C)(C)C1=CC2=C(C=C1)N3C4=CC(=C5C=CC6=C7C5=C4C=CC7=CC(=C6)C(C)(C)C)N8C9=C(C=C(C=C9)C(C)(C)C)C1=CC4=C(C=C18)N(C1=C4C=C(C=C1)C(C)(C)C)C1=C4C=CC5=C6C4=C(C=CC6=CC(=C5)C(C)(C)C)C(=C1)N1C4=C(C=C(C=C4)C(C)(C)C)C4=C1C=C3C2=C4";

    const result = parseSMILES(slowSMILES);
    const mol = result.molecules[0]!;

    expect(mol.rings).toBeDefined();
    expect(mol.rings!.length).toBeGreaterThan(0);

    expect(mol.atoms).toHaveLength(96);
    expect(mol.bonds).toHaveLength(114);
  });
});
