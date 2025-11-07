import type { Molecule } from "types";
import type {
  FunctionalGroup,
  ParentStructure,
  MultipleBond,
} from "../../types";
import type { OPSINService } from "../../opsin-service";
import { getMultiplicativePrefix, collectConnectedAtomsInSet } from "./utils";

export function buildChainName(
  parentStructure: ParentStructure,
  functionalGroups: FunctionalGroup[],
  opsinService?: OPSINService,
): string {
  const chain = parentStructure.chain;
  if (!chain) {
    return parentStructure.name || "unknown-chain";
  }

  // For amines, count only carbons in the chain (nitrogen is not counted in parent name)
  const principalGroup = functionalGroups.find((g) => g.isPrincipal);
  const isAmine = principalGroup?.type === "amine";
  const length = isAmine
    ? chain.atoms.filter((a) => a.symbol === "C").length
    : chain.length;

  // Base chain name
  const chainNames = [
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
    "undec",
    "dodec",
    "tridec",
    "tetradec",
    "pentadec",
    "hexadec",
    "heptadec",
    "octadec",
    "nonadec",
  ];

  let baseName = "unknown";
  if (length < chainNames.length) {
    baseName = chainNames[length] ?? "unknown";
  } else {
    baseName = `tetracos`; // For very long chains
  }

  // Add unsaturation suffixes based on multiple bonds
  const doubleBonds =
    chain.multipleBonds?.filter(
      (bond: MultipleBond) => bond.type === "double",
    ) || [];
  const tripleBonds =
    chain.multipleBonds?.filter(
      (bond: MultipleBond) => bond.type === "triple",
    ) || [];

  if (tripleBonds.length > 0 && doubleBonds.length === 0) {
    baseName = baseName.replace(/[aeiou]+$/, ""); // Remove trailing vowels
    const locants = tripleBonds
      .map((bond: MultipleBond) => bond.locant)
      .filter(Boolean)
      .sort((a: number, b: number) => a - b);
    // IUPAC rule: Include locants for chains ≥3 carbons with triple bonds
    // prop-1-yne, but-1-yne vs but-2-yne
    const locantStr =
      locants.length > 0 && length >= 3 ? `-${locants.join(",")}-` : "";
    baseName = `${baseName}${locantStr}yne`;
  } else if (doubleBonds.length > 0 && tripleBonds.length === 0) {
    baseName = baseName.replace(/[aeiou]+$/, ""); // Remove trailing vowels
    const allLocants = doubleBonds.map((bond: MultipleBond) => bond.locant);
    const locants = allLocants
      .filter((loc: number | undefined) => loc !== undefined && loc !== null)
      .sort((a: number, b: number) => a - b);

    // IUPAC 2013 rule: Include locants for alkenes except ethene (unambiguous)
    // ethene (no locant needed), prop-1-ene, but-1-ene, but-2-ene, etc.
    const locantStr =
      locants.length > 0 && length >= 3 ? `-${locants.join(",")}-` : "";

    // If there are multiple double bonds (dienes, trienes, ...), use multiplicative prefix
    // e.g., buta-1,3-diene (doubleBonds.length === 2)
    if (doubleBonds.length > 1) {
      const multiplicativePrefix = getMultiplicativePrefix(
        doubleBonds.length,
        false,
        opsinService,
        "e", // Next char is 'e' in "ene"
      );
      // Insert connecting vowel 'a' between the stem and the multiplicative suffix per IUPAC
      baseName = `${baseName}a${locantStr}${multiplicativePrefix}ene`;
    } else {
      baseName = `${baseName}${locantStr}ene`;
    }
  } else if (doubleBonds.length > 0 && tripleBonds.length > 0) {
    baseName = baseName.replace(/[aeiou]+$/, ""); // Remove trailing vowels
    const doubleLocants = doubleBonds
      .map((bond: MultipleBond) => bond.locant)
      .filter(Boolean)
      .sort((a: number, b: number) => a - b);
    const tripleLocants = tripleBonds
      .map((bond: MultipleBond) => bond.locant)
      .filter(Boolean)
      .sort((a: number, b: number) => a - b);
    const allLocants = [...doubleLocants, ...tripleLocants].sort(
      (a: number, b: number) => a - b,
    );
    const locantStr = allLocants.length > 0 ? `-${allLocants.join(",")}-` : "";
    baseName = `${baseName}${locantStr}en-yne`;
  } else {
    baseName += "ane"; // Saturated
  }

  return baseName;
}

