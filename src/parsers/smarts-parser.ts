import type {
  SMARTSPattern,
  PatternAtom,
  PatternBond,
  AtomPrimitive,
  BondPrimitive,
  LogicalExpression,
  AtomPrimitiveType,
  BondPrimitiveType,
} from "src/types/smarts-types";

function isAtomAromatic(atom: PatternAtom): boolean {
  if (atom.primitives) {
    return atom.primitives.some(
      (p) => p.type === "aromatic_element" || p.type === "aromatic",
    );
  }
  return false;
}

function isAtomAliphatic(atom: PatternAtom): boolean {
  if (atom.primitives) {
    return atom.primitives.some(
      (p) => p.type === "aliphatic_element" || p.type === "aliphatic",
    );
  }
  return false;
}

function canMatchBothAromaticAndAliphatic(atom: PatternAtom): boolean {
  if (!atom.primitives || atom.primitives.length === 0) {
    return true;
  }
  return atom.primitives.some(
    (p) =>
      p.type === "atomic_number" ||
      p.type === "element" ||
      p.type === "wildcard",
  );
}

function getImplicitBondType(
  atoms: PatternAtom[],
  fromIndex: number,
  toIndex: number,
): BondPrimitive[] {
  const fromAtom = atoms[fromIndex];
  const toAtom = atoms[toIndex];

  if (
    fromAtom &&
    toAtom &&
    isAtomAromatic(fromAtom) &&
    isAtomAromatic(toAtom)
  ) {
    return [{ type: "aromatic" }];
  }

  if (
    fromAtom &&
    toAtom &&
    ((isAtomAliphatic(fromAtom) && isAtomAromatic(toAtom)) ||
      (isAtomAromatic(fromAtom) && isAtomAliphatic(toAtom)))
  ) {
    return [{ type: "any" }];
  }

  if (
    fromAtom &&
    toAtom &&
    (canMatchBothAromaticAndAliphatic(fromAtom) ||
      canMatchBothAromaticAndAliphatic(toAtom))
  ) {
    return [{ type: "any" }];
  }

  return [{ type: "single" }];
}

