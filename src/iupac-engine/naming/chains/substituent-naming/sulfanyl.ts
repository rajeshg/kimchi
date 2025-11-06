import type { Molecule } from "types";
import { getAlkaneBaseName } from "../../iupac-helpers";

export function nameAlkylSulfanylSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  sulfurAtomIdx: number,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkylSulfanylSubstituent] sulfur=${sulfurAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}`,
    );
  }

  const carbonAtoms = Array.from(substituentAtoms).filter(
    (idx) => molecule.atoms[idx]?.symbol === "C",
  );

  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkylSulfanylSubstituent] carbonAtoms=${carbonAtoms.join(",")}`,
    );
  }

  if (carbonAtoms.length === 0) {
    return "sulfanyl";
  }

  let carbonAttachedToS = -1;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === sulfurAtomIdx && carbonAtoms.includes(bond.atom2)) {
      carbonAttachedToS = bond.atom2;
      break;
    }
    if (bond.atom2 === sulfurAtomIdx && carbonAtoms.includes(bond.atom1)) {
      carbonAttachedToS = bond.atom1;
      break;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkylSulfanylSubstituent] carbonAttachedToS=${carbonAttachedToS}`,
    );
  }

  if (carbonAttachedToS === -1) {
    return "sulfanyl";
  }

  const carbonAtom = molecule.atoms[carbonAttachedToS];
  if (carbonAtom?.aromatic) {
    if (process.env.VERBOSE) {
      console.log(
        `[nameAlkylSulfanylSubstituent] Carbon ${carbonAttachedToS} is aromatic, checking for phenyl ring`,
      );
    }

    const ringContainingCarbon = molecule.rings?.find((ring) =>
      ring.includes(carbonAttachedToS),
    );

    if (ringContainingCarbon) {
      const ringSize = ringContainingCarbon.length;
      if (process.env.VERBOSE) {
        console.log(
          `[nameAlkylSulfanylSubstituent] Found ring: size=${ringSize}, atoms=${ringContainingCarbon}`,
        );
      }

      if (ringSize === 6) {
        const allCarbons = ringContainingCarbon.every((atomId: number) => {
          const atom = molecule.atoms[atomId];
          return atom?.symbol === "C";
        });

        if (process.env.VERBOSE) {
          console.log(
            `[nameAlkylSulfanylSubstituent] All carbons in ring: ${allCarbons}`,
          );
        }

        if (allCarbons) {
          if (process.env.VERBOSE) {
            console.log(
              `[nameAlkylSulfanylSubstituent] ✓ RETURNING phenylsulfanyl`,
            );
          }
          return "phenylsulfanyl";
        }
      }
    }
  }

  const carbonChain: number[] = [];
  const visited = new Set<number>([sulfurAtomIdx]);
  const stack = [carbonAttachedToS];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    carbonChain.push(current);

    for (const bond of molecule.bonds) {
      if (
        bond.atom1 === current &&
        carbonAtoms.includes(bond.atom2) &&
        !visited.has(bond.atom2)
      ) {
        stack.push(bond.atom2);
      } else if (
        bond.atom2 === current &&
        carbonAtoms.includes(bond.atom1) &&
        !visited.has(bond.atom1)
      ) {
        stack.push(bond.atom1);
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkylSulfanylSubstituent] carbonChain=${carbonChain.join(",")}, length=${carbonChain.length}`,
    );
  }

  const carbonCount = carbonChain.length;

  const tripleBonds: number[] = [];
  const doubleBonds: number[] = [];

  for (let i = 0; i < carbonChain.length; i++) {
    const c1 = carbonChain[i];
    for (let j = i + 1; j < carbonChain.length; j++) {
      const c2 = carbonChain[j];
      const bond = molecule.bonds.find(
        (b) =>
          (b.atom1 === c1 && b.atom2 === c2) ||
          (b.atom1 === c2 && b.atom2 === c1),
      );
      if (bond) {
        if (bond.type === "triple") {
          tripleBonds.push(i + 1);
        } else if (bond.type === "double") {
          doubleBonds.push(i + 1);
        }
      }
    }
  }

  let baseName: string;
  if (carbonCount === 1) {
    baseName = "meth";
  } else if (carbonCount === 2) {
    baseName = "eth";
  } else if (carbonCount === 3) {
    baseName = "prop";
  } else if (carbonCount === 4) {
    baseName = "but";
  } else {
    baseName = getAlkaneBaseName(carbonCount);
  }

  if (tripleBonds.length > 0) {
    const positions = tripleBonds.sort((a, b) => a - b).join(",");
    return `${baseName}-${positions}-ynylsulfanyl`;
  } else if (doubleBonds.length > 0) {
    const positions = doubleBonds.sort((a, b) => a - b).join(",");
    return `${baseName}-${positions}-enylsulfanyl`;
  } else {
    return `${baseName}ylsulfanyl`;
  }
}
