import type { Molecule } from "types";
import { BondType } from "types";
import {
  getAlkaneBaseName,
  getAlkylName,
  getGreekNumeral,
} from "./iupac-helpers";
import type { NamingSubstituent } from "./iupac-types";
import { getSharedOPSINService } from "../services/opsin-service";
import { getHeteroAtomPrefixFromOPSIN } from "../adapters/opsin-adapter";
import {
  findSubstituents,
  classifySubstituent,
  nameRingSubstituent,
  nameAlkoxySubstituent,
  nameAlkylSulfanylSubstituent,
  namePhosphorylSubstituent,
} from "./chains/substituent-naming";
import { findMainChain } from "./chains/main-chain-selection";
import { getChainFunctionalGroupPriority } from "./chains/main-chain-selection/functional-group-priority";
import { isBetterLocants } from "./chains/main-chain-selection/chain-comparison";

// Re-export for backward compatibility
export {
  findSubstituents,
  classifySubstituent,
  nameRingSubstituent,
  nameAlkoxySubstituent,
  nameAlkylSulfanylSubstituent,
  namePhosphorylSubstituent,
} from "./chains/substituent-naming";
export { findMainChain } from "./chains/main-chain-selection";
export { getChainFunctionalGroupPriority } from "./chains/main-chain-selection/functional-group-priority";

function _getCombinedLocants(molecule: Molecule, chain: number[]): number[] {
  const substituentLocants = findSubstituents(molecule, chain).map((s) =>
    parseInt(s.position),
  );
  const unsaturationLocants = getUnsaturationPositions(chain, molecule);
  return [...substituentLocants, ...unsaturationLocants].sort((a, b) => a - b);
}

function getUnsaturationPositions(
  chain: number[],
  molecule: Molecule,
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const bond = molecule.bonds.find(
      (b) =>
        (b.atom1 === chain[i] && b.atom2 === chain[i + 1]) ||
        (b.atom1 === chain[i + 1] && b.atom2 === chain[i]),
    );
    if (
      bond &&
      (bond.type === BondType.DOUBLE || bond.type === BondType.TRIPLE)
    ) {
      positions.push(i + 1);
    }
  }
  return positions;
}

function _isValidChain(chain: number[], molecule: Molecule): boolean {
  for (let i = 0; i < chain.length - 1; i++) {
    const atom1 = chain[i];
    const atom2 = chain[i + 1];
    const bondExists = molecule.bonds.some(
      (b) =>
        (b.atom1 === atom1 && b.atom2 === atom2) ||
        (b.atom1 === atom2 && b.atom2 === atom1),
    );
    if (!bondExists) return false;
  }
  return true;
}

function renumberUnsaturationToLowest(
  positions: number[],
  chainLength: number,
): number[] {
  if (positions.length === 0) return positions;
  const original = positions.slice().sort((a, b) => a - b);
  const reversed = original.map((p) => chainLength - p).sort((a, b) => a - b);

  // Choose the lexicographically lowest full vector (not just the first locant)
  return isBetterLocants(reversed, original) ? reversed : original;
}

export function findLongestCarbonChain(molecule: Molecule): number[] {
  const carbonIndices = molecule.atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom }) => atom.symbol === "C")
    .map(({ idx }) => idx);

  if (carbonIndices.length === 0) return [];
  if (carbonIndices.length === 1) return carbonIndices;

  const adjList = new Map<number, number[]>();
  for (const idx of carbonIndices) adjList.set(idx, []);

  for (const bond of molecule.bonds) {
    if (
      molecule.atoms[bond.atom1]?.symbol === "C" &&
      molecule.atoms[bond.atom2]?.symbol === "C"
    ) {
      adjList.get(bond.atom1)?.push(bond.atom2);
      adjList.get(bond.atom2)?.push(bond.atom1);
    }
  }

  let longestPath: number[] = [];
  const dfs = (node: number, visited: Set<number>, path: number[]): void => {
    if (path.length > longestPath.length) longestPath = [...path];
    const neighbors = adjList.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };

  for (const startAtom of carbonIndices) {
    const visited = new Set<number>([startAtom]);
    dfs(startAtom, visited, [startAtom]);
  }

  return longestPath;
}

