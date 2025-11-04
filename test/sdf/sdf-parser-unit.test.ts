import { describe, it, expect } from "bun:test";
import { parseSDF } from "index";

describe("SDF Parser - Unit Tests", () => {
  describe("Single record parsing", () => {
    it("should parse a single record with no properties", () => {
      const sdf = `  Mrv2311 02102409422D          


  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
$$$$
`;
      const result = parseSDF(sdf);
      expect(result.errors).toHaveLength(0);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
      expect(record.molecule?.atoms).toHaveLength(3);
      expect(record.properties).toEqual({});
    });

    it("should parse a single record with properties", () => {
      const sdf = `  Mrv2311 02102409422D          


  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
>  <ID>
MOL001

>  <NAME>
Ethanol

>  <FORMULA>
C2H6O

$$$$
`;
      const result = parseSDF(sdf);
      expect(result.errors).toHaveLength(0);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties).toEqual({
        ID: "MOL001",
        NAME: "Ethanol",
        FORMULA: "C2H6O",
      });
    });

    it("should handle multi-line property values", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <DESCRIPTION>
This is a long
description that spans
multiple lines

$$$$
`;
      const result = parseSDF(sdf);
      expect(result.errors).toHaveLength(0);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties.DESCRIPTION).toBe(
        "This is a long\ndescription that spans\nmultiple lines",
      );
    });
  });

  describe("Multiple records parsing", () => {
    it("should parse multiple records", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <ID>
1

$$$$

  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <ID>
2

$$$$
`;
      const result = parseSDF(sdf);
      expect(result.errors).toHaveLength(0);
      expect(result.records).toHaveLength(2);
      const record0 = result.records[0];
      const record1 = result.records[1];
      if (!record0 || !record1) throw new Error("Expected records");
      expect(record0.properties.ID).toBe("1");
      expect(record1.properties.ID).toBe("2");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty input", () => {
      const result = parseSDF("");
      expect(result.records).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle whitespace-only input", () => {
      const result = parseSDF("   \n\n  \t  \n");
      expect(result.records).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle record with missing M END", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.errors.length).toBeGreaterThan(0);
    });

    it("should handle malformed property (missing value)", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <NAME>

$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties.NAME).toBe("");
    });

    it("should handle property without proper header format", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  NAME
Value

$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties).toEqual({});
    });

    it("should collect errors from invalid MOL blocks", () => {
      const sdf = `Invalid MOL block
$$$$`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.errors.length).toBeGreaterThan(0);
      expect(record.molecule).toBeNull();
    });

    it("should handle mixed valid and invalid records", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$
Invalid MOL
$$$$
  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(3);
      const record0 = result.records[0];
      const record1 = result.records[1];
      const record2 = result.records[2];
      if (!record0 || !record1 || !record2) throw new Error("Expected records");
      expect(record0.molecule).toBeTruthy();
      expect(record1.molecule).toBeNull();
      expect(record2.molecule).toBeTruthy();
    });
  });

  describe("Property parsing edge cases", () => {
    it("should trim whitespace from property names and values", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <  NAME  >
  Value  

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["NAME"]).toBe("Value");
    });

    it("should handle properties with special characters", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <SMILES>
C(=O)O

>  <INCHI>
InChI=1S/CH2O2/c2-1-3/h1H,(H,2,3)

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["SMILES"]).toBe("C(=O)O");
      expect(record.properties["INCHI"]).toBe(
        "InChI=1S/CH2O2/c2-1-3/h1H,(H,2,3)",
      );
    });

    it("should handle duplicate property names (last one wins)", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <ID>
first

>  <ID>
second

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["ID"]).toBe("second");
    });

    it("should handle empty property name", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <>
value

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties[""]).toBe("value");
    });

    it("should handle numeric property values", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <WEIGHT>
78.11

>  <COUNT>
42

>  <RATIO>
0.123

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["WEIGHT"]).toBe("78.11");
      expect(record.properties["COUNT"]).toBe("42");
      expect(record.properties["RATIO"]).toBe("0.123");
    });
  });

  describe("MOL block edge cases", () => {
    it("should handle empty title line", () => {
      const sdf = `
  Mrv2311 02102409422D          

  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
      expect(record.molfile?.header.title).toBe("");
    });

    it("should handle title with special characters", () => {
      const sdf = `Compound #123 (test)
  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molfile?.header.title).toBe("Compound #123 (test)");
    });

    it("should handle empty molecule (0 atoms)", () => {
      const sdf = `Empty
  Mrv2311 02102409422D          

  0  0  0  0  0  0            999 V2000
M  END
$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
      expect(record.molecule?.atoms).toHaveLength(0);
      expect(record.molecule?.bonds).toHaveLength(0);
    });

    it("should handle molecule with isotopes", () => {
      const sdf = `Deuterated compound
  Mrv2311 02102409422D          

  2  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  ISO  1   2   2
M  END
$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
      expect(record.molecule?.atoms).toHaveLength(2);
      const hydrogenAtom = record.molecule?.atoms[1];
      expect(hydrogenAtom?.isotope).toBe(2);
    });

    it("should handle molecule with charges", () => {
      const sdf = `Charged compound
  Mrv2311 02102409422D          

  2  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  CHG  1   2   1
M  END
$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
      const nitrogenAtom = record.molecule?.atoms[1];
      expect(nitrogenAtom?.charge).toBe(1);
    });

    it("should handle molecule with multiple charge entries", () => {
      const sdf = `Multiple charges
  Mrv2311 02102409422D          

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  CHG  2   2   1   3  -1
M  END
$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
      const nitrogenAtom = record.molecule?.atoms[1];
      const oxygenAtom = record.molecule?.atoms[2];
      expect(nitrogenAtom?.charge).toBe(1);
      expect(oxygenAtom?.charge).toBe(-1);
    });
  });

  describe("Delimiter and formatting variations", () => {
    it("should handle Windows line endings (CRLF)", () => {
      const sdf =
        "  Mrv2311 02102409422D          \r\n\r\n\r\n  1  0  0  0  0  0            999 V2000\r\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\r\nM  END\r\n$$$$\r\n";
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
    });

    it("should handle mixed line endings", () => {
      const sdf =
        "  Mrv2311 02102409422D          \r\n\n\r\n  1  0  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\r\nM  END\n$$$$\r\n";
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
    });

    it("should handle multiple consecutive delimiters", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$
$$$$
$$$$
  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(2);
      const record0 = result.records[0];
      const record1 = result.records[1];
      if (!record0 || !record1) throw new Error("Expected records");
      expect(record0.molecule).toBeTruthy();
      expect(record1.molecule).toBeTruthy();
    });

    it("should handle trailing whitespace after delimiter", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$   
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(1);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.molecule).toBeTruthy();
    });

    it("should handle multiple blank lines between records", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$



  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$
`;
      const result = parseSDF(sdf);
      expect(result.records).toHaveLength(2);
      const record0 = result.records[0];
      const record1 = result.records[1];
      if (!record0 || !record1) throw new Error("Expected records");
      expect(record0.molecule).toBeTruthy();
      expect(record1.molecule).toBeTruthy();
    });
  });

  describe("Property value variations", () => {
    it("should handle property with only whitespace as value", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <EMPTY>
   

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["EMPTY"]).toBe("");
    });

    it("should handle very long property values", () => {
      const longValue = "A".repeat(10000);
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <LONG>
${longValue}

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["LONG"]).toBe(longValue);
    });

    it("should handle property with leading/trailing blank lines", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <DESC>

Line1

Line2

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["DESC"]).toBe("\nLine1\n\nLine2");
    });

    it("should handle properties with tabs", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <TABS>
Col1\tCol2\tCol3

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["TABS"]).toBe("Col1\tCol2\tCol3");
    });

    it("should handle property names with underscores and numbers", () => {
      const sdf = `  Mrv2311 02102409422D          


  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
>  <PROP_123>
value1

>  <TEST_VALUE_2>
value2

$$$$
`;
      const result = parseSDF(sdf);
      const record = result.records[0];
      if (!record) throw new Error("Expected record");
      expect(record.properties["PROP_123"]).toBe("value1");
      expect(record.properties["TEST_VALUE_2"]).toBe("value2");
    });
  });
});