export function findLongestCarbonChainFromRoot(
  molecule: Molecule,
  rootIdx: number,
  allowedAtoms: Set<number>,
): number[] {
  // First, use DFS to get an initial estimate of the longest chain length
  let estimatedMaxLength = 0;

  function estimateDfs(
    currentIdx: number,
    currentChain: number[],
    visited: Set<number>,
  ): void {
    const currentAtom = molecule.atoms[currentIdx];
    if (!currentAtom || currentAtom.symbol !== "C") return;
    if (!allowedAtoms.has(currentIdx)) return;

    visited.add(currentIdx);
    currentChain.push(currentIdx);

    if (currentChain.length > estimatedMaxLength) {
      estimatedMaxLength = currentChain.length;
    }

    // Try extending to carbon neighbors
    for (const bond of molecule.bonds) {
      let nextIdx = -1;
      if (bond.atom1 === currentIdx) nextIdx = bond.atom2;
      else if (bond.atom2 === currentIdx) nextIdx = bond.atom1;

      if (
        nextIdx !== -1 &&
        !visited.has(nextIdx) &&
        allowedAtoms.has(nextIdx)
      ) {
        const nextAtom = molecule.atoms[nextIdx];
        if (nextAtom?.symbol === "C") {
          estimateDfs(nextIdx, currentChain, visited);
        }
      }
    }

    currentChain.pop();
    visited.delete(currentIdx);
  }

  estimateDfs(rootIdx, [], new Set());

  // Now use iterative deepening to find all chains at maximum length
  const allChains: number[][] = [];

  function findChainsOfLength(
    currentIdx: number,
    currentChain: number[],
    visited: Set<number>,
    targetLength: number,
  ): void {
    const currentAtom = molecule.atoms[currentIdx];
    if (!currentAtom || currentAtom.symbol !== "C") return;
    if (!allowedAtoms.has(currentIdx)) return;

    visited.add(currentIdx);
    currentChain.push(currentIdx);

    // If we've reached the target length, record this chain
    if (currentChain.length === targetLength) {
      allChains.push([...currentChain]);
    } else if (currentChain.length < targetLength) {
      // Continue searching
      for (const bond of molecule.bonds) {
        let nextIdx = -1;
        if (bond.atom1 === currentIdx) nextIdx = bond.atom2;
        else if (bond.atom2 === currentIdx) nextIdx = bond.atom1;

        if (
          nextIdx !== -1 &&
          !visited.has(nextIdx) &&
          allowedAtoms.has(nextIdx)
        ) {
          const nextAtom = molecule.atoms[nextIdx];
          if (nextAtom?.symbol === "C") {
            findChainsOfLength(nextIdx, currentChain, visited, targetLength);
          }
        }
      }
    }

    currentChain.pop();
    visited.delete(currentIdx);
  }

  // Try to find chains of increasing length starting from the DFS estimate
  let confirmedMaxLength = estimatedMaxLength;
  for (
    let targetLength = estimatedMaxLength;
    targetLength <= allowedAtoms.size;
    targetLength++
  ) {
    allChains.length = 0; // Clear previous results
    findChainsOfLength(rootIdx, [], new Set(), targetLength);

    if (allChains.length > 0) {
      confirmedMaxLength = targetLength;
    } else {
      // No chains of this length found, so previous length was maximum
      break;
    }
  }

  // Return the first chain at maximum length (or re-run to get it if needed)
  if (allChains.length > 0 && allChains[0]!.length === confirmedMaxLength) {
    return allChains[0]!;
  }

  // Re-run for confirmed max length to get a chain
  allChains.length = 0;
  findChainsOfLength(rootIdx, [], new Set(), confirmedMaxLength);
  return allChains.length > 0 ? allChains[0]! : [];
}

