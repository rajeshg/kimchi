import { describe, it, expect } from "bun:test";
import { generateIUPACNameFromSMILES } from "index";

describe("Heterocycle IUPAC Names", () => {
  describe("6-membered aromatic rings", () => {
    it("benzene", () => {
      const result = generateIUPACNameFromSMILES("c1ccccc1");
      expect(result.name).toBe("benzene");
    });

    it("pyridine", () => {
      const result = generateIUPACNameFromSMILES("c1ccncc1");
      expect(result.name).toBe("pyridine");
    });

    it("pyrimidine (1,3-diazine)", () => {
      const result = generateIUPACNameFromSMILES("c1cncnc1");
      expect(result.name).toBe("pyrimidine");
    });

    it("pyrazine (1,4-diazine) - pattern 1", () => {
      const result = generateIUPACNameFromSMILES("c1nccnc1");
      expect(result.name).toBe("pyrazine");
    });

    it("pyrazine (1,4-diazine) - pattern 2", () => {
      const result = generateIUPACNameFromSMILES("c1cnccn1");
      expect(result.name).toBe("pyrazine");
    });

    it("triazine (1,3,5-triazine)", () => {
      const result = generateIUPACNameFromSMILES("c1ncncn1");
      expect(result.name).toBe("triazine");
    });
  });

  describe("5-membered aromatic rings", () => {
    it("furan", () => {
      const result = generateIUPACNameFromSMILES("c1ccoc1");
      expect(result.name).toBe("furan");
    });

    it("thiophene", () => {
      const result = generateIUPACNameFromSMILES("c1ccsc1");
      expect(result.name).toBe("thiophene");
    });

    it("pyrrole", () => {
      const result = generateIUPACNameFromSMILES("c1cc[nH]c1");
      expect(result.name).toBe("pyrrole");
    });

    it("imidazole (1,3-diazole)", () => {
      const result = generateIUPACNameFromSMILES("c1cnc[nH]1");
      expect(result.name).toBe("imidazole");
    });

    it("oxazole", () => {
      const result = generateIUPACNameFromSMILES("c1ocnc1");
      expect(result.name).toBe("oxazole");
    });

    it("thiazole", () => {
      const result = generateIUPACNameFromSMILES("c1scnc1");
      expect(result.name).toBe("thiazole");
    });
  });

  describe("Saturated 5-membered rings", () => {
    it("oxolane (tetrahydrofuran)", () => {
      const result = generateIUPACNameFromSMILES("C1CCCO1");
      expect(result.name).toBe("oxolane");
    });

    it("thiolane (tetrahydrothiophene)", () => {
      const result = generateIUPACNameFromSMILES("C1CCCS1");
      expect(result.name).toBe("thiolane");
    });

    it("pyrrolidine", () => {
      const result = generateIUPACNameFromSMILES("C1CCCN1");
      expect(result.name).toBe("pyrrolidine");
    });
  });

  describe("Saturated 6-membered rings", () => {
    it("oxane (tetrahydropyran)", () => {
      const result = generateIUPACNameFromSMILES("C1CCCCO1");
      expect(result.name).toBe("oxane");
    });

    it("thiane", () => {
      const result = generateIUPACNameFromSMILES("C1CCCCS1");
      expect(result.name).toBe("thiane");
    });

    it("piperidine", () => {
      const result = generateIUPACNameFromSMILES("C1CCCCN1");
      expect(result.name).toBe("piperidine");
    });
  });

  describe("3-membered rings", () => {
    it("oxirane (ethylene oxide)", () => {
      const result = generateIUPACNameFromSMILES("C1CO1");
      expect(result.name).toBe("oxirane");
    });

    it("thiirane", () => {
      const result = generateIUPACNameFromSMILES("C1CS1");
      expect(result.name).toBe("thiirane");
    });

    it("azirane", () => {
      const result = generateIUPACNameFromSMILES("C1CN1");
      expect(result.name).toBe("azirane");
    });
  });

  describe("4-membered rings", () => {
    it("oxetane", () => {
      const result = generateIUPACNameFromSMILES("C1CCO1");
      expect(result.name).toBe("oxetane");
    });

    it("thietane", () => {
      const result = generateIUPACNameFromSMILES("C1CCS1");
      expect(result.name).toBe("thietane");
    });

    it("azetidine", () => {
      const result = generateIUPACNameFromSMILES("C1CCN1");
      expect(result.name).toBe("azetidine");
    });
  });
});
