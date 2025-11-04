import { describe, it, expect } from "bun:test";
import { parseSMILES, generateSMILES } from "index";

describe("Standard Form Compliance (OpenSMILES 4.3)", () => {
  describe("Starting Atom Selection (4.3.4)", () => {
    it("prefers terminal atoms over non-terminal", () => {
      const input = "CCCCCCC";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).toBe("CCCCCCC");
    });

    it("prefers heteroatoms when canonical labels are equal", () => {
      const input = "c1ccccc1O";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).toBe("Oc1ccccc1");
    });

    it("prefers heteroatoms over carbon when both are terminal", () => {
      const input = "c1ccc(N)cc1";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output[0]).toBe("N");
    });

    it("uses canonical labels as primary criterion", () => {
      const input = "CC(C)C";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).toBe("CC(C)C");
    });

    it("prefers oxygen in phenol", () => {
      const input = "c1ccc(O)cc1";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).toBe("Oc1ccccc1");
    });

    it("handles multiple heteroatoms", () => {
      const input = "c1ccc(N)c(O)c1";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output[0]).toMatch(/[NO]/);
    });

    it("terminal preference applies when no heteroatoms", () => {
      const input = "CCCC(CC)CC";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output[0]).toBe("C");
      expect(output[output.length - 1]).toBe("C");
    });
  });

  describe("Aromatic Single Bonds (4.3.2)", () => {
    it("outputs explicit - between aromatic rings", () => {
      const input = "c1ccccc1-c2ccccc2";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).toContain("-");
      expect(output).toMatch(/c.*-.*c/);
    });

    it("handles biphenyl correctly", () => {
      const input = "c1ccc(cc1)-c2ccccc2";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).toContain("-");
    });

    it("does not add - for aromatic bonds", () => {
      const input = "c1ccccc1";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).toBe("c1ccccc1");
      expect(output.split("-").length).toBe(1);
    });

    it("handles multiple aromatic rings connected by single bonds", () => {
      const input = "c1ccccc1-c2ccccc2-c3ccccc3";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      const dashCount = (output.match(/-/g) || []).length;
      expect(dashCount).toBeGreaterThanOrEqual(1);
    });

    it("does not add - for aliphatic single bonds", () => {
      const input = "CCCC";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).not.toContain("-");
    });

    it("does not add - for aromatic-aliphatic bonds", () => {
      const input = "c1ccccc1C";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);
      expect(output).not.toContain("-");
    });
  });

  describe("Combined Standard Form Features", () => {
    it("applies both starting atom and bond formatting rules", async () => {
      const rdkitModule = await import("@rdkit/rdkit").catch(() => null);
      if (!rdkitModule) return;

      const initRDKitModule = rdkitModule.default;
      const RDKit: any = await (initRDKitModule as any)();
      const input = "c1ccccc1-c2ccc(O)cc2";

      const result = parseSMILES(input);
      const ourOutput = generateSMILES(result.molecules);

      const mol = RDKit.get_mol(input);
      const rdkitOutput = mol.get_smiles();

      expect(ourOutput).toContain("-");
      expect(ourOutput[0]).toMatch(/[Oc]/);
    });

    it("handles complex aromatic systems", () => {
      const input = "c1ccc(cc1)-c2ccncc2";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);

      expect(output).toContain("-");
      expect(result.errors).toHaveLength(0);
    });

    it("preserves stereo and outputs - for aromatic-aromatic bonds", () => {
      const input = "c1ccccc1-c2ccc(/C=C/C)cc2";
      const result = parseSMILES(input);
      const output = generateSMILES(result.molecules);

      expect(output).toContain("-");
      // eslint-disable-next-line no-useless-escape -- backslash escape needed to match literal backslash in SMILES
      expect(output).toMatch(/[\/\\]/);
    });
  });

  describe("RDKit Parity for New Features", () => {
    const testCases = ["c1ccccc1O", "Oc1ccccc1", "c1ccc(O)cc1"];

    testCases.forEach((input) => {
      it(`matches RDKit for ${input}`, async () => {
        const rdkitModule = await import("@rdkit/rdkit").catch(() => null);
        if (!rdkitModule) {
          if (process.env.VERBOSE) {
            console.warn(`RDKit not available for ${input}`);
          }
          return;
        }

        const initRDKitModule = rdkitModule.default;
        const RDKit: any = await (initRDKitModule as any)();

        const result = parseSMILES(input);
        const ourOutput = generateSMILES(result.molecules);

        const mol = RDKit.get_mol(input);
        if (!mol || !mol.is_valid()) return;

        const rdkitOutput = mol.get_smiles();

        expect(ourOutput).toBe(rdkitOutput);
      });
    });

    it("outputs - between aromatic rings like RDKit", async () => {
      const rdkitModule = await import("@rdkit/rdkit").catch(() => null);
      if (!rdkitModule) return;

      const initRDKitModule = rdkitModule.default;
      const RDKit: any = await (initRDKitModule as any)();

      const input = "c1ccccc1-c2ccccc2";
      const result = parseSMILES(input);
      const ourOutput = generateSMILES(result.molecules);

      const mol = RDKit.get_mol(input);
      const rdkitOutput = mol.get_smiles();

      expect(ourOutput).toContain("-");
      expect(rdkitOutput).toContain("-");
    });
  });
});
