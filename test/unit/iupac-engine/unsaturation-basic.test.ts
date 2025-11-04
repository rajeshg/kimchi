import { describe, test, expect } from "bun:test";
import { IUPACNamer } from "../../../src/iupac-engine/index";

describe("Unsaturation basic naming", () => {
  const namer = new IUPACNamer();

  test("ethene (C=C) -> ethene", () => {
    const result = namer.generateNameFromSMILES("C=C");
    // debug output
    console.log(
      "DEBUG ethene result:",
      JSON.stringify(
        { name: result.name, parent: result.parentStructure },
        null,
        2,
      ),
    );
    expect(result.name.toLowerCase()).toBe("ethene");
  });

  test("ethyne (C#C) -> ethyne", () => {
    const result = namer.generateNameFromSMILES("C#C");
    expect(result.name.toLowerCase()).toBe("ethyne");
  });

  test("propene (C=CC) -> prop-1-ene", () => {
    const result = namer.generateNameFromSMILES("C=CC");
    // PubChem authoritative name: "prop-1-ene" (locant required for C3+)
    expect(result.name.toLowerCase()).toBe("prop-1-ene");
  });

  test("but-2-ene (CC=CC) -> but-2-ene", () => {
    const result = namer.generateNameFromSMILES("CC=CC");
    expect(result.name.toLowerCase()).toBe("but-2-ene");
  });
});
