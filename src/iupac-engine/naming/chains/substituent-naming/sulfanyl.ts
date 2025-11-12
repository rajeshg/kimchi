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

  // Check if sulfur has oxygen double bonds (sulfinyl or sulfonyl)
  const oxygenDoubleBonds = molecule.bonds
    .filter(
      (bond) =>
        (bond.atom1 === sulfurAtomIdx || bond.atom2 === sulfurAtomIdx) &&
        bond.type === "double",
    )
    .filter((bond) => {
      const otherAtomId =
        bond.atom1 === sulfurAtomIdx ? bond.atom2 : bond.atom1;
      return molecule.atoms[otherAtomId]?.symbol === "O";
    });

  const oxygenCount = oxygenDoubleBonds.length;
  let sulfurSuffix = "sulfanyl"; // default: -S-

  if (oxygenCount === 2) {
    sulfurSuffix = "sulfonyl"; // -S(=O)(=O)-
  } else if (oxygenCount === 1) {
    sulfurSuffix = "sulfinyl"; // -S(=O)-
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkylSulfanylSubstituent] oxygenCount=${oxygenCount}, suffix=${sulfurSuffix}`,
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
    return sulfurSuffix;
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
    return sulfurSuffix;
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
              `[nameAlkylSulfanylSubstituent] ✓ RETURNING phenyl${sulfurSuffix}`,
            );
          }
          return `phenyl${sulfurSuffix}`;
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

  // Detect if we need to add attachment locant for branched chains
  let needsLocant = false;
  let attachmentPosition = 1; // default to position 1 (terminal carbon)

  // Count how many carbons are bonded to the carbon attached to sulfur
  let carbonNeighbors = 0;
  for (const bond of molecule.bonds) {
    if (bond.atom1 === carbonAttachedToS && carbonAtoms.includes(bond.atom2)) {
      carbonNeighbors++;
    } else if (
      bond.atom2 === carbonAttachedToS &&
      carbonAtoms.includes(bond.atom1)
    ) {
      carbonNeighbors++;
    }
  }

  // If the carbon attached to S has 2+ carbon neighbors, it's branched
  // For branched chains like isopropyl, we need to determine the attachment position
  if (carbonNeighbors >= 2) {
    needsLocant = true;

    // For a branched carbon in the middle of the chain (like isopropyl):
    // The chain goes through it, so the attachment is at an internal position
    // We need to find the position by counting from one end of the longest chain

    // Simple heuristic: if the carbon has 2 carbon neighbors and is not at either end,
    // it's likely at position 2 for a 3-carbon chain (isopropyl pattern)
    // More complex cases would need proper chain traversal and numbering

    if (carbonCount === 3 && carbonNeighbors === 2) {
      // Isopropyl case: C-C(C)-S -> attachment at position 2
      attachmentPosition = 2;
    } else {
      // For other cases, use the position in the DFS chain
      attachmentPosition = carbonChain.indexOf(carbonAttachedToS) + 1;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[nameAlkylSulfanylSubstituent] carbonAttachedToS=${carbonAttachedToS}, ` +
        `carbonNeighbors=${carbonNeighbors}, carbonCount=${carbonCount}, ` +
        `needsLocant=${needsLocant}, attachmentPosition=${attachmentPosition}`,
    );
  }

  if (tripleBonds.length > 0) {
    const positions = tripleBonds.sort((a, b) => a - b).join(",");
    if (needsLocant) {
      return `${baseName}-${positions}-yn-${attachmentPosition}-yl${sulfurSuffix}`;
    }
    return `${baseName}-${positions}-ynyl${sulfurSuffix}`;
  } else if (doubleBonds.length > 0) {
    const positions = doubleBonds.sort((a, b) => a - b).join(",");
    if (needsLocant) {
      return `${baseName}-${positions}-en-${attachmentPosition}-yl${sulfurSuffix}`;
    }
    return `${baseName}-${positions}-enyl${sulfurSuffix}`;
  } else {
    if (needsLocant) {
      return `${baseName}an-${attachmentPosition}-yl${sulfurSuffix}`;
    }
    return `${baseName}yl${sulfurSuffix}`;
  }
}
