import type { Molecule, Atom, Bond } from "types";
import { BondType } from "types";
import type {
  SMARTSPattern,
  PatternAtom,
  AtomPrimitive,
  MatchResult,
  Match,
  AtomMatch,
  SMARTSMatchOptions,
  PatternBond,
  BondPrimitive,
} from "src/types/smarts-types";
import { enrichMolecule } from "src/utils/molecule-enrichment";
import { calculateValence } from "src/utils/valence-calculator";
import { parseSMARTS } from "src/parsers/smarts-parser";

const debugSmarts: boolean = !!process.env.OPENCHEM_DEBUG_SMARTS;
const debug: boolean = debugSmarts;

const matchSMARTSCache: WeakMap<
  Molecule,
  Map<string, MatchResult>
> = new WeakMap();

export function matchSMARTS(
  pattern: string | SMARTSPattern,
  molecule: Molecule,
  options?: SMARTSMatchOptions,
): MatchResult {
  let patternKey: string | undefined;
  let parsedPattern: SMARTSPattern;
  if (typeof pattern === "string") {
    patternKey = pattern;
    const parseResult = parseSMARTS(pattern);
    if (!parseResult.pattern || parseResult.errors.length > 0) {
      throw new Error(
        `Invalid SMARTS pattern: ${parseResult.errors.join(", ")}`,
      );
    }
    parsedPattern = parseResult.pattern;
  } else {
    // For parsed patterns, skip caching (no stable key)
    patternKey = undefined;
    parsedPattern = pattern;
  }

  // Caching layer (only for string patterns)
  if (patternKey !== undefined) {
    let patternMap = matchSMARTSCache.get(molecule);
    if (!patternMap) {
      patternMap = new Map();
      matchSMARTSCache.set(molecule, patternMap);
    }
    if (patternMap.has(patternKey)) {
      return patternMap.get(patternKey)!;
    }
  }

  const enriched = enrichMolecule(molecule);
  molecule = enriched;

  const matches: Match[] = [];
  const maxMatches = options?.maxMatches ?? Infinity;

  for (
    let i = 0;
    i < molecule.atoms.length && matches.length < maxMatches;
    i++
  ) {
    const foundMatches = tryMatchFromAtom(parsedPattern, molecule, i);
    for (const match of foundMatches) {
      if (matches.length >= maxMatches) break;
      if (!options?.uniqueMatches || !isDuplicateMatch(match, matches)) {
        matches.push(match);
      }
    }
  }

  const result: MatchResult = {
    success: matches.length > 0,
    matches,
  };
  // Store in cache only for string patterns
  if (patternKey !== undefined) {
    let patternMap = matchSMARTSCache.get(molecule);
    if (!patternMap) {
      patternMap = new Map();
      matchSMARTSCache.set(molecule, patternMap);
    }
    patternMap.set(patternKey, result);
  }
  return result;
}

function tryMatchFromAtom(
  pattern: SMARTSPattern,
  molecule: Molecule,
  startAtomIndex: number,
): Match[] {
  if (pattern.atoms.length === 0) {
    return [];
  }

  const allMatches: Match[] = [];
  const mapping: Map<number, number> = new Map();

  collectAllMatches(
    pattern,
    molecule,
    0,
    startAtomIndex,
    mapping,
    new Set(),
    allMatches,
  );

  return allMatches;
}

function validateRingClosures(
  pattern: SMARTSPattern,
  molecule: Molecule,
  mapping: Map<number, number>,
): boolean {
  const ringClosureBonds = pattern.bonds.filter((b) => b.isRingClosure);

  if (ringClosureBonds.length === 0) {
    return true;
  }

  const mappedIndices = new Set(mapping.values());
  const mappedIndicesArr = Array.from(mappedIndices);
  const matchedAtomIds = mappedIndicesArr.map((idx) => molecule.atoms[idx]!.id);
  const matchedAtomIdSet = new Set(matchedAtomIds);

  if (debugSmarts) {
    // eslint-disable-next-line no-console
    console.debug(
      "[SMARTS DEBUG] validateRingClosures mappingIndices=",
      mappedIndicesArr,
    );
    // eslint-disable-next-line no-console
    console.debug(
      "[SMARTS DEBUG] validateRingClosures matchedAtomIds=",
      matchedAtomIds,
    );
    // eslint-disable-next-line no-console
    console.debug(
      "[SMARTS DEBUG] validateRingClosures molecule.rings=",
      molecule.rings?.slice(0, 100),
    );
    // eslint-disable-next-line no-console
    console.debug(
      "[SMARTS DEBUG] validateRingClosures matched atoms ringIds=",
      mappedIndicesArr.map((i) => ({
        idx: i,
        id: molecule.atoms[i]!.id,
        ringIds: molecule.atoms[i]!.ringIds,
      })),
    );
  }

  if (!molecule.rings || molecule.rings.length === 0) {
    if (debug)
      console.debug(
        "[SMARTS DEBUG] validateRingClosures: molecule has no rings, failing ring closure",
      );
    return false;
  }

  // First, check for an exact SSSR ring match (existing behavior)
  const matchesExactRing = molecule.rings.some((ring) => {
    if (ring.length !== matchedAtomIds.length) {
      return false;
    }
    const ringSet = new Set(ring);
    const matches =
      matchedAtomIds.every((id) => ringSet.has(id)) &&
      ring.every((id) => matchedAtomIdSet.has(id));
    if (debug && matches) {
      console.debug(
        "[SMARTS DEBUG] validateRingClosures: found exact ring match",
        ring,
      );
    }
    return matches;
  });

  if (matchesExactRing) {
    return true;
  }

  if (debug) {
    console.debug(
      "[SMARTS DEBUG] validateRingClosures: no exact ring match for",
      matchedAtomIds,
    );
  }

  // Relaxed rule: each ring-closure bond in the pattern must map to two molecule atoms
  // that share at least one ring id. This allows local ring-closure checks (common SMARTS usage).
  for (const rb of ringClosureBonds) {
    const fromMolIdx = mapping.get(rb.from);
    const toMolIdx = mapping.get(rb.to);
    if (fromMolIdx === undefined || toMolIdx === undefined) {
      if (debug)
        console.debug(
          "[SMARTS DEBUG] validateRingClosures: ring closure bond endpoints not mapped",
          rb,
        );
      return false;
    }

    const fromAtom = molecule.atoms[fromMolIdx];
    const toAtom = molecule.atoms[toMolIdx];
    if (!fromAtom || !toAtom) {
      if (debug)
        console.debug(
          "[SMARTS DEBUG] validateRingClosures: fromAtom or toAtom is undefined",
          { fromMolIdx, toMolIdx },
        );
      return false;
    }

    const fromRingIds = new Set(fromAtom.ringIds ?? []);
    const toRingIds = new Set(toAtom.ringIds ?? []);

    const shared = Array.from(fromRingIds).some((rid) => toRingIds.has(rid));

    if (debug) {
      console.debug("[SMARTS DEBUG] validateRingClosures: ringBond endpoints", {
        patternFrom: rb.from,
        patternTo: rb.to,
        fromAtomId: fromAtom.id,
        toAtomId: toAtom.id,
        fromRingIds: fromAtom.ringIds,
        toRingIds: toAtom.ringIds,
        shared,
      });
    }

    if (!shared) {
      return false;
    }
  }

  return true;
}

