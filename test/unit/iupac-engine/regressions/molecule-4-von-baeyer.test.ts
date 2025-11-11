import { describe, expect, it } from "bun:test";
import { parseSMILES, generateIUPACName } from "index";

describe("Molecule #4 - Von Baeyer Numbering & Double Bond", () => {
  it("should correctly generate Von Baeyer numbering for pentacyclic system", () => {
    const smiles = "C1CC2C3(CCC4C25CC(OC4OC5)C6=COC=C6)COC(=O)C3=C1";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0]!;
    const iupacResult = generateIUPACName(mol);
    const iupacName = iupacResult.name;

    // Test Von Baeyer numbering is correct (oxygen locants)
    expect(iupacName).toContain("8,15,19-trioxa");

    // Test bridge descriptor is correct
    expect(iupacName).toContain("[12.3.2.01,13.02,10.06,10]");

    // Test double bond notation is included
    expect(iupacName).toContain("-5-en");

    // Test full pentacyclic descriptor
    expect(iupacName).toContain(
      "pentacyclo[12.3.2.01,13.02,10.06,10]nonadec-5-en",
    );
  });

  it("should handle secondary bridges correctly in pentacyclic systems", () => {
    const smiles = "C1CC2C3(CCC4C25CC(OC4OC5)C6=COC=C6)COC(=O)C3=C1";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0]!;
    const iupacResult = generateIUPACName(mol);
    const iupacName = iupacResult.name;

    // Should have exactly 3 secondary bridges (not duplicates)
    const bridgeMatch = iupacName.match(/\[12\.3\.2\.([0-9,\.]+)\]/);
    expect(bridgeMatch).toBeTruthy();

    if (bridgeMatch) {
      const secondaryPart = bridgeMatch[1] || "";
      const bridgeCount = (secondaryPart.match(/\d+,\d+/g) || []).length;
      expect(bridgeCount).toBe(3); // Should have 3 secondary bridges
    }

    // Should NOT have duplicate bridges like 11,14.11,14
    expect(iupacName).not.toContain(".11,14.11,14");
  });

  it("should detect and include double bonds in Von Baeyer systems", () => {
    const smiles = "C1CC2C3(CCC4C25CC(OC4OC5)C6=COC=C6)COC(=O)C3=C1";
    const result = parseSMILES(smiles);
    const mol = result.molecules[0]!;
    const iupacResult = generateIUPACName(mol);
    const iupacName = iupacResult.name;

    // Should convert "nonadecane" to "nonadec-5-en"
    expect(iupacName).toContain("nonadec-5-en");
    expect(iupacName).not.toContain("nonadecane");
  });
});
