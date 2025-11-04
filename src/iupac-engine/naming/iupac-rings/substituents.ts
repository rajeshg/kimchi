import type { Molecule } from "types";
import type { Substituent } from "../iupac-types";
import {
  identifyPolycyclicPattern,
  identifyAdvancedFusedPattern,
} from "./fused-naming";
import { getNumberingFunction } from "./numbering";
import { buildPerimeterFromRings, compareNumericArrays } from "./utils";

export function generateSubstitutedFusedNameWithIUPACNumbering(
  baseName: string,
  substituents: Substituent[],
  fusedSystem: any,
  molecule: Molecule,
): string {
  if (substituents.length === 0) return baseName;
  const numberingFn = getNumberingFunction(baseName);
  const renumbered = applyNumberingToSubstituents(
    substituents,
    numberingFn,
    fusedSystem,
    molecule,
  );
  const grouped = groupSubstituents(renumbered);
  const prefixes = generatePrefixes(grouped);
  return `${prefixes.join("-")}${baseName}`;
}

function applyNumberingToSubstituents(
  substituents: Substituent[],
  numberingFn: Function,
  fusedSystem: any,
  molecule: Molecule,
): Substituent[] {
  return substituents.map((sub) => {
    if (typeof sub.position === "string") return sub; // already numbered
    return {
      ...sub,
      position: numberingFn(sub.position, fusedSystem, molecule),
    };
  });
}

function groupSubstituents(
  substituents: Substituent[],
): Record<string, { positions: string[]; name: string }> {
  const grouped: Record<string, { positions: string[]; name: string }> = {};
  for (const sub of substituents) {
    const key = sub.name;
    if (!grouped[key]) grouped[key] = { positions: [], name: sub.name };
    grouped[key].positions.push(sub.position);
  }
  return grouped;
}

function generatePrefixes(
  grouped: Record<string, { positions: string[]; name: string }>,
): string[] {
  const prefixes: string[] = [];
  for (const [name, data] of Object.entries(grouped)) {
    const positions = data.positions.slice().sort();
    const posStr = positions.join(",");
    let prefix = "";
    if (positions.length === 1) prefix = `${posStr}-${name}`;
    else prefix = `${posStr}-${getMultiplicityPrefix(positions.length)}${name}`;
    prefixes.push(prefix);
  }
  prefixes.sort();
  return prefixes;
}

function getMultiplicityPrefix(n: number): string {
  const map: Record<number, string> = {
    2: "di",
    3: "tri",
    4: "tetra",
    5: "penta",
  };
  return map[n] ?? `${n}`;
}

export function findSubstituentsOnFusedSystem(
  fusedSystem: any,
  molecule: Molecule,
): Substituent[] {
  const substituents: Substituent[] = [];
  const fusedAtoms = new Set<number>();
  for (const ring of fusedSystem.rings)
    for (const atomIdx of ring) fusedAtoms.add(atomIdx);
  const baseName =
    identifyAdvancedFusedPattern(fusedSystem.rings, molecule) ||
    identifyPolycyclicPattern(fusedSystem.rings, molecule) ||
    "";
  const numberingFn = getNumberingFunction(baseName);
  for (const atomIdx of fusedAtoms) {
    for (const bond of molecule.bonds) {
      let substituentAtomIdx = -1;
      if (bond.atom1 === atomIdx && !fusedAtoms.has(bond.atom2))
        substituentAtomIdx = bond.atom2;
      else if (bond.atom2 === atomIdx && !fusedAtoms.has(bond.atom1))
        substituentAtomIdx = bond.atom1;
      if (substituentAtomIdx >= 0) {
        const substituentInfo = classifyFusedSubstituent(
          molecule,
          substituentAtomIdx,
          fusedAtoms,
        );
        if (substituentInfo) {
          substituents.push({
            position: numberingFn(atomIdx, fusedSystem, molecule),
            type: substituentInfo.type,
            size: substituentInfo.size,
            name: substituentInfo.name,
          });
        }
      }
    }
  }
  const unique = substituents.filter(
    (s, i, arr) =>
      i ===
      arr.findIndex((x) => x.position === s.position && x.name === s.name),
  );
  return unique;
}

export function determinePositionInFusedSystem(
  atomIdx: number,
  fusedSystem: any,
  molecule: Molecule,
): string {
  const fusedAtoms = new Set<number>();
  for (const ring of fusedSystem.rings) for (const a of ring) fusedAtoms.add(a);
  const baseName = identifyPolycyclicPattern(fusedSystem.rings, molecule);
  if (!baseName) {
    const sortedAtoms = Array.from(fusedAtoms).sort((a, b) => a - b);
    return (sortedAtoms.indexOf(atomIdx) + 1).toString();
  }
  const numberingFn = getNumberingFunction(baseName);
  return numberingFn(atomIdx, fusedSystem, molecule);
}

function classifyFusedSubstituent(
  molecule: Molecule,
  startAtomIdx: number,
  fusedAtoms: Set<number>,
): { type: string; size: number; name: string } | null {
  const visited = new Set<number>(fusedAtoms);
  const substituentAtoms = new Set<number>();
  const stack = [startAtomIdx];
  visited.add(startAtomIdx);
  substituentAtoms.add(startAtomIdx);

  while (stack.length > 0) {
    const currentIdx = stack.pop()!;
    substituentAtoms.add(currentIdx);
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (bond.atom1 === currentIdx && !visited.has(bond.atom2)) {
        neighborIdx = bond.atom2;
      } else if (bond.atom2 === currentIdx && !visited.has(bond.atom1)) {
        neighborIdx = bond.atom1;
      }
      if (neighborIdx >= 0) {
        visited.add(neighborIdx);
        stack.push(neighborIdx);
      }
    }
  }

  const atoms = Array.from(substituentAtoms)
    .map((idx) => molecule.atoms[idx])
    .filter((atom): atom is (typeof molecule.atoms)[0] => atom !== undefined);

  const carbonCount = atoms.filter((atom) => atom.symbol === "C").length;

  // Simple substituents
  if (carbonCount === 1 && atoms.length === 1) {
    return { type: "alkyl", size: 1, name: "methyl" };
  } else if (carbonCount === 2 && atoms.length === 2) {
    return { type: "alkyl", size: 2, name: "ethyl" };
  } else if (carbonCount === 3 && atoms.length === 3) {
    return { type: "alkyl", size: 3, name: "propyl" };
  } else if (
    atoms.some((atom) => atom.symbol === "O" && atom.hydrogens === 1)
  ) {
    return { type: "functional", size: 1, name: "hydroxy" };
  } else if (atoms.some((atom) => atom.symbol === "Cl")) {
    return { type: "halo", size: 1, name: "chloro" };
  } else if (atoms.some((atom) => atom.symbol === "Br")) {
    return { type: "halo", size: 1, name: "bromo" };
  } else if (atoms.some((atom) => atom.symbol === "I")) {
    return { type: "halo", size: 1, name: "iodo" };
  }

  // Larger alkyl groups
  if (carbonCount > 0) {
    const alkaneNames = [
      "",
      "meth",
      "eth",
      "prop",
      "but",
      "pent",
      "hex",
      "hept",
      "oct",
      "non",
      "dec",
    ];
    const prefix = alkaneNames[carbonCount] || `C${carbonCount}`;
    return { type: "alkyl", size: carbonCount, name: `${prefix}yl` };
  }

  return null;
}