export function findLongestHeteroChain(molecule: Molecule): number[] {
  const carbonChain = findLongestCarbonChain(molecule);
  if (carbonChain.length > 0) return carbonChain;

  const allIndices = molecule.atoms.map((_, idx) => idx);
  if (allIndices.length === 0) return [];
  if (allIndices.length === 1) return allIndices;

  const adjList = new Map<number, number[]>();
  for (const idx of allIndices) adjList.set(idx, []);
  for (const bond of molecule.bonds) {
    adjList.get(bond.atom1)?.push(bond.atom2);
    adjList.get(bond.atom2)?.push(bond.atom1);
  }

  let longestPath: number[] = [];
  const dfs = (node: number, visited: Set<number>, path: number[]): void => {
    if (path.length > longestPath.length) longestPath = [...path];
    const neighbors = adjList.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, visited, path);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };

  for (const startAtom of allIndices) {
    const visited = new Set<number>([startAtom]);
    dfs(startAtom, visited, [startAtom]);
  }

  return longestPath;
}

export function generateHeteroPrefixes(
  mainChain: number[],
  molecule: Molecule,
): string[] {
  const opsinService = getSharedOPSINService();
  const prefixes: string[] = [];

  for (const atomIdx of mainChain) {
    const atom = molecule.atoms[atomIdx];
    if (!atom || atom.symbol === "C") continue;

    const position = mainChain.indexOf(atomIdx) + 1;
    const heteroPrefix = getHeteroAtomPrefixFromOPSIN(
      atom.symbol,
      opsinService,
    );

    if (heteroPrefix) {
      prefixes.push(`${position}-${heteroPrefix}`);
    } else {
      // Fallback for atoms not in OPSIN data
      prefixes.push(`${position}-${atom.symbol.toLowerCase()}a`);
    }
  }

  // Sort by IUPAC priority from OPSIN heteroatom order (per P-15.1.5.2)
  const priorityOrder = opsinService.getHeteroAtomPriorityOrder();
  prefixes.sort((a, b) => {
    const pa = priorityOrder.findIndex((p: string) => a.includes(p));
    const pb = priorityOrder.findIndex((p: string) => b.includes(p));
    if (pa === pb) return a.localeCompare(b);
    if (pa === -1) return 1;
    if (pb === -1) return -1;
    return pa - pb;
  });

  return prefixes;
}

export function generateChainBaseName(
  mainChain: number[],
  molecule: Molecule,
): {
  hydrocarbonBase: string;
  unsaturation: { type: "ene" | "yne"; positions: number[] } | null;
} | null {
  const heteroAtoms = mainChain
    .map((idx) => molecule.atoms[idx])
    .filter(
      (atom): atom is NonNullable<typeof atom> =>
        atom !== undefined && atom.symbol !== "C",
    );

  let doubleBonds: number[] = [];
  let tripleBonds: number[] = [];
  for (let i = 0; i < mainChain.length - 1; i++) {
    const bond = molecule.bonds.find(
      (b) =>
        (b.atom1 === mainChain[i] && b.atom2 === mainChain[i + 1]) ||
        (b.atom1 === mainChain[i + 1] && b.atom2 === mainChain[i]),
    );
    if (bond) {
      if (bond.type === BondType.DOUBLE) doubleBonds.push(i + 1);
      else if (bond.type === BondType.TRIPLE) tripleBonds.push(i + 1);
    }
  }

  const carbonCount = mainChain.length;
  const hydrocarbonBase = getAlkaneBaseName(carbonCount);

  let unsaturation: { type: "ene" | "yne"; positions: number[] } | null = null;
  if (tripleBonds.length > 0) {
    const renumberedTriples = renumberUnsaturationToLowest(
      tripleBonds,
      carbonCount,
    );
    unsaturation = { type: "yne", positions: renumberedTriples };
  } else if (doubleBonds.length > 0) {
    const renumberedDoubles = renumberUnsaturationToLowest(
      doubleBonds,
      carbonCount,
    );
    unsaturation = { type: "ene", positions: renumberedDoubles };
  }

  if (heteroAtoms.length === 0) {
    return { hydrocarbonBase, unsaturation };
  } else {
    return { hydrocarbonBase: `hetero${hydrocarbonBase}`, unsaturation };
  }
}

