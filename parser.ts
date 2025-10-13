import type { Atom, Bond, Molecule, ParseResult, ParseError } from './types';
import { BondType, StereoType } from './types';

// Complete atomic numbers for all elements (OpenSMILES specification)
const ATOMIC_NUMBERS: Record<string, number> = {
  H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
  Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18, K: 19, Ca: 20,
  Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26, Co: 27, Ni: 28, Cu: 29, Zn: 30,
  Ga: 31, Ge: 32, As: 33, Se: 34, Br: 35, Kr: 36, Rb: 37, Sr: 38, Y: 39, Zr: 40,
  Nb: 41, Mo: 42, Tc: 43, Ru: 44, Rh: 45, Pd: 46, Ag: 47, Cd: 48, In: 49, Sn: 50,
  Sb: 51, Te: 52, I: 53, Xe: 54, Cs: 55, Ba: 56, Hf: 72, Ta: 73, W: 74, Re: 75,
  Os: 76, Ir: 77, Pt: 78, Au: 79, Hg: 80, Tl: 81, Pb: 82, Bi: 83, Po: 84, At: 85,
  Rn: 86, Fr: 87, Ra: 88, Rf: 104, Db: 105, Sg: 106, Bh: 107, Hs: 108, Mt: 109,
  Ds: 110, Rg: 111, Cn: 112, Fl: 114, Lv: 116,
  // Lanthanides
  La: 57, Ce: 58, Pr: 59, Nd: 60, Pm: 61, Sm: 62, Eu: 63, Gd: 64, Tb: 65, Dy: 66,
  Ho: 67, Er: 68, Tm: 69, Yb: 70, Lu: 71,
  // Actinides
  Ac: 89, Th: 90, Pa: 91, U: 92, Np: 93, Pu: 94, Am: 95, Cm: 96, Bk: 97, Cf: 98,
  Es: 99, Fm: 100, Md: 101, No: 102, Lr: 103,
  // Wildcard atom
  '*': 0,
};

// Default valences for elements (OpenSMILES specification)
const DEFAULT_VALENCES: Record<string, number[]> = {
  // Organic subset
  B: [3],
  C: [4],
  N: [3, 5],
  O: [2],
  P: [3, 5],
  S: [2, 4, 6],
  F: [1],
  Cl: [1],
  Br: [1],
  I: [1],
  // Common elements
  H: [1],
  Li: [1],
  Na: [1],
  K: [1],
  Rb: [1],
  Cs: [1],
  Be: [2],
  Mg: [2],
  Ca: [2],
  Sr: [2],
  Ba: [2],
  Al: [3],
  Si: [4],
  Ga: [3],
  Ge: [4],
  As: [3, 5],
  Se: [2, 4, 6],
  Te: [2, 4, 6],
  He: [0],
  Ne: [0],
  Ar: [0],
  Kr: [0],
  Xe: [0],
  Rn: [0],
  // Transition metals (common oxidation states)
  Sc: [3],
  Ti: [4],
  V: [3, 4, 5],
  Cr: [3, 6],
  Mn: [2, 4, 7],
  Fe: [2, 3],
  Co: [2, 3],
  Ni: [2],
  Cu: [1, 2],
  Zn: [2],
  Zr: [4],
  Nb: [5],
  Mo: [6],
  Tc: [7],
  Ru: [3, 4],
  Rh: [3],
  Pd: [2, 4],
  Ag: [1],
  Cd: [2],
  Hf: [4],
  Ta: [5],
  W: [6],
  Re: [7],
  Os: [4, 6],
  Ir: [3, 4],
  Pt: [2, 4],
  Au: [1, 3],
  Hg: [1, 2],
  // Lanthanides and Actinides (common +3 state)
  La: [3], Ce: [3, 4], Pr: [3], Nd: [3], Pm: [3], Sm: [3], Eu: [2, 3],
  Gd: [3], Tb: [3, 4], Dy: [3], Ho: [3], Er: [3], Tm: [3], Yb: [2, 3], Lu: [3],
  Ac: [3], Th: [4], Pa: [5], U: [4, 6], Np: [5], Pu: [4, 6], Am: [3, 6],
  Cm: [3], Bk: [3, 4], Cf: [3], Es: [3], Fm: [3], Md: [3], No: [2, 3], Lr: [3],
  // Other elements
  In: [3], Sn: [2, 4], Sb: [3, 5], Tl: [1, 3], Pb: [2, 4], Bi: [3, 5],
  Po: [2, 4, 6], At: [1, 3, 5, 7], Fr: [1], Ra: [2],
  Rf: [4], Db: [5], Sg: [6], Bh: [7], Hs: [8], Mt: [9], Ds: [8], Rg: [9], Cn: [2], Fl: [2], Lv: [2],
  // Wildcard atom (no specific valence)
  '*': [],
};

