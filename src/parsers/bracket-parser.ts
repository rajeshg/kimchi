import type { Atom } from 'types';
import { ATOMIC_NUMBERS } from 'src/constants';

/**
 * Parse bracket atom notation like [C], [NH4+], [13CH3@TH1:2]
 */
export function parseBracketAtom(content: string, id: number): Atom | null {
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
  // symbol (including wildcard * and aromatic lowercase symbols)
  let aromatic = false;
  if (j < content.length) {
    const firstChar = content[j]!;
    if (firstChar === '*') {
      symbol += firstChar;
      j++;
    } else if (firstChar >= 'A' && firstChar <= 'Z') {
      // Regular uppercase element
      symbol += firstChar;
      j++;
      if (j < content.length && content[j]! >= 'a' && content[j]! <= 'z') {
        symbol += content[j]!;
        j++;
      }
    } else if (firstChar >= 'a' && firstChar <= 'z') {
      // Aromatic lowercase symbol (b, c, n, o, p, s, se, as)
      aromatic = true;
      symbol += firstChar.toUpperCase(); // Store as uppercase
      j++;
      if (j < content.length && content[j]! >= 'a' && content[j]! <= 'z') {
        // Two-letter aromatic like 'se' or 'as'
        symbol += content[j]!.toLowerCase();
        j++;
      }
    } else {
      return null; // invalid
    }
  } else {
    return null; // empty content
  }
  // rest: H, charge, etc. simplified
  while (j < content.length) {
    const c = content[j]!;
    if (c === 'H') {
      j++;
      if (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
        let hStr = '';
        while (j < content.length && content[j]! >= '0' && content[j]! <= '9') {
          hStr += content[j]!;
          j++;
        }
        hydrogens = parseInt(hStr);
      } else {
        hydrogens = 1;
      }
    } else if (c === '+') {
      j++;
      // Count consecutive + signs (++, +++ -> equivalent to numeric count)
      let plusCount = 1;
      while (j < content.length && content[j]! === '+') {
        plusCount++;
        j++;
      }
      // If there's a numeric value after the plus signs, parse full number
      if (j < content.length && /[0-9]/.test(content[j]!)) {
        let numStr = '';
        while (j < content.length && /[0-9]/.test(content[j]!)) {
          numStr += content[j]!;
          j++;
        }
        charge = parseInt(numStr);
      } else {
        charge = plusCount;
      }
    } else if (c === '-') {
      j++;
      // Count consecutive - signs
      let minusCount = 1;
      while (j < content.length && content[j]! === '-') {
        minusCount++;
        j++;
      }
      // If there's a numeric value after the minus signs, parse full number
      if (j < content.length && /[0-9]/.test(content[j]!)) {
        let numStr = '';
        while (j < content.length && /[0-9]/.test(content[j]!)) {
          numStr += content[j]!;
          j++;
        }
        charge = -parseInt(numStr);
      } else {
        charge = -minusCount;
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
    aromatic,
    chiral,
    isBracket: true,
    atomClass,
  };
}