import type { Atom, Bond, Molecule, ParseResult, ParseError } from '../types';
import { BondType, StereoType } from '../types';
import { ATOMIC_NUMBERS, DEFAULT_VALENCES, AROMATIC_VALENCES } from './constants';
import { createAtom } from './utils/atom-utils';
import { validateAromaticity } from './validators/aromaticity-validator';
import { validateValences } from './validators/valence-validator';
import { validateStereochemistry } from './validators/stereo-validator';
import { parseBracketAtom } from './parsers/bracket-parser';
import { maxBy } from 'es-toolkit';
import { enrichMolecule } from './utils/molecule-enrichment';

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
  const explicitBonds = new Set<string>();

  const bondKey = (a1: number, a2: number) => {
    const [min, max] = a1 < a2 ? [a1, a2] : [a2, a1];
    return `${min}-${max}`;
  };

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
  let pendingBondExplicit = false;
  const branchStack: number[] = [];
  const bookmarks = new Map<number, { atomId: number; bondType: BondType; bondStereo: StereoType; explicit: boolean }[]>();


  while (i < smiles.length) {
    const ch = smiles[i]!;


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
        if (pendingBondExplicit) explicitBonds.add(bondKey(prevAtomId, atom.id));
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({ atom1: bp, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        if (pendingBondExplicit) explicitBonds.add(bondKey(bp, atom.id));
        pendingBondStereo = StereoType.NONE;
      }
      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      pendingBondExplicit = false;
      continue;
    }

    // Wildcard atom '*' (can be aromatic or aliphatic)
    if (ch === '*') {
      const atom = createAtom('*', atomId++, false, false, 0);
      atoms.push(atom);
      if (prevAtomId !== null) {
        bonds.push({ atom1: prevAtomId, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        if (pendingBondExplicit) explicitBonds.add(bondKey(prevAtomId, atom.id));
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({ atom1: bp, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        if (pendingBondExplicit) explicitBonds.add(bondKey(bp, atom.id));
        pendingBondStereo = StereoType.NONE;
      }
      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      pendingBondExplicit = false;
      i++;
      continue;
    }

    // Organic atoms (handle two-letter like Cl, Br)
    if (/[A-Za-z]/.test(ch)) {
      let symbol = ch;
      // Only treat as two-letter element when the first character is uppercase
      // and the next character is lowercase AND the combination is a valid element
      if (ch === ch.toUpperCase() && i + 1 < smiles.length && /[a-z]/.test(smiles[i + 1]!)) {
        const twoLetter = ch + smiles[i + 1]!;
        const nextChar = smiles[i + 1]!;
        const singleLetterUpper = ch.toUpperCase();
        const twoLetterIsValid = ATOMIC_NUMBERS[twoLetter] !== undefined;
        
        // Ambiguous case: "Xy" where both "Xy" and "X" + "y" could be valid
        // Examples: Cn (Copernicium vs C+n), Sn (tin vs S+n), Cs (cesium vs C+s)
        //
        // Rule: Split into "X" + "y" if ALL of the following are true:
        // 1. "y" is an aromatic organic atom (bcnosp)
        // 2. "X" alone is a common organic element (C, N, O, S, P, B)
        // 3. What follows "y" suggests it's a separate atom (ring digit, bond, branch, @, etc.)
        //
        // This allows "Cn1ccnc1" -> C + n + ... but "Cs" -> cesium
        
        const isNextCharAromaticOrganic = /^[bcnosp]$/.test(nextChar);
        const isFirstCharCommonOrganic = /^[CNOSPB]$/.test(singleLetterUpper);
        
        let shouldSplit = false;
        if (twoLetterIsValid && isNextCharAromaticOrganic && isFirstCharCommonOrganic) {
          // Check what follows the second character
          const charAfterNext = i + 2 < smiles.length ? smiles[i + 2]! : '';
          // Split if followed by: digit (ring), =/#/$ (bond), @ (chirality), ( (branch)
          // Do NOT split if at end of string or followed by other characters
          const followedByAtomContext = charAfterNext !== '' && /^[0-9=\/#$@(]/.test(charAfterNext);
          shouldSplit = followedByAtomContext;
        }
        
        if (twoLetterIsValid && !shouldSplit) {
          symbol = twoLetter;
          i += 2;
        } else {
          i++;
        }
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
        if (pendingBondExplicit) explicitBonds.add(bondKey(prevAtomId, atom.id));
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({ atom1: bp, atom2: atom.id, type: pendingBondType, stereo: pendingBondStereo });
        if (pendingBondExplicit) explicitBonds.add(bondKey(bp, atom.id));
        pendingBondStereo = StereoType.NONE;
      }

      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      pendingBondExplicit = false;
      continue;
    }

    // Bonds
    if (ch === '-') {
      pendingBondType = BondType.SINGLE;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === '/') {
      pendingBondStereo = StereoType.UP;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === '\\') {
      pendingBondStereo = StereoType.DOWN;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === '=') {
      pendingBondType = BondType.DOUBLE;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === '#') {
      pendingBondType = BondType.TRIPLE;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === '$') {
      pendingBondType = BondType.QUADRUPLE;
      pendingBondExplicit = true;
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
        list.push({ atomId: prevAtomId, bondType: pendingBondType, bondStereo: pendingBondStereo, explicit: pendingBondExplicit });
        bookmarks.set(d, list);
        i++;
      }
      pendingBondType = BondType.SINGLE;
      pendingBondStereo = StereoType.NONE;
      pendingBondExplicit = false;
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
        list.push({ atomId: prevAtomId, bondType: pendingBondType, bondStereo: pendingBondStereo, explicit: pendingBondExplicit });
        bookmarks.set(d, list);
        i += 3;
        pendingBondType = BondType.SINGLE;
        pendingBondStereo = StereoType.NONE;
        pendingBondExplicit = false;
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

  // Post-process ring closures
  for (const [digit, entries] of bookmarks) {
    if (entries.length < 2) continue;

    // Pair up endpoints in chronological order, but never pair an atom with itself.
    const used = new Array(entries.length).fill(false);
    for (let i = 0; i < entries.length; i++) {
      if (used[i]) continue;
      const first = entries[i]!;
      // find next unused entry with a different atomId
      let pairedIndex = -1;
      for (let j = i + 1; j < entries.length; j++) {
        if (used[j]) continue;
        if (entries[j]!.atomId !== first.atomId) {
          pairedIndex = j;
          break;
        }
      }

      if (pairedIndex === -1) {
        // No pair found for this endpoint; record an error and skip
        errors.push({ message: `Ring closure digit ${digit} has unmatched endpoint atom ${first.atomId}`, position: -1 });
        used[i] = true;
        continue;
      }

      const second = entries[pairedIndex]!;

      let bondType = BondType.SINGLE;
      let bondStereo: StereoType = StereoType.NONE;
      let isExplicit = false;

      if (first.bondType !== BondType.SINGLE && second.bondType !== BondType.SINGLE) {
        if (first.bondType !== second.bondType) {
          errors.push({ message: `Ring closure ${digit} has conflicting bond types`, position: -1 });
        }
        bondType = first.bondType;
        bondStereo = first.bondStereo || second.bondStereo || StereoType.NONE;
        isExplicit = first.explicit || second.explicit;
      } else if (first.bondType !== BondType.SINGLE) {
        bondType = first.bondType;
        bondStereo = first.bondStereo || StereoType.NONE;
        isExplicit = first.explicit;
      } else if (second.bondType !== BondType.SINGLE) {
        bondType = second.bondType;
        bondStereo = second.bondStereo || StereoType.NONE;
        isExplicit = second.explicit;
      } else {
        // Both are SINGLE, check if either is explicit
        isExplicit = first.explicit || second.explicit;
      }

      bonds.push({ atom1: first.atomId, atom2: second.atomId, type: bondType, stereo: bondStereo });
      if (isExplicit) explicitBonds.add(bondKey(first.atomId, second.atomId));

      used[i] = true;
      used[pairedIndex] = true;
    }

    // Note: Allowing more than two endpoints for compatibility with RDKit
  }
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
    if (a1.aromatic && a2.aromatic && !explicitBonds.has(bondKey(bond.atom1, bond.atom2))) {
      bond.type = BondType.AROMATIC;
    }
  }

  for (const atom of atoms) {
    if (atom.isBracket) {
      // Bracket atoms have explicit hydrogen count, default to 0 if not specified
      if (atom.hydrogens < 0) {
        atom.hydrogens = 0;
      }
    } else {
      // Calculate implicit hydrogens for non-bracket atoms
      // For hydrogen calculation, aromatic bonds count as 1.0 (not 1.5)
      let bondOrderSum = 0;
      for (const bond of bonds) {
        if (bond.atom1 === atom.id || bond.atom2 === atom.id) {
          switch (bond.type) {
            case BondType.SINGLE:
            case BondType.AROMATIC:
              bondOrderSum += 1;
              break;
            case BondType.DOUBLE:
              bondOrderSum += 2;
              break;
            case BondType.TRIPLE:
              bondOrderSum += 3;
              break;
            case BondType.QUADRUPLE:
              bondOrderSum += 4;
              break;
          }
        }
      }
      
      // Special handling for wildcard atom '*'
      if (atom.symbol === '*') {
        // Wildcard atom takes valence from its bonds, no implicit hydrogens
        atom.hydrogens = 0;
      } else {
        // Use aromatic valences for aromatic atoms, default valences otherwise
        const defaultValences = atom.aromatic 
          ? (AROMATIC_VALENCES[atom.symbol] || DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber])
          : (DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber]);
        // Per OpenSMILES spec: if bond sum equals a known valence or exceeds all known valences, H count = 0
        // Otherwise H count = (next highest known valence) - bond sum
        const maxValence = maxBy(defaultValences, (v) => v) ?? 0;
        if (bondOrderSum >= maxValence) {
          atom.hydrogens = 0;
        } else {
          // Find the next highest valence
          let targetValence = maxValence;
          for (const v of defaultValences.sort((a, b) => a - b)) {
            if (v >= bondOrderSum) {
              targetValence = v;
              break;
            }
          }
          atom.hydrogens = Math.max(0, targetValence + (atom.charge || 0) - bondOrderSum);
        }
      }
    }
  }

  // Validate aromaticity
  validateAromaticity(atoms, bonds, errors);

  // Validate valences
  validateValences(atoms, bonds, errors);

  // Validate stereochemistry
  validateStereochemistry(atoms, bonds, errors);

  const molecule: Molecule = { atoms, bonds };
  
  enrichMolecule(molecule);

  return { molecule, errors };
}