function collectAllMatches(
  pattern: SMARTSPattern,
  molecule: Molecule,
  patternAtomIdx: number,
  moleculeAtomIdx: number,
  mapping: Map<number, number>,
  visited: Set<number>,
  allMatches: Match[],
): void {
  if (patternAtomIdx >= pattern.atoms.length) {
    if (!validateRingClosures(pattern, molecule, mapping)) {
      return;
    }

    const atomMatches: AtomMatch[] = [];
    for (const [patternIdx, moleculeIdx] of mapping.entries()) {
      atomMatches.push({
        patternIndex: patternIdx,
        moleculeIndex: moleculeIdx,
      });
    }
    allMatches.push({ atoms: atomMatches });
    return;
  }

  if (visited.has(patternAtomIdx)) {
    if (mapping.get(patternAtomIdx) === moleculeAtomIdx) {
      collectAllMatches(
        pattern,
        molecule,
        patternAtomIdx + 1,
        moleculeAtomIdx,
        mapping,
        visited,
        allMatches,
      );
    }
    return;
  }

  const patternAtom = pattern.atoms[patternAtomIdx]!;
  const moleculeAtom = molecule.atoms[moleculeAtomIdx];

  if (
    !moleculeAtom ||
    !matchesAtomPrimitives(patternAtom, moleculeAtom, molecule)
  ) {
    return;
  }

  mapping.set(patternAtomIdx, moleculeAtomIdx);
  visited.add(patternAtomIdx);

  const allPatternBonds = pattern.bonds.filter(
    (b) => b.from === patternAtomIdx,
  );
  const ringClosureBonds = allPatternBonds.filter(
    (b) => b.isRingClosure && visited.has(b.to),
  );
  const regularBonds = allPatternBonds.filter(
    (b) => !b.isRingClosure || !visited.has(b.to),
  );

  for (const ringBond of ringClosureBonds) {
    const targetMoleculeIdx = mapping.get(ringBond.to);
    if (targetMoleculeIdx === undefined) continue;

    const targetMoleculeAtom = molecule.atoms[targetMoleculeIdx];
    if (!targetMoleculeAtom) {
      mapping.delete(patternAtomIdx);
      visited.delete(patternAtomIdx);
      return;
    }

    const moleculeBond = molecule.bonds.find(
      (b) =>
        (b.atom1 === moleculeAtom.id && b.atom2 === targetMoleculeAtom.id) ||
        (b.atom2 === moleculeAtom.id && b.atom1 === targetMoleculeAtom.id),
    );

    if (!moleculeBond) {
      mapping.delete(patternAtomIdx);
      visited.delete(patternAtomIdx);
      return;
    }

    if (
      ringBond.primitives.length > 0 &&
      !matchesBondPrimitives(ringBond.primitives[0]!, moleculeBond, molecule)
    ) {
      mapping.delete(patternAtomIdx);
      visited.delete(patternAtomIdx);
      return;
    }
  }

  if (regularBonds.length === 0) {
    const nextUnmatched = findNextUnmatchedPatternAtom(pattern, mapping);
    if (nextUnmatched === -1) {
      if (!validateRingClosures(pattern, molecule, mapping)) {
        mapping.delete(patternAtomIdx);
        visited.delete(patternAtomIdx);
        return;
      }
      const atomMatches: AtomMatch[] = [];
      for (const [patternIdx, moleculeIdx] of mapping.entries()) {
        atomMatches.push({
          patternIndex: patternIdx,
          moleculeIndex: moleculeIdx,
        });
      }
      allMatches.push({ atoms: atomMatches });
    } else {
      for (let i = 0; i < molecule.atoms.length; i++) {
        if (!Array.from(mapping.values()).includes(i)) {
          collectAllMatches(
            pattern,
            molecule,
            nextUnmatched,
            i,
            mapping,
            visited,
            allMatches,
          );
        }
      }
    }

    mapping.delete(patternAtomIdx);
    visited.delete(patternAtomIdx);
    return;
  }

  const moleculeAtomId = moleculeAtom.id;
  const moleculeBonds = molecule.bonds.filter(
    (b) => b.atom1 === moleculeAtomId || b.atom2 === moleculeAtomId,
  );

  collectAllBondMatches(
    pattern,
    molecule,
    regularBonds,
    moleculeBonds,
    moleculeAtomIdx,
    mapping,
    visited,
    allMatches,
  );

  mapping.delete(patternAtomIdx);
  visited.delete(patternAtomIdx);
}

function collectAllBondMatches(
  pattern: SMARTSPattern,
  molecule: Molecule,
  patternBonds: typeof pattern.bonds,
  moleculeBonds: typeof molecule.bonds,
  currentMoleculeAtom: number,
  mapping: Map<number, number>,
  visited: Set<number>,
  allMatches: Match[],
): void {
  if (patternBonds.length === 0) {
    const nextUnmatched = findNextUnmatchedPatternAtom(pattern, mapping);
    if (nextUnmatched === -1) {
      if (!validateRingClosures(pattern, molecule, mapping)) {
        return;
      }
      const atomMatches: AtomMatch[] = [];
      for (const [patternIdx, moleculeIdx] of mapping.entries()) {
        atomMatches.push({
          patternIndex: patternIdx,
          moleculeIndex: moleculeIdx,
        });
      }
      allMatches.push({ atoms: atomMatches });
      return;
    }

    for (let i = 0; i < molecule.atoms.length; i++) {
      if (!Array.from(mapping.values()).includes(i)) {
        collectAllMatches(
          pattern,
          molecule,
          nextUnmatched,
          i,
          mapping,
          visited,
          allMatches,
        );
      }
    }
    return;
  }

  collectAllBondPermutations(
    pattern,
    molecule,
    patternBonds,
    moleculeBonds,
    currentMoleculeAtom,
    mapping,
    visited,
    0,
    new Set(),
    allMatches,
  );
}

