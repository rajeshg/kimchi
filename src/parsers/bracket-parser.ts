import type { Atom } from '../../types';
import { ATOMIC_NUMBERS } from '../constants';

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