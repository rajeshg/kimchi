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

  test("propene (C=CC) -> propene", () => {
    const result = namer.generateNameFromSMILES("C=CC");
    // IUPAC 2013 Blue Book P-31.1.2.2.1: "propyne (PIN)" - locant omitted for C3
    // This is the strict IUPAC preferred name per Blue Book
    expect(result.name.toLowerCase()).toBe("propene");
  });

  test("but-2-ene (CC=CC) -> but-2-ene", () => {
    const result = namer.generateNameFromSMILES("CC=CC");
    expect(result.name.toLowerCase()).toBe("but-2-ene");
  });
});