function collectAllBondPermutations(
  pattern: SMARTSPattern,
  molecule: Molecule,
  patternBonds: typeof pattern.bonds,
  moleculeBonds: typeof molecule.bonds,
  currentMoleculeAtomIdx: number,
  mapping: Map<number, number>,
  visited: Set<number>,
  patternBondIndex: number,
  usedMoleculeBonds: Set<number>,
  allMatches: Match[],
): void {
  if (patternBondIndex >= patternBonds.length) {
    const nextUnmatched = findNextUnmatchedPatternAtom(pattern, mapping);
    if (nextUnmatched === -1) {
      if (!validateRingClosures(pattern, molecule, mapping)) {
        return;
      }
      const atomMatches: AtomMatch[] = [];
      for (const [patternIdx, moleculeIdx] of mapping.entries()) {
        atomMatches.push({
          patternIndex: patternIdx,
          moleculeIndex: moleculeIdx,
        });
      }
      allMatches.push({ atoms: atomMatches });
      return;
    }

    for (let i = 0; i < molecule.atoms.length; i++) {
      if (!Array.from(mapping.values()).includes(i)) {
        collectAllMatches(
          pattern,
          molecule,
          nextUnmatched,
          i,
          mapping,
          visited,
          allMatches,
        );
      }
    }
    return;
  }

  const patternBond = patternBonds[patternBondIndex]!;
  const targetPatternAtom = patternBond.to;
  const currentMoleculeAtomId = molecule.atoms[currentMoleculeAtomIdx]!.id;

  for (let i = 0; i < moleculeBonds.length; i++) {
    if (usedMoleculeBonds.has(i)) {
      continue;
    }

    const moleculeBond = moleculeBonds[i]!;
    const neighborAtomId =
      moleculeBond.atom1 === currentMoleculeAtomId
        ? moleculeBond.atom2
        : moleculeBond.atom1;
    const neighborAtomIdx = molecule.atoms.findIndex(
      (a) => a.id === neighborAtomId,
    );

    if (neighborAtomIdx === -1) {
      continue;
    }

    if (
      Array.from(mapping.values()).includes(neighborAtomIdx) &&
      mapping.get(targetPatternAtom) !== neighborAtomIdx
    ) {
      continue;
    }

    if (
      !matchesBondPrimitives(patternBond.primitives[0]!, moleculeBond, molecule)
    ) {
      continue;
    }

    const prevMapping = new Map(mapping);
    const prevVisited = new Set(visited);

    const tempMatches: Match[] = [];
    collectAllMatches(
      pattern,
      molecule,
      targetPatternAtom,
      neighborAtomIdx,
      mapping,
      visited,
      tempMatches,
    );

    if (tempMatches.length > 0) {
      usedMoleculeBonds.add(i);

      for (const tempMatch of tempMatches) {
        const tempMapping = new Map<number, number>();
        for (const am of tempMatch.atoms) {
          tempMapping.set(am.patternIndex, am.moleculeIndex);
        }

        collectAllBondPermutations(
          pattern,
          molecule,
          patternBonds,
          moleculeBonds,
          currentMoleculeAtomIdx,
          tempMapping,
          visited,
          patternBondIndex + 1,
          usedMoleculeBonds,
          allMatches,
        );
      }

      usedMoleculeBonds.delete(i);
    }

    mapping.clear();
    for (const [k, v] of prevMapping) {
      mapping.set(k, v);
    }
    visited.clear();
    for (const v of prevVisited) {
      visited.add(v);
    }
  }
}

function matchAtomRecursive(
  pattern: SMARTSPattern,
  molecule: Molecule,
  patternAtomIdx: number,
  moleculeAtomIdx: number,
  mapping: Map<number, number>,
  visited: Set<number>,
): boolean {
  if (patternAtomIdx >= pattern.atoms.length) {
    return true;
  }

  if (visited.has(patternAtomIdx)) {
    return mapping.get(patternAtomIdx) === moleculeAtomIdx;
  }

  const patternAtom = pattern.atoms[patternAtomIdx]!;
  const moleculeAtom = molecule.atoms[moleculeAtomIdx];

  if (
    !moleculeAtom ||
    !matchesAtomPrimitives(patternAtom, moleculeAtom, molecule)
  ) {
    return false;
  }

  mapping.set(patternAtomIdx, moleculeAtomIdx);
  visited.add(patternAtomIdx);

  const patternBonds = pattern.bonds.filter((b) => b.from === patternAtomIdx);

  if (patternBonds.length === 0) {
    const nextUnmatched = findNextUnmatchedPatternAtom(pattern, mapping);
    if (nextUnmatched === -1) {
      return true;
    }

    for (let i = 0; i < molecule.atoms.length; i++) {
      if (!Array.from(mapping.values()).includes(i)) {
        if (
          matchAtomRecursive(
            pattern,
            molecule,
            nextUnmatched,
            i,
            mapping,
            visited,
          )
        ) {
          return true;
        }
      }
    }

    mapping.delete(patternAtomIdx);
    visited.delete(patternAtomIdx);
    return false;
  }

  const moleculeAtomId = moleculeAtom.id;
  const moleculeBonds = molecule.bonds.filter(
    (b) => b.atom1 === moleculeAtomId || b.atom2 === moleculeAtomId,
  );

  if (
    !tryMatchBonds(
      pattern,
      molecule,
      patternBonds,
      moleculeBonds,
      moleculeAtomIdx,
      mapping,
      visited,
    )
  ) {
    mapping.delete(patternAtomIdx);
    visited.delete(patternAtomIdx);
    return false;
  }

  return true;
}

