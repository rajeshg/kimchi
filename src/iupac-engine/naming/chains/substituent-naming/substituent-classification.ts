import type { Molecule } from "types";
import type { NamingSubstituentInfo } from "../../iupac-types";
import type { OPSINFunctionalGroupDetector } from "../../../opsin-functional-group-detector";
import { getAlkylName } from "../../iupac-helpers";
import { nameRingSubstituent } from "./ring";
import { nameAlkoxySubstituent } from "./alkoxy";
import { nameAlkylSulfanylSubstituent } from "./sulfanyl";

export function classifySubstituent(
  molecule: Molecule,
  startAtomIdx: number,
  chainAtoms: Set<number>,
  fgAtomIds: Set<number> = new Set(),
  depth = 0,
  detector?: OPSINFunctionalGroupDetector,
): NamingSubstituentInfo | null {
  if (process.env.VERBOSE && startAtomIdx === 0) {
    console.log(
      `[classifySubstituent] CALLED with atom 0, chainAtoms=${Array.from(chainAtoms).join(",")}`,
    );
    console.log(
      `[classifySubstituent] Molecule has ${molecule.atoms.length} atoms, ALL IDs:`,
      molecule.atoms.map((a, i) => ({ idx: i, id: a.id, symbol: a.symbol })),
    );
    console.log(
      `[classifySubstituent] Call stack:`,
      new Error().stack?.split("\n").slice(2, 8).join("\n"),
    );
  }

  // First check: if the starting atom is part of a functional group, skip it
  // UNLESS it's part of a ring system, which should be named as a ring substituent
  const isRingAtom =
    molecule.rings?.some((ring) => ring.includes(startAtomIdx)) || false;

  if (fgAtomIds.has(startAtomIdx) && !isRingAtom) {
    if (process.env.VERBOSE)
      console.log(
        `[classifySubstituent] Skipping atom ${startAtomIdx} - part of functional group (not a ring)`,
      );
    return null;
  }

  if (fgAtomIds.has(startAtomIdx) && isRingAtom && process.env.VERBOSE) {
    console.log(
      `[classifySubstituent] Atom ${startAtomIdx} is in FG but also in a ring - will attempt ring naming`,
    );
  }

  const visited = new Set<number>(chainAtoms);
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

  if (process.env.VERBOSE && startAtomIdx === 0) {
    console.log(
      `[classifySubstituent] Atom 0 substituent: atoms=[${Array.from(substituentAtoms).join(",")}], carbonCount=${carbonCount}, atoms.length=${atoms.length}`,
    );
    console.log(
      `[classifySubstituent] Atom 0 details: symbol=${molecule.atoms[0]?.symbol}, idx=0, atomObj=`,
      molecule.atoms[0],
    );
    console.log(
      `[classifySubstituent] Filtered atoms:`,
      atoms.map((a) => ({ symbol: a.symbol, idx: molecule.atoms.indexOf(a) })),
    );
  }

  // Check if this substituent contains ring atoms - if so, it might be a ring system substituent
  const hasRingAtoms = Array.from(substituentAtoms).some((atomId) => {
    if (!molecule.rings) return false;
    return molecule.rings.some((ring) => ring.includes(atomId));
  });

  if (hasRingAtoms && process.env.VERBOSE) {
    console.log(
      `[classifySubstituent] Substituent starting at ${startAtomIdx} contains ring atoms`,
    );
  }

  // If this substituent contains ring atoms, it's likely a complex ring system
  // For now, return null to skip it (will be handled by ring system naming later)
  if (hasRingAtoms) {
    if (process.env.VERBOSE)
      console.log(
        `[classifySubstituent] Detected ring system substituent starting at ${startAtomIdx}`,
      );
    // Name the ring system as a substituent
    return nameRingSubstituent(molecule, startAtomIdx, chainAtoms, depth);
  }

  // Check if this is an acyl group (ketone substituent): C(=O)R
  // This should be checked BEFORE other carbon-based substituents
  const startAtom = molecule.atoms[startAtomIdx];
  if (startAtom && startAtom.symbol === "C") {
    // Check if this carbon has a C=O double bond
    const carbonylBond = molecule.bonds.find(
      (bond) =>
        (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) &&
        bond.type === "double" &&
        ((bond.atom1 === startAtomIdx &&
          molecule.atoms[bond.atom2]?.symbol === "O") ||
          (bond.atom2 === startAtomIdx &&
            molecule.atoms[bond.atom1]?.symbol === "O")),
    );

    if (carbonylBond) {
      // This is a ketone group attached to the ring: C(=O)-R
      // Find the oxygen atom
      const carbonylOxygenIdx =
        carbonylBond.atom1 === startAtomIdx
          ? carbonylBond.atom2
          : carbonylBond.atom1;

      // Count carbons in the R group (excluding the carbonyl carbon and oxygen)
      const alkylCarbons = atoms.filter(
        (atom) =>
          atom.symbol === "C" &&
          atom.id !== startAtomIdx &&
          atom.id !== carbonylOxygenIdx,
      );

      const alkylCarbonCount = alkylCarbons.length;

      // Name the acyl group based on total carbon count (carbonyl + alkyl carbons)
      const totalCarbons = alkylCarbonCount + 1;
      let acylName: string;

      if (totalCarbons === 1) {
        acylName = "formyl"; // H-C(=O)-
      } else if (totalCarbons === 2) {
        acylName = "acetyl"; // CH3-C(=O)-
      } else if (totalCarbons === 3) {
        acylName = "propanoyl"; // CH3CH2-C(=O)-
      } else if (totalCarbons === 4) {
        acylName = "butanoyl"; // CH3CH2CH2-C(=O)-
      } else {
        // Generic acyl name
        const alkylPrefix = getAlkylName(totalCarbons);
        acylName = alkylPrefix.replace("yl", "oyl");
      }

      if (process.env.VERBOSE) {
        console.log(
          `[classifySubstituent] Detected acyl group at ${startAtomIdx}: ${acylName} (${totalCarbons} total carbons)`,
        );
      }

      return {
        type: "acyl",
        size: substituentAtoms.size,
        name: acylName,
      };
    }
  }

  // Check if this is an ether substituent FIRST (before checking for phenyl)
  // This ensures O-Aryl patterns are detected as "aryloxy" not "phenyl"
  if (startAtom && startAtom.symbol === "O" && startAtom.hydrogens === 0) {
    // Check if oxygen has a double bond (ketone, aldehyde, etc.)
    const hasDoubleBond = molecule.bonds.some(
      (bond) =>
        (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) &&
        bond.type === "double",
    );

    // If oxygen has a double bond, it's part of a functional group (C=O), not an ether
    if (hasDoubleBond) {
      return null; // Skip this - it's part of a carbonyl group
    }

    // Check for aminooxy pattern: -O-N-R (e.g., tert-butylaminooxy)
    // Find nitrogen bonded to this oxygen
    const nitrogenBond = molecule.bonds.find(
      (bond) =>
        (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) &&
        bond.type === "single" &&
        ((bond.atom1 === startAtomIdx &&
          molecule.atoms[bond.atom2]?.symbol === "N") ||
          (bond.atom2 === startAtomIdx &&
            molecule.atoms[bond.atom1]?.symbol === "N")),
    );

    if (nitrogenBond) {
      const nitrogenIdx =
        nitrogenBond.atom1 === startAtomIdx
          ? nitrogenBond.atom2
          : nitrogenBond.atom1;

      // Find carbon chain attached to nitrogen (excluding chain atoms)
      const carbonBonds = molecule.bonds.filter(
        (bond) =>
          (bond.atom1 === nitrogenIdx || bond.atom2 === nitrogenIdx) &&
          bond.atom1 !== startAtomIdx &&
          bond.atom2 !== startAtomIdx &&
          ((bond.atom1 === nitrogenIdx &&
            molecule.atoms[bond.atom2]?.symbol === "C" &&
            substituentAtoms.has(bond.atom2)) ||
            (bond.atom2 === nitrogenIdx &&
              molecule.atoms[bond.atom1]?.symbol === "C" &&
              substituentAtoms.has(bond.atom1))),
      );

      if (carbonBonds.length > 0) {
        // Get the alkyl group name attached to nitrogen
        const carbonIdx =
          carbonBonds[0]!.atom1 === nitrogenIdx
            ? carbonBonds[0]!.atom2
            : carbonBonds[0]!.atom1;

        // Collect all atoms in the N-C chain (excluding oxygen)
        const ncChainAtoms = new Set<number>();
        ncChainAtoms.add(nitrogenIdx);
        const ncVisited = new Set<number>([...chainAtoms, startAtomIdx]);
        const ncStack = [carbonIdx];

        while (ncStack.length > 0) {
          const current = ncStack.pop()!;
          if (ncVisited.has(current)) continue;
          ncVisited.add(current);
          ncChainAtoms.add(current);

          for (const bond of molecule.bonds) {
            let neighbor = -1;
            if (bond.atom1 === current && !ncVisited.has(bond.atom2)) {
              neighbor = bond.atom2;
            } else if (bond.atom2 === current && !ncVisited.has(bond.atom1)) {
              neighbor = bond.atom1;
            }
            if (neighbor >= 0) {
              ncStack.push(neighbor);
            }
          }
        }

        // Name the alkyl group attached to nitrogen
        // Count carbons and check for branching patterns
        const ncCarbons = Array.from(ncChainAtoms).filter(
          (idx) => molecule.atoms[idx]?.symbol === "C",
        );
        let alkylGroupName = "alkyl";

        if (ncCarbons.length === 1) {
          alkylGroupName = "methyl";
        } else if (ncCarbons.length === 2) {
          alkylGroupName = "ethyl";
        } else if (ncCarbons.length === 3) {
          alkylGroupName = "propyl";
        } else if (ncCarbons.length === 4) {
          // Check for tert-butyl pattern: central carbon bonded to N + 3 methyl carbons
          let foundTertButyl = false;
          for (const cIdx of ncCarbons) {
            const cBonds = molecule.bonds.filter(
              (b) =>
                (b.atom1 === cIdx || b.atom2 === cIdx) &&
                ncChainAtoms.has(b.atom1) &&
                ncChainAtoms.has(b.atom2),
            );
            const cNeighbors = cBonds
              .map((b) => (b.atom1 === cIdx ? b.atom2 : b.atom1))
              .filter((n) => molecule.atoms[n]?.symbol === "C");

            // If this carbon has 3 carbon neighbors within the group, it's the central carbon
            if (cNeighbors.length === 3) {
              foundTertButyl = true;
              break;
            }
          }

          alkylGroupName = foundTertButyl ? "tert-butyl" : "butyl";
        } else {
          alkylGroupName = getAlkylName(ncCarbons.length);
        }

        // The full name is: (alkyl)amino-oxy  (e.g., tert-butylaminooxy)
        const fullName = `(${alkylGroupName}amino)oxy`;

        if (process.env.VERBOSE) {
          console.log(
            `[classifySubstituent] Detected aminooxy: O=${startAtomIdx}, N=${nitrogenIdx}, name=${fullName}`,
          );
        }

        return {
          type: "functional",
          size: substituentAtoms.size,
          name: fullName,
        };
      }
    }

    // This is an ether substituent: -O-R
    // Name it as "alkoxy" where alkyl is the carbon chain attached to the oxygen
    if (carbonCount === 0) {
      // Just oxygen with no carbons - this shouldn't happen in normal ethers
      return { type: "functional", size: 1, name: "oxy" };
    }

    // Get the alkyl chain name
    const alkylName = nameAlkoxySubstituent(
      molecule,
      substituentAtoms,
      startAtomIdx,
    );
    return { type: "functional", size: carbonCount + 1, name: alkylName };
  }

  // Check if this is a phenyl substituent (benzene ring attached to chain)
  // Phenyl = aromatic 6-membered carbon ring
  // This check comes AFTER oxygen check to avoid detecting O-phenyl as phenyl
  if (carbonCount === 6 || carbonCount === 7) {
    // Count aromatic carbons in the substituent
    const aromaticCarbons = atoms.filter(
      (atom) => atom.symbol === "C" && atom.aromatic,
    );

    if (process.env.VERBOSE) {
      console.log(`[phenyl-detection] carbonCount=${carbonCount}, aromaticCarbons=${aromaticCarbons.length}`);
      console.log(`[phenyl-detection] substituent atom IDs:`, Array.from(substituentAtoms));
      console.log(`[phenyl-detection] aromatic carbon IDs:`, aromaticCarbons.map(a => a.id));
    }

    // If we have exactly 6 aromatic carbons, this is a phenyl group
    if (aromaticCarbons.length === 6) {
      // Check if these 6 aromatic carbons form a ring
      const aromaticCarbonIds = new Set(aromaticCarbons.map((a) => a.id));

      // Verify ring structure by checking molecule.rings
      if (molecule.rings) {
        if (process.env.VERBOSE) {
          console.log(`[phenyl-detection] checking ${molecule.rings.length} rings`);
          molecule.rings.forEach((ring, idx) => {
            console.log(`[phenyl-detection] ring ${idx}: length=${ring.length}, atoms=[${ring.join(',')}]`);
          });
        }
        
        for (const ring of molecule.rings) {
          if (ring.length === 6) {
            // Check if all ring atoms are in our aromatic carbon set
            const ringIsAromatic = ring.every((atomId) =>
              aromaticCarbonIds.has(atomId),
            );
            if (process.env.VERBOSE) {
              console.log(`[phenyl-detection] 6-membered ring [${ring.join(',')}]: ringIsAromatic=${ringIsAromatic}`);
            }
            if (ringIsAromatic) {
              // This is a phenyl substituent!
              if (process.env.VERBOSE) {
                console.log(`[phenyl-detection] ✅ DETECTED PHENYL!`);
              }
              return { type: "aryl", size: 6, name: "phenyl" };
            }
          }
        }
      }
    }
  }

  // detect simple branched alkyls: isopropyl, tert-butyl, isobutyl
  const carbonNeighbors = new Map<number, number>();
  for (const idx of substituentAtoms) {
    const atom = molecule.atoms[idx];
    if (!atom) continue;
    if (atom.symbol !== "C") continue;
    let neigh = 0;
    for (const b of molecule.bonds) {
      if (b.atom1 === idx && substituentAtoms.has(b.atom2)) neigh++;
      if (b.atom2 === idx && substituentAtoms.has(b.atom1)) neigh++;
    }
    carbonNeighbors.set(idx, neigh);
  }
  const neighborCounts = Array.from(carbonNeighbors.values());
  const maxCNeigh = neighborCounts.length ? Math.max(...neighborCounts) : 0;
  if (carbonCount === 1 && atoms.length === 1) {
    // Check if this is an exocyclic double bond (=CH2 group)
    // Look for a double bond connecting this carbon to a parent structure atom (chain or ring)
    const hasDoubleBondToParent = molecule.bonds.some(
      (bond) =>
        (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) &&
        bond.type === "double" &&
        ((bond.atom1 === startAtomIdx && chainAtoms.has(bond.atom2)) ||
          (bond.atom2 === startAtomIdx && chainAtoms.has(bond.atom1))),
    );

    if (process.env.VERBOSE) {
      console.log(
        `[classifySubstituent] Checking single carbon at ${startAtomIdx}: hasDoubleBondToParent=${hasDoubleBondToParent}`,
      );
    }

    if (hasDoubleBondToParent) {
      // This is an exocyclic double bond: =CH2 → methylidene
      if (process.env.VERBOSE) {
        console.log(
          `[classifySubstituent] Detected exocyclic double bond at ${startAtomIdx} → methylidene`,
        );
      }
      return { type: "alkyl", size: 1, name: "methylidene" };
    }

    return { type: "alkyl", size: 1, name: "methyl" };
  } else if (carbonCount === 2 && atoms.length === 2) {
    return { type: "alkyl", size: 2, name: "ethyl" };
  } else if (carbonCount === 3 && atoms.length === 3) {
    // if central carbon has two carbon neighbors it's propan-2-yl (not isopropyl)
    if (maxCNeigh >= 2) return { type: "alkyl", size: 3, name: "propan-2-yl" };
    return { type: "alkyl", size: 3, name: "propyl" };
  } else if (
    atoms.some((atom) => atom.symbol === "O" && atom.hydrogens === 1)
  ) {
    return { type: "functional", size: 1, name: "hydroxy" };
  } else if (atoms.some((atom) => atom.symbol === "F")) {
    return { type: "halo", size: 1, name: "fluoro" };
  } else if (atoms.some((atom) => atom.symbol === "Cl")) {
    return { type: "halo", size: 1, name: "chloro" };
  } else if (atoms.some((atom) => atom.symbol === "Br")) {
    return { type: "halo", size: 1, name: "bromo" };
  } else if (atoms.some((atom) => atom.symbol === "I")) {
    return { type: "halo", size: 1, name: "iodo" };
  } else if (atoms.some((atom) => atom.symbol === "S")) {
    // Find the sulfur atom index
    const sulfurAtomIdx = Array.from(substituentAtoms).find(
      (idx) => molecule.atoms[idx]?.symbol === "S",
    );

    if (sulfurAtomIdx === undefined) {
      return null;
    }

    // Use detector to check for sulfinyl S(=O) or sulfonyl S(=O)(=O) patterns
    if (detector) {
      // Run detector on full molecule, then filter to functional groups that overlap with this substituent
      const fgs = detector.detectFunctionalGroups(molecule);

      // Check for sulfonyl S(=O)(=O) first (higher priority)
      const sulfonylFG = fgs.find(
        (fg) =>
          fg.name === "sulfonyl" &&
          fg.atoms &&
          fg.atoms.some((atomIdx) => atomIdx === sulfurAtomIdx),
      );

      if (sulfonylFG) {
        // This is a sulfonyl group: R-S(=O)(=O)-R'
        if (carbonCount > 0) {
          // Alkylsulfonyl: -S(=O)(=O)-alkyl → alkylsulfonyl
          const name = nameAlkylSulfanylSubstituent(
            molecule,
            substituentAtoms,
            sulfurAtomIdx,
          ).replace("sulfanyl", "sulfonyl");
          return { type: "functional", size: substituentAtoms.size, name };
        }
        return {
          type: "functional",
          size: substituentAtoms.size,
          name: "sulfonyl",
        };
      }

      // Check for sulfinyl S(=O)
      const sulfinylFG = fgs.find(
        (fg) =>
          fg.name === "sulfinyl" &&
          fg.atoms &&
          fg.atoms.some((atomIdx) => atomIdx === sulfurAtomIdx),
      );

      if (sulfinylFG) {
        // This is a sulfinyl group: R-S(=O)-R'
        if (carbonCount > 0) {
          // Alkylsulfinyl: -S(=O)-alkyl → alkylsulfinyl
          const name = nameAlkylSulfanylSubstituent(
            molecule,
            substituentAtoms,
            sulfurAtomIdx,
          ).replace("sulfanyl", "sulfinyl");
          return { type: "functional", size: substituentAtoms.size, name };
        }
        return {
          type: "functional",
          size: substituentAtoms.size,
          name: "sulfinyl",
        };
      }
    }

    // Check for thiocyanate: -S-C≡N pattern
    const carbonBondedToS = molecule.bonds.find(
      (bond) =>
        (bond.atom1 === sulfurAtomIdx &&
          substituentAtoms.has(bond.atom2) &&
          molecule.atoms[bond.atom2]?.symbol === "C") ||
        (bond.atom2 === sulfurAtomIdx &&
          substituentAtoms.has(bond.atom1) &&
          molecule.atoms[bond.atom1]?.symbol === "C"),
    );

    if (carbonBondedToS) {
      const carbonIdx =
        carbonBondedToS.atom1 === sulfurAtomIdx
          ? carbonBondedToS.atom2
          : carbonBondedToS.atom1;

      // Check if this carbon has a triple bond to nitrogen
      const tripleBondToN = molecule.bonds.find(
        (bond) =>
          (bond.atom1 === carbonIdx || bond.atom2 === carbonIdx) &&
          bond.type === "triple" &&
          ((bond.atom1 === carbonIdx &&
            molecule.atoms[bond.atom2]?.symbol === "N") ||
            (bond.atom2 === carbonIdx &&
              molecule.atoms[bond.atom1]?.symbol === "N")),
      );

      if (tripleBondToN) {
        // This is a thiocyanate group: -S-C≡N → thiocyano
        return { type: "functional", size: 3, name: "thiocyano" };
      }
    }

    // Regular sulfur-containing substituents
    if (atoms.length === 1 && carbonCount === 0) {
      // Just sulfur: -SH → sulfanyl (or mercapto in older nomenclature)
      return { type: "functional", size: 1, name: "sulfanyl" };
    } else if (carbonCount > 0) {
      // Alkylsulfanyl: -S-alkyl → alkylsulfanyl (e.g., methylsulfanyl, ethylsulfanyl, prop-1-ynylsulfanyl)
      const name = nameAlkylSulfanylSubstituent(
        molecule,
        substituentAtoms,
        sulfurAtomIdx,
      );
      return { type: "functional", size: carbonCount + 1, name };
    }
  }
  if (carbonCount > 0) {
    // detect simple branched alkyls: propan-2-yl, 2-methylpropan-2-yl, 2-methylpropyl
    if (carbonCount === 4) {
      // 2-methylpropan-2-yl (formerly tert-butyl): one carbon connected to three carbons inside substituent
      if (maxCNeigh >= 3)
        return { type: "alkyl", size: 4, name: "2-methylpropan-2-yl" };
      // 2-methylpropyl (formerly isobutyl): contains a branch but not quaternary center
      if (maxCNeigh === 2)
        return { type: "alkyl", size: 4, name: "2-methylpropyl" };
    }
    if (carbonCount === 5 && atoms.length === 5) {
      // Check for branched 5-carbon groups: 2-methylbutan-2-yl (tert-pentyl), 3-methylbutyl (isopentyl)
      if (process.env.VERBOSE) {
        console.log(
          `[classifySubstituent] Checking 5-carbon branching: carbonCount=${carbonCount}, atoms.length=${atoms.length}, startAtomIdx=${startAtomIdx}`,
        );
      }
      const startAtom = molecule.atoms[startAtomIdx];
      if (startAtom?.symbol === "C") {
        // Count carbon neighbors at attachment point (within substituent)
        let carbonNeighborsAtStart = 0;
        const neighborsAtStart: number[] = [];
        for (const bond of molecule.bonds) {
          if (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) {
            const otherIdx =
              bond.atom1 === startAtomIdx ? bond.atom2 : bond.atom1;
            const otherAtom = molecule.atoms[otherIdx];
            if (otherAtom?.symbol === "C" && substituentAtoms.has(otherIdx)) {
              carbonNeighborsAtStart++;
              neighborsAtStart.push(otherIdx);
            }
          }
        }
        if (process.env.VERBOSE) {
          console.log(
            `[classifySubstituent] carbonNeighborsAtStart=${carbonNeighborsAtStart}`,
          );
        }

        // Case 1: Attachment point IS the quaternary center (has 3 carbon neighbors)
        // Structure: N-C(CH3)2-CH2-CH3 (tert-pentyl)
        if (carbonNeighborsAtStart === 3) {
          if (process.env.VERBOSE) {
            console.log(
              `[classifySubstituent] Detected 2-methylbutan-2-yl (attachment is quaternary center)`,
            );
          }
          return { type: "alkyl", size: 5, name: "2-methylbutan-2-yl" };
        }

        // Case 2: Attachment point has 1 carbon neighbor - check for tert-pentyl or isopentyl
        if (carbonNeighborsAtStart === 1) {
          const neighborIdx = neighborsAtStart[0];
          if (neighborIdx !== undefined) {
            // Count carbon neighbors of the second carbon
            let carbonNeighborsAtSecond = 0;
            for (const bond of molecule.bonds) {
              if (bond.atom1 === neighborIdx || bond.atom2 === neighborIdx) {
                const otherIdx =
                  bond.atom1 === neighborIdx ? bond.atom2 : bond.atom1;
                const otherAtom = molecule.atoms[otherIdx];
                if (
                  otherAtom?.symbol === "C" &&
                  substituentAtoms.has(otherIdx)
                ) {
                  carbonNeighborsAtSecond++;
                }
              }
            }
            if (process.env.VERBOSE) {
              console.log(
                `[classifySubstituent] carbonNeighborsAtSecond=${carbonNeighborsAtSecond}`,
              );
            }

            // 2-methylbutan-2-yl (tert-pentyl): -CC(C)(C)C where second carbon has 4 neighbors
            // (1 back to attachment + 3 other carbons)
            if (carbonNeighborsAtSecond === 4) {
              if (process.env.VERBOSE) {
                console.log(
                  `[classifySubstituent] Detected 2-methylbutan-2-yl`,
                );
              }
              return { type: "alkyl", size: 5, name: "2-methylbutan-2-yl" };
            }

            // 3-methylbutyl (isopentyl): -CCC(C)C where third carbon is branched
            // Second carbon should have 2 neighbors in substituent
            if (carbonNeighborsAtSecond === 2) {
              if (process.env.VERBOSE) {
                console.log(`[classifySubstituent] Detected 3-methylbutyl`);
              }
              return { type: "alkyl", size: 5, name: "3-methylbutyl" };
            }
          }
        }
      }
    }
    if (carbonCount === 6 && atoms.length === 6) {
      // Check for branched 6-carbon groups with quaternary attachment
      if (process.env.VERBOSE) {
        console.log(
          `[classifySubstituent] Checking 6-carbon branching: carbonCount=${carbonCount}, atoms.length=${atoms.length}, startAtomIdx=${startAtomIdx}`,
        );
      }
      const startAtom = molecule.atoms[startAtomIdx];
      if (startAtom?.symbol === "C") {
        // Count carbon neighbors at attachment point (within substituent)
        let carbonNeighborsAtStart = 0;
        const neighborsAtStart: number[] = [];
        for (const bond of molecule.bonds) {
          if (bond.atom1 === startAtomIdx || bond.atom2 === startAtomIdx) {
            const otherIdx =
              bond.atom1 === startAtomIdx ? bond.atom2 : bond.atom1;
            const otherAtom = molecule.atoms[otherIdx];
            if (otherAtom?.symbol === "C" && substituentAtoms.has(otherIdx)) {
              carbonNeighborsAtStart++;
              neighborsAtStart.push(otherIdx);
            }
          }
        }
        if (process.env.VERBOSE) {
          console.log(
            `[classifySubstituent] carbonNeighborsAtStart=${carbonNeighborsAtStart}`,
          );
        }

        // Quaternary center attachment (3 carbon neighbors at attachment)
        if (carbonNeighborsAtStart === 3) {
          // Determine the structure: could be 2-methylpentan-2-yl, 2-ethylbutan-2-yl, or 2,3-dimethylbutan-2-yl
          // Count chain lengths from each neighbor
          const chainLengths: number[] = [];
          for (const neighborIdx of neighborsAtStart) {
            let chainLen = 1; // Start with 1 for the neighbor itself
            let currentIdx = neighborIdx;
            let prevIdx = startAtomIdx;

            // Walk chain until we hit a dead end
            while (true) {
              let nextIdx = -1;
              for (const bond of molecule.bonds) {
                if (bond.atom1 === currentIdx || bond.atom2 === currentIdx) {
                  const otherIdx =
                    bond.atom1 === currentIdx ? bond.atom2 : bond.atom1;
                  const otherAtom = molecule.atoms[otherIdx];
                  if (
                    otherAtom?.symbol === "C" &&
                    substituentAtoms.has(otherIdx) &&
                    otherIdx !== prevIdx
                  ) {
                    nextIdx = otherIdx;
                    break;
                  }
                }
              }
              if (nextIdx === -1) break; // Dead end
              chainLen++;
              prevIdx = currentIdx;
              currentIdx = nextIdx;
            }
            chainLengths.push(chainLen);
          }

          // Sort chain lengths to normalize structure comparison
          chainLengths.sort((a, b) => b - a); // Descending order

          if (process.env.VERBOSE) {
            console.log(
              `[classifySubstituent] 6-carbon quaternary: chainLengths=${chainLengths.join(",")}`,
            );
          }

          // 2-methylpentan-2-yl: C(C)(C)CCC → chains [3,1,1]
          if (
            chainLengths[0] === 3 &&
            chainLengths[1] === 1 &&
            chainLengths[2] === 1
          ) {
            return { type: "alkyl", size: 6, name: "2-methylpentan-2-yl" };
          }

          // 2-ethylbutan-2-yl: C(C)(CC)CC → chains [2,2,1]
          if (
            chainLengths[0] === 2 &&
            chainLengths[1] === 2 &&
            chainLengths[2] === 1
          ) {
            return { type: "alkyl", size: 6, name: "2-ethylbutan-2-yl" };
          }

          // 2,3-dimethylbutan-2-yl: C(C)(C)C(C)C → chains [2,1,1] but second carbon is branched
          // This is harder to detect - for now we'll let it fall through
        }
      }
    }
    return {
      type: "alkyl",
      size: carbonCount,
      name: getAlkylName(carbonCount),
    };
  }
  return null;
}