export function parseSMARTS(pattern: string): {
  pattern: SMARTSPattern | null;
  errors: string[];
} {
  const errors: string[] = [];

  if (!pattern || pattern.trim().length === 0) {
    errors.push("Empty SMARTS pattern");
    return { pattern: null, errors };
  }

  const atoms: PatternAtom[] = [];
  const bonds: PatternBond[] = [];
  const ringClosures = new Map<
    string,
    { atomIndex: number; bond?: BondPrimitive[] }
  >();
  const parentStack: number[] = [];

  let i = 0;
  let atomIndex = 0;
  let lastAtomIndex = -1;
  let pendingBond: BondPrimitive[] | undefined = undefined;

  while (i < pattern.length) {
    const char = pattern[i]!;

    if (char === "[") {
      const result = parseBracketAtom(pattern, i);
      if (result.error) {
        errors.push(result.error);
        return { pattern: null, errors };
      }

      atoms.push({
        index: atomIndex,
        primitives: result.primitives,
        logicalExpression: result.logicalExpression,
        recursive: result.recursive,
      });

      if (lastAtomIndex >= 0) {
        bonds.push({
          from: lastAtomIndex,
          to: atomIndex,
          primitives:
            pendingBond ||
            result.precedingBond ||
            getImplicitBondType(atoms, lastAtomIndex, atomIndex),
        });
        pendingBond = undefined;
      }

      lastAtomIndex = atomIndex;
      atomIndex++;
      i = result.nextIndex;

      const ringResult = parseRingClosures(
        pattern,
        i,
        atomIndex - 1,
        ringClosures,
        bonds,
        atoms,
        pendingBond,
      );
      pendingBond = undefined;
      i = ringResult.nextIndex;
      if (ringResult.error) {
        errors.push(ringResult.error);
        return { pattern: null, errors };
      }
    } else if (char === "(") {
      parentStack.push(lastAtomIndex);
      i++;
    } else if (char === ")") {
      lastAtomIndex = parentStack.pop() ?? -1;
      i++;
    } else if (isOrganicSubset(char)) {
      const result = parseOrganicAtom(pattern, i);

      atoms.push({
        index: atomIndex,
        primitives: result.primitives,
      });

      if (lastAtomIndex >= 0) {
        bonds.push({
          from: lastAtomIndex,
          to: atomIndex,
          primitives:
            pendingBond ||
            result.precedingBond ||
            getImplicitBondType(atoms, lastAtomIndex, atomIndex),
        });
        pendingBond = undefined;
      }

      lastAtomIndex = atomIndex;
      atomIndex++;
      i = result.nextIndex;

      const ringResult = parseRingClosures(
        pattern,
        i,
        atomIndex - 1,
        ringClosures,
        bonds,
        atoms,
        pendingBond,
      );
      pendingBond = undefined;
      i = ringResult.nextIndex;
      if (ringResult.error) {
        errors.push(ringResult.error);
        return { pattern: null, errors };
      }
    } else if (isBondSymbol(char)) {
      pendingBond = parseBondSymbol(char);
      i++;
    } else if (char === "*") {
      atoms.push({
        index: atomIndex,
        primitives: [{ type: "wildcard" }],
      });

      if (lastAtomIndex >= 0) {
        bonds.push({
          from: lastAtomIndex,
          to: atomIndex,
          primitives: pendingBond || [{ type: "single" }],
        });
        pendingBond = undefined;
      }

      lastAtomIndex = atomIndex;
      atomIndex++;
      i++;

      const ringResult = parseRingClosures(
        pattern,
        i,
        atomIndex - 1,
        ringClosures,
        bonds,
        atoms,
        pendingBond,
      );
      pendingBond = undefined;
      i = ringResult.nextIndex;
      if (ringResult.error) {
        errors.push(ringResult.error);
        return { pattern: null, errors };
      }
    } else if (char === "A") {
      atoms.push({
        index: atomIndex,
        primitives: [{ type: "aliphatic" }],
      });

      if (lastAtomIndex >= 0) {
        bonds.push({
          from: lastAtomIndex,
          to: atomIndex,
          primitives: pendingBond || [{ type: "single" }],
        });
        pendingBond = undefined;
      }

      lastAtomIndex = atomIndex;
      atomIndex++;
      i++;

      const ringResult = parseRingClosures(
        pattern,
        i,
        atomIndex - 1,
        ringClosures,
        bonds,
        atoms,
        pendingBond,
      );
      pendingBond = undefined;
      i = ringResult.nextIndex;
      if (ringResult.error) {
        errors.push(ringResult.error);
        return { pattern: null, errors };
      }
    } else if (char === "a") {
      atoms.push({
        index: atomIndex,
        primitives: [{ type: "aromatic" }],
      });

      if (lastAtomIndex >= 0) {
        bonds.push({
          from: lastAtomIndex,
          to: atomIndex,
          primitives:
            pendingBond || getImplicitBondType(atoms, lastAtomIndex, atomIndex),
        });
        pendingBond = undefined;
      }

      lastAtomIndex = atomIndex;
      atomIndex++;
      i++;

      const ringResult = parseRingClosures(
        pattern,
        i,
        atomIndex - 1,
        ringClosures,
        bonds,
        atoms,
        pendingBond,
      );
      pendingBond = undefined;
      i = ringResult.nextIndex;
      if (ringResult.error) {
        errors.push(ringResult.error);
        return { pattern: null, errors };
      }
    } else {
      errors.push(`Unexpected character '${char}' at position ${i}`);
      return { pattern: null, errors };
    }
  }

  if (ringClosures.size > 0) {
    errors.push(
      `Unclosed ring closures: ${Array.from(ringClosures.keys()).join(", ")}`,
    );
    return { pattern: null, errors };
  }

  return {
    pattern: { atoms, bonds },
    errors: [],
  };
}

interface BracketAtomResult {
  primitives: AtomPrimitive[];
  logicalExpression?: LogicalExpression;
  recursive?: SMARTSPattern;
  precedingBond?: BondPrimitive[];
  nextIndex: number;
  error?: string;
}

