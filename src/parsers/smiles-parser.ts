import type { Atom, Bond, Molecule, ParseResult, ParseError } from "types";
import { BondType, StereoType } from "types";
import {
  ATOMIC_NUMBERS,
  DEFAULT_VALENCES,
  AROMATIC_VALENCES,
} from "src/constants";
import { createAtom } from "src/utils/atom-utils";
import { validateAromaticity } from "src/validators/aromaticity-validator";
import { validateValences } from "src/validators/valence-validator";
import { validateStereochemistry } from "src/validators/stereo-validator";
import { parseBracketAtom } from "src/parsers/bracket-parser";
import { enrichMolecule } from "src/utils/molecule-enrichment";
import { perceiveAromaticity } from "src/utils/aromaticity-perceiver";
import { MoleculeGraph } from "src/utils/molecular-graph";

type MutableAtom = {
  -readonly [K in keyof Atom]: Atom[K];
};

type MutableBond = {
  -readonly [K in keyof Bond]: Bond[K];
};

export function parseSMILES(smiles: string, timings?: any): ParseResult {
  const errors: ParseError[] = [];
  const molecules: Molecule[] = [];

  // Split on '.' for disconnected structures
  const parts = smiles.split(".");
  for (const part of parts) {
    if (part.trim() === "") continue; // skip empty parts
    const result = parseSingleSMILES(part.trim(), timings);
    molecules.push(result.molecule);
    errors.push(...result.errors);
  }

  return { molecules, errors };
}

