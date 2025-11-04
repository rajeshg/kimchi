import { describe, it, expect } from "bun:test";
import { parseSMILES } from "index";
import { MoleculeGraph } from "src/utils/molecular-graph";

describe("SSSR (Smallest Set of Smallest Rings)", () => {
  describe("Single Rings", () => {
    it("benzene should have 1 ring of size 6", () => {
      const result = parseSMILES("c1ccccc1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(1);
      expect(mg.sssr[0]!.length).toBe(6);
    });

    it("cyclopentane should have 1 ring of size 5", () => {
      const result = parseSMILES("C1CCCC1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(1);
      expect(mg.sssr[0]!.length).toBe(5);
    });

    it("cyclohexane should have 1 ring of size 6", () => {
      const result = parseSMILES("C1CCCCC1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(1);
      expect(mg.sssr[0]!.length).toBe(6);
    });

    it("cyclobutane should have 1 ring of size 4", () => {
      const result = parseSMILES("C1CCC1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(1);
      expect(mg.sssr[0]!.length).toBe(4);
    });
  });

  describe("Fused Ring Systems", () => {
    it("indole (fused 5+6) should have 2 rings", () => {
      const result = parseSMILES("c1ccc2[nH]ccc2c1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      const sizes = mg.sssr.map((r) => r.length).sort();
      expect(sizes).toEqual([5, 6]);
    });

    it("naphthalene (fused 6+6) should have 2 rings", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      expect(mg.sssr[0]!.length).toBe(6);
      expect(mg.sssr[1]!.length).toBe(6);
    });

    it("anthracene (fused 6+6+6) should have 3 rings", () => {
      const result = parseSMILES("c1ccc2cc3ccccc3cc2c1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(3);
      expect(mg.sssr.every((r) => r.length === 6)).toBe(true);
    });

    it("phenanthrene (angular fused 6+6+6) should have 3 rings", () => {
      const result = parseSMILES("c1ccc2c(c1)ccc3ccccc23");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(3);
      expect(mg.sssr.every((r) => r.length === 6)).toBe(true);
    });

    it("quinoline (fused 6+6 with N) should have 2 rings", () => {
      const result = parseSMILES("c1ccc2ncccc2c1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      expect(mg.sssr.every((r) => r.length === 6)).toBe(true);
    });
  });

  describe("Spiro Systems", () => {
    it("spiro[4.5]decane should have 2 rings", () => {
      const result = parseSMILES("C1CCC2(C1)CCCCC2");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      const sizes = mg.sssr.map((r) => r.length).sort();
      expect(sizes).toEqual([5, 6]);
    });

    it("spiro[3.3]heptane should have 2 rings", () => {
      const result = parseSMILES("C1CC2(C1)CCC2");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      expect(mg.sssr[0]!.length).toBe(4);
      expect(mg.sssr[1]!.length).toBe(4);
    });
  });

  describe("Bridged Systems", () => {
    it("norbornane (bicyclo[2.2.1]heptane) should have 2 rings", () => {
      const result = parseSMILES("C1CC2CCC1C2");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      expect(mg.sssr[0]!.length).toBe(5);
      expect(mg.sssr[1]!.length).toBe(5);
    });

    it("adamantane should have 3 rings", () => {
      const result = parseSMILES("C1C2CC3CC1CC(C2)C3");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(3);
      expect(mg.sssr.every((r) => r.length === 6)).toBe(true);
    });

    it("cubane should have 5 rings", () => {
      const result = parseSMILES("C12C3C4C1C5C4C3C25");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(5);
      expect(mg.sssr.every((r) => r.length === 4)).toBe(true);
    });

    it("basketane should have 6 rings", () => {
      const result = parseSMILES("C12C3C4C5C1C6C2C5C3C46");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(6);
      const sizes = mg.sssr.map((r) => r.length).sort();
      expect(sizes).toEqual([4, 4, 5, 5, 5, 5]);
    });
  });

  describe("Edge Cases", () => {
    it("acyclic molecule should have 0 rings", () => {
      const result = parseSMILES("CCCC");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(0);
    });

    it("disconnected molecule with two separate rings", () => {
      const result = parseSMILES("C1CCCC1.C1CCCCC1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(2);
      const mg1 = new MoleculeGraph(result.molecules[0]!);
      const mg2 = new MoleculeGraph(result.molecules[1]!);
      expect(mg1.sssr.length).toBe(1);
      expect(mg2.sssr.length).toBe(1);
      expect(mg1.sssr[0]!.length).toBe(5);
      expect(mg2.sssr[0]!.length).toBe(6);
    });

    it("two separate benzenes should have 2 rings total", () => {
      const result = parseSMILES("c1ccccc1.c1ccccc1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(2);
      const mg1 = new MoleculeGraph(result.molecules[0]!);
      const mg2 = new MoleculeGraph(result.molecules[1]!);
      expect(mg1.sssr.length).toBe(1);
      expect(mg2.sssr.length).toBe(1);
      expect(mg1.sssr[0]!.length).toBe(6);
      expect(mg2.sssr[0]!.length).toBe(6);
    });
  });

  describe("Complex Cases", () => {
    it("indole with explicit bond should have 2 rings", () => {
      const result = parseSMILES("c1ccccc1-n2cccc2");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      const sizes = mg.sssr.map((r) => r.length).sort();
      expect(sizes).toEqual([5, 6]);
    });

    it("biphenyl (two connected rings) should have 2 rings", () => {
      const result = parseSMILES("c1ccccc1-c2ccccc2");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(2);
      expect(mg.sssr.every((r) => r.length === 6)).toBe(true);
    });

    it("pyrene (4 fused 6-rings) should have 4 rings", () => {
      const result = parseSMILES("c1cc2ccc3cccc4ccc(c1)c2c34");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);
      expect(mg.sssr.length).toBe(4);
      expect(mg.sssr.every((r) => r.length === 6)).toBe(true);
    });
  });

  describe("SSSR Count Formula", () => {
    it("SSSR count should match formula: edges - nodes + components", () => {
      const testCases = [
        { smiles: "c1ccccc1", description: "benzene" },
        { smiles: "c1ccc2[nH]ccc2c1", description: "indole" },
        { smiles: "c1ccc2ccccc2c1", description: "naphthalene" },
        { smiles: "C1CC2CCC1C2", description: "norbornane" },
        { smiles: "C1C2CC3CC1CC(C2)C3", description: "adamantane" },
      ];

      for (const { smiles, description } of testCases) {
        const result = parseSMILES(smiles);
        expect(result.errors).toEqual([]);
        expect(result.molecules.length).toBe(1);
        const mol = result.molecules[0]!;
        const mg = new MoleculeGraph(mol);

        const numEdges = mol.bonds.length;
        const numNodes = mol.atoms.length;
        const numComponents = mg.components.length;
        const expectedRings = numEdges - numNodes + numComponents;

        expect(mg.sssr.length).toBe(expectedRings);
      }
    });
  });

  describe("Node Ring Membership", () => {
    it("all atoms in benzene should be in exactly 1 ring", () => {
      const result = parseSMILES("c1ccccc1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);

      for (const atom of result.molecules[0]!.atoms) {
        const ringIndices = mg.getNodeRings(atom.id);
        expect(ringIndices.length).toBe(1);
      }
    });

    it("fusion atoms in naphthalene should be in 2 rings", () => {
      const result = parseSMILES("c1ccc2ccccc2c1");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);

      const fusionAtomIds = result.molecules[0]!.atoms.filter((a) => {
        const ringIndices = mg.getNodeRings(a.id);
        return ringIndices.length === 2;
      }).map((a) => a.id);

      expect(fusionAtomIds.length).toBe(2);
    });

    it("spiro center should be in 2 rings", () => {
      const result = parseSMILES("C1CCC2(C1)CCCCC2");
      expect(result.errors).toEqual([]);
      expect(result.molecules.length).toBe(1);
      const mg = new MoleculeGraph(result.molecules[0]!);

      const spiroCenters = result.molecules[0]!.atoms.filter((a) => {
        const ringIndices = mg.getNodeRings(a.id);
        return ringIndices.length === 2;
      });

      expect(spiroCenters.length).toBe(1);
    });
  });
});
