import { describe, expect, it } from "bun:test";
import { parseSMILES } from "index";
import { generateIUPACName } from "src/iupac-engine";

describe("Naphthalene with long alkyl chains (Issue from previous session)", () => {
  it("should correctly name naphthalene (baseline)", () => {
    const result = parseSMILES("c1ccc2ccccc2c1");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("naphthalene");
  });

  it("should correctly name 1-methylnaphthalene (simple substituent)", () => {
    const result = parseSMILES("Cc1cccc2ccccc12");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("1-methylnaphthalene");
  });

  it("should correctly name 1-hexylnaphthalene (6-carbon chain)", () => {
    const result = parseSMILES("CCCCCCc1cccc2ccccc12");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("1-hexylnaphthalene");
  });

  it("should correctly name 1-undecylnaphthalene (11-carbon chain)", () => {
    const result = parseSMILES("CCCCCCCCCCCc1cccc2ccccc12");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("1-undecylnaphthalene");
  });
});

describe("Long alkyl chains on other ring systems", () => {
  it("should correctly name dodecylbenzene (12-carbon chain on benzene)", () => {
    const result = parseSMILES("CCCCCCCCCCCCc1ccccc1");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("dodecylbenzene");
  });

  it("should correctly name 1-pentadecylcyclohexane (15-carbon chain on cyclohexane)", () => {
    const result = parseSMILES("CCCCCCCCCCCCCCCC1CCCCC1");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("pentadecylcyclohexane");
  });

  it("should correctly name 1-tetradecylphenanthrene (14-carbon chain on phenanthrene)", () => {
    const result = parseSMILES("CCCCCCCCCCCCCCc1c2ccccc2cc3ccccc13");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("1-tetradecylphenanthrene");
  });

  it("should correctly name eicosylcyclopentane (20-carbon chain on cyclopentane)", () => {
    const result = parseSMILES("CCCCCCCCCCCCCCCCCCCCC1CCCC1");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("eicosylcyclopentane");
  });

  it("should correctly name tridecylcyclobutane (13-carbon chain on cyclobutane)", () => {
    const result = parseSMILES("CCCCCCCCCCCCCC1CCC1");
    expect(result.molecules.length).toBe(1);
    const mol = result.molecules[0];
    if (!mol) throw new Error("No molecule parsed");
    const iupacName = generateIUPACName(mol);
    expect(iupacName).toBe("tridecylcyclobutane");
  });
});
