import type { Molecule } from "types";
import { getAlkaneBaseName } from "../../iupac-helpers";

export function nameAmideSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  carbonylCarbonIdx: number,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[nameAmideSubstituent] carbonylCarbon=${carbonylCarbonIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}`,
    );
  }

  const carbonAtom = molecule.atoms[carbonylCarbonIdx];
  if (!carbonAtom || carbonAtom.symbol !== "C") {
    return "carbamoyl";
  }

  const carbonAtoms = Array.from(substituentAtoms).filter(
    (idx) => molecule.atoms[idx]?.symbol === "C",
  );

  if (process.env.VERBOSE) {
    console.log(`[nameAmideSubstituent] carbonAtoms=${carbonAtoms.join(",")}`);
  }

  if (carbonAtoms.length === 0) {
    return "carbamoyl";
  }

  let carbonChainStart = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === carbonylCarbonIdx && carbonAtoms.includes(bond.atom2)) {
      const bondedAtom = molecule.atoms[bond.atom2];
      if (bondedAtom?.symbol === "C") {
        carbonChainStart = bond.atom2;
        break;
      }
    }
    if (bond.atom2 === carbonylCarbonIdx && carbonAtoms.includes(bond.atom1)) {
      const bondedAtom = molecule.atoms[bond.atom1];
      if (bondedAtom?.symbol === "C") {
        carbonChainStart = bond.atom1;
        break;
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(`[nameAmideSubstituent] carbonChainStart=${carbonChainStart}`);
  }

  if (carbonChainStart === -1) {
    return "carbamoyl";
  }

  const carbonChain: number[] = [carbonylCarbonIdx];
  const visited = new Set<number>([carbonylCarbonIdx]);
  let current = carbonChainStart;

  while (current !== -1 && substituentAtoms.has(current)) {
    carbonChain.push(current);
    visited.add(current);

    let next = -1;
    for (const bond of molecule.bonds) {
      const neighbor =
        bond.atom1 === current
          ? bond.atom2
          : bond.atom2 === current
            ? bond.atom1
            : -1;
      if (
        neighbor !== -1 &&
        !visited.has(neighbor) &&
        substituentAtoms.has(neighbor) &&
        molecule.atoms[neighbor]?.symbol === "C"
      ) {
        next = neighbor;
        break;
      }
    }
    current = next;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameAmideSubstituent] carbonChain=${carbonChain.join(",")}, length=${carbonChain.length}`,
    );
  }

  const carbonCount = carbonChain.length;

  if (carbonCount === 1) return "carbamoyl";
  if (carbonCount === 2) return "acetamoyl";
  if (carbonCount === 3) return "propanamoyl";
  if (carbonCount === 4) return "butanamoyl";
  if (carbonCount === 5) return "pentanamoyl";
  if (carbonCount === 6) return "hexanamoyl";
  if (carbonCount === 7) return "heptanamoyl";
  if (carbonCount === 8) return "octanamoyl";
  if (carbonCount === 9) return "nonanamoyl";
  if (carbonCount === 10) return "decanamoyl";

  return `${getAlkaneBaseName(carbonCount)}anamoyl`;
}