export function findSubstituentsOnChain(
  molecule: Molecule,
  chain: number[],
  allowedAtoms: Set<number>,
): Array<{ position: number; name: string; sortKey: string }> {
  const substituents: Array<{
    position: number;
    name: string;
    sortKey: string;
  }> = [];
  const chainSet = new Set(chain);

  for (let i = 0; i < chain.length; i++) {
    const chainAtomIdx = chain[i]!;
    const position = i + 1;

    // Find atoms bonded to this chain atom that aren't part of the chain
    for (const bond of molecule.bonds) {
      let substituentStartIdx = -1;
      if (bond.atom1 === chainAtomIdx && !chainSet.has(bond.atom2)) {
        substituentStartIdx = bond.atom2;
      } else if (bond.atom2 === chainAtomIdx && !chainSet.has(bond.atom1)) {
        substituentStartIdx = bond.atom1;
      }

      if (substituentStartIdx === -1) continue;
      if (!allowedAtoms.has(substituentStartIdx)) continue;

      const substituentAtom = molecule.atoms[substituentStartIdx];
      if (!substituentAtom || substituentAtom.symbol === "H") continue;

      // Name this substituent
      const subName = nameChainSubstituent(
        molecule,
        substituentStartIdx,
        chainAtomIdx,
        allowedAtoms,
      );

      if (subName) {
        substituents.push({
          position,
          name: subName,
          sortKey: subName.replace(/^\d+-/, ""), // Remove locants for alphabetical sorting
        });
      }
    }
  }

  return substituents;
}