function tryMatchBonds(
  pattern: SMARTSPattern,
  molecule: Molecule,
  patternBonds: typeof pattern.bonds,
  moleculeBonds: typeof molecule.bonds,
  currentMoleculeAtom: number,
  mapping: Map<number, number>,
  visited: Set<number>,
): boolean {
  if (patternBonds.length === 0) {
    const nextUnmatched = findNextUnmatchedPatternAtom(pattern, mapping);
    if (nextUnmatched === -1) {
      return true;
    }

    for (let i = 0; i < molecule.atoms.length; i++) {
      if (!Array.from(mapping.values()).includes(i)) {
        if (
          matchAtomRecursive(
            pattern,
            molecule,
            nextUnmatched,
            i,
            mapping,
            visited,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  return tryMatchBondsPermutation(
    pattern,
    molecule,
    patternBonds,
    moleculeBonds,
    currentMoleculeAtom,
    mapping,
    visited,
    0,
    new Set(),
  );
}

function tryMatchBondsPermutation(
  pattern: SMARTSPattern,
  molecule: Molecule,
  patternBonds: typeof pattern.bonds,
  moleculeBonds: typeof molecule.bonds,
  currentMoleculeAtomIdx: number,
  mapping: Map<number, number>,
  visited: Set<number>,
  patternBondIndex: number,
  usedMoleculeBonds: Set<number>,
): boolean {
  if (patternBondIndex >= patternBonds.length) {
    const nextUnmatched = findNextUnmatchedPatternAtom(pattern, mapping);
    if (nextUnmatched === -1) {
      return true;
    }

    for (let i = 0; i < molecule.atoms.length; i++) {
      if (!Array.from(mapping.values()).includes(i)) {
        if (
          matchAtomRecursive(
            pattern,
            molecule,
            nextUnmatched,
            i,
            mapping,
            visited,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  const patternBond = patternBonds[patternBondIndex]!;
  const targetPatternAtom = patternBond.to;
  const currentMoleculeAtomId = molecule.atoms[currentMoleculeAtomIdx]!.id;

  for (let i = 0; i < moleculeBonds.length; i++) {
    if (usedMoleculeBonds.has(i)) {
      continue;
    }

    const moleculeBond = moleculeBonds[i]!;
    const neighborAtomId =
      moleculeBond.atom1 === currentMoleculeAtomId
        ? moleculeBond.atom2
        : moleculeBond.atom1;
    const neighborAtomIdx = molecule.atoms.findIndex(
      (a) => a.id === neighborAtomId,
    );

    if (neighborAtomIdx === -1) {
      continue;
    }

    if (
      Array.from(mapping.values()).includes(neighborAtomIdx) &&
      mapping.get(targetPatternAtom) !== neighborAtomIdx
    ) {
      continue;
    }

    if (
      !matchesBondPrimitives(patternBond.primitives[0]!, moleculeBond, molecule)
    ) {
      continue;
    }

    const prevMapping = new Map(mapping);
    const prevVisited = new Set(visited);

    if (
      !matchAtomRecursive(
        pattern,
        molecule,
        targetPatternAtom,
        neighborAtomIdx,
        mapping,
        visited,
      )
    ) {
      mapping.clear();
      for (const [k, v] of prevMapping) {
        mapping.set(k, v);
      }
      visited.clear();
      for (const v of prevVisited) {
        visited.add(v);
      }
      continue;
    }

    usedMoleculeBonds.add(i);

    if (
      tryMatchBondsPermutation(
        pattern,
        molecule,
        patternBonds,
        moleculeBonds,
        currentMoleculeAtomIdx,
        mapping,
        visited,
        patternBondIndex + 1,
        usedMoleculeBonds,
      )
    ) {
      return true;
    }

    usedMoleculeBonds.delete(i);

    mapping.clear();
    for (const [k, v] of prevMapping) {
      mapping.set(k, v);
    }
    visited.clear();
    for (const v of prevVisited) {
      visited.add(v);
    }
  }

  return false;
}

function findNextUnmatchedPatternAtom(
  pattern: SMARTSPattern,
  mapping: Map<number, number>,
): number {
  for (let i = 0; i < pattern.atoms.length; i++) {
    if (!mapping.has(i)) {
      return i;
    }
  }
  return -1;
}

function matchesAtomPrimitives(
  patternAtom: PatternAtom,
  atom: Atom,
  molecule: Molecule,
): boolean {
  if (patternAtom.logicalExpression) {
    return evaluateLogicalExpression(
      patternAtom.logicalExpression,
      atom,
      molecule,
    );
  }

  if (!patternAtom.primitives || patternAtom.primitives.length === 0) {
    return true;
  }

  for (const primitive of patternAtom.primitives) {
    if (!matchesAtomPrimitive(primitive, atom, molecule)) {
      return false;
    }
  }
  return true;
}

function evaluateLogicalExpression(
  expr: import("../types/smarts-types").LogicalExpression,
  atom: Atom,
  molecule: Molecule,
): boolean {
  const operandResults = expr.operands.map((operand) => {
    if ("operator" in operand) {
      return evaluateLogicalExpression(
        operand as import("../types/smarts-types").LogicalExpression,
        atom,
        molecule,
      );
    } else {
      return matchesAtomPrimitive(operand as AtomPrimitive, atom, molecule);
    }
  });

  switch (expr.operator) {
    case "and":
      return operandResults.every((r) => r);
    case "or":
      return operandResults.some((r) => r);
    case "not":
      return !operandResults[0];
    default:
      return false;
  }
}

function matchesAtomPrimitive(
  primitive: AtomPrimitive,
  atom: Atom,
  molecule: Molecule,
): boolean {
  const result = checkAtomPrimitive(primitive, atom, molecule);
  return primitive.negate ? !result : result;
}

function checkAtomPrimitive(
  primitive: AtomPrimitive,
  atom: Atom,
  molecule: Molecule,
): boolean {
  switch (primitive.type) {
    case "wildcard":
      return true;

    case "element":
      return (
        atom.symbol.toUpperCase() === (primitive.value as string).toUpperCase()
      );

    case "aromatic_element":
      return (
        atom.aromatic === true &&
        atom.symbol.toLowerCase() === (primitive.value as string).toLowerCase()
      );

    case "aliphatic_element":
      return (
        atom.aromatic !== true &&
        atom.symbol.toUpperCase() === (primitive.value as string).toUpperCase()
      );

    case "atomic_number":
      return atom.atomicNumber === primitive.value;

    case "degree":
      return (atom.degree ?? 0) === primitive.value;

    case "valence":
      return calculateValence(atom, molecule.bonds) === primitive.value;

    case "connectivity":
      const connectivityBonds = molecule.bonds.filter(
        (b) => b.atom1 === atom.id || b.atom2 === atom.id,
      );
      const totalConnectivity =
        connectivityBonds.length + (atom.hydrogens ?? 0);
      return totalConnectivity === primitive.value;

    case "total_h":
      const implicitH = atom.hydrogens ?? 0;
      const bondsForH = molecule.bonds.filter(
        (b) => b.atom1 === atom.id || b.atom2 === atom.id,
      );
      const explicitHCount = bondsForH.filter((b) => {
        const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
        const other = molecule.atoms.find((a) => a.id === otherId);
        return other?.symbol === "H";
      }).length;
      return implicitH + explicitHCount === primitive.value;

    case "implicit_h":
      const explicitH = atom.hydrogens ?? 0;
      const bonds = molecule.bonds.filter(
        (b) => b.atom1 === atom.id || b.atom2 === atom.id,
      );
      const bondedH = bonds.filter((b) => {
        const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
        const other = molecule.atoms.find((a) => a.id === otherId);
        return other?.symbol === "H";
      }).length;
      return explicitH - bondedH === primitive.value;

    case "ring_membership":
      const atomRingCount = atom.ringIds?.length ?? 0;
      if (primitive.value === 0) {
        return atomRingCount === 0;
      }
      if (primitive.value === undefined) {
        return atomRingCount > 0;
      }
      return atomRingCount === primitive.value;

    case "ring_size":
      if (!molecule.rings || !atom.ringIds) {
        return false;
      }
      return (
        atom.ringIds.some(
          (ringId) => molecule.rings![ringId]?.length === primitive.value,
        ) ?? false
      );

    case "ring_connectivity":
      const ringBonds = molecule.bonds.filter(
        (b) =>
          (b.atom1 === atom.id || b.atom2 === atom.id) && b.isInRing === true,
      );
      return ringBonds.length === primitive.value;

    case "charge":
      return (atom.charge ?? 0) === primitive.value;

    case "aromatic":
      return atom.aromatic === true;

    case "aliphatic":
      return atom.aromatic !== true;

    default:
      return false;
  }
}

function matchesBondPrimitives(
  primitive: import("../types/smarts-types").BondPrimitive,
  bond: Bond,
  molecule: Molecule,
): boolean {
  const result = checkBondPrimitive(primitive, bond, molecule);
  return primitive.negate ? !result : result;
}

function checkBondPrimitive(
  primitive: import("../types/smarts-types").BondPrimitive,
  bond: Bond,
  molecule: Molecule,
): boolean {
  const fromAtom = molecule.atoms.find((a) => a.id === bond.atom1);
  const toAtom = molecule.atoms.find((a) => a.id === bond.atom2);
  if (!fromAtom || !toAtom) return false;

  switch (primitive.type) {
    case "single":
      return bond.type === BondType.SINGLE;

    case "double":
      return bond.type === BondType.DOUBLE;

    case "triple":
      return bond.type === BondType.TRIPLE;

    case "aromatic":
      return (
        bond.type === BondType.AROMATIC &&
        fromAtom?.aromatic === true &&
        toAtom?.aromatic === true
      );

    case "any":
      return true;

    case "ring":
      return bond.isInRing === true;

    case "not_ring":
      return bond.isInRing !== true;

    default:
      return false;
  }
}

function isDuplicateMatch(match: Match, existingMatches: Match[]): boolean {
  for (const existing of existingMatches) {
    if (match.atoms.length !== existing.atoms.length) {
      continue;
    }

    const matchSet = new Set(match.atoms.map((a) => a.moleculeIndex));
    const existingSet = new Set(existing.atoms.map((a) => a.moleculeIndex));

    if (
      matchSet.size === existingSet.size &&
      Array.from(matchSet).every((idx) => existingSet.has(idx))
    ) {
      return true;
    }
  }

  return false;
}