/**
 * Helper function to name phosphanyl substituents (P with substituents, no P=O)
 * For example: P(C6H5)2 → "diphenylphosphanyl"
 */
export function namePhosphanylSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  phosphorusAtomIdx: number,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[namePhosphanylSubstituent] phosphorus=${phosphorusAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}`,
    );
  }

  // Find all atoms bonded to phosphorus
  const pAtom = molecule.atoms[phosphorusAtomIdx];
  if (!pAtom) return "phosphanyl";

  const substituentsOnP: number[] = [];
  for (const bond of molecule.bonds) {
    let otherAtom = -1;
    if (bond.atom1 === phosphorusAtomIdx) {
      otherAtom = bond.atom2;
    } else if (bond.atom2 === phosphorusAtomIdx) {
      otherAtom = bond.atom1;
    } else {
      continue;
    }

    // Include this substituent
    if (substituentAtoms.has(otherAtom)) {
      substituentsOnP.push(otherAtom);
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[namePhosphanylSubstituent] substituentsOnP=${substituentsOnP.join(",")}`,
    );
  }

  if (substituentsOnP.length === 0) {
    return "phosphanyl"; // Just P
  }

  // Count substituent types (group identical ones)
  const substituentGroups = new Map<string, number>();

  for (const subAtomIdx of substituentsOnP) {
    const subAtom = molecule.atoms[subAtomIdx];
    if (!subAtom) continue;

    // Collect all atoms in this substituent branch
    const branchAtoms = new Set<number>();
    const visited = new Set<number>([phosphorusAtomIdx]);
    const stack = [subAtomIdx];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      branchAtoms.add(current);

      for (const bond of molecule.bonds) {
        const next =
          bond.atom1 === current
            ? bond.atom2
            : bond.atom2 === current
              ? bond.atom1
              : -1;
        if (next !== -1 && !visited.has(next) && substituentAtoms.has(next)) {
          stack.push(next);
        }
      }
    }

    // Determine the name for this branch
    let branchName = "";

    if (subAtom.symbol === "C") {
      // Alkyl substituent: -R
      const carbonAtoms = Array.from(branchAtoms).filter(
        (idx) => molecule.atoms[idx]?.symbol === "C",
      );

      // Check for phenyl group
      if (subAtom.aromatic) {
        const ringContainingCarbon = molecule.rings?.find((ring) =>
          ring.includes(subAtomIdx),
        );
        if (ringContainingCarbon && ringContainingCarbon.length === 6) {
          const allCarbons = ringContainingCarbon.every(
            (atomId: number) => molecule.atoms[atomId]?.symbol === "C",
          );
          if (allCarbons) {
            branchName = "phenyl";
          }
        }
      }

      if (!branchName) {
        // Aliphatic alkyl
        const carbonCount = carbonAtoms.length;
        if (carbonCount === 1) branchName = "methyl";
        else if (carbonCount === 2) branchName = "ethyl";
        else if (carbonCount === 3) branchName = "propyl";
        else if (carbonCount === 4) branchName = "butyl";
        else branchName = getAlkylName(carbonCount);
      }
    } else if (subAtom.symbol === "O") {
      branchName = "oxy";
    } else {
      branchName = subAtom.symbol.toLowerCase();
    }

    if (branchName) {
      substituentGroups.set(
        branchName,
        (substituentGroups.get(branchName) || 0) + 1,
      );
    }
  }

  if (substituentGroups.size === 0) {
    return "phosphanyl";
  }

  // Build the name with multiplicative prefixes
  const parts: string[] = [];
  for (const [name, count] of substituentGroups.entries()) {
    if (count === 1) {
      parts.push(name);
    } else if (count === 2) {
      parts.push(`di${name}`);
    } else if (count === 3) {
      parts.push(`tri${name}`);
    } else if (count === 4) {
      parts.push(`tetra${name}`);
    } else {
      parts.push(`${getGreekNumeral(count)}${name}`);
    }
  }

  // Format as "diphenylphosphanyl" or "methylethylphosphanyl"
  return `${parts.join("")}phosphanyl`;
}

/**
 * Build the longest carbon chain passing through a given carbon within a set of atoms
 * This explores ALL possible paths through the attachment point to find the true longest chain
 */

