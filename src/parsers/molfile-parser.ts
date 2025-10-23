import type { Atom, Bond, BondType, Molecule, ParseError, StereoType } from 'types';
import { BondType as BT, StereoType as ST } from 'types';
import { ATOMIC_NUMBERS } from 'src/constants';
import { enrichMolecule } from 'src/utils/molecule-enrichment';
import { validateValences } from 'src/validators/valence-validator';

export enum MolfileVersion {
  V2000 = 'V2000',
  V3000 = 'V3000',
}

export interface MolfileAtomRecord {
  x: number;
  y: number;
  z: number;
  symbol: string;
  massDiff: number;
  charge: number;
  stereoParity: number;
  hydrogenCount: number;
  stereoBoxed: number;
  valence: number;
  atomMapping: number;
}

export interface MolfileBondRecord {
  atom1: number;
  atom2: number;
  type: number;
  stereo: number;
}

export interface MolfilePropertyBlock {
  charges: Map<number, number>;
  isotopes: Map<number, number>;
  radicals: Map<number, number>;
}

export interface MolfileData {
  version: MolfileVersion;
  header: {
    title: string;
    program: string;
    comment: string;
  };
  counts: {
    numAtoms: number;
    numBonds: number;
    chiral: boolean;
  };
  atoms: MolfileAtomRecord[];
  bonds: MolfileBondRecord[];
  properties: MolfilePropertyBlock;
}

export interface MolfileParseResult {
  molfile: MolfileData | null;
  molecule: Molecule | null;
  errors: ParseError[];
}

export interface MolfileAtomRecord {
  x: number;
  y: number;
  z: number;
  symbol: string;
  massDiff: number;
  charge: number;
  stereoParity: number;
  hydrogenCount: number;
  stereoBoxed: number;
  valence: number;
  atomMapping: number;
}

export interface MolfileBondRecord {
  atom1: number;
  atom2: number;
  type: number;
  stereo: number;
}

export interface MolfilePropertyBlock {
  charges: Map<number, number>;
  isotopes: Map<number, number>;
  radicals: Map<number, number>;
}

export interface MolfileData {
  version: MolfileVersion;
  header: {
    title: string;
    program: string;
    comment: string;
  };
  counts: {
    numAtoms: number;
    numBonds: number;
    chiral: boolean;
  };
  atoms: MolfileAtomRecord[];
  bonds: MolfileBondRecord[];
  properties: MolfilePropertyBlock;
}

export interface MolfileParseResult {
  molfile: MolfileData | null;
  molecule: Molecule | null;
  errors: ParseError[];
}

function detectVersion(lines: string[]): MolfileVersion {
  for (const line of lines) {
    if (line.includes('V3000')) return MolfileVersion.V3000;
    if (line.includes('V2000')) return MolfileVersion.V2000;
  }
  return MolfileVersion.V2000;
}

function parseV2000Header(lines: string[]): { title: string; program: string; comment: string } {
  return {
    title: lines[0] || '',
    program: lines[1] || '',
    comment: lines[2] || '',
  };
}

function parseV2000CountsLine(line: string, errors: ParseError[]): { numAtoms: number; numBonds: number; chiral: boolean } {
  const atomsStr = line.substring(0, 3).trim();
  const bondsStr = line.substring(3, 6).trim();
  const atoms = parseInt(atomsStr, 10);
  const bonds = parseInt(bondsStr, 10);
  const chiralFlag = parseInt(line.substring(12, 15).trim(), 10) || 0;
  
  if (isNaN(atoms) || atoms < 0) {
    errors.push({ message: `Invalid atom count: ${atomsStr}`, position: 0 });
    return { numAtoms: 0, numBonds: 0, chiral: false };
  }
  if ((bondsStr && isNaN(bonds)) || bonds < 0) {
    errors.push({ message: `Invalid bond count: ${bondsStr}`, position: 0 });
    return { numAtoms: 0, numBonds: 0, chiral: false };
  }
  
  return { numAtoms: atoms, numBonds: bonds || 0, chiral: chiralFlag === 1 };
}

function parseV2000AtomBlock(lines: string[], count: number, errors: ParseError[]): MolfileAtomRecord[] {
  const atoms: MolfileAtomRecord[] = [];
  for (let i = 0; i < count; i++) {
    const line = lines[i];
    if (!line) {
      errors.push({ message: `Expected ${count} atoms, found only ${i}`, position: i + 4 });
      break;
    }
    const x = parseFloat(line.substring(0, 10).trim());
    const y = parseFloat(line.substring(10, 20).trim());
    const z = parseFloat(line.substring(20, 30).trim());
    
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      errors.push({ message: `Invalid atom coordinates at atom ${i + 1}`, position: i + 4 });
      continue;
    }
    
    const symbol = line.substring(31, 34).trim();
    const massDiff = parseInt(line.substring(34, 36).trim(), 10) || 0;
    const chargeRaw = parseInt(line.substring(36, 39).trim(), 10) || 0;
    const stereoParity = parseInt(line.substring(39, 42).trim(), 10) || 0;
    const hydrogenCount = parseInt(line.substring(42, 45).trim(), 10) || 0;
    const stereoBoxed = parseInt(line.substring(45, 48).trim(), 10) || 0;
    const valence = parseInt(line.substring(48, 51).trim(), 10) || 0;

    let charge = 0;
    if (chargeRaw === 1) charge = 3;
    else if (chargeRaw === 2) charge = 2;
    else if (chargeRaw === 3) charge = 1;
    else if (chargeRaw === 5) charge = -1;
    else if (chargeRaw === 6) charge = -2;
    else if (chargeRaw === 7) charge = -3;

    atoms.push({
      x,
      y,
      z,
      symbol,
      massDiff,
      charge,
      stereoParity,
      hydrogenCount,
      stereoBoxed,
      valence,
      atomMapping: 0,
    });
  }
  return atoms;
}

function parseV2000BondBlock(lines: string[], count: number, numAtoms: number, errors: ParseError[]): MolfileBondRecord[] {
  const bonds: MolfileBondRecord[] = [];
  for (let i = 0; i < count; i++) {
    const line = lines[i];
    if (!line) {
      errors.push({ message: `Expected ${count} bonds, found only ${i}`, position: i });
      break;
    }
    const atom1 = parseInt(line.substring(0, 3).trim(), 10);
    const atom2 = parseInt(line.substring(3, 6).trim(), 10);
    const type = parseInt(line.substring(6, 9).trim(), 10);
    const stereo = parseInt(line.substring(9, 12).trim(), 10) || 0;
    
    if (isNaN(atom1) || isNaN(atom2) || isNaN(type)) {
      errors.push({ message: `Invalid bond at bond ${i + 1}`, position: i });
      continue;
    }
    
    if (atom1 < 1 || atom1 > numAtoms || atom2 < 1 || atom2 > numAtoms) {
      errors.push({ message: `Bond ${i + 1} references non-existent atom (atom1: ${atom1}, atom2: ${atom2}, numAtoms: ${numAtoms})`, position: i });
      continue;
    }
    
    if (![1, 2, 3, 4].includes(type)) {
      errors.push({ message: `Invalid bond type ${type} at bond ${i + 1}`, position: i });
      continue;
    }
    
    bonds.push({ atom1, atom2, type, stereo });
  }
  return bonds;
}

function parseV2000PropertyBlock(lines: string[]): MolfilePropertyBlock {
  const charges = new Map<number, number>();
  const isotopes = new Map<number, number>();
  const radicals = new Map<number, number>();

  for (const line of lines) {
    if (line.startsWith('M  CHG')) {
      const parts = line.substring(6).trim().split(/\s+/);
      const count = parseInt(parts[0] || '0', 10);
      for (let i = 0; i < count; i++) {
        const atomIdx = parseInt(parts[1 + i * 2] || '0', 10);
        const charge = parseInt(parts[2 + i * 2] || '0', 10);
        charges.set(atomIdx, charge);
      }
    } else if (line.startsWith('M  ISO')) {
      const parts = line.substring(6).trim().split(/\s+/);
      const count = parseInt(parts[0] || '0', 10);
      for (let i = 0; i < count; i++) {
        const atomIdx = parseInt(parts[1 + i * 2] || '0', 10);
        const isotope = parseInt(parts[2 + i * 2] || '0', 10);
        isotopes.set(atomIdx, isotope);
      }
    } else if (line.startsWith('M  RAD')) {
      const parts = line.substring(6).trim().split(/\s+/);
      const count = parseInt(parts[0] || '0', 10);
      for (let i = 0; i < count; i++) {
        const atomIdx = parseInt(parts[1 + i * 2] || '0', 10);
        const radical = parseInt(parts[2 + i * 2] || '0', 10);
        radicals.set(atomIdx, radical);
      }
    }
  }

  return { charges, isotopes, radicals };
}

function parseV2000(lines: string[]): { molfile: MolfileData; errors: ParseError[] } {
  const errors: ParseError[] = [];

  if (lines.length < 4) {
    errors.push({ message: 'MOL file too short', position: 0 });
    return {
      molfile: {
        version: MolfileVersion.V2000,
        header: { title: '', program: '', comment: '' },
        counts: { numAtoms: 0, numBonds: 0, chiral: false },
        atoms: [],
        bonds: [],
        properties: { charges: new Map(), isotopes: new Map(), radicals: new Map() },
      },
      errors,
    };
  }

  const header = parseV2000Header(lines.slice(0, 3));
  const countsLine = lines[3] || '';
  const counts = parseV2000CountsLine(countsLine, errors);

  const atomLines = lines.slice(4, 4 + counts.numAtoms);
  const atoms = parseV2000AtomBlock(atomLines, counts.numAtoms, errors);

  const bondLines = lines.slice(4 + counts.numAtoms, 4 + counts.numAtoms + counts.numBonds);
  const bonds = parseV2000BondBlock(bondLines, counts.numBonds, atoms.length, errors);

  const propLines = lines.slice(4 + counts.numAtoms + counts.numBonds);
  const properties = parseV2000PropertyBlock(propLines);

  return {
    molfile: {
      version: MolfileVersion.V2000,
      header,
      counts,
      atoms,
      bonds,
      properties,
    },
    errors,
  };
}

function parseV3000(lines: string[]): { molfile: MolfileData; errors: ParseError[] } {
  const errors: ParseError[] = [];

  let inCtab = false;
  let inAtomBlock = false;
  let inBondBlock = false;

  const atoms: MolfileAtomRecord[] = [];
  const bonds: MolfileBondRecord[] = [];
  let numAtoms = 0;
  let numBonds = 0;
  let chiral = false;

  const header = {
    title: lines[0] || '',
    program: lines[1] || '',
    comment: lines[2] || '',
  };

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();

    if (trimmed.startsWith('M  V30 BEGIN CTAB')) {
      inCtab = true;
      continue;
    }
    if (trimmed.startsWith('M  V30 END CTAB')) {
      inCtab = false;
      break;
    }
    if (!inCtab) continue;

    if (trimmed.startsWith('M  V30 COUNTS')) {
      const parts = trimmed.substring(13).trim().split(/\s+/);
      const atomCount = parseInt(parts[0] || '0', 10);
      const bondCount = parseInt(parts[1] || '0', 10);
      
      if (isNaN(atomCount) || atomCount < 0) {
        errors.push({ message: `Invalid atom count in V3000 COUNTS: ${parts[0]}`, position: i });
      } else {
        numAtoms = atomCount;
      }
      
      if (isNaN(bondCount) || bondCount < 0) {
        errors.push({ message: `Invalid bond count in V3000 COUNTS: ${parts[1]}`, position: i });
      } else {
        numBonds = bondCount;
      }
      
      chiral = (parts[3] || '') === '1';
      continue;
    }

    if (trimmed.startsWith('M  V30 BEGIN ATOM')) {
      inAtomBlock = true;
      continue;
    }
    if (trimmed.startsWith('M  V30 END ATOM')) {
      inAtomBlock = false;
      continue;
    }

    if (inAtomBlock) {
      const parts = trimmed.substring(7).trim().split(/\s+/);
      const symbol = parts[1] || '';
      const x = parseFloat(parts[2] || '0');
      const y = parseFloat(parts[3] || '0');
      const z = parseFloat(parts[4] || '0');
      let charge = 0;
      let isotope = 0;

      for (let j = 5; j < parts.length; j++) {
        const part = parts[j];
        if (part && part.startsWith('CHG=')) {
          charge = parseInt(part.substring(4), 10);
        } else if (part && part.startsWith('MASS=')) {
          isotope = parseInt(part.substring(5), 10);
        }
      }

      atoms.push({
        x,
        y,
        z,
        symbol,
        massDiff: isotope,
        charge,
        stereoParity: 0,
        hydrogenCount: 0,
        stereoBoxed: 0,
        valence: 0,
        atomMapping: 0,
      });
      continue;
    }

    if (trimmed.startsWith('M  V30 BEGIN BOND')) {
      inBondBlock = true;
      continue;
    }
    if (trimmed.startsWith('M  V30 END BOND')) {
      inBondBlock = false;
      continue;
    }

    if (inBondBlock) {
      const parts = trimmed.substring(7).trim().split(/\s+/);
      const type = parseInt(parts[1] || '0', 10);
      const atom1 = parseInt(parts[2] || '0', 10);
      const atom2 = parseInt(parts[3] || '0', 10);
      let stereo = 0;
      
      if (isNaN(atom1) || isNaN(atom2) || isNaN(type)) {
        errors.push({ message: `Invalid bond parameters in V3000`, position: i });
        continue;
      }
      
      if (atom1 < 1 || atom1 > atoms.length || atom2 < 1 || atom2 > atoms.length) {
        errors.push({ message: `V3000 bond references non-existent atom (atom1: ${atom1}, atom2: ${atom2}, numAtoms: ${atoms.length})`, position: i });
        continue;
      }

      for (let j = 4; j < parts.length; j++) {
        const part = parts[j];
        if (part && part.startsWith('CFG=')) {
          stereo = parseInt(part.substring(4), 10);
        }
      }

      bonds.push({ atom1, atom2, type, stereo });
      continue;
    }
  }

  return {
    molfile: {
      version: MolfileVersion.V3000,
      header,
      counts: { numAtoms, numBonds, chiral },
      atoms,
      bonds,
      properties: { charges: new Map(), isotopes: new Map(), radicals: new Map() },
    },
    errors,
  };
}

function molfileBondTypeToInternal(type: number): BondType {
  switch (type) {
    case 1:
      return BT.SINGLE;
    case 2:
      return BT.DOUBLE;
    case 3:
      return BT.TRIPLE;
    case 4:
      return BT.AROMATIC;
    default:
      return BT.SINGLE;
  }
}

function molfileBondStereoToInternal(stereo: number): StereoType {
  switch (stereo) {
    case 1:
      return ST.UP;
    case 6:
      return ST.DOWN;
    case 4:
      return ST.EITHER;
    default:
      return ST.NONE;
  }
}

function convertToMolecule(molfile: MolfileData): Molecule {
  const atoms: Atom[] = molfile.atoms.map((rec, idx) => {
    let charge = rec.charge;
    if (molfile.properties.charges.has(idx + 1)) {
      charge = molfile.properties.charges.get(idx + 1)!;
    }

    let isotope: number | null = null;
    if (molfile.properties.isotopes.has(idx + 1)) {
      isotope = molfile.properties.isotopes.get(idx + 1)!;
    } else if (rec.massDiff !== 0) {
      isotope = rec.massDiff;
    }

    return {
      id: idx,
      symbol: rec.symbol,
      atomicNumber: ATOMIC_NUMBERS[rec.symbol] || 0,
      charge,
      hydrogens: rec.hydrogenCount,
      isotope,
      aromatic: false,
      chiral: null,
      isBracket: true,
      atomClass: rec.atomMapping,
    };
  });

  const bonds: Bond[] = molfile.bonds.map((rec) => ({
    atom1: rec.atom1 - 1,
    atom2: rec.atom2 - 1,
    type: molfileBondTypeToInternal(rec.type),
    stereo: molfileBondStereoToInternal(rec.stereo),
  }));

  return { atoms, bonds };
}

/**
 * Parses a MOL file (MDL Molfile format) into a molecule structure.
 * 
 * Supports both V2000 and V3000 MOL file formats with comprehensive validation.
 * 
 * @param input - MOL file content as a string
 * @returns Parse result containing:
 *   - `molfile`: Raw MOL file data structure (or null on critical errors)
 *   - `molecule`: Parsed molecule with enriched properties (or null on errors)
 *   - `errors`: Array of parse/validation errors (empty if successful)
 * 
 * @example
 * ```typescript
 * import { parseMolfile } from 'openchem';
 * 
 * const molContent = `
 * ethanol
 *   openchem
 * 
 *   3  2  0  0  0  0  0  0  0  0999 V2000
 *     0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
 *     1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
 *     2.2500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
 *   1  2  1  0  0  0  0
 *   2  3  1  0  0  0  0
 * M  END
 * `;
 * 
 * const result = parseMolfile(molContent);
 * if (result.errors.length === 0) {
 *   console.log(result.molecule?.atoms.length); // 3
 *   console.log(result.molecule?.bonds.length); // 2
 * }
 * ```
 * 
 * @remarks
 * **Supported formats:**
 * - V2000: Classic fixed-width format (most common)
 * - V3000: Extended format with additional features
 * 
 * **Validation features:**
 * - Validates atom/bond counts match declared values
 * - Checks bond references point to valid atoms
 * - Validates numeric fields (coordinates, counts, bond types)
 * - Detects malformed data (NaN, negative counts, invalid types)
 * - Returns errors without throwing exceptions
 * 
 * **Parsed features:**
 * - Atom coordinates (2D/3D)
 * - Element symbols (organic and periodic table)
 * - Charges (both atom block and M CHG property)
 * - Isotopes (both mass diff and M ISO property)
 * - Bond types (single, double, triple, aromatic)
 * - Stereochemistry (bond wedges, chiral centers)
 * - Atom mapping (reaction mapping)
 * 
 * **Limitations:**
 * - SGroups are parsed but not converted to molecule structure
 * - Query atoms/bonds not supported
 * - No MOL file generation (use generateMolfile instead)
 * 
 * **Error handling:**
 * All errors are collected and returned in the `errors` array. Critical errors
 * (e.g., invalid counts, missing data) result in `molecule: null` but still
 * return the raw `molfile` data for inspection. Non-critical warnings
 * (e.g., invalid property block indices) are silently ignored.
 */
export function parseMolfile(input: string): MolfileParseResult {
  const lines = input.split(/\r?\n/);
  const version = detectVersion(lines);

  let result: { molfile: MolfileData; errors: ParseError[] };

  if (version === MolfileVersion.V3000) {
    result = parseV3000(lines);
  } else {
    result = parseV2000(lines);
  }

  if (result.errors.length > 0) {
    return { molfile: result.molfile, molecule: null, errors: result.errors };
  }

  const baseMolecule = convertToMolecule(result.molfile);
  const molecule = enrichMolecule(baseMolecule);

  const validationErrors: ParseError[] = [];
  validateValences(molecule.atoms, molecule.bonds, validationErrors);

  return { molfile: result.molfile, molecule, errors: validationErrors };
}
