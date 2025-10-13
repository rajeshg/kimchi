import type { Atom, Bond, Molecule, ParseResult, ParseError } from './types';
import { BondType, StereoType } from './types';
import { ATOMIC_NUMBERS, DEFAULT_VALENCES, AROMATIC_VALENCES } from './src/constants';
import { calculateValence } from './src/utils/valence-calculator';
import { findRings } from './src/utils/ring-finder';
import { createAtom, isOrganicAtom } from './src/utils/atom-utils';
import { validateAromaticity } from './src/validators/aromaticity-validator';
import { validateValences } from './src/validators/valence-validator';
import { validateStereochemistry } from './src/validators/stereo-validator';
import { parseBracketAtom } from './src/parsers/bracket-parser';
import { maxBy, sortBy } from 'es-toolkit';

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
        let ringBondType = pendingBondType;
        let ringBondStereo = pendingBondStereo;
        let nextIdx = i + 1;
        if (nextIdx < smiles.length) {
          const nextCh = smiles[nextIdx]!;
          if (nextCh === '=') {
            ringBondType = BondType.DOUBLE;
            nextIdx++;
          } else if (nextCh === '#') {
            ringBondType = BondType.TRIPLE;
            nextIdx++;
          } else if (nextCh === '$') {
            ringBondType = BondType.QUADRUPLE;
            nextIdx++;
          } else if (nextCh === '/') {
            ringBondStereo = StereoType.UP;
            nextIdx++;
          } else if (nextCh === '\\') {
            ringBondStereo = StereoType.DOWN;
            nextIdx++;
          }
        }
        list.push({ atomId: prevAtomId, bondType: ringBondType, bondStereo: ringBondStereo });
        bookmarks.set(d, list);
        i = nextIdx;
      }
      pendingBondType = BondType.SINGLE;
      pendingBondStereo = StereoType.NONE;
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
        let ringBondType = pendingBondType;
        let ringBondStereo = pendingBondStereo;
        let nextIdx = i + 3;
        if (nextIdx < smiles.length) {
          const nextCh = smiles[nextIdx]!;
          if (nextCh === '=') {
            ringBondType = BondType.DOUBLE;
            nextIdx++;
          } else if (nextCh === '#') {
            ringBondType = BondType.TRIPLE;
            nextIdx++;
          } else if (nextCh === '$') {
            ringBondType = BondType.QUADRUPLE;
            nextIdx++;
          } else if (nextCh === '/') {
            ringBondStereo = StereoType.UP;
            nextIdx++;
          } else if (nextCh === '\\') {
            ringBondStereo = StereoType.DOWN;
            nextIdx++;
          }
        }
        list.push({ atomId: prevAtomId, bondType: ringBondType, bondStereo: ringBondStereo });
        bookmarks.set(d, list);
        i = nextIdx;
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

  // Post-process ring closures
  for (const [digit, entries] of bookmarks) {
    if (entries.length < 2) {
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
    
    let bondType = BondType.SINGLE;
    let bondStereo: StereoType = StereoType.NONE;
    
    if (first.bondType !== BondType.SINGLE && second.bondType !== BondType.SINGLE) {
      if (first.bondType !== second.bondType) {
        errors.push({ message: `Ring closure ${digit} has conflicting bond types`, position: -1 });
      }
      bondType = first.bondType;
      bondStereo = first.bondStereo || second.bondStereo || StereoType.NONE;
    } else if (first.bondType !== BondType.SINGLE) {
      bondType = first.bondType;
      bondStereo = first.bondStereo || StereoType.NONE;
    } else if (second.bondType !== BondType.SINGLE) {
      bondType = second.bondType;
      bondStereo = second.bondStereo || StereoType.NONE;
    }
    
    bonds.push({ atom1: first.atomId, atom2: second.atomId, type: bondType, stereo: bondStereo });

    // If more than two distinct endpoints exist, report an error
    const distinct = Array.from(new Set(entries.map(e => e.atomId)));
    if (distinct.length > 2) {
      errors.push({ message: `Ring closure digit ${digit} used more than twice with endpoints ${distinct.join(',')}`, position: -1 });
    }
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
    if (a1.aromatic && a2.aromatic) bond.type = BondType.AROMATIC;
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

  // Store original aromatic flags before validation (for two-pass hydrogen calculation)
  const originalAromaticFlags = new Map(atoms.map(a => [a.id, a.aromatic]));

  // Validate aromaticity (first pass)
  validateAromaticity(atoms, bonds, errors);

  // Two-pass hydrogen calculation for 5-membered aromatic rings
  // If aromaticity validation failed, try adjusting N/P atoms to have +1 H
  const aromaticErrors = errors.filter(e => e.message.includes("Hückel's 4n+2 rule"));
  if (aromaticErrors.length > 0) {
    // Extract ring atom IDs from error messages
    const failedRings = aromaticErrors.map(e => {
      const match = e.message.match(/Ring ([\d,]+)/);
      if (match) {
        return match[1]!.split(',').map(Number);
      }
      return null;
    }).filter((r): r is number[] => r !== null && r.length === 5);

    // For each failed 5-membered ring, try adjusting N/P atoms
    for (const ringIds of failedRings) {
      if (!ringIds) continue;
      
      // Get ring atoms
      const ringAtoms = ringIds.map(id => atoms.find(a => a.id === id)!);
      
      // Find N/P atoms in the ring with 0 hydrogens
      const adjustableAtoms = ringAtoms
        .filter(a => (a.symbol === 'N' || a.symbol === 'P') && a.hydrogens === 0 && !a.isBracket);

      if (adjustableAtoms.length > 0) {
        const oldHydrogens = adjustableAtoms.map(a => a.hydrogens);
        let success = false;

        // Try giving exactly one N/P atom 1 hydrogen (for heterocycles like imidazole)
        for (let i = 0; i < adjustableAtoms.length; i++) {
          // Reset all to 0
          adjustableAtoms.forEach(a => a.hydrogens = 0);
          // Set only the i-th atom to 1
          adjustableAtoms[i]!.hydrogens = 1;
          
          // Restore original aromatic flags before re-validating
          ringAtoms.forEach(a => a.aromatic = originalAromaticFlags.get(a.id)!);

          // Re-validate aromaticity
          const testErrors: ParseError[] = [];
          validateAromaticity(atoms, bonds, testErrors);

          // Check if this specific ring now passes
          const ringIdStr = ringIds.join(',');
          const stillFails = testErrors.some(e => e.message.includes(`Ring ${ringIdStr}`));

          if (!stillFails) {
            // Success! Remove the old error for this ring
            const errorIndex = errors.findIndex(e => e.message.includes(`Ring ${ringIdStr}`));
            if (errorIndex >= 0) {
              errors.splice(errorIndex, 1);
            }
            success = true;
            break;
          }
        }

        if (!success) {
          // Revert the changes
          adjustableAtoms.forEach((a, i) => a.hydrogens = oldHydrogens[i]!);
        }
      }
    }
  }

  // Validate valences
  validateValences(atoms, bonds, errors);

  // Validate stereochemistry
  validateStereochemistry(atoms, bonds, errors);

  return { molecule: { atoms, bonds }, errors };
}