function parseBracketAtom(
  pattern: string,
  startIndex: number,
): BracketAtomResult {
  let i = startIndex + 1;
  const primitives: AtomPrimitive[] = [];
  const tokens: (AtomPrimitive | string)[] = [];

  while (i < pattern.length && pattern[i] !== "]") {
    const char = pattern[i]!;

    if (char === "!") {
      i++;
      if (i >= pattern.length || pattern[i] === "]") {
        return {
          primitives: [],
          nextIndex: i,
          error: `Unexpected '!' at position ${i - 1}`,
        };
      }

      const nextChar = pattern[i]!;
      if (nextChar === "#") {
        i++;
        const numResult = parseNumber(pattern, i);
        primitives.push({
          type: "atomic_number",
          value: numResult.value ?? 0,
          negate: true,
        });
        tokens.push({
          type: "atomic_number",
          value: numResult.value ?? 0,
          negate: true,
        });
        i = numResult.nextIndex;
      } else if (nextChar === "*") {
        primitives.push({ type: "wildcard", negate: true });
        tokens.push({ type: "wildcard", negate: true });
        i++;
      } else if (nextChar === "D") {
        i++;
        const numResult = parseNumber(pattern, i);
        primitives.push({
          type: "degree",
          value: numResult.value || 1,
          negate: true,
        });
        tokens.push({
          type: "degree",
          value: numResult.value || 1,
          negate: true,
        });
        i = numResult.nextIndex;
      } else if (nextChar === "X") {
        i++;
        const numResult = parseNumber(pattern, i);
        primitives.push({
          type: "connectivity",
          value: numResult.value || 1,
          negate: true,
        });
        tokens.push({
          type: "connectivity",
          value: numResult.value || 1,
          negate: true,
        });
        i = numResult.nextIndex;
      } else if (nextChar === "H") {
        i++;
        const numResult = parseNumber(pattern, i);
        primitives.push({
          type: "total_h",
          value: numResult.value === null ? 1 : numResult.value,
          negate: true,
        });
        tokens.push({
          type: "total_h",
          value: numResult.value === null ? 1 : numResult.value,
          negate: true,
        });
        i = numResult.nextIndex;
      } else if (nextChar === "R") {
        i++;
        const numResult = parseNumber(pattern, i);
        if (numResult.value !== null) {
          primitives.push({
            type: "ring_size",
            value: numResult.value,
            negate: true,
          });
          tokens.push({
            type: "ring_size",
            value: numResult.value,
            negate: true,
          });
        } else {
          primitives.push({ type: "ring_membership", negate: true });
          tokens.push({ type: "ring_membership", negate: true });
        }
        i = numResult.nextIndex;
      } else if (nextChar === "r") {
        i++;
        const numResult = parseNumber(pattern, i);
        if (numResult.value !== null) {
          primitives.push({
            type: "ring_size",
            value: numResult.value,
            negate: true,
          });
          tokens.push({
            type: "ring_size",
            value: numResult.value,
            negate: true,
          });
        } else {
          primitives.push({ type: "ring_membership", negate: true });
          tokens.push({ type: "ring_membership", negate: true });
        }
        i = numResult.nextIndex;
      } else if (nextChar === "a") {
        primitives.push({ type: "aromatic", negate: true });
        tokens.push({ type: "aromatic", negate: true });
        i++;
      } else if (nextChar === "A") {
        primitives.push({ type: "aliphatic", negate: true });
        tokens.push({ type: "aliphatic", negate: true });
        i++;
      } else if (isUpperCase(nextChar)) {
        const element = parseElement(pattern, i);
        primitives.push({
          type: "element",
          value: element.value,
          negate: true,
        });
        tokens.push({ type: "element", value: element.value, negate: true });
        i = element.nextIndex;
      } else {
        return {
          primitives: [],
          nextIndex: i,
          error: `Unexpected character after '!': ${nextChar} at position ${i}`,
        };
      }
    } else if (char === "#") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({ type: "atomic_number", value: numResult.value ?? 0 });
      tokens.push({ type: "atomic_number", value: numResult.value ?? 0 });
      i = numResult.nextIndex;
    } else if (char === "D") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({ type: "degree", value: numResult.value || 1 });
      tokens.push({ type: "degree", value: numResult.value || 1 });
      i = numResult.nextIndex;
    } else if (char === "X") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({ type: "connectivity", value: numResult.value || 1 });
      tokens.push({ type: "connectivity", value: numResult.value || 1 });
      i = numResult.nextIndex;
    } else if (char === "v") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({ type: "valence", value: numResult.value || 1 });
      tokens.push({ type: "valence", value: numResult.value || 1 });
      i = numResult.nextIndex;
    } else if (char === "H") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({
        type: "total_h",
        value: numResult.value === null ? 1 : numResult.value,
      });
      tokens.push({
        type: "total_h",
        value: numResult.value === null ? 1 : numResult.value,
      });
      i = numResult.nextIndex;
    } else if (char === "h") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({
        type: "implicit_h",
        value: numResult.value === null ? 1 : numResult.value,
      });
      tokens.push({
        type: "implicit_h",
        value: numResult.value === null ? 1 : numResult.value,
      });
      i = numResult.nextIndex;
    } else if (char === "R") {
      i++;
      const numResult = parseNumber(pattern, i);
      if (numResult.value !== null) {
        primitives.push({ type: "ring_membership", value: numResult.value });
        tokens.push({ type: "ring_membership", value: numResult.value });
      } else {
        primitives.push({ type: "ring_membership" });
        tokens.push({ type: "ring_membership" });
      }
      i = numResult.nextIndex;
    } else if (char === "r") {
      i++;
      const numResult = parseNumber(pattern, i);
      if (numResult.value !== null) {
        primitives.push({ type: "ring_size", value: numResult.value });
        tokens.push({ type: "ring_size", value: numResult.value });
      } else {
        primitives.push({ type: "ring_membership" });
        tokens.push({ type: "ring_membership" });
      }
      i = numResult.nextIndex;
    } else if (char === "x") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({
        type: "ring_connectivity",
        value: numResult.value || 1,
      });
      tokens.push({ type: "ring_connectivity", value: numResult.value || 1 });
      i = numResult.nextIndex;
    } else if (char === "+") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({ type: "charge", value: numResult.value ?? 1 });
      tokens.push({ type: "charge", value: numResult.value ?? 1 });
      i = numResult.nextIndex;
    } else if (char === "-") {
      i++;
      const numResult = parseNumber(pattern, i);
      primitives.push({ type: "charge", value: -(numResult.value ?? 1) });
      tokens.push({ type: "charge", value: -(numResult.value ?? 1) });
      i = numResult.nextIndex;
    } else if (char === "*") {
      primitives.push({ type: "wildcard" });
      tokens.push({ type: "wildcard" });
      i++;
    } else if (char === "a") {
      primitives.push({ type: "aromatic" });
      tokens.push({ type: "aromatic" });
      i++;
    } else if (char === "A") {
      primitives.push({ type: "aliphatic" });
      tokens.push({ type: "aliphatic" });
      i++;
    } else if (isLowerCase(char)) {
      const element = parseElement(pattern, i);
      primitives.push({ type: "aromatic_element", value: element.value });
      tokens.push({ type: "aromatic_element", value: element.value });
      i = element.nextIndex;
    } else if (isUpperCase(char)) {
      const element = parseElement(pattern, i);
      primitives.push({ type: "aliphatic_element", value: element.value });
      tokens.push({ type: "aliphatic_element", value: element.value });
      i = element.nextIndex;
    } else if (char === "&" || char === "," || char === ";") {
      tokens.push(char);
      i++;
    } else {
      return {
        primitives: [],
        nextIndex: i,
        error: `Unexpected character in bracket atom: ${char} at position ${i}`,
      };
    }
  }

  if (i >= pattern.length) {
    return {
      primitives: [],
      nextIndex: i,
      error: `Unclosed bracket atom starting at position ${startIndex}`,
    };
  }

  i++;

  const logicalExpression = buildLogicalExpression(tokens, primitives);

  return {
    primitives,
    logicalExpression,
    nextIndex: i,
  };
}

function buildLogicalExpression(
  tokens: (AtomPrimitive | string)[],
  primitives: AtomPrimitive[],
): LogicalExpression | undefined {
  if (primitives.length <= 1) {
    return undefined;
  }

  const hasSemicolon = tokens.some((t) => t === ";");

  if (hasSemicolon) {
    const semicolonSections: (AtomPrimitive | string)[][] = [];
    let currentSection: (AtomPrimitive | string)[] = [];

    for (const token of tokens) {
      if (typeof token === "string" && token === ";") {
        if (currentSection.length > 0) {
          semicolonSections.push(currentSection);
          currentSection = [];
        }
      } else {
        currentSection.push(token);
      }
    }

    if (currentSection.length > 0) {
      semicolonSections.push(currentSection);
    }

    const andOperands: (AtomPrimitive | LogicalExpression)[] =
      semicolonSections.map((section) => {
        const sectionPrimitives = section.filter(
          (t): t is AtomPrimitive => typeof t !== "string",
        );
        const hasComma = section.some((t) => t === ",");

        if (!hasComma) {
          if (sectionPrimitives.length === 1) {
            return sectionPrimitives[0]!;
          }
          return {
            operator: "and" as const,
            operands: sectionPrimitives,
          };
        }

        const commaGroups: AtomPrimitive[][] = [];
        let currentGroup: AtomPrimitive[] = [];

        for (const token of section) {
          if (typeof token === "string" && token === ",") {
            if (currentGroup.length > 0) {
              commaGroups.push(currentGroup);
              currentGroup = [];
            }
          } else if (typeof token !== "string") {
            currentGroup.push(token);
          }
        }

        if (currentGroup.length > 0) {
          commaGroups.push(currentGroup);
        }

        const orOperands = commaGroups.map((cg) => {
          if (cg.length === 1) {
            return cg[0]!;
          }
          return {
            operator: "and" as const,
            operands: cg,
          } as LogicalExpression;
        });

        if (orOperands.length === 1) {
          return orOperands[0]!;
        }

        return {
          operator: "or" as const,
          operands: orOperands,
        };
      });

    if (andOperands.length === 1) {
      return andOperands[0] as LogicalExpression;
    }

    return {
      operator: "and",
      operands: andOperands,
    };
  }

  const hasComma = tokens.some((t) => t === ",");
  const hasAmpersand = tokens.some((t) => t === "&");

  if (hasComma) {
    const commaGroups: AtomPrimitive[][] = [];
    let currentGroup: AtomPrimitive[] = [];

    for (const token of tokens) {
      if (typeof token === "string" && token === ",") {
        if (currentGroup.length > 0) {
          commaGroups.push(currentGroup);
          currentGroup = [];
        }
      } else if (typeof token !== "string") {
        currentGroup.push(token);
      }
    }

    if (currentGroup.length > 0) {
      commaGroups.push(currentGroup);
    }

    const orOperands = commaGroups.map((cg) => {
      if (cg.length === 1) {
        return cg[0]!;
      }
      return {
        operator: "and" as const,
        operands: cg,
      } as LogicalExpression;
    });

    if (orOperands.length === 1) {
      return orOperands[0] as LogicalExpression;
    }

    return {
      operator: "or",
      operands: orOperands,
    };
  }

  if (hasAmpersand) {
    return {
      operator: "and",
      operands: primitives,
    };
  }

  return {
    operator: "and",
    operands: primitives,
  };
}

function buildCommaGroups(
  tokens: (AtomPrimitive | string)[],
  primitives: AtomPrimitive[],
): AtomPrimitive[][] {
  const groups: AtomPrimitive[][] = [];
  let currentGroup: AtomPrimitive[] = [];
  let primitiveIndex = 0;

  for (const token of tokens) {
    if (typeof token === "string") {
      if (token === ",") {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
      } else if (token === ";") {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        break;
      }
    } else {
      if (primitives.includes(token)) {
        currentGroup.push(token);
      }
      primitiveIndex++;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

interface OrganicAtomResult {
  primitives: AtomPrimitive[];
  precedingBond?: BondPrimitive[];
  nextIndex: number;
}

function parseOrganicAtom(
  pattern: string,
  startIndex: number,
): OrganicAtomResult {
  const char = pattern[startIndex]!;

  let nextIndex = startIndex + 1;

  if (
    isUpperCase(char) &&
    nextIndex < pattern.length &&
    isLowerCase(pattern[nextIndex]!)
  ) {
    const twoChar = char + pattern[nextIndex]!;
    if (["Br", "Cl"].includes(twoChar)) {
      return {
        primitives: [{ type: "aliphatic_element", value: twoChar }],
        nextIndex: startIndex + 2,
      };
    }
  }

  if (isLowerCase(char)) {
    return {
      primitives: [{ type: "aromatic_element", value: char }],
      nextIndex,
    };
  }

  return {
    primitives: [{ type: "aliphatic_element", value: char }],
    nextIndex,
  };
}

interface RingClosureResult {
  nextIndex: number;
  error?: string;
}

function parseRingClosures(
  pattern: string,
  startIndex: number,
  atomIndex: number,
  ringClosures: Map<string, { atomIndex: number; bond?: BondPrimitive[] }>,
  bonds: PatternBond[],
  atoms: PatternAtom[],
  pendingBond?: BondPrimitive[],
): RingClosureResult {
  let i = startIndex;

  while (i < pattern.length) {
    let ringBond: BondPrimitive[] | undefined = undefined;

    if (isBondSymbol(pattern[i]!)) {
      const nextChar = pattern[i + 1];
      if (nextChar && (isDigit(nextChar) || nextChar === "%")) {
        ringBond = parseBondSymbol(pattern[i]!);
        i++;
      } else {
        break;
      }
    }

    if (i < pattern.length && isDigit(pattern[i]!)) {
      const digit = pattern[i]!;
      i++;

      if (ringClosures.has(digit)) {
        const closure = ringClosures.get(digit)!;
        bonds.push({
          from: closure.atomIndex,
          to: atomIndex,
          primitives:
            ringBond ||
            closure.bond ||
            getImplicitBondType(atoms, closure.atomIndex, atomIndex),
          isRingClosure: true,
        });
        ringClosures.delete(digit);
      } else {
        ringClosures.set(digit, { atomIndex, bond: ringBond });
      }
    } else {
      break;
    }
  }

  if (i < pattern.length && pattern[i] === "%") {
    i++;
    if (
      i + 1 < pattern.length &&
      isDigit(pattern[i]!) &&
      isDigit(pattern[i + 1]!)
    ) {
      const digit = pattern[i]! + pattern[i + 1]!;
      i += 2;

      if (ringClosures.has(digit)) {
        const closure = ringClosures.get(digit)!;
        bonds.push({
          from: closure.atomIndex,
          to: atomIndex,
          primitives:
            closure.bond ||
            getImplicitBondType(atoms, closure.atomIndex, atomIndex),
          isRingClosure: true,
        });
        ringClosures.delete(digit);
      } else {
        ringClosures.set(digit, { atomIndex });
      }
    } else {
      return {
        nextIndex: i,
        error: `Invalid ring closure: % must be followed by two digits at position ${i - 1}`,
      };
    }
  }

  return { nextIndex: i };
}

function parseElement(
  pattern: string,
  startIndex: number,
): { value: string; nextIndex: number } {
  let i = startIndex;
  let element = pattern[i]!;
  i++;

  if (i < pattern.length && isLowerCase(pattern[i]!)) {
    element += pattern[i]!;
    i++;
  }

  return { value: element, nextIndex: i };
}

function parseNumber(
  pattern: string,
  startIndex: number,
): { value: number | null; nextIndex: number } {
  let i = startIndex;
  let numStr = "";

  while (i < pattern.length && isDigit(pattern[i]!)) {
    numStr += pattern[i]!;
    i++;
  }

  if (numStr === "") {
    return { value: null, nextIndex: i };
  }

  return { value: parseInt(numStr, 10), nextIndex: i };
}

function isOrganicSubset(char: string): boolean {
  return /^[BCNOPSFIbcnops]$/.test(char);
}

function isBondSymbol(char: string): boolean {
  return /^[-=#:~@/\\]$/.test(char);
}

function isUpperCase(char: string): boolean {
  return /^[A-Z]$/.test(char);
}

function isLowerCase(char: string): boolean {
  return /^[a-z]$/.test(char);
}

function isDigit(char: string): boolean {
  return /^[0-9]$/.test(char);
}

function parseBondSymbol(char: string): BondPrimitive[] {
  switch (char) {
    case "-":
      return [{ type: "single" }];
    case "=":
      return [{ type: "double" }];
    case "#":
      return [{ type: "triple" }];
    case ":":
      return [{ type: "aromatic" }];
    case "~":
      return [{ type: "any" }];
    default:
      return [{ type: "single" }];
  }
}
