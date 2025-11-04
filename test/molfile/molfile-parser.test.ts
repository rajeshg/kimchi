import { describe, expect, it } from "bun:test";
import { parseMolfile } from "src/parsers/molfile-parser";
import { StereoType, BondType } from "types";

describe("molfile-parser V2000", () => {
  it("parses simple methane V2000", () => {
    const molfile = `
  Mrv0541 02231512212D          

  5  4  0  0  0  0            999 V2000
   -0.7145    0.4125    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0000    0.8250    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7145   -0.4125    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.5395    0.4125    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7145    1.2375    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.bonds[0]?.stereo).toBe(StereoType.NONE);
  });

  it("parses bond stereo wedge down", () => {
    const molfile = `
  Mrv0541 02231512212D          

  2  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  6  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.bonds[0]?.stereo).toBe(StereoType.DOWN);
  });

  it("parses V2000 with multiple charges", () => {
    const molfile = `
  Mrv0541 02231512212D          

  2  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
M  CHG  2   1   1   2  -1
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.charge).toBe(1);
    expect(result.molecule?.atoms[1]?.charge).toBe(-1);
  });

  it("handles unusual whitespace in counts line", () => {
    const molfile = `
  Mrv0541 02231512212D          

  1   0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms.length).toBe(1);
  });

  it("parses aromatic bond type 4", () => {
    const molfile = `
  Mrv0541 02231512212D          

  2  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  4  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.bonds[0]?.type).toBe(BondType.AROMATIC);
  });
});

describe("molfile-parser V3000", () => {
  it("parses simple methane V3000", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 5 4 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C -0.7145 0.4125 0.0000 0
M  V30 2 H -0.0000 0.8250 0.0000 0
M  V30 3 H -0.7145 -0.4125 0.0000 0
M  V30 4 H -1.5395 0.4125 0.0000 0
M  V30 5 H -0.7145 1.2375 0.0000 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 1 2
M  V30 2 1 1 3
M  V30 3 1 1 4
M  V30 4 1 1 5
M  V30 END BOND
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule).not.toBeNull();
    expect(result.molecule?.atoms.length).toBe(5);
    expect(result.molecule?.bonds.length).toBe(4);
    expect(result.molecule?.atoms[0]?.symbol).toBe("C");
  });

  it("parses V3000 with inline charge", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 1 0 0 0 0
M  V30 BEGIN ATOM
M  V30 1 N 0.0000 0.0000 0.0000 0 CHG=1
M  V30 END ATOM
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.charge).toBe(1);
  });

  it("parses V3000 with inline isotope", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 1 0 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.0000 0.0000 0.0000 0 MASS=13
M  V30 END ATOM
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.isotope).toBe(13);
  });

  it("parses V3000 bond stereo", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 2 1 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.0000 0.0000 0.0000 0
M  V30 2 H 0.0000 1.0000 0.0000 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 1 2 CFG=1
M  V30 END BOND
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.bonds[0]?.stereo).toBe(StereoType.UP);
  });

  it("parses V3000 with both CHG and MASS", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 1 0 0 0 0
M  V30 BEGIN ATOM
M  V30 1 N 0.0000 0.0000 0.0000 0 CHG=-1 MASS=15
M  V30 END ATOM
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.charge).toBe(-1);
    expect(result.molecule?.atoms[0]?.isotope).toBe(15);
  });
});

describe("molfile-parser edge cases", () => {
  it("handles missing M END gracefully", () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
`;
    const result = parseMolfile(molfile);
    expect(result.molecule).not.toBeNull();
    expect(result.molecule?.atoms.length).toBe(1);
  });

  it("handles malformed counts line with negative numbers", () => {
    const molfile = `
  Mrv0541 02231512212D          

  -1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles counts line with fewer atoms than declared", () => {
    const molfile = `
  Mrv0541 02231512212D          

  3  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles bond referencing non-existent atom", () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  5  1  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles property block with invalid atom index", () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  CHG  1   5   1
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.molecule?.atoms[0]?.charge).toBe(0);
  });

  it("handles multiple property blocks of same type", () => {
    const molfile = `
  Mrv0541 02231512212D          

  2  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
M  CHG  1   1   1
M  CHG  1   2  -1
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.charge).toBe(1);
    expect(result.molecule?.atoms[1]?.charge).toBe(-1);
  });

  it("handles V3000 with missing END CTAB", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 1 0 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.0000 0.0000 0.0000 0
M  V30 END ATOM
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.molecule?.atoms.length).toBe(1);
  });

  it("handles V3000 with malformed COUNTS line", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS abc def
M  V30 BEGIN ATOM
M  V30 1 C 0.0000 0.0000 0.0000 0
M  V30 END ATOM
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles V3000 bond with invalid atom reference", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 1 1 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.0000 0.0000 0.0000 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 1 99
M  V30 END BOND
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles extra leading/trailing whitespace in atom lines", () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  0  0  0  0  0            999 V2000
      0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0   
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms.length).toBe(1);
  });

  it("handles very large charge values", () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
M  CHG  1   1  99
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms[0]?.charge).toBe(99);
  });

  it("handles V2000 with only header (no atoms/bonds)", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0  0  0  0            999 V2000
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms.length).toBe(0);
    expect(result.molecule?.bonds.length).toBe(0);
  });

  it("handles V3000 with only header (no atoms/bonds)", () => {
    const molfile = `
  Mrv0541 02231512212D          

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 0 0 0 0 0
M  V30 END CTAB
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors).toEqual([]);
    expect(result.molecule?.atoms.length).toBe(0);
  });

  it("rejects file with insufficient header lines", () => {
    const molfile = `
  Mrv0541 02231512212D          
  1  0  0  0  0  0            999 V2000
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles malformed atom coordinate (non-numeric)", () => {
    const molfile = `
  Mrv0541 02231512212D          

  1  0  0  0  0  0            999 V2000
    abc    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles bond with invalid bond type", () => {
    const molfile = `
  Mrv0541 02231512212D          

  2  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  9  0  0  0  0
M  END
`;
    const result = parseMolfile(molfile);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
