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

  // Parser with branches and rings
  let i = 0;
  let prevAtomId: number | null = null;
  let pendingBondType = BondType.SINGLE;
  const branchStack: number[] = []; // stack of prevAtomId before branch
  const ringMap = new Map<number, number>(); // ring digit to atom id

  while (i < smiles.length) {
    const char = smiles[i]!;

    if (char === ' ') {
      i++;
      continue; // skip spaces
    }

    if (isOrganicAtom(char)) {
      const aromatic = char !== char.toUpperCase();
      const currentAtom = createAtom(char, atomId++, aromatic);
      atoms.push(currentAtom);

      // parse ring closures
      const ringClosures: number[] = [];
      i++;
      while (i < smiles.length) {
        const next = smiles[i]!;
        if (next >= '0' && next <= '9') {
          const digit = parseInt(next);
          ringClosures.push(digit);
          if (ringMap.has(digit)) {
            const ringAtomId = ringMap.get(digit)!;
            bonds.push({
              atom1: ringAtomId,
              atom2: currentAtom.id,
              type: BondType.SINGLE, // ring closures are single bonds
              stereo: StereoType.NONE,
            });
            ringMap.delete(digit); // closed
          } else {
            ringMap.set(digit, currentAtom.id);
          }
          i++;
        } else if (next === '%') {
          // two-digit
          i++;
          if (i < smiles.length) {
            const tens = smiles[i]!;
            if (tens >= '0' && tens <= '9') {
              if (i + 1 < smiles.length) {
                const units = smiles[i + 1]!;
                if (units >= '0' && units <= '9') {
                  const digit = parseInt(tens + units);
                  ringClosures.push(digit);
                  if (ringMap.has(digit)) {
                    const ringAtomId = ringMap.get(digit)!;
                    bonds.push({
                      atom1: ringAtomId,
                      atom2: currentAtom.id,
                      type: BondType.SINGLE,
                      stereo: StereoType.NONE,
                    });
                    ringMap.delete(digit);
                  } else {
                    ringMap.set(digit, currentAtom.id);
                  }
                  i += 2;
                } else {
                  errors.push(`Invalid % digit at position ${i - 1}`);
                  i++;
                }
              } else {
                errors.push(`Invalid % at position ${i - 1}`);
                i++;
              }
            } else {
              errors.push(`Invalid % at position ${i - 1}`);
              i++;
            }
          }
        } else {
          break;
        }
      }
      currentAtom.ringClosures = ringClosures;

      // parse chiral
      if (i < smiles.length && smiles[i] === '@') {
        i++;
        if (i < smiles.length && smiles[i] === '@') {
          currentAtom.chiral = '@@';
          i++;
        } else {
          currentAtom.chiral = '@';
        }
      }

      if (prevAtomId !== null) {
        bonds.push({
          atom1: prevAtomId,
          atom2: currentAtom.id,
          type: pendingBondType,
          stereo: StereoType.NONE,
        });
      } else if (branchStack.length > 0) {
        // branch atom
        const branchPoint = branchStack[branchStack.length - 1]!;
        bonds.push({
          atom1: branchPoint,
          atom2: currentAtom.id,
          type: pendingBondType,
          stereo: StereoType.NONE,
        });
      }
      prevAtomId = currentAtom.id;
      pendingBondType = BondType.SINGLE; // reset
    }
    else if (char === '[') {
      // bracket atom
      i++;
      let bracketContent = '';
      while (i < smiles.length && smiles[i] !== ']') {
        bracketContent += smiles[i]!;
        i++;
      }
      if (i >= smiles.length || smiles[i] !== ']') {
        errors.push(`Unclosed bracket at position ${i}`);
      } else {
        i++; // skip ]
      }
      const currentAtom = parseBracketAtom(bracketContent, atomId++);
      if (currentAtom !== null) {
        atoms.push(currentAtom);

        // parse ring closures after ]
        const ringClosures: number[] = [];
        while (i < smiles.length) {
          const next = smiles[i]!;
          if (next >= '0' && next <= '9') {
            const digit = parseInt(next);
            ringClosures.push(digit);
            if (ringMap.has(digit)) {
              const ringAtomId = ringMap.get(digit)!;
              bonds.push({
                atom1: ringAtomId,
                atom2: currentAtom.id,
                type: BondType.SINGLE,
                stereo: StereoType.NONE,
              });
              ringMap.delete(digit);
            } else {
              ringMap.set(digit, currentAtom.id);
            }
            i++;
          } else if (next === '%') {
            i++;
            if (i < smiles.length) {
              const tens = smiles[i]!;
            if (tens >= '0' && tens <= '9') {
              if (i + 1 < smiles.length) {
                const units = smiles[i + 1]!;
                if (units >= '0' && units <= '9') {
                  const digit = parseInt(tens + units);
                  ringClosures.push(digit);
                  if (ringMap.has(digit)) {
                    const ringAtomId = ringMap.get(digit)!;
                    bonds.push({
                      atom1: ringAtomId,
                      atom2: currentAtom.id,
                      type: BondType.SINGLE,
                      stereo: StereoType.NONE,
                    });
                    ringMap.delete(digit);
                  } else {
                    ringMap.set(digit, currentAtom.id);
                  }
                  i += 2;
                } else {
                  errors.push(`Invalid % digit at position ${i - 1}`);
                  i++;
                }
              } else {
                errors.push(`Invalid % at position ${i - 1}`);
                i++;
              }
            } else {
              errors.push(`Invalid % at position ${i - 1}`);
              i++;
            }
            }
          } else {
            break;
          }
        }
        currentAtom.ringClosures = ringClosures;
      } else {
        errors.push(`Invalid bracket atom: ${bracketContent}`);
      }

      if (prevAtomId !== null) {
        bonds.push({
          atom1: prevAtomId,
          atom2: currentAtom!.id,
          type: pendingBondType,
          stereo: StereoType.NONE,
        });
      } else if (branchStack.length > 0) {
        // branch atom
        const branchPoint = branchStack[branchStack.length - 1]!;
        bonds.push({
          atom1: branchPoint,
          atom2: currentAtom!.id,
          type: pendingBondType,
          stereo: StereoType.NONE,
        });
      }
      prevAtomId = currentAtom!.id;
      pendingBondType = BondType.SINGLE; // reset
    } else if (char === '=') {
      pendingBondType = BondType.DOUBLE;
      i++;
    } else if (char === '#') {
      pendingBondType = BondType.TRIPLE;
      i++;
    } else if (char === '(') {
      // start branch
      branchStack.push(prevAtomId!); // the atom before branch
      prevAtomId = null; // branch starts new chain
      i++;
    } else if (char === ')') {
      // end branch
      if (branchStack.length === 0) {
        errors.push(`Unmatched ')' at position ${i}`);
      } else {
        prevAtomId = branchStack.pop()!; // restore prev
      }
      i++;
    } else {
      errors.push(`Unsupported character: ${char} at position ${i}`);
      i++;
    }
  }

  if (branchStack.length > 0) {
    errors.push('Unmatched opening parentheses');
  }

  // Set aromatic bonds
  for (const bond of bonds) {
    const atom1 = atoms.find(a => a.id === bond.atom1)!;
    const atom2 = atoms.find(a => a.id === bond.atom2)!;
    if (atom1.aromatic && atom2.aromatic) {
      bond.type = BondType.AROMATIC;
    }
  }

  // Calculate implicit hydrogens
  for (const atom of atoms) {
    if (atom.hydrogens === 0) { // only for atoms without explicit H
      const valence = calculateValence(atom, bonds);
      const defaultValences = DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber]; // fallback
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
    ringClosures: [],
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
    ringClosures: [],
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