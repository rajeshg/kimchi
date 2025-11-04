import { describe, it, expect } from "bun:test";
import { parseSDF, writeSDF, parseSMILES } from "index";

describe("SDF Parser - Integration Tests", () => {
  describe("Round-trip parsing", () => {
    it("should round-trip a single molecule with properties", () => {
      const parseResult = parseSMILES("CCO");
      if (parseResult.errors.length > 0 || parseResult.molecules.length === 0) {
        throw new Error("Failed to parse SMILES");
      }
      const molecule = parseResult.molecules[0];
      if (!molecule) {
        throw new Error("No molecule in parse result");
      }

      const writeResult = writeSDF({
        molecule,
        properties: {
          ID: "001",
          NAME: "Ethanol",
          FORMULA: "C2H6O",
        },
      });

      if (writeResult.errors.length > 0) {
        throw new Error("Failed to write SDF");
      }

      const sdfParseResult = parseSDF(writeResult.sdf);
      expect(sdfParseResult.errors).toHaveLength(0);
      expect(sdfParseResult.records).toHaveLength(1);
      const record = sdfParseResult.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties).toEqual({
        ID: "001",
        NAME: "Ethanol",
        FORMULA: "C2H6O",
      });
      expect(record.molecule).toBeTruthy();
      expect(record.molecule?.atoms).toHaveLength(3);
    });

    it("should round-trip multiple molecules with properties", () => {
      const mol1Result = parseSMILES("C");
      const mol2Result = parseSMILES("CC");
      const mol3Result = parseSMILES("CCC");

      if (
        mol1Result.errors.length > 0 ||
        mol1Result.molecules.length === 0 ||
        mol2Result.errors.length > 0 ||
        mol2Result.molecules.length === 0 ||
        mol3Result.errors.length > 0 ||
        mol3Result.molecules.length === 0
      ) {
        throw new Error("Failed to parse SMILES");
      }

      const mol1 = mol1Result.molecules[0];
      const mol2 = mol2Result.molecules[0];
      const mol3 = mol3Result.molecules[0];

      if (!mol1 || !mol2 || !mol3) {
        throw new Error("No molecules in parse result");
      }

      const writeResult = writeSDF([
        { molecule: mol1, properties: { ID: "1", NAME: "Methane" } },
        { molecule: mol2, properties: { ID: "2", NAME: "Ethane" } },
        { molecule: mol3, properties: { ID: "3", NAME: "Propane" } },
      ]);

      if (writeResult.errors.length > 0) {
        throw new Error("Failed to write SDF");
      }

      const parseResult = parseSDF(writeResult.sdf);
      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.records).toHaveLength(3);

      const record0 = parseResult.records[0];
      const record1 = parseResult.records[1];
      const record2 = parseResult.records[2];
      if (!record0 || !record1 || !record2) throw new Error("Expected records");

      expect(record0.properties.ID).toBe("1");
      expect(record0.properties.NAME).toBe("Methane");
      expect(record1.properties.ID).toBe("2");
      expect(record1.properties.NAME).toBe("Ethane");
      expect(record2.properties.ID).toBe("3");
      expect(record2.properties.NAME).toBe("Propane");
    });
  });

  describe("Real-world SDF files", () => {
    it("should parse complex molecules with multiple properties", () => {
      const sdf = `  Mrv2311 02102409422D          


  6  6  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    2.5981    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.5981    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  2  0  0  0  0
  4  5  1  0  0  0  0
  5  6  2  0  0  0  0
  6  1  1  0  0  0  0
M  END
>  <DATABASE_ID>
CHEMBL123456

>  <COMPOUND_NAME>
Benzene

>  <MOLECULAR_FORMULA>
C6H6

>  <MOLECULAR_WEIGHT>
78.11

>  <SMILES>
c1ccccc1

>  <INCHI>
InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H

>  <CANONICAL_SMILES>
C1=CC=CC=C1

>  <ACTIVITY>
Active

>  <IC50>
1.23

>  <NOTES>
Test compound for aromaticity
detection and validation

$$$$
`;

      const result = parseSDF(sdf);
      expect(result.errors).toHaveLength(0);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");

      expect(record.molecule).toBeTruthy();
      expect(record.molecule?.atoms).toHaveLength(6);
      expect(record.properties.DATABASE_ID).toBe("CHEMBL123456");
      expect(record.properties.COMPOUND_NAME).toBe("Benzene");
      expect(record.properties.MOLECULAR_FORMULA).toBe("C6H6");
      expect(record.properties.MOLECULAR_WEIGHT).toBe("78.11");
      expect(record.properties.SMILES).toBe("c1ccccc1");
      expect(record.properties.CANONICAL_SMILES).toBe("C1=CC=CC=C1");
      expect(record.properties.ACTIVITY).toBe("Active");
      expect(record.properties.IC50).toBe("1.23");
      expect(record.properties.NOTES).toBe(
        "Test compound for aromaticity\ndetection and validation",
      );
    });

    it("should handle large SDF files with many records", () => {
      const records = [];
      for (let i = 0; i < 100; i++) {
        records.push(`  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <ID>
${i}

>  <INDEX>
Record ${i}

$$$$`);
      }
      const sdf = records.join("\n");

      const result = parseSDF(sdf);
      expect(result.errors).toHaveLength(0);
      expect(result.records).toHaveLength(100);

      for (let i = 0; i < 100; i++) {
        const record = result.records[i];
        if (!record) throw new Error(`Expected record ${i}`);
        expect(record.properties.ID).toBe(String(i));
        expect(record.properties.INDEX).toBe(`Record ${i}`);
        expect(record.molecule).toBeTruthy();
      }
    });
  });

  describe("Error handling in mixed scenarios", () => {
    it("should continue parsing after encountering invalid records", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <ID>
valid1

$$$$
Invalid record with no proper MOL block
>  <ID>
invalid1

$$$$

  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <ID>
valid2

$$$$
Another bad record
$$$$
  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <ID>
valid3

$$$$
`;

      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(5);

      const valid1 = result.records[0];
      const invalid1 = result.records[1];
      const valid2 = result.records[2];
      const invalid2 = result.records[3];
      const valid3 = result.records[4];

      if (!valid1 || !invalid1 || !valid2 || !invalid2 || !valid3) {
        throw new Error("Expected records");
      }

      expect(valid1.molecule).toBeTruthy();
      expect(valid1.properties.ID).toBe("valid1");

      expect(invalid1.molecule).toBeNull();
      expect(invalid1.errors.length).toBeGreaterThan(0);

      expect(valid2.molecule).toBeTruthy();
      expect(valid2.properties.ID).toBe("valid2");

      expect(invalid2.molecule).toBeNull();
      expect(invalid2.errors.length).toBeGreaterThan(0);

      expect(valid3.molecule).toBeTruthy();
      expect(valid3.properties.ID).toBe("valid3");
    });
  });

  describe("Property edge cases in integration", () => {
    it("should preserve empty properties", () => {
      const parseResult = parseSMILES("C");
      if (parseResult.errors.length > 0 || parseResult.molecules.length === 0) {
        throw new Error("Failed to parse SMILES");
      }
      const molecule = parseResult.molecules[0];
      if (!molecule) {
        throw new Error("No molecule in parse result");
      }

      const writeResult = writeSDF({
        molecule,
        properties: {
          FILLED: "Value",
          EMPTY: "",
        },
      });

      const sdfParseResult = parseSDF(writeResult.sdf);
      const record = sdfParseResult.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties.FILLED).toBe("Value");
      expect(record.properties.EMPTY).toBe("");
    });

    it("should handle properties with newlines", () => {
      const parseResult = parseSMILES("C");
      if (parseResult.errors.length > 0 || parseResult.molecules.length === 0) {
        throw new Error("Failed to parse SMILES");
      }
      const molecule = parseResult.molecules[0];
      if (!molecule) {
        throw new Error("No molecule in parse result");
      }

      const writeResult = writeSDF({
        molecule,
        properties: {
          DESCRIPTION: "Line 1\nLine 2\nLine 3",
        },
      });

      const sdfParseResult = parseSDF(writeResult.sdf);
      const record = sdfParseResult.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties.DESCRIPTION).toBe("Line 1\nLine 2\nLine 3");
    });
  });
});
