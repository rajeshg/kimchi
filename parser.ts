import type { Atom, Bond, Molecule, ParseResult } from './types';
import { BondType, StereoType } from './types';

// Basic atomic numbers for organic subset
const ATOMIC_NUMBERS: Record<string, number> = {
  H: 1,
  B: 5,
  C: 6,
  N: 7,
  O: 8,
  F: 9,
  P: 15,
  S: 16,
  Cl: 17,
  Br: 35,
  I: 53,
};

// Default valences for organic subset
const DEFAULT_VALENCES: Record<string, number[]> = {
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
};

export function parseSMILES(smiles: string): ParseResult {
  const errors: string[] = [];
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

function parseSingleSMILES(smiles: string): { molecule: Molecule; errors: string[] } {
  const errors: string[] = [];
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
        errors.push(`Unclosed bracket at position ${i}`);
      } else {
        i++; // skip ]
      }
      const atom = parseBracketAtom(content, atomId++);
      if (!atom) {
        errors.push(`Invalid bracket atom: ${content}`);
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
      const aromatic = symbol !== symbol.toUpperCase();
      const atom = createAtom(symbol, atomId++, aromatic);
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

    // Branching
    if (ch === '(') {
      branchStack.push(prevAtomId!);
      prevAtomId = null;
      i++;
      continue;
    }
    if (ch === ')') {
      if (branchStack.length === 0) {
        errors.push(`Unmatched ')' at position ${i}`);
      } else {
        prevAtomId = branchStack.pop()!;
      }
      i++;
      continue;
    }

    // Ring closures: digit or %nn
    if (ch >= '0' && ch <= '9') {
      if (prevAtomId === null) {
        errors.push(`Ring closure digit at position ${i} without previous atom`);
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
        errors.push(`Ring closure % at position ${i} without previous atom`);
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
        errors.push(`Invalid % ring closure at position ${i}`);
        i++;
        continue;
      }
    }

    errors.push(`Unsupported character: ${ch} at position ${i}`);
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
      errors.push(`Ring closure digit ${digit} endpoints identical: ${entries.map(e => e.atomId).join(',')}`);
      continue;
    }

    const first = entries[firstIndex]!;
    const second = entries[secondIndex]!;
    console.warn(`Pairing ring ${digit}: ${first.atomId} - ${second.atomId} (type from second ${second.bondType})`);
    bonds.push({ atom1: first.atomId, atom2: second.atomId, type: second.bondType, stereo: second.bondStereo });

    // If more than two distinct endpoints exist, report an error
    const distinct = Array.from(new Set(entries.map(e => e.atomId)));
    if (distinct.length > 2) {
      errors.push(`Ring closure digit ${digit} used more than twice with endpoints ${distinct.join(',')}`);
    }
  }
  console.warn('Bonds at end of pairing:', bonds.map(b => `${b.atom1}-${b.atom2}`));

  if (branchStack.length > 0) errors.push('Unmatched opening parentheses');

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
    if (atom.hydrogens === 0) {
      const valence = calculateValence(atom, bonds);
      const defaultValences = DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber];
      const expectedValence = defaultValences[0] || atom.atomicNumber;
      atom.hydrogens = Math.max(0, expectedValence - valence);
    }
  }

  return { molecule: { atoms, bonds }, errors };
}

function isOrganicAtom(char: string): boolean {
  return /^[BCNOPSFI]$/.test(char.toUpperCase());
}

function createAtom(symbol: string, id: number, aromatic = false, isBracket = false): Atom {
  const upperSymbol = symbol.toUpperCase();
  const atomicNumber = ATOMIC_NUMBERS[upperSymbol];
  if (atomicNumber === undefined) {
    throw new Error(`Unknown atomic number for symbol: ${symbol}`);
  }
  return {
    id,
    symbol: upperSymbol, // normalize to uppercase
    atomicNumber,
    charge: 0,
    hydrogens: 0, // will calculate later
    isotope: null,
    aromatic,
    chiral: null,
    isBracket,
  };
}

function parseBracketAtom(content: string, id: number): Atom | null {
  // Simple bracket parser: [symbol] or [symbolH] or [symbol+] etc.
  let symbol = '';
  let isotope: number | null = null;
  let hydrogens = 0;
  let charge = 0;
  let chiral: string | null = null;

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
  // symbol
  if (j < content.length && content[j]! >= 'A' && content[j]! <= 'Z') {
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
      if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
        charge = parseInt(content[j]!);
        j++;
      } else {
        charge = 1;
      }
    } else if (c === '-') {
      j++;
      if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
        charge = -parseInt(content[j]!);
        j++;
      } else {
        charge = -1;
      }
    } else if (c === '@') {
      chiral = '@';
      j++;
      if (j < content.length && content[j]! === '@') {
        chiral = '@@';
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
        case BondType.AROMATIC:
          valence += 1.5; // approximate
          break;
      }
    }
  }
  return valence;
}