export function nameChainSubstituent(
  molecule: Molecule,
  startIdx: number,
  chainIdx: number,
  allowedAtoms: Set<number>,
): string {
  const atom = molecule.atoms[startIdx];
  if (!atom) return "";

  // Handle oxygen (ether substituents: -O-R becomes "Roxy")
  if (atom.symbol === "O") {
    // Find what's attached to the oxygen (excluding the chain)
    let carbonIdx = -1;
    for (const bond of molecule.bonds) {
      let nextIdx = -1;
      if (bond.atom1 === startIdx && bond.atom2 !== chainIdx) {
        nextIdx = bond.atom2;
      } else if (bond.atom2 === startIdx && bond.atom1 !== chainIdx) {
        nextIdx = bond.atom1;
      }

      if (nextIdx !== -1 && allowedAtoms.has(nextIdx)) {
        const nextAtom = molecule.atoms[nextIdx];
        if (nextAtom?.symbol === "C") {
          carbonIdx = nextIdx;
          break;
        }
      }
    }

    if (carbonIdx === -1) {
      return "hydroxy"; // -OH
    }

    // Collect the alkyl group attached to oxygen
    const alkoxyAtoms = collectConnectedAtomsInSet(
      molecule,
      carbonIdx,
      startIdx,
      allowedAtoms,
    );
    const carbonCount = alkoxyAtoms.filter(
      (idx) => molecule.atoms[idx]?.symbol === "C",
    ).length;

    const alkoxyNames: Record<number, string> = {
      1: "methoxy",
      2: "ethoxy",
      3: "propoxy",
      4: "butoxy",
    };

    // Check if it's methoxymethyl specifically (CH2-O-CH3 pattern)
    if (carbonCount === 1) {
      // This is the -O-CH3 part, but it's attached to another carbon
      // Need to check if the chain carbon is a CH2
      const chainAtom = molecule.atoms[chainIdx];
      if (chainAtom?.symbol === "C") {
        // Count other carbons attached to chain carbon (excluding the chain itself)
        const otherCarbons = molecule.bonds.filter((b) => {
          const otherIdx =
            b.atom1 === chainIdx
              ? b.atom2
              : b.atom2 === chainIdx
                ? b.atom1
                : -1;
          if (otherIdx === -1 || otherIdx === startIdx) return false;
          const otherAtom = molecule.atoms[otherIdx];
          return otherAtom?.symbol === "C";
        });

        // If this oxygen is on a -CH2- group, name it as "methoxymethyl"
        if (otherCarbons.length >= 1) {
          return "methoxymethyl";
        }
      }

      return alkoxyNames[carbonCount] || "alkoxy";
    }

    return alkoxyNames[carbonCount] || "alkoxy";
  }

  // Handle carbon substituents (alkyl groups)
  if (atom.symbol === "C") {
    const alkylAtoms = collectConnectedAtomsInSet(
      molecule,
      startIdx,
      chainIdx,
      allowedAtoms,
    );
    const carbonCount = alkylAtoms.filter(
      (idx) => molecule.atoms[idx]?.symbol === "C",
    ).length;

    // Check for methoxymethyl pattern: -CH2-O-CH3
    // This occurs when we have a carbon substituent containing an oxygen
    const hasOxygen = alkylAtoms.some(
      (idx) => molecule.atoms[idx]?.symbol === "O",
    );

    if (hasOxygen && carbonCount === 2) {
      // Check if this is specifically -CH2-O-CH3
      // startIdx should be a CH2, and it should be connected to O which connects to CH3
      let oxygenIdx = -1;
      for (const bond of molecule.bonds) {
        let nextIdx = -1;
        if (bond.atom1 === startIdx && bond.atom2 !== chainIdx) {
          nextIdx = bond.atom2;
        } else if (bond.atom2 === startIdx && bond.atom1 !== chainIdx) {
          nextIdx = bond.atom1;
        }

        if (nextIdx !== -1 && allowedAtoms.has(nextIdx)) {
          const nextAtom = molecule.atoms[nextIdx];
          if (nextAtom?.symbol === "O") {
            oxygenIdx = nextIdx;
            break;
          }
        }
      }

      if (oxygenIdx !== -1) {
        // Found oxygen attached to the starting carbon
        // Check if the oxygen is connected to another carbon (the methyl group)
        let terminalCarbonIdx = -1;
        for (const bond of molecule.bonds) {
          let nextIdx = -1;
          if (bond.atom1 === oxygenIdx && bond.atom2 !== startIdx) {
            nextIdx = bond.atom2;
          } else if (bond.atom2 === oxygenIdx && bond.atom1 !== startIdx) {
            nextIdx = bond.atom1;
          }

          if (nextIdx !== -1 && allowedAtoms.has(nextIdx)) {
            const nextAtom = molecule.atoms[nextIdx];
            if (nextAtom?.symbol === "C") {
              terminalCarbonIdx = nextIdx;
              break;
            }
          }
        }

        if (terminalCarbonIdx !== -1) {
          // Confirmed: -CH2-O-CH3 pattern
          return "methoxymethyl";
        }
      }
    }

    // Check for branching to determine if it's iso-, sec-, tert-, etc.
    const alkylNames: Record<number, string> = {
      1: "methyl",
      2: "ethyl",
      3: "propyl",
      4: "butyl",
      5: "pentyl",
    };

    return alkylNames[carbonCount] || `C${carbonCount}yl`;
  }

  // Handle other heteroatoms
  const heteroNames: Record<string, string> = {
    F: "fluoro",
    Cl: "chloro",
    Br: "bromo",
    I: "iodo",
    N: "amino",
    S: "sulfanyl",
  };

  return heteroNames[atom.symbol] || atom.symbol.toLowerCase();
}