export function parseSMILES(smiles: string): ParseResult {
  const errors: ParseError[] = [];
  const molecules: Molecule[] = [];

  // Split on '.' for disconnected structures
  const parts = smiles.split('.');
  for (const part of parts) {
    if (part.trim() === '') continue; // skip empty parts
    const result = parseSingleSMILES(part.trim());
    molecules.push(result.molecule);
    errors.push(...result.errors);
  }

  return { molecules, errors };
}

function parseSingleSMILES(smiles: string): { molecule: Molecule; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  let atomId = 0;

  // Small built-in tracing set for problematic inputs discovered earlier
  const TRACE_SMILES = new Set([
    'c1ccccc1',
    'F/C1=CCC1/F',
    'c1ccncc1',
    'C1CC[C@H](C)CC1',
  ]);
  const trace = TRACE_SMILES.has(smiles);

  let i = 0;
  let prevAtomId: number | null = null;
  let pendingBondType = BondType.SINGLE;
  let pendingBondStereo = StereoType.NONE;
  const branchStack: number[] = [];
  const bookmarks = new Map<number, { atomId: number; bondType: BondType; bondStereo: StereoType }[]>();


  while (i < smiles.length) {
    const ch = smiles[i]!;
    if (trace) {
      console.warn(`TRACE[${smiles}] i=${i} ch='${ch}' prev=${prevAtomId} pendingType=${pendingBondType} pendingStereo=${pendingBondStereo} branchStack=[${branchStack.join(',')}] bookmarks=${JSON.stringify(Array.from(bookmarks.entries()))}`);
    }

    if (ch === ' ') {
      i++;
      continue;
    }

    // Bracket atoms like [NH4+]
    if (ch === '[') {
      i++;
      let content = '';
      while (i < smiles.length && smiles[i] !== ']') {
        content += smiles[i]!;
        i++;
      }
      if (i >= smiles.length || smiles[i] !== ']') {
        errors.push({ message: 'Unclosed bracket', position: i });
      } else {
        i++; // skip ]
      }
      const atom = parseBracketAtom(content, atomId++);
      if (!atom) {
        errors.push({ message: `Invalid bracket atom: ${content}`, position: i });
        continue;
      }
      atoms.push(atom);
      if (prevAtomId !== null) {
        bonds.push({ atom1: prevAtomId, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({ atom1: bp, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        pendingBondStereo = StereoType.NONE;
      }
      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      continue;
    }

    // Wildcard atom '*' (can be aromatic or aliphatic)
    if (ch === '*') {
      const atom = createAtom('*', atomId++, false, false, 0); // '*' is not aromatic by default
      atoms.push(atom);
      if (prevAtomId !== null) {
        bonds.push({ atom1: prevAtomId, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({ atom1: bp, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        pendingBondStereo = StereoType.NONE;
      }
      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      i++;
      continue;
    }

    // Organic atoms (handle two-letter like Cl, Br)
    if (/[A-Za-z]/.test(ch)) {
      let symbol = ch;
      // Only treat as two-letter element when the first character is uppercase
      // and the next character is lowercase (e.g., 'Cl', 'Br'). This avoids
      // combining aromatic lowercase atoms like 'c' + 'c' -> 'cc'.
      if (ch === ch.toUpperCase() && i + 1 < smiles.length && /[a-z]/.test(smiles[i + 1]!)) {
        // two-letter element (e.g., Cl, Br)
        symbol = ch + smiles[i + 1]!;
        i += 2;
      } else {
        i++;
      }
      // Only consider atoms aromatic if they are in the aromatic organic subset
      // or explicitly written in lowercase (like 'c' for carbon)
      const isAromaticOrganic = /^[bcnosp]$/.test(symbol);
      const aromatic = isAromaticOrganic;
      const atom = createAtom(symbol, atomId++, aromatic, false, 0);
      atoms.push(atom);

      // chiral marker immediately after atom
      if (i < smiles.length && smiles[i] === '@') {
        i++;
        if (i < smiles.length && smiles[i] === '@') {
          atom.chiral = '@@';
          i++;
        } else {
          atom.chiral = '@';
        }
      }

      if (prevAtomId !== null) {
        bonds.push({ atom1: prevAtomId, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({ atom1: bp, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        pendingBondStereo = StereoType.NONE;
      }

      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      continue;
    }

    // Bonds
    if (ch === '/') {
      pendingBondStereo = StereoType.UP;
      i++;
      continue;
    }
    if (ch === '\\') {
      pendingBondStereo = StereoType.DOWN;
      i++;
      continue;
    }
    if (ch === '=') {
      pendingBondType = BondType.DOUBLE;
      i++;
      continue;
    }
    if (ch === '#') {
      pendingBondType = BondType.TRIPLE;
      i++;
      continue;
    }
    if (ch === '$') {
      pendingBondType = BondType.QUADRUPLE;
      i++;
      continue;
    }

    // Branching
    if (ch === '(') {
      branchStack.push(prevAtomId!);
      prevAtomId = null;
      i++;
      continue;
    }
    if (ch === ')') {
      if (branchStack.length === 0) {
        errors.push({ message: 'Unmatched closing parenthesis', position: i });
      } else {
        prevAtomId = branchStack.pop()!;
      }
      i++;
      continue;
    }

    // Ring closures: digit or %nn
    if (ch >= '0' && ch <= '9') {
      if (prevAtomId === null) {
        errors.push({ message: 'Ring closure digit without previous atom', position: i });
      } else {
        const d = parseInt(ch);
        const list = bookmarks.get(d) || [];
        // Always record the bookmark; pairing logic will choose endpoints later
        list.push({ atomId: prevAtomId, bondType: pendingBondType, bondStereo: pendingBondStereo });
        bookmarks.set(d, list);
      }
      pendingBondType = BondType.SINGLE;
      pendingBondStereo = StereoType.NONE;
      i++;
      continue;
    }
    if (ch === '%') {
      if (prevAtomId === null) {
        errors.push({ message: 'Ring closure % without previous atom', position: i });
        i++;
        continue;
      }
      if (i + 2 < smiles.length && /[0-9][0-9]/.test(smiles.substr(i + 1, 2))) {
        const d = parseInt(smiles.substr(i + 1, 2));
        const list = bookmarks.get(d) || [];
        // Always record the bookmark for %nn; pairing chooses endpoints later
        list.push({ atomId: prevAtomId, bondType: pendingBondType, bondStereo: pendingBondStereo });
        bookmarks.set(d, list);
        i += 3;
        pendingBondType = BondType.SINGLE;
        pendingBondStereo = StereoType.NONE;
        continue;
      } else {
        errors.push({ message: 'Invalid % ring closure', position: i });
        i++;
        continue;
      }
    }

    errors.push({ message: `Unsupported character: ${ch}`, position: i });
    i++;
  }

  // Debug: print bookmarks before pairing
  if (bookmarks.size > 0) {
    console.warn('Ring bookmarks:', Array.from(bookmarks.entries()).map(([d, es]) => [d, es.map(e => e.atomId)]));
  }

  // Post-process ring closures
  for (const [digit, entries] of bookmarks) {
    if (entries.length < 2) {
      if (entries.length === 1) {
        console.warn(`Ring closure ${digit} only had one end:`, entries.map(e => e.atomId));
      } else {
        console.warn(`Ring closure ${digit} had no entries`);
      }
      continue;
    }

    // Find the first two entries with distinct atomIds (chronological order)
    let firstIndex = 0;
    let secondIndex = -1;
    for (let j = 1; j < entries.length; j++) {
      if (entries[j]!.atomId !== entries[firstIndex]!.atomId) {
        secondIndex = j;
        break;
      }
    }
    if (secondIndex === -1) {
      // All recorded endpoints are the same atom — cannot form a valid ring bond
      errors.push({ message: `Ring closure digit ${digit} endpoints identical: ${entries.map(e => e.atomId).join(',')}`, position: -1 });
      continue;
    }

    const first = entries[firstIndex]!;
    const second = entries[secondIndex]!;
    console.warn(`Pairing ring ${digit}: ${first.atomId} - ${second.atomId} (type from second ${second.bondType})`);
    bonds.push({ atom1: first.atomId, atom2: second.atomId, type: second.bondType, stereo: second.bondStereo });

    // If more than two distinct endpoints exist, report an error
    const distinct = Array.from(new Set(entries.map(e => e.atomId)));
    if (distinct.length > 2) {
      errors.push({ message: `Ring closure digit ${digit} used more than twice with endpoints ${distinct.join(',')}`, position: -1 });
    }
  }
  console.warn('Bonds at end of pairing:', bonds.map(b => `${b.atom1}-${b.atom2}`));

  if (branchStack.length > 0) errors.push({ message: 'Unmatched opening parentheses', position: -1 });

  // Stereo inference, aromatic bonds, hydrogens
  for (const bd of bonds) {
    if (bd.type !== BondType.DOUBLE) continue;
    if (bd.stereo && bd.stereo !== StereoType.NONE) continue;
    const a = bd.atom1;
    const b = bd.atom2;
    const singleA = bonds.find(bx => bx.type === BondType.SINGLE && ((bx.atom1 === a && bx.atom2 !== b) || (bx.atom2 === a && bx.atom1 !== b)) && bx.stereo && bx.stereo !== StereoType.NONE);
    const singleB = bonds.find(bx => bx.type === BondType.SINGLE && ((bx.atom1 === b && bx.atom2 !== a) || (bx.atom2 === b && bx.atom1 !== a)) && bx.stereo && bx.stereo !== StereoType.NONE);
    if (singleA && singleB && singleA.stereo === singleB.stereo) bd.stereo = singleA.stereo;
  }

  for (const bond of bonds) {
    const a1 = atoms.find(a => a.id === bond.atom1)!;
    const a2 = atoms.find(a => a.id === bond.atom2)!;
    if (a1.aromatic && a2.aromatic) bond.type = BondType.AROMATIC;
  }

  for (const atom of atoms) {
    const hasExplicitH = atom.isBracket && atom.hydrogens >= 0;
    if (!hasExplicitH) {
      const valence = calculateValence(atom, bonds);
      // Special handling for wildcard atom '*'
      if (atom.symbol === '*') {
        // Wildcard atom takes valence from its bonds, no implicit hydrogens
        atom.hydrogens = 0;
      } else {
        const defaultValences = DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber];
        const expectedValence = (defaultValences[0] || atom.atomicNumber) + (atom.charge || 0);
        atom.hydrogens = Math.max(0, expectedValence - valence);
      }
    } else if (atom.hydrogens < 0) {
      atom.hydrogens = 0;
    }
  }

  // Validate aromaticity
  validateAromaticity(atoms, bonds, errors);

  return { molecule: { atoms, bonds }, errors };
}

function isOrganicAtom(char: string): boolean {
  return /^[BCNOPSFI]$/.test(char.toUpperCase());
}

function createAtom(symbol: string, id: number, aromatic = false, isBracket = false, atomClass = 0): Atom {
  // Handle two-letter symbols (Cl, Br) which should not be fully uppercased
  const normalizedSymbol = symbol.length === 2
    ? symbol[0].toUpperCase() + symbol[1].toLowerCase()
    : symbol.toUpperCase();
  const atomicNumber = ATOMIC_NUMBERS[normalizedSymbol];
  if (atomicNumber === undefined) {
    throw new Error(`Unknown atomic number for symbol: ${symbol}`);
  }
  return {
    id,
    symbol: normalizedSymbol,
    atomicNumber,
    charge: 0,
    hydrogens: 0, // will calculate later
    isotope: null,
    aromatic,
    chiral: null,
    isBracket,
    atomClass,
  };
}

function parseBracketAtom(content: string, id: number): Atom | null {
  // Simple bracket parser: [symbol] or [symbolH] or [symbol+] etc.
  let symbol = '';
  let isotope: number | null = null;
  let hydrogens = -1;
  let charge = 0;
  let chiral: string | null = null;
  let atomClass = 0;

  let j = 0;
  // isotope
  if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
    let isoStr = '';
    while (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
      isoStr += content[j]!;
      j++;
    }
    isotope = parseInt(isoStr);
  }
   // symbol (including wildcard *)
   if (j < content.length && (content[j]! >= 'A' && content[j]! <= 'Z' || content[j]! === '*')) {
     symbol += content[j]!;
     j++;
     if (j < content.length && content[j]! >= 'a' && content[j]! <= 'z') {
       symbol += content[j]!;
       j++;
     }
   } else {
     return null; // invalid
   }
  // rest: H, charge, etc. simplified
  while (j < content.length) {
    const c = content[j]!;
    if (c === 'H') {
      j++;
      if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
        hydrogens = parseInt(content[j]!);
        j++;
      } else {
        hydrogens = 1;
      }
    } else if (c === '+') {
      j++;
      // Check for multiple + signs (++, +++, etc.)
      let chargeCount = 1;
      while (j < content.length && content[j]! === '+') {
        chargeCount++;
        j++;
      }
      // If there's a digit after the + signs, use that instead
      if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
        charge = parseInt(content[j]!);
        j++;
      } else {
        charge = chargeCount;
      }
    } else if (c === '-') {
      j++;
      // Check for multiple - signs (--, ---, etc.)
      let chargeCount = 1;
      while (j < content.length && content[j]! === '-') {
        chargeCount++;
        j++;
      }
      // If there's a digit after the - signs, use that instead
      if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
        charge = -parseInt(content[j]!);
        j++;
      } else {
        charge = -chargeCount;
      }
    } else if (c === '@') {
      chiral = '@';
      j++;
      if (j < content.length && content[j]! === '@') {
        chiral = '@@';
        j++;
      } else {
        // Check for extended chirality: @TH1, @AL1, @SP1, @TB1, @OH1, etc.
        // Try to parse extended forms
        let extendedChiral = '@';
        let startJ = j;
        // Try TH1/TH2
        if (j + 2 < content.length && content.slice(j, j + 2) === 'TH' && /[12]/.test(content[j + 2]!)) {
          extendedChiral += 'TH' + content[j + 2]!;
          j += 3;
        }
        // Try AL1/AL2
        else if (j + 2 < content.length && content.slice(j, j + 2) === 'AL' && /[12]/.test(content[j + 2]!)) {
          extendedChiral += 'AL' + content[j + 2]!;
          j += 3;
        }
        // Try SP1/SP2/SP3
        else if (j + 2 < content.length && content.slice(j, j + 2) === 'SP' && /[123]/.test(content[j + 2]!)) {
          extendedChiral += 'SP' + content[j + 2]!;
          j += 3;
        }
        // Try TB1-TB20
        else if (j + 1 < content.length && content.slice(j, j + 2) === 'TB') {
          j += 2;
          let numStr = '';
          while (j < content.length && /\d/.test(content[j]!)) {
            numStr += content[j]!;
            j++;
          }
          let num = parseInt(numStr);
          if (num >= 1 && num <= 20) {
            extendedChiral += 'TB' + numStr;
          } else {
            j = startJ; // Reset if invalid
          }
        }
        // Try OH1-OH30
        else if (j + 1 < content.length && content.slice(j, j + 2) === 'OH') {
          j += 2;
          let numStr = '';
          while (j < content.length && /\d/.test(content[j]!)) {
            numStr += content[j]!;
            j++;
          }
          let num = parseInt(numStr);
          if (num >= 1 && num <= 30) {
            extendedChiral += 'OH' + numStr;
          } else {
            j = startJ; // Reset if invalid
          }
        }

        if (extendedChiral.length > 1) {
          chiral = extendedChiral;
        }
        // If no extended form matched, keep the basic '@'
      }
    } else if (c === ':') {
      j++;
      if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
        let classStr = '';
        while (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
          classStr += content[j]!;
          j++;
        }
        atomClass = parseInt(classStr);
      } else {
        // Invalid atom class, ignore
        j++;
      }
    } else {
      // ignore others for now
      j++;
    }
  }

  const atomicNumber = ATOMIC_NUMBERS[symbol];
  if (atomicNumber === undefined && !/^[A-Z][a-z]?$/.test(symbol)) {
    return null;
  }

  return {
    id,
    symbol,
    atomicNumber: atomicNumber || 0, // for unknown, 0
    charge,
    hydrogens,
    isotope,
    aromatic: false, // TODO
    chiral,
    isBracket: true,
    atomClass,
  };
}

function calculateValence(atom: Atom, bonds: Bond[]): number {
  let valence = 0;
  for (const bond of bonds) {
    if (bond.atom1 === atom.id || bond.atom2 === atom.id) {
      switch (bond.type) {
        case BondType.SINGLE:
          valence += 1;
          break;
        case BondType.DOUBLE:
          valence += 2;
          break;
        case BondType.TRIPLE:
          valence += 3;
          break;
        case BondType.QUADRUPLE:
          valence += 4;
          break;
        case BondType.AROMATIC:
          valence += 1.5; // aromatic bonds contribute 1.5 to valence
          break;
      }
    }
  }
  return valence;
}

function validateAromaticity(atoms: Atom[], bonds: Bond[], errors: string[]): void {
  // Basic aromaticity validation
  // For now, just check that aromatic atoms are in rings and have appropriate connectivity

  const aromaticAtoms = atoms.filter(a => a.aromatic);
  if (aromaticAtoms.length === 0) return;

  // Find rings containing aromatic atoms
  const rings = findRings(atoms, bonds);

  for (const atom of aromaticAtoms) {
    // Check if this aromatic atom is in at least one ring
    const atomInRing = rings.some(ring =>
      ring.some(ringAtomId => ringAtomId === atom.id)
    );

    if (!atomInRing) {
      errors.push({ message: `Aromatic atom ${atom.symbol} (id: ${atom.id}) is not in a ring`, position: -1 });
      // Mark as non-aromatic
      atom.aromatic = false;
    }

    // Check valence - aromatic atoms should typically have 2-3 bonds
    const atomBonds = bonds.filter(b => b.atom1 === atom.id || b.atom2 === atom.id);
    if (atomBonds.length < 2 || atomBonds.length > 3) {
      errors.push({ message: `Aromatic atom ${atom.symbol} (id: ${atom.id}) has ${atomBonds.length} bonds, expected 2-3`, position: -1 });
      atom.aromatic = false;
    }
  }

  // Check that aromatic rings have alternating aromatic bonds or appropriate Kekule form
  for (const ring of rings) {
    const ringAtoms = ring.map(id => atoms.find(a => a.id === id)!);
    const allAromatic = ringAtoms.every(a => a.aromatic);

    if (allAromatic) {
      // Check that bonds in the ring are aromatic
      const ringBonds = bonds.filter(b =>
        ring.includes(b.atom1) && ring.includes(b.atom2)
      );

      // For a proper aromatic ring, we expect alternating single/double or all aromatic
      const aromaticBondCount = ringBonds.filter(b => b.type === BondType.AROMATIC).length;
      const singleBondCount = ringBonds.filter(b => b.type === BondType.SINGLE).length;
      const doubleBondCount = ringBonds.filter(b => b.type === BondType.DOUBLE).length;

      // Allow either all aromatic bonds or alternating single/double
      if (aromaticBondCount !== ring.length && singleBondCount + doubleBondCount !== ring.length) {
        errors.push({ message: `Aromatic ring ${ring.join(',')} has inconsistent bond types`, position: -1 });
      }
    }
  }
}

function findRings(atoms: Atom[], bonds: Bond[]): number[][] {
  // Simple ring finding using DFS
  const rings: number[][] = [];
  const visited = new Set<number>();

  function dfs(startId: number, currentId: number, path: number[], visitedEdges: Set<string>): void {
    path.push(currentId);
    visited.add(currentId);

    const neighbors = bonds
      .filter(b => b.atom1 === currentId || b.atom2 === currentId)
      .map(b => b.atom1 === currentId ? b.atom2 : b.atom1)
      .filter(id => !visitedEdges.has(`${Math.min(currentId, id)}-${Math.max(currentId, id)}`));

    for (const neighborId of neighbors) {
      const edgeKey = `${Math.min(currentId, neighborId)}-${Math.max(currentId, neighborId)}`;
      visitedEdges.add(edgeKey);

      if (neighborId === startId && path.length >= 3) {
        // Found a ring
        rings.push([...path]);
      } else if (!path.includes(neighborId)) {
        dfs(startId, neighborId, [...path], new Set(visitedEdges));
      }

      visitedEdges.delete(edgeKey);
    }

    path.pop();
    visited.delete(currentId);
  }

  for (const atom of atoms) {
    if (!visited.has(atom.id)) {
      dfs(atom.id, atom.id, [], new Set());
    }
  }

  return rings;
}
