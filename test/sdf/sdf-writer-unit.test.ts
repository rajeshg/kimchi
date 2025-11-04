import { describe, expect, it } from "bun:test";
import { parseSMILES } from "src/parsers/smiles-parser";
import { parseMolfile } from "src/parsers/molfile-parser";
import { generateMolfile } from "src/generators/mol-generator";
import { writeSDF } from "src/generators/sdf-writer";

describe("SDF writer", () => {
  describe("MOL block generation (via generateMolfile)", () => {
    it("writes a simple molecule as MOL block", () => {
      const result = parseSMILES("CCO");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const molblock = generateMolfile(molecule);
      expect(molblock).toContain("V2000");
      expect(molblock).toContain("M  END");
      expect(molblock.split("\n").length).toBeGreaterThan(5);
    });

    it("round-trips simple molecules", () => {
      const result = parseSMILES("c1ccccc1");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const molblock = generateMolfile(molecule);
      const parsed = parseMolfile(molblock);

      expect(parsed.errors).toEqual([]);
      expect(parsed.molecule?.atoms.length).toBe(6);
      expect(parsed.molecule?.bonds.length).toBe(6);
    });

    it("preserves charges", () => {
      const result = parseSMILES("[NH4+]");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const molblock = generateMolfile(molecule);
      expect(molblock).toContain("M  CHG");

      const parsed = parseMolfile(molblock);
      expect(parsed.molecule?.atoms[0]?.charge).toBe(1);
    });

    it("preserves isotopes", () => {
      const result = parseSMILES("[13C]");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const molblock = generateMolfile(molecule);
      expect(molblock).toContain("M  ISO");

      const parsed = parseMolfile(molblock);
      expect(parsed.molecule?.atoms[0]?.isotope).toBe(13);
    });
  });

  describe("writeSDF", () => {
    it("writes single record SDF", () => {
      const result = parseSMILES("CCO");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({ molecule });
      expect(sdfResult.errors).toEqual([]);
      expect(sdfResult.sdf).toContain("V2000");
      expect(sdfResult.sdf).toContain("M  END");
      expect(sdfResult.sdf).toContain("$$$$");
    });

    it("writes single record with properties", () => {
      const result = parseSMILES("CCO");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({
        molecule,
        properties: {
          NAME: "Ethanol",
          MW: 46.07,
          ACTIVE: true,
        },
      });

      expect(sdfResult.errors).toEqual([]);
      expect(sdfResult.sdf).toContain(">  <NAME>");
      expect(sdfResult.sdf).toContain("Ethanol");
      expect(sdfResult.sdf).toContain(">  <MW>");
      expect(sdfResult.sdf).toContain("46.07");
      expect(sdfResult.sdf).toContain(">  <ACTIVE>");
      expect(sdfResult.sdf).toContain("true");
      expect(sdfResult.sdf).toContain("$$$$");
    });

    it("writes multiple records", () => {
      const smiles = ["CCO", "CC(C)O", "c1ccccc1"];
      const molecules = smiles.map((s) => parseSMILES(s).molecules[0]!);

      const records = molecules.map((molecule, i) => ({
        molecule,
        properties: { ID: i + 1 },
      }));

      const sdfResult = writeSDF(records);
      expect(sdfResult.errors).toEqual([]);

      const recordCount = (sdfResult.sdf.match(/\$\$\$\$/g) || []).length;
      expect(recordCount).toBe(3);

      expect(sdfResult.sdf).toContain(">  <ID>");
      expect(sdfResult.sdf).toContain("1");
      expect(sdfResult.sdf).toContain("2");
      expect(sdfResult.sdf).toContain("3");
    });

    it("writes records without properties", () => {
      const result = parseSMILES("CCO");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF([{ molecule }, { molecule }]);
      expect(sdfResult.errors).toEqual([]);

      const recordCount = (sdfResult.sdf.match(/\$\$\$\$/g) || []).length;
      expect(recordCount).toBe(2);
    });

    it("round-trips SDF with properties", () => {
      const result = parseSMILES("c1ccccc1");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({
        molecule,
        properties: {
          NAME: "Benzene",
          FORMULA: "C6H6",
        },
      });

      expect(sdfResult.errors).toEqual([]);

      const lines = sdfResult.sdf.split("\n");
      const mEndIndex = lines.findIndex((line) => line.trim() === "M  END");
      const molblock = lines.slice(0, mEndIndex + 1).join("\n");

      const parsed = parseMolfile(molblock);
      expect(parsed.errors).toEqual([]);
      expect(parsed.molecule?.atoms.length).toBe(6);
    });

    it("handles empty molecule array", () => {
      const sdfResult = writeSDF([]);
      expect(sdfResult.errors).toEqual([]);
      expect(sdfResult.sdf).toBe("\n");
    });

    it("handles molecules with multiple charges", () => {
      const result = parseSMILES("[NH4+].[Cl-]");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({ molecule });
      expect(sdfResult.errors).toEqual([]);

      const chargeLines = sdfResult.sdf.match(/M  CHG/g);
      expect(chargeLines?.length).toBeGreaterThan(0);
    });

    it("handles custom title and program name", () => {
      const result = parseSMILES("CCO");
      expect(result.errors).toEqual([]);
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF(
        { molecule },
        {
          title: "Ethanol",
          programName: "test",
        },
      );

      expect(sdfResult.errors).toEqual([]);
      expect(sdfResult.sdf).toContain("Ethanol");
      expect(sdfResult.sdf).toContain("test");
    });
  });

  describe("property formatting", () => {
    it("formats string properties", () => {
      const result = parseSMILES("C");
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({
        molecule,
        properties: { NAME: "Methane" },
      });

      expect(sdfResult.sdf).toContain(">  <NAME>\nMethane\n\n");
    });

    it("formats number properties", () => {
      const result = parseSMILES("C");
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({
        molecule,
        properties: { MW: 16.04 },
      });

      expect(sdfResult.sdf).toContain(">  <MW>\n16.04\n\n");
    });

    it("formats boolean properties", () => {
      const result = parseSMILES("C");
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({
        molecule,
        properties: { ACTIVE: false },
      });

      expect(sdfResult.sdf).toContain(">  <ACTIVE>\nfalse\n\n");
    });

    it("handles multiple properties in correct order", () => {
      const result = parseSMILES("C");
      const molecule = result.molecules[0]!;

      const sdfResult = writeSDF({
        molecule,
        properties: {
          A: "1",
          B: "2",
          C: "3",
        },
      });

      const aIndex = sdfResult.sdf.indexOf(">  <A>");
      const bIndex = sdfResult.sdf.indexOf(">  <B>");
      const cIndex = sdfResult.sdf.indexOf(">  <C>");

      expect(aIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(cIndex);
    });
  });
});
