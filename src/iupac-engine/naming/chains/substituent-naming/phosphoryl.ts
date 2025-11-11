import type { Molecule } from "types";
import {
  getAlkaneBaseName,
  getGreekNumeral,
  getAlkylName,
} from "../../iupac-helpers";

export function namePhosphorylSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  phosphorusAtomIdx: number,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[namePhosphorylSubstituent] phosphorus=${phosphorusAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}`,
    );
  }

  const pAtom = molecule.atoms[phosphorusAtomIdx];
  if (!pAtom) return "phosphoryl";

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

    const otherAtomObj = molecule.atoms[otherAtom];
    if (otherAtomObj?.symbol === "O" && bond.type === "double") {
      continue;
    }

    if (substituentAtoms.has(otherAtom)) {
      substituentsOnP.push(otherAtom);
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[namePhosphorylSubstituent] substituentsOnP=${substituentsOnP.join(",")}`,
    );
  }

  if (substituentsOnP.length === 0) {
    return "phosphoryl";
  }

  const substituentNames: string[] = [];
  for (const subAtomIdx of substituentsOnP) {
    const subAtom = molecule.atoms[subAtomIdx];
    if (!subAtom) continue;

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

    let branchName = "";

    if (subAtom.symbol === "O") {
      const carbonAtoms = Array.from(branchAtoms).filter(
        (idx) => molecule.atoms[idx]?.symbol === "C",
      );

      if (carbonAtoms.length === 0) {
        branchName = "hydroxy";
      } else {
        let carbonAttachedToO = -1;
        for (const bond of molecule.bonds) {
          if (bond.atom1 === subAtomIdx && carbonAtoms.includes(bond.atom2)) {
            carbonAttachedToO = bond.atom2;
            break;
          }
          if (bond.atom2 === subAtomIdx && carbonAtoms.includes(bond.atom1)) {
            carbonAttachedToO = bond.atom1;
            break;
          }
        }

        if (carbonAttachedToO !== -1) {
          const carbonAtom = molecule.atoms[carbonAttachedToO];
          if (carbonAtom?.aromatic) {
            const ringContainingCarbon = molecule.rings?.find((ring) =>
              ring.includes(carbonAttachedToO),
            );
            if (ringContainingCarbon && ringContainingCarbon.length === 6) {
              branchName = "phenoxy";
            } else {
              branchName = "aryloxy";
            }
          } else {
            const ringContainingCarbon = molecule.rings?.find((ring) =>
              ring.includes(carbonAttachedToO),
            );
            if (ringContainingCarbon) {
              const ringSize = ringContainingCarbon.length;
              if (ringSize === 8) {
                branchName = "cyclooctyloxy";
              } else if (ringSize === 6) {
                branchName = "cyclohexyloxy";
              } else if (ringSize === 5) {
                branchName = "cyclopentyloxy";
              } else {
                branchName = `cyclo${getAlkaneBaseName(ringSize)}yloxy`;
              }
            } else {
              const carbonCount = carbonAtoms.length;
              if (carbonCount === 1) branchName = "methoxy";
              else if (carbonCount === 2) branchName = "ethoxy";
              else if (carbonCount === 3) branchName = "propoxy";
              else if (carbonCount === 4) branchName = "butoxy";
              else branchName = `${getAlkaneBaseName(carbonCount)}oxy`;
            }
          }
        }
      }
    } else if (subAtom.symbol === "C") {
      const carbonAtoms = Array.from(branchAtoms).filter(
        (idx) => molecule.atoms[idx]?.symbol === "C",
      );

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
        const carbonCount = carbonAtoms.length;
        if (carbonCount === 1) branchName = "methyl";
        else if (carbonCount === 2) branchName = "ethyl";
        else if (carbonCount === 3) branchName = "propyl";
        else if (carbonCount === 4) branchName = "butyl";
        else branchName = getAlkylName(carbonCount);
      }
    } else if (subAtom.symbol === "S") {
      branchName = "sulfanyl";
    } else {
      branchName = subAtom.symbol.toLowerCase();
    }

    if (branchName) {
      substituentNames.push(branchName);
    }
  }

  if (substituentNames.length === 0) {
    return "phosphoryl";
  }

  substituentNames.sort();

  const formattedNames = substituentNames.map((name) => `(${name})`).join("");
  return `${formattedNames}phosphoryl`;
}

export function namePhosphanylSubstituent(
  molecule: Molecule,
  substituentAtoms: Set<number>,
  phosphorusAtomIdx: number,
  attachmentPointIdx?: number,
): string {
  if (process.env.VERBOSE) {
    console.log(
      `[namePhosphanylSubstituent] phosphorus=${phosphorusAtomIdx}, substituentAtoms=${Array.from(substituentAtoms).join(",")}, attachmentPoint=${attachmentPointIdx}`,
    );
  }

  const pAtom = molecule.atoms[phosphorusAtomIdx];
  if (!pAtom) return "phosphanyl";

  // Identify the linker atom (attachment point to main chain)
  let linkerAtom: number | undefined = attachmentPointIdx;
  let linkerSymbol: string | undefined = undefined;

  if (linkerAtom !== undefined) {
    const linkerAtomObj = molecule.atoms[linkerAtom];
    linkerSymbol = linkerAtomObj?.symbol;

    if (process.env.VERBOSE) {
      console.log(
        `[namePhosphanylSubstituent] linker atom ${linkerAtom} (${linkerSymbol}) connects to main chain`,
      );
    }
  }

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

    // Skip the linker atom - it's not a substituent ON phosphorus
    if (otherAtom === linkerAtom) {
      if (process.env.VERBOSE) {
        console.log(
          `[namePhosphanylSubstituent] skipping linker atom ${otherAtom} from substituents on P`,
        );
      }
      continue;
    }

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
    return "phosphanyl";
  }

  const substituentGroups = new Map<string, number>();

  for (const subAtomIdx of substituentsOnP) {
    const subAtom = molecule.atoms[subAtomIdx];
    if (!subAtom) continue;

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

    let branchName = "";

    if (subAtom.symbol === "C") {
      const carbonAtoms = Array.from(branchAtoms).filter(
        (idx) => molecule.atoms[idx]?.symbol === "C",
      );

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
    // If there's a linker, add its suffix (e.g., "oxy" for oxygen)
    if (linkerSymbol === "O") {
      return "phosphanyloxy";
    }
    return "phosphanyl";
  }

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

  // Build base name with substituents
  let baseName = `${parts.join("")}phosphanyl`;

  // Add linker suffix if present (e.g., "oxy" for oxygen linker)
  if (linkerSymbol === "O") {
    baseName += "oxy";
  } else if (linkerSymbol === "S") {
    baseName += "sulfanyl";
  } else if (linkerSymbol === "N") {
    baseName += "amino";
  }

  if (process.env.VERBOSE) {
    console.log(
      `[namePhosphanylSubstituent] final name: ${baseName} (linker=${linkerSymbol})`,
    );
  }

  return baseName;
}
