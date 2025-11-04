import { describe, it, expect } from "bun:test";
import { parseSMILES } from "src/parsers/smiles-parser";
import {
  generateInChI,
  generateInChIKey,
} from "src/generators/inchi-generator";

describe("InChI Generator", () => {
  it("should generate InChI for benzene", async () => {
    const result = parseSMILES("c1ccccc1");
    expect(result.molecules.length).toBeGreaterThan(0);
    const molecule = result.molecules[0]!;
    const inchi = await generateInChI(molecule);
    expect(inchi).toBe("InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H");
  });

  it("should generate InChI for ethanol", async () => {
    const result = parseSMILES("CCO");
    expect(result.molecules.length).toBeGreaterThan(0);
    const molecule = result.molecules[0]!;
    const inchi = await generateInChI(molecule);
    expect(inchi).toBe("InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3");
  });

  it("should generate InChIKey from InChI", async () => {
    const inchi = "InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H";
    const inchikey = await generateInChIKey(inchi);
    expect(inchikey).toBe("UHOVQNZJYSORNB-UHFFFAOYSA-N");
  });

  it("should handle options", async () => {
    const result = parseSMILES("CCO");
    expect(result.molecules.length).toBeGreaterThan(0);
    const molecule = result.molecules[0]!;
    const inchi = await generateInChI(molecule, { options: "/FixedH" });
    expect(inchi).toContain("InChI=1S");
  });
});
