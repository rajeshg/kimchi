import { describe, test, expect } from "bun:test";
import { IUPACNamer } from "../../../src/iupac-engine/index";

describe("Functional group locants and trace metadata", () => {
  test("normalized functional groups include expected locants and suffixes (ethanol)", () => {
    const namer = new IUPACNamer();
    const result = namer.generateNameFromSMILES("CCO"); // ethanol

    expect(result.functionalGroups.length).toBeGreaterThan(0);
    expect(result.parentStructure).toBeDefined();

    // Find alcohol FG
    const alcohol = result.functionalGroups.find(
      (g) =>
        /alcohol|hydroxyl|alcoh/.test(g.type || g.assembledName || "") ||
        (g.suffix && g.suffix.includes("ol")),
    );
    expect(alcohol).toBeDefined();

    // All locants should be numeric; if parent locants are available, they should map within range
    const parentSize =
      result.parentStructure?.locants &&
      result.parentStructure.locants.length > 0
        ? result.parentStructure.locants.length
        : result.parentStructure?.chain?.atoms?.length || 0;
    for (const g of result.functionalGroups) {
      expect(g.locants.length).toBeGreaterThan(0);
      expect(g.locants.every((l) => typeof l === "number")).toBeTruthy();
      if (parentSize > 0) {
        expect(g.locants.every((l) => l >= 1 && l <= parentSize)).toBeTruthy();
      }
    }

    // Alcohol should have a suffix defined (e.g., '-ol')
    expect(alcohol?.suffix).toBeTruthy();
  });

  test("normalized functional groups include expected locants and suffixes (acetic acid)", () => {
    const namer = new IUPACNamer();
    const result = namer.generateNameFromSMILES("CC(=O)O"); // acetic acid

    expect(result.functionalGroups.length).toBeGreaterThan(0);
    expect(result.parentStructure).toBeDefined();

    const acid = result.functionalGroups.find(
      (g) =>
        /acid|carboxylic/.test(g.type || g.assembledName || "") ||
        (g.suffix && /acid|oic/.test(g.suffix)),
    );
    expect(acid).toBeDefined();
    expect(acid?.locants.length).toBeGreaterThan(0);
    expect(acid?.locants.every((l) => typeof l === "number")).toBeTruthy();
    if ((result.parentStructure?.locants || []).length > 0) {
      expect(
        acid?.locants.every(
          (l) => l >= 1 && l <= result.parentStructure!.locants.length,
        ),
      ).toBeTruthy();
    }
    expect(acid?.suffix).toBeTruthy();
  });

  test("engine returns OPSIN functional group trace metadata", () => {
    const namer = new IUPACNamer();
    const result = namer.generateNameFromSMILES("CC(=O)O");

    // functionalGroupTrace is optional; if present it should be well-formed
    if (result.functionalGroupTrace) {
      expect(Array.isArray(result.functionalGroupTrace)).toBeTruthy();
      expect(result.functionalGroupTrace.length).toBeGreaterThan(0);
      for (const t of result.functionalGroupTrace || []) {
        expect(
          typeof t.pattern === "string" || typeof t.type === "string",
        ).toBeTruthy();
        expect(Array.isArray(t.atomIds)).toBeTruthy();
      }
    }
  });

  test("ring substituent locants are preserved from ring numbering (4-methoxycycloheptan-1-one)", () => {
    const namer = new IUPACNamer();
    const result = namer.generateNameFromSMILES("COC1CCCC(=O)CC1");

    expect(result.name).toBe("4-methoxycycloheptan-1-one");

    // Verify that the alkoxy group has the correct locant (4, not 8)
    // Alkoxy groups are stored as substituents in parentStructure.substituents
    const alkoxy = result.parentStructure?.substituents?.find(
      (s: any) => s.type === "alkoxy",
    );
    expect(alkoxy).toBeDefined();
    expect(alkoxy?.position).toBe("4");
    expect(alkoxy?.name).toBe("methoxy");

    // Verify that the ketone has locant 1
    const ketone = result.functionalGroups.find((g) => g.type === "ketone");
    expect(ketone).toBeDefined();
    expect(ketone?.locants).toContain(1);
  });
});