/**
 * Names an aryloxy substituent: -O-Aryl (e.g., phenoxy, 4-chlorophenoxy, naphthoxy)
 * Detects aromatic rings bonded to oxygen and names substituents on the ring
 */

export function generateSubstitutedName(
  hydrocarbonBase: string,
  substituents: NamingSubstituent[],
  heteroPrefixes: string[] = [],
  unsaturation: { type: "ene" | "yne"; positions: number[] } | null,
): string {
  // Group substituents by root name, collect positions and counts. Build prefix
  // objects so we can sort alphabetically by root name ignoring multiplicative
  // prefixes (di/tri/bis) according to IUPAC rules.
  const grouped = new Map<string, { positions: string[]; count: number }>();
  for (const sub of substituents) {
    const entry = grouped.get(sub.name);
    if (entry) {
      entry.positions.push(sub.position);
      entry.count += 1;
    } else {
      grouped.set(sub.name, { positions: [sub.position], count: 1 });
    }
  }

  type PrefixObj = {
    positions: string[];
    count: number;
    root: string;
    text: string;
  };
  const substituentPrefixes: PrefixObj[] = [];
  for (const [root, data] of grouped.entries()) {
    const positions = data.positions.sort((a, b) => parseInt(a) - parseInt(b));
    const count = positions.length;
    const multiplier = count === 1 ? "" : getGreekNumeral(count);

    // Check if we can omit the locant: single substituent at position 1, no heteroatoms, simple saturated chain
    const canOmitLocant =
      count === 1 &&
      positions[0] === "1" &&
      heteroPrefixes.length === 0 &&
      substituents.length === 1 &&
      unsaturation === null;

    const text =
      count === 1
        ? canOmitLocant
          ? `${root}`
          : `${positions.join(",")}-${root}`
        : `${positions.join(",")}-${multiplier}${root}`;
    substituentPrefixes.push({ positions, count, root, text });
  }

  // heteroPrefixes come as strings like '2-oxa' — parse root for sorting (after '-')
  const heteroPrefixObjs: PrefixObj[] = heteroPrefixes.map((h) => {
    const parts = h.split("-");
    const pos = parts[0] ?? "";
    const root = parts[1] ?? h;
    return { positions: [pos], count: 1, root, text: h };
  });

  // Sort prefixes alphabetically by root (IUPAC ignores multiplicative prefixes)
  const allPrefixes: PrefixObj[] = [
    ...substituentPrefixes,
    ...heteroPrefixObjs,
  ];
  allPrefixes.sort((A, B) => {
    const aRoot = A.root.replace(/^(di|tri|tetra|bis|tris|tetr)/i, "");
    const bRoot = B.root.replace(/^(di|tri|tetra|bis|tris|tetr)/i, "");
    if (aRoot === bRoot) return A.text.localeCompare(B.text);
    return aRoot.localeCompare(bRoot);
  });
  const prefixes = allPrefixes.map((p) => p.text);

  let unsaturationSuffix = "";
  if (unsaturation) {
    const positions = unsaturation.positions;
    if (process.env.VERBOSE) {
      console.log(
        `[Unsaturation] positions=${JSON.stringify(positions)}, type=${unsaturation.type}`,
      );
    }
    if (positions.length === 1 && positions[0] === 1) {
      unsaturationSuffix = unsaturation.type;
    } else {
      unsaturationSuffix = `-${positions.join(",")}-${unsaturation.type}`;
    }
  } else {
    unsaturationSuffix = "ane";
  }

  const prefixPart = prefixes.length > 0 ? prefixes.join("-") : "";
  if (prefixPart.length > 0) {
    // If there are hetero prefixes present, insert a hyphen between the prefix part
    // and the hydrocarbon base (e.g., 2-oxa-propene). If no hetero prefixes, do not
    // add an extra hyphen between substituent prefix and base (e.g., 2-methylbutane).
    if (heteroPrefixes && heteroPrefixes.length > 0) {
      return `${prefixPart}-${hydrocarbonBase}${unsaturationSuffix}`;
    }
    return `${prefixPart}${hydrocarbonBase}${unsaturationSuffix}`;
  }
  return `${hydrocarbonBase}${unsaturationSuffix}`;
}