function parseSingleSMILES(
  smiles: string,
  timings?: any,
): { molecule: Molecule; errors: ParseError[] } {
  const errors: ParseError[] = [];
  let atoms: MutableAtom[] = [];
  let bonds: MutableBond[] = [];
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let atomId = 0;
  const explicitBonds = new Set<string>();

  const bondKey = (a1: number, a2: number) => {
    const [min, max] = a1 < a2 ? [a1, a2] : [a2, a1];
    return `${min}-${max}`;
  };

  let i = 0;
  let prevAtomId: number | null = null;
  let pendingBondType = BondType.SINGLE;
  let pendingBondStereo = StereoType.NONE;
  let pendingBondExplicit = false;
  const branchStack: number[] = [];
  const bookmarks = new Map<
    number,
    {
      atomId: number;
      bondType: BondType;
      bondStereo: StereoType;
      explicit: boolean;
    }[]
  >();

  const tTokenizeStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  while (i < smiles.length) {
    const ch = smiles[i]!;

    if (ch === " ") {
      i++;
      continue;
    }

    // Bracket atoms like [NH4+]
    if (ch === "[") {
      i++;
      let content = "";
      while (i < smiles.length && smiles[i] !== "]") {
        content += smiles[i]!;
        i++;
      }
      if (i >= smiles.length || smiles[i] !== "]") {
        errors.push({ message: "Unclosed bracket", position: i });
      } else {
        i++; // skip ]
      }
      const atom = parseBracketAtom(content, atomId++) as MutableAtom | null;
      if (!atom) {
        errors.push({
          message: `Invalid bracket atom: ${content}`,
          position: i,
        });
        continue;
      }
      atoms.push(atom);
      if (prevAtomId !== null) {
        bonds.push({
          atom1: prevAtomId,
          atom2: atom.id,
          type: pendingBondType,
          stereo: pendingBondStereo,
        });
        if (pendingBondExplicit)
          explicitBonds.add(bondKey(prevAtomId, atom.id));
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({
          atom1: bp,
          atom2: atom.id,
          type: pendingBondType,
          stereo: pendingBondStereo,
        });
        if (pendingBondExplicit) explicitBonds.add(bondKey(bp, atom.id));
        pendingBondStereo = StereoType.NONE;
      }
      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      pendingBondExplicit = false;
      continue;
    }

    // Wildcard atom '*' (can be aromatic or aliphatic)
    if (ch === "*") {
      const atom = createAtom("*", atomId++, false, false, 0) as MutableAtom;
      atoms.push(atom);
      if (prevAtomId !== null) {
        bonds.push({
          atom1: prevAtomId,
          atom2: atom.id,
          type: pendingBondType,
          stereo: pendingBondStereo,
        });
        if (pendingBondExplicit)
          explicitBonds.add(bondKey(prevAtomId, atom.id));
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({
          atom1: bp,
          atom2: atom.id,
          type: pendingBondType,
          stereo: pendingBondStereo,
        });
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
      if (
        ch === ch.toUpperCase() &&
        i + 1 < smiles.length &&
        /[a-z]/.test(smiles[i + 1]!)
      ) {
        const twoLetter = ch + smiles[i + 1]!;
        const nextChar = smiles[i + 1]!;
        const singleLetterUpper = ch.toUpperCase();
        const twoLetterIsValid = ATOMIC_NUMBERS[twoLetter] !== undefined;
        let shouldSplit = false;
        if (
          twoLetterIsValid &&
          /^[bcnosp]$/.test(nextChar) &&
          /^[CNOSPB]$/.test(singleLetterUpper)
        ) {
          const charAfterNext = i + 2 < smiles.length ? smiles[i + 2]! : "";
          const followedByAtomContext =
            charAfterNext !== "" && /^[0-9=\/#$@(]/.test(charAfterNext);
          shouldSplit = followedByAtomContext;
        }
        if (twoLetterIsValid && !shouldSplit) {
          symbol = twoLetter;
          i++;
        }
      }
      // Prevent creation of explicit hydrogen atoms when they are likely part
      // of an aliphatic shorthand (e.g. the 'H' in 'CH2'). Allow explicit
      // hydrogen atoms when they appear as standalone atoms (no previous atom).
      if (symbol === "H" && prevAtomId !== null) {
        i++;
        continue;
      }
      const isAromaticOrganic = /^[bcnops]$/.test(symbol);
      const aromatic = isAromaticOrganic;
      const atom = createAtom(
        symbol,
        atomId++,
        aromatic,
        false,
        0,
      ) as MutableAtom | null;
      if (!atom) {
        errors.push({ message: `Unknown atom symbol: ${symbol}`, position: i });
        i++;
        continue;
      }
      atoms.push(atom);
      if (prevAtomId !== null) {
        bonds.push({
          atom1: prevAtomId,
          atom2: atom.id,
          type: pendingBondType,
          stereo: pendingBondStereo,
        });
        if (pendingBondExplicit)
          explicitBonds.add(bondKey(prevAtomId, atom.id));
        pendingBondStereo = StereoType.NONE;
      } else if (branchStack.length > 0) {
        const bp = branchStack[branchStack.length - 1]!;
        bonds.push({
          atom1: bp,
          atom2: atom.id,
          type: pendingBondType,
          stereo: pendingBondStereo,
        });
        if (pendingBondExplicit) explicitBonds.add(bondKey(bp, atom.id));
        pendingBondStereo = StereoType.NONE;
      }
      prevAtomId = atom.id;
      pendingBondType = BondType.SINGLE;
      pendingBondExplicit = false;
      i++;
      continue;
    }

    // Bonds
    if (ch === "-") {
      pendingBondType = BondType.SINGLE;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === "/") {
      pendingBondStereo = StereoType.UP;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === "\\") {
      pendingBondStereo = StereoType.DOWN;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === "=") {
      pendingBondType = BondType.DOUBLE;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === "#") {
      pendingBondType = BondType.TRIPLE;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === "$") {
      pendingBondType = BondType.QUADRUPLE;
      pendingBondExplicit = true;
      i++;
      continue;
    }
    if (ch === ":") {
      pendingBondType = BondType.AROMATIC;
      pendingBondExplicit = true;
      i++;
      continue;
    }

    // Branching
    if (ch === "(") {
      branchStack.push(prevAtomId!);
      prevAtomId = null;
      i++;
      continue;
    }
    if (ch === ")") {
      if (branchStack.length === 0) {
        errors.push({ message: "Unmatched closing parenthesis", position: i });
      } else {
        prevAtomId = branchStack.pop()!;
      }
      i++;
      continue;
    }

    // Ring closures: digit or %nn
    if (ch >= "0" && ch <= "9") {
      if (prevAtomId === null) {
        errors.push({
          message: "Ring closure digit without previous atom",
          position: i,
        });
      } else {
        const d = parseInt(ch);
        const list = bookmarks.get(d) || [];
        list.push({
          atomId: prevAtomId,
          bondType: pendingBondType,
          bondStereo: pendingBondStereo,
          explicit: pendingBondExplicit,
        });
        bookmarks.set(d, list);
        i++;
      }
      pendingBondType = BondType.SINGLE;
      pendingBondStereo = StereoType.NONE;
      pendingBondExplicit = false;
      continue;
    }
    if (ch === "%") {
      if (prevAtomId === null) {
        errors.push({
          message: "Ring closure % without previous atom",
          position: i,
        });
        i++;
        continue;
      }
      if (i + 2 < smiles.length && /[0-9][0-9]/.test(smiles.substr(i + 1, 2))) {
        const d = parseInt(smiles.substr(i + 1, 2));
        const list = bookmarks.get(d) || [];
        list.push({
          atomId: prevAtomId,
          bondType: pendingBondType,
          bondStereo: pendingBondStereo,
          explicit: pendingBondExplicit,
        });
        bookmarks.set(d, list);
        i += 3;
        pendingBondType = BondType.SINGLE;
        pendingBondStereo = StereoType.NONE;
        pendingBondExplicit = false;
        continue;
      } else {
        errors.push({ message: "Invalid % ring closure", position: i });
        i++;
        continue;
      }
    }

    errors.push({ message: `Unsupported character: ${ch}`, position: i });
    i++;
  }

  const tTokenizeEnd =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (timings) timings.tokenize += tTokenizeEnd - tTokenizeStart;
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
        errors.push({
          message: `Ring closure digit ${digit} has unmatched endpoint atom ${first.atomId}`,
          position: -1,
        });
        used[i] = true;
        continue;
      }

      const second = entries[pairedIndex]!;

      let bondType = BondType.SINGLE;
      let bondStereo: StereoType = StereoType.NONE;
      let isExplicit = false;

      if (
        first.bondType !== BondType.SINGLE &&
        second.bondType !== BondType.SINGLE
      ) {
        if (first.bondType !== second.bondType) {
          errors.push({
            message: `Ring closure ${digit} has conflicting bond types`,
            position: -1,
          });
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

      bonds.push({
        atom1: first.atomId,
        atom2: second.atomId,
        type: bondType,
        stereo: bondStereo,
      });
      if (isExplicit) explicitBonds.add(bondKey(first.atomId, second.atomId));

      used[i] = true;
      used[pairedIndex] = true;
    }

    // Note: Allowing more than two endpoints for compatibility with RDKit
  }
  if (branchStack.length > 0)
    errors.push({ message: "Unmatched opening parentheses", position: -1 });

  const tBuildGraphStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  // Build O(1) lookup structures for atoms and bonds
  const atomMap = new Map<number, MutableAtom>();
  for (const atom of atoms) {
    atomMap.set(atom.id, atom);
  }

  // Build adjacency index: atom id -> list of bonds connected to it
  const adjacency = new Map<number, MutableBond[]>();
  for (const bond of bonds) {
    if (!adjacency.has(bond.atom1)) adjacency.set(bond.atom1, []);
    if (!adjacency.has(bond.atom2)) adjacency.set(bond.atom2, []);
    adjacency.get(bond.atom1)!.push(bond);
    adjacency.get(bond.atom2)!.push(bond);
  }

  // Stereo inference: O(1) lookup instead of O(N²) .find()
  for (const bd of bonds) {
    if (bd.type !== BondType.DOUBLE) continue;
    if (bd.stereo && bd.stereo !== StereoType.NONE) continue;
    const a = bd.atom1;
    const b = bd.atom2;

    let singleA: MutableBond | undefined;
    let singleB: MutableBond | undefined;

    // Find stereo single bond attached to atom a (but not to b)
    const bondsAtA = adjacency.get(a) || [];
    for (const bx of bondsAtA) {
      if (
        bx.type === BondType.SINGLE &&
        bx.stereo &&
        bx.stereo !== StereoType.NONE
      ) {
        const other = bx.atom1 === a ? bx.atom2 : bx.atom1;
        if (other !== b) {
          singleA = bx;
          break;
        }
      }
    }

    // Find stereo single bond attached to atom b (but not to a)
    const bondsAtB = adjacency.get(b) || [];
    for (const bx of bondsAtB) {
      if (
        bx.type === BondType.SINGLE &&
        bx.stereo &&
        bx.stereo !== StereoType.NONE
      ) {
        const other = bx.atom1 === b ? bx.atom2 : bx.atom1;
        if (other !== a) {
          singleB = bx;
          break;
        }
      }
    }

    if (singleA && singleB && singleA.stereo === singleB.stereo)
      bd.stereo = singleA.stereo;
  }

  // Aromatic bond detection: O(N) with O(1) atom lookup
  for (const bond of bonds) {
    const a1 = atomMap.get(bond.atom1);
    const a2 = atomMap.get(bond.atom2);
    if (a1 && a2 && a1.aromatic && a2.aromatic) {
      // Convert to aromatic bond if both atoms are aromatic
      // For heterocycles, convert single bonds to aromatic too
      bond.type = BondType.AROMATIC;
    }
  }

  // Hydrogen calculation: O(N·M) -> O(N) with adjacency index
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
      const atomBonds = adjacency.get(atom.id) || [];
      for (const bond of atomBonds) {
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

      // Special handling for wildcard atom '*'
      if (atom.symbol === "*") {
        // Wildcard atom takes valence from its bonds, no implicit hydrogens
        atom.hydrogens = 0;
      } else {
        // Use aromatic valences for aromatic atoms, default valences otherwise
        const defaultValences = atom.aromatic
          ? AROMATIC_VALENCES[atom.symbol] ||
            DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber]
          : DEFAULT_VALENCES[atom.symbol] || [atom.atomicNumber];
        // Per OpenSMILES spec: if bond sum equals a known valence or exceeds all known valences, H count = 0
        // Otherwise H count = (next highest known valence) - bond sum
        const maxValence = Math.max(...defaultValences);
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
          atom.hydrogens = Math.max(
            0,
            targetValence + (atom.charge || 0) - bondOrderSum,
          );
        }
      }
    }
  }

  const tBuildGraphEnd =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (timings) timings.buildGraph += tBuildGraphEnd - tBuildGraphStart;

  const mol: Molecule = { atoms: atoms as Atom[], bonds: bonds as Bond[] };
  const mg = new MoleculeGraph(mol);

  // Validate aromaticity
  const tAromStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const validatedArom = validateAromaticity(
    atoms,
    bonds,
    errors,
    explicitBonds,
    mg,
  );
  const tAromEnd =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (timings) timings.validateAromaticity += tAromEnd - tAromStart;
  atoms = validatedArom.atoms;
  bonds = validatedArom.bonds;

  const tValenceStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  validateValences(atoms, bonds, errors);
  const tValenceEnd =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (timings) timings.validateValences += tValenceEnd - tValenceStart;

  const tStereoStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  validateStereochemistry(atoms, bonds, errors);
  const tStereoEnd =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (timings) timings.validateStereo += tStereoEnd - tStereoStart;

  // Perceive aromaticity (only once, after validation) - reuse MoleculeGraph
  const tPerceiveAromStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const { atoms: aromaticAtoms, bonds: aromaticBonds } = perceiveAromaticity(
    atoms as Atom[],
    bonds as Bond[],
    mg,
  );
  const tPerceiveAromEnd =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (timings)
    timings.perceiveAromaticity += tPerceiveAromEnd - tPerceiveAromStart;

  // Enrich molecule using aromaticity-perceived atoms/bonds - reuse MoleculeGraph
  const tEnrichStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const molecule = enrichMolecule(
    { atoms: aromaticAtoms, bonds: aromaticBonds },
    mg,
  );
  const tEnrichEnd =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (timings) timings.enrichMolecule += tEnrichEnd - tEnrichStart;

  if (timings)
    timings.total +=
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      t0;

  return { molecule, errors };
}
