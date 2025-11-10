import type { Molecule } from "types";
import type { NamingSubstituent } from "../../iupac-types";
import type { OPSINFunctionalGroupDetector } from "../../../opsin-functional-group-detector";
import { getSharedDetector } from "../../../opsin-functional-group-detector";
import { getAlkylName, getAlkanoylName } from "../../iupac-helpers";
import { classifySubstituent } from "./substituent-classification";
import { nameAlkoxySubstituent } from "./alkoxy";

/**
 * Finds all substituents attached to the main chain.
 *
 * This function handles multiple types of substituents:
 * 1. Regular substituents (alkyl, halogen, etc.) via classifySubstituent
 * 2. Ether functional groups (O-R patterns)
 * 3. Sulfonyl/sulfinyl bridges (complex sulfur patterns)
 * 4. Ketone groups as acyl substituents (C=O not on main chain)
 */
export function findSubstituents(
  molecule: Molecule,
  mainChain: number[],
  detector?: OPSINFunctionalGroupDetector,
): NamingSubstituent[] {
  const substituents: NamingSubstituent[] = [];
  const chainSet = new Set(mainChain);

  // Detect functional groups to exclude their atoms from being classified as substituents
  const functionalGroups = (
    detector || getSharedDetector()
  ).detectFunctionalGroups(molecule);
  const fgAtomIds = new Set<number>();
  for (const fg of functionalGroups) {
    if (fg.atoms && Array.isArray(fg.atoms)) {
      for (const atomId of fg.atoms) {
        fgAtomIds.add(atomId);
      }
    }
  }

  // For amine chains, the nitrogen is not numbered (it's the functional group)
  // Numbering starts from the carbon next to nitrogen
  // E.g., for ethanamine: C-C-N, the first C is position 1, second C is position 2
  const firstAtom = mainChain[0];
  const isAmineChain = firstAtom !== undefined && 
    molecule.atoms[firstAtom]?.symbol === 'N';

  if (process.env.VERBOSE)
    console.log(
      `[findSubstituents] mainChain: ${mainChain.join(",")}, fgAtoms: ${Array.from(fgAtomIds).join(",")}, isAmineChain: ${isAmineChain}`,
    );
  for (let i = 0; i < mainChain.length; i++) {
    const chainAtomIdx = mainChain[i]!;
    for (const bond of molecule.bonds) {
      let substituentAtomIdx = -1;
      if (bond.atom1 === chainAtomIdx && !chainSet.has(bond.atom2)) {
        substituentAtomIdx = bond.atom2;
      } else if (bond.atom2 === chainAtomIdx && !chainSet.has(bond.atom1)) {
        substituentAtomIdx = bond.atom1;
      }
      if (substituentAtomIdx >= 0) {
        const substituent = classifySubstituent(
          molecule,
          substituentAtomIdx,
          chainSet,
          fgAtomIds,
        );
        if (substituent) {
          const position = isAmineChain ? i.toString() : (i + 1).toString();
          if (process.env.VERBOSE)
            console.log(
              `[findSubstituents] i=${i}, chainAtomIdx=${chainAtomIdx}, substituentAtomIdx=${substituentAtomIdx}, position=${position}, type=${substituent.name}`,
            );
          substituents.push({
            position: position,
            type: substituent.type,
            size: substituent.size,
            name: substituent.name,
          });
        }
      }
    }
  }
  // Special handling for ether functional groups
  // After regular substituents are found, check for ether oxygens that connect to carbon chains
  const etherGroups = functionalGroups.filter(
    (fg) =>
      (fg.name === "ether" || fg.type === "alkoxy") &&
      fg.atoms &&
      fg.atoms.length === 1,
  );
  for (const etherGroup of etherGroups) {
    const oxygenIdx = etherGroup.atoms![0]!;

    // Check if this oxygen is attached to the main chain
    let attachedToChainAt = -1;
    let chainSideCarbon = -1;
    let substituentSideCarbon = -1;

    for (const bond of molecule.bonds) {
      if (bond.atom1 === oxygenIdx || bond.atom2 === oxygenIdx) {
        const otherAtom = bond.atom1 === oxygenIdx ? bond.atom2 : bond.atom1;
        const otherAtomObj = molecule.atoms[otherAtom];

        if (otherAtomObj && otherAtomObj.symbol === "C") {
          if (chainSet.has(otherAtom)) {
            chainSideCarbon = otherAtom;
            attachedToChainAt = mainChain.indexOf(otherAtom);
          } else {
            substituentSideCarbon = otherAtom;
          }
        }
      }
    }

    // If oxygen is attached to main chain and has a carbon substituent
    if (attachedToChainAt >= 0 && substituentSideCarbon >= 0) {
      if (process.env.VERBOSE) {
        console.log(
          `[findSubstituents] Found ether at O${oxygenIdx}, chain side: C${chainSideCarbon}, substituent side: C${substituentSideCarbon}`,
        );
      }

      // Traverse the substituent side to collect all atoms
      const substituentAtoms = new Set<number>();
      substituentAtoms.add(oxygenIdx);
      const visited = new Set<number>(chainSet);
      visited.add(oxygenIdx);
      const stack = [substituentSideCarbon];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        substituentAtoms.add(current);

        for (const bond of molecule.bonds) {
          let neighbor = -1;
          if (bond.atom1 === current && !visited.has(bond.atom2)) {
            neighbor = bond.atom2;
          } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
            neighbor = bond.atom1;
          }
          if (neighbor >= 0) {
            stack.push(neighbor);
          }
        }
      }

      // Name the alkoxy substituent
      const alkoxyName = nameAlkoxySubstituent(
        molecule,
        substituentAtoms,
        oxygenIdx,
      );
      const position = isAmineChain ? 
        attachedToChainAt.toString() : 
        (attachedToChainAt + 1).toString();

      if (process.env.VERBOSE) {
        console.log(
          `[findSubstituents] Ether substituent: position=${position}, name=${alkoxyName}`,
        );
      }

      substituents.push({
        position: position,
        type: "functional",
        size: substituentAtoms.size,
        name: alkoxyName,
        atoms: Array.from(substituentAtoms), // Include atoms for deduplication
      });
    }
  }

  // Special handling for sulfanyl groups attached to phosphorus
  // Pattern: chain-S-P(=O)(OR)(R') where S should be named as "[phosphoryl]sulfanyl"
  const phosphorylGroups = functionalGroups.filter(
    (fg) =>
      (fg.name === "phosphoryl" || fg.name === "phosphanyl") &&
      fg.atoms &&
      fg.atoms.length >= 2,
  );

  for (const phosphorylGroup of phosphorylGroups) {
    const phosphorusIdx = phosphorylGroup.atoms![0]!;
    const phosphorusAtom = molecule.atoms[phosphorusIdx];
    if (!phosphorusAtom || phosphorusAtom.symbol !== "P") continue;

    // Check if phosphorus is bonded to a sulfur that's attached to the main chain
    for (const bond of molecule.bonds) {
      if (bond.atom1 === phosphorusIdx || bond.atom2 === phosphorusIdx) {
        const neighborIdx =
          bond.atom1 === phosphorusIdx ? bond.atom2 : bond.atom1;
        const neighborAtom = molecule.atoms[neighborIdx];

        if (neighborAtom && neighborAtom.symbol === "S") {
          // Check if this sulfur is attached to the main chain
          let attachedToChainAt = -1;
          let chainAtomIdx = -1;

          for (const chainBond of molecule.bonds) {
            if (
              chainBond.atom1 === neighborIdx ||
              chainBond.atom2 === neighborIdx
            ) {
              const chainNeighbor =
                chainBond.atom1 === neighborIdx
                  ? chainBond.atom2
                  : chainBond.atom1;

              if (chainSet.has(chainNeighbor)) {
                chainAtomIdx = chainNeighbor;
                attachedToChainAt = mainChain.indexOf(chainNeighbor);
                break;
              }
            }
          }

          if (attachedToChainAt >= 0) {
            // Found a sulfur-phosphorus linkage to the chain!
            // Collect all atoms in the phosphoryl substituent (excluding the sulfur and chain atoms)
            const phosphorylSubstituentAtoms = new Set<number>();
            phosphorylSubstituentAtoms.add(phosphorusIdx);

            // Add the P=O oxygen
            for (const atomId of phosphorylGroup.atoms!) {
              if (
                molecule.atoms[atomId]?.symbol === "O" &&
                !chainSet.has(atomId)
              ) {
                phosphorylSubstituentAtoms.add(atomId);
              }
            }

            // Traverse from phosphorus to collect all attached atoms (excluding sulfur)
            const visited = new Set<number>([...chainSet, neighborIdx]); // Exclude chain and sulfur
            const stack = [phosphorusIdx];
            visited.add(phosphorusIdx);

            while (stack.length > 0) {
              const current = stack.pop()!;

              for (const b of molecule.bonds) {
                let next = -1;
                if (b.atom1 === current && !visited.has(b.atom2)) {
                  next = b.atom2;
                } else if (b.atom2 === current && !visited.has(b.atom1)) {
                  next = b.atom1;
                }

                if (next >= 0) {
                  visited.add(next);
                  phosphorylSubstituentAtoms.add(next);
                  stack.push(next);
                }
              }
            }

            if (process.env.VERBOSE) {
              console.log(
                `[findSubstituents] Found sulfanyl-phosphoryl at S=${neighborIdx}, P=${phosphorusIdx}, chain position=${attachedToChainAt + 1}`,
              );
              console.log(
                `  Phosphoryl atoms: ${Array.from(phosphorylSubstituentAtoms).join(",")}`,
              );
            }

            // Create a substituent with both sulfur and phosphoryl group
            // This will be named later in the name assembly layer
            const position = isAmineChain ? 
              attachedToChainAt.toString() : 
              (attachedToChainAt + 1).toString();
            
            substituents.push({
              position: position,
              type: "functional",
              size: phosphorylSubstituentAtoms.size + 1, // +1 for sulfur
              name: "phosphorylsulfanyl", // Placeholder - will be refined in name assembly
              atoms: [neighborIdx, ...Array.from(phosphorylSubstituentAtoms)], // Include sulfur and phosphoryl atoms
            });

            // Mark these atoms as processed to avoid re-detection
            fgAtomIds.add(neighborIdx); // Mark sulfur as processed
          }
        }
      }
    }
  }

  // Special handling for sulfonyl and sulfinyl functional groups
  // These can form bridges like R-S(=O)-S(=O)(=O)-R' where we need to detect the full substituent
  const sulfurGroups = functionalGroups.filter(
    (fg) =>
      (fg.name === "sulfonyl" || fg.name === "sulfinyl") &&
      fg.atoms &&
      fg.atoms.length > 0,
  );

  for (const sulfurGroup of sulfurGroups) {
    const sulfurIdx = sulfurGroup.atoms![0]!;
    const sulfurAtom = molecule.atoms[sulfurIdx];
    if (!sulfurAtom) continue;

    // Check if this sulfur is directly attached to the main chain
    let attachedToChainAt = -1;

    for (const bond of molecule.bonds) {
      if (bond.atom1 === sulfurIdx || bond.atom2 === sulfurIdx) {
        const otherAtom = bond.atom1 === sulfurIdx ? bond.atom2 : bond.atom1;

        if (chainSet.has(otherAtom)) {
          attachedToChainAt = mainChain.indexOf(otherAtom);
          break;
        }
      }
    }

    if (attachedToChainAt < 0) continue; // Not attached to chain

    // Traverse through FG atoms to find non-FG, non-chain atoms beyond the sulfur bridge
    const visited = new Set<number>(chainSet);
    const sulfurBridge: number[] = []; // Track FG atoms in the bridge
    const sulfurToSubstituentStarts = new Map<number, number[]>(); // Map each sulfur to its substituents
    const queue: number[] = [sulfurIdx];
    visited.add(sulfurIdx);
    sulfurBridge.push(sulfurIdx);

    // BFS through FG atoms
    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const bond of molecule.bonds) {
        let neighbor = -1;
        if (bond.atom1 === current && !visited.has(bond.atom2)) {
          neighbor = bond.atom2;
        } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
          neighbor = bond.atom1;
        }

        if (neighbor >= 0) {
          visited.add(neighbor);

          const neighborAtom = molecule.atoms[neighbor];
          // If neighbor is a sulfur atom, add it to the bridge
          if (neighborAtom && neighborAtom.symbol === "S") {
            queue.push(neighbor);
            sulfurBridge.push(neighbor);
          } else if (fgAtomIds.has(neighbor)) {
            // If neighbor is FG atom (not S), continue traversing only if it's S
            // This should not happen since we already handled S above
            // But keep for safety
            if (neighborAtom && neighborAtom.symbol === "S") {
              queue.push(neighbor);
              sulfurBridge.push(neighbor);
            }
          } else {
            // Found a non-FG, non-chain, non-sulfur atom - this is the start of a substituent
            // Track which sulfur it's attached to
            if (!sulfurToSubstituentStarts.has(current)) {
              sulfurToSubstituentStarts.set(current, []);
            }
            sulfurToSubstituentStarts.get(current)!.push(neighbor);
          }
        }
      }
    }

    if (sulfurToSubstituentStarts.size === 0) continue; // No substituent found

    // Normalize sulfur bridge order: put chain-attached sulfur first
    // This ensures consistent naming regardless of BFS traversal order
    if (sulfurBridge.length === 2) {
      if (process.env.VERBOSE) {
        console.log(
          "[DEBUG normalize] Before normalization: sulfurBridge =",
          sulfurBridge,
        );
      }

      const s0AttachedToChain = molecule.bonds.some(
        (b) =>
          (b.atom1 === sulfurBridge[0]! || b.atom2 === sulfurBridge[0]!) &&
          chainSet.has(b.atom1 === sulfurBridge[0]! ? b.atom2 : b.atom1),
      );
      const s1AttachedToChain = molecule.bonds.some(
        (b) =>
          (b.atom1 === sulfurBridge[1]! || b.atom2 === sulfurBridge[1]!) &&
          chainSet.has(b.atom1 === sulfurBridge[1]! ? b.atom2 : b.atom1),
      );

      if (process.env.VERBOSE) {
        console.log(
          "[DEBUG normalize] s0AttachedToChain:",
          s0AttachedToChain,
          "s1AttachedToChain:",
          s1AttachedToChain,
        );
      }

      // Swap if needed so that sulfurBridge[0] is always the one attached to chain
      if (!s0AttachedToChain && s1AttachedToChain) {
        [sulfurBridge[0], sulfurBridge[1]] = [
          sulfurBridge[1]!,
          sulfurBridge[0]!,
        ];

        if (process.env.VERBOSE) {
          console.log(
            "[DEBUG normalize] After swap: sulfurBridge =",
            sulfurBridge,
          );
        }
      }
    }

    // Collect all atoms in the substituent(s) beyond the sulfur bridge
    // Only collect from non-chain sulfur atoms (sulfurBridge[1] onwards)
    const substituentAtoms = new Set<number>();
    const substVisited = new Set<number>([...chainSet, ...sulfurBridge]);

    // Also mark all FG oxygen atoms as visited to avoid including them
    for (const fgAtom of fgAtomIds) {
      if (molecule.atoms[fgAtom]?.symbol === "O") {
        substVisited.add(fgAtom);
      }
    }

    // Only collect substituents from non-chain sulfur atoms
    const nonChainSulfurs = sulfurBridge.slice(1);
    const substituentStarts: number[] = [];
    for (const sulfur of nonChainSulfurs) {
      const starts = sulfurToSubstituentStarts.get(sulfur) || [];
      substituentStarts.push(...starts);
    }

    if (process.env.VERBOSE) {
      console.log(
        "[DEBUG sulfur bridge] sulfurBridge:",
        sulfurBridge,
        "nonChainSulfurs:",
        nonChainSulfurs,
      );
      console.log(
        "[DEBUG sulfur bridge] sulfurToSubstituentStarts:",
        sulfurToSubstituentStarts,
      );
      console.log(
        "[DEBUG sulfur bridge] substituentStarts:",
        substituentStarts,
      );
    }

    for (const startAtom of substituentStarts) {
      const stack = [startAtom];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (substVisited.has(current)) continue;
        substVisited.add(current);
        substituentAtoms.add(current);

        for (const bond of molecule.bonds) {
          let neighbor = -1;
          if (bond.atom1 === current && !substVisited.has(bond.atom2)) {
            neighbor = bond.atom2;
          } else if (bond.atom2 === current && !substVisited.has(bond.atom1)) {
            neighbor = bond.atom1;
          }
          if (neighbor >= 0) {
            stack.push(neighbor);
          }
        }
      }
    }

    if (substituentAtoms.size === 0) continue;

    // Build the substituent name: (alkyl)(functional groups)
    // First, name the alkyl group
    const alkylCarbons = Array.from(substituentAtoms).filter(
      (idx) => molecule.atoms[idx]?.symbol === "C",
    );
    let alkylName = "methyl";

    if (alkylCarbons.length === 0) {
      alkylName = ""; // No alkyl group
    } else if (alkylCarbons.length === 1) {
      alkylName = "methyl";
    } else if (alkylCarbons.length === 2) {
      alkylName = "ethyl";
    } else if (alkylCarbons.length === 3) {
      alkylName = "propyl";
    } else if (alkylCarbons.length === 4) {
      // Check for tert-butyl or isobutyl patterns
      let foundTertButyl = false;
      for (const cIdx of alkylCarbons) {
        const cNeighbors = molecule.bonds.filter(
          (b) =>
            (b.atom1 === cIdx || b.atom2 === cIdx) &&
            substituentAtoms.has(b.atom1) &&
            substituentAtoms.has(b.atom2) &&
            molecule.atoms[b.atom1 === cIdx ? b.atom2 : b.atom1]?.symbol ===
              "C",
        );
        if (cNeighbors.length === 3) {
          foundTertButyl = true;
          alkylName = "tert-butyl";
          break;
        }
      }
      if (!foundTertButyl) alkylName = "butyl";
    } else {
      // Check for 2,2-dimethylpropyl pattern (5 carbons in specific configuration)
      // Structure: (CH3)2C-CH2-
      if (alkylCarbons.length === 5) {
        // Find the carbon attached to the sulfur bridge
        let attachedCarbon = -1;
        for (const sIdx of sulfurBridge) {
          for (const bond of molecule.bonds) {
            const neighbor =
              bond.atom1 === sIdx
                ? bond.atom2
                : bond.atom2 === sIdx
                  ? bond.atom1
                  : -1;
            if (
              neighbor >= 0 &&
              substituentAtoms.has(neighbor) &&
              molecule.atoms[neighbor]?.symbol === "C"
            ) {
              attachedCarbon = neighbor;
              break;
            }
          }
          if (attachedCarbon >= 0) break;
        }

        if (attachedCarbon >= 0) {
          // Check if this carbon is CH2 bonded to a quaternary carbon
          const attachedNeighbors = molecule.bonds
            .filter(
              (b) =>
                (b.atom1 === attachedCarbon || b.atom2 === attachedCarbon) &&
                substituentAtoms.has(b.atom1) &&
                substituentAtoms.has(b.atom2),
            )
            .map((b) => (b.atom1 === attachedCarbon ? b.atom2 : b.atom1))
            .filter((n) => molecule.atoms[n]?.symbol === "C");

          if (attachedNeighbors.length === 1) {
            const quaternaryC = attachedNeighbors[0]!;
            const quaternaryNeighbors = molecule.bonds
              .filter(
                (b) =>
                  (b.atom1 === quaternaryC || b.atom2 === quaternaryC) &&
                  substituentAtoms.has(b.atom1) &&
                  substituentAtoms.has(b.atom2),
              )
              .map((b) => (b.atom1 === quaternaryC ? b.atom2 : b.atom1))
              .filter((n) => molecule.atoms[n]?.symbol === "C");

            // For 2,2-dimethylpropyl: (CH3)3C-CH2- structure
            // The quaternary carbon has 4 carbon neighbors: 1 CH2 + 3 CH3
            if (quaternaryNeighbors.length === 4) {
              alkylName = "2,2-dimethylpropyl";
            } else {
              alkylName = "pentyl";
            }
          } else {
            alkylName = "pentyl";
          }
        } else {
          alkylName = "pentyl";
        }
      } else {
        alkylName = getAlkylName(alkylCarbons.length);
      }
    }

    // Now identify the functional group names from the sulfur bridge
    const fgNames: string[] = [];

    // Build name in order: furthest from chain first
    // For S5-S7 bridge where S7 is attached to chain: name is "alkyl-sulfinyl-sulfonyl"
    // We need to determine which sulfur is which
    if (sulfurBridge.length === 2) {
      const s0 = sulfurBridge[0]!;
      const s1 = sulfurBridge[1]!;

      if (process.env.VERBOSE) {
        console.log(
          "[DEBUG] Sulfur bridge:",
          sulfurBridge,
          "s0=",
          s0,
          "s1=",
          s1,
        );
      }

      // Determine which is attached to chain
      const s0AttachedToChain = molecule.bonds.some(
        (b) =>
          (b.atom1 === s0 || b.atom2 === s0) &&
          chainSet.has(b.atom1 === s0 ? b.atom2 : b.atom1),
      );

      // Also determine which is attached to substituent
      const s0AttachedToSubst = molecule.bonds.some(
        (b) =>
          (b.atom1 === s0 || b.atom2 === s0) &&
          substituentAtoms.has(b.atom1 === s0 ? b.atom2 : b.atom1),
      );
      const s1AttachedToSubst = molecule.bonds.some(
        (b) =>
          (b.atom1 === s1 || b.atom2 === s1) &&
          substituentAtoms.has(b.atom1 === s1 ? b.atom2 : b.atom1),
      );

      if (process.env.VERBOSE) {
        console.log("[DEBUG] s0 attached to chain:", s0AttachedToChain);
        console.log(
          "[DEBUG] s0 attached to subst:",
          s0AttachedToSubst,
          "s1 attached to subst:",
          s1AttachedToSubst,
        );
      }

      // Determine the functional group types
      const s0Type =
        functionalGroups.find((g) => g.atoms && g.atoms.includes(s0))?.name ||
        "sulfanyl";
      const s1Type =
        functionalGroups.find((g) => g.atoms && g.atoms.includes(s1))?.name ||
        "sulfanyl";

      // Count oxygen atoms attached to each sulfur
      const s0OxygenCount = molecule.bonds.filter(
        (b) =>
          (b.atom1 === s0 || b.atom2 === s0) &&
          molecule.atoms[b.atom1 === s0 ? b.atom2 : b.atom1]?.symbol === "O",
      ).length;
      const s1OxygenCount = molecule.bonds.filter(
        (b) =>
          (b.atom1 === s1 || b.atom2 === s1) &&
          molecule.atoms[b.atom1 === s1 ? b.atom2 : b.atom1]?.symbol === "O",
      ).length;

      if (process.env.VERBOSE) {
        console.log(
          "[DEBUG] s0Type:",
          s0Type,
          `(${s0OxygenCount} O)`,
          "s1Type:",
          s1Type,
          `(${s1OxygenCount} O)`,
        );
      }

      // Order by oxidation state: higher oxygen count (higher oxidation) comes first
      // This follows IUPAC priority for naming oxidized sulfur compounds
      if (s0OxygenCount > s1OxygenCount) {
        // s0 has more oxygens, name it first
        if (process.env.VERBOSE) {
          console.log(
            "[DEBUG] Pushing order: s0Type, s1Type (s0 has more oxygens)",
          );
        }
        fgNames.push(s0Type, s1Type);
      } else if (s1OxygenCount > s0OxygenCount) {
        // s1 has more oxygens, name it first
        if (process.env.VERBOSE) {
          console.log(
            "[DEBUG] Pushing order: s1Type, s0Type (s1 has more oxygens)",
          );
        }
        fgNames.push(s1Type, s0Type);
      } else {
        // Equal oxygen counts: use substituent attachment as tiebreaker
        if (s1AttachedToSubst) {
          if (process.env.VERBOSE) {
            console.log(
              "[DEBUG] Pushing order: s1Type, s0Type (equal O, s1 attached to subst)",
            );
          }
          fgNames.push(s1Type, s0Type);
        } else if (s0AttachedToSubst) {
          if (process.env.VERBOSE) {
            console.log(
              "[DEBUG] Pushing order: s0Type, s1Type (equal O, s0 attached to subst)",
            );
          }
          fgNames.push(s0Type, s1Type);
        } else {
          // Final fallback: use chain attachment
          if (s0AttachedToChain) {
            if (process.env.VERBOSE) {
              console.log(
                "[DEBUG] Pushing order: s0Type, s1Type (equal O, s0 attached to chain)",
              );
            }
            fgNames.push(s0Type, s1Type);
          } else {
            if (process.env.VERBOSE) {
              console.log(
                "[DEBUG] Pushing order: s1Type, s0Type (equal O, s1 attached to chain)",
              );
            }
            fgNames.push(s1Type, s0Type);
          }
        }
      }
    } else if (sulfurBridge.length === 1) {
      const sType =
        functionalGroups.find(
          (g) => g.atoms && g.atoms.includes(sulfurBridge[0]!),
        )?.name || "sulfur";
      fgNames.push(sType);
    }

    // Construct full substituent name: (alkyl)(fg1)(fg2)
    let fullName = "";
    if (alkylName) {
      fullName = alkylName;
    }
    if (fgNames.length > 0) {
      if (fullName) {
        fullName = `${fullName}${fgNames.join("")}`;
      } else {
        fullName = fgNames.join("");
      }
    }

    const position = isAmineChain ? 
      attachedToChainAt.toString() : 
      (attachedToChainAt + 1).toString();

    if (process.env.VERBOSE) {
      console.log(
        `[findSubstituents] Sulfur bridge substituent at position ${position}: ${fullName}`,
      );
      console.log(
        `  Bridge: ${sulfurBridge.join(",")}, Substituent atoms: ${Array.from(substituentAtoms).join(",")}`,
      );
    }
    substituents.push({
      position: position,
      type: "functional",
      size: substituentAtoms.size + sulfurBridge.length,
      name: fullName,
    });
  }

  // Special handling for ketone groups NOT on the main chain - these are acyl substituents
  // Pattern: R-C(=O)- where the C is not in mainChain
  const ketoneGroups = functionalGroups.filter(
    (fg) => fg.name === "ketone" && fg.atoms && fg.atoms.length >= 2,
  );

  for (const ketoneGroup of ketoneGroups) {
    // ketoneGroup.atoms should be [carbonylCarbon, oxygen]
    const carbonylCarbonIdx = ketoneGroup.atoms!.find(
      (atomIdx) => molecule.atoms[atomIdx]?.symbol === "C",
    );
    const oxygenIdx = ketoneGroup.atoms!.find(
      (atomIdx) => molecule.atoms[atomIdx]?.symbol === "O",
    );

    if (carbonylCarbonIdx === undefined || oxygenIdx === undefined) continue;

    // Check if carbonyl carbon is in the main chain
    if (chainSet.has(carbonylCarbonIdx)) {
      // This ketone is on the main chain, not an acyl substituent
      continue;
    }

    // Find which main chain carbon this acyl group is attached to
    let attachedToChainAt = -1;
    let chainCarbonIdx = -1;

    for (const bond of molecule.bonds) {
      if (
        bond.atom1 === carbonylCarbonIdx ||
        bond.atom2 === carbonylCarbonIdx
      ) {
        const otherAtom =
          bond.atom1 === carbonylCarbonIdx ? bond.atom2 : bond.atom1;
        const otherAtomObj = molecule.atoms[otherAtom];

        // Skip the oxygen (that's the C=O bond)
        if (otherAtom === oxygenIdx) continue;

        if (otherAtomObj && chainSet.has(otherAtom)) {
          chainCarbonIdx = otherAtom;
          attachedToChainAt = mainChain.indexOf(otherAtom);
          break;
        }
      }
    }

    if (attachedToChainAt < 0) continue; // Not attached to main chain

    // Now traverse from carbonylCarbon to collect all atoms in the acyl group
    // Exclude: the oxygen, the chain atoms, and any other FG heteroatoms
    const acylAtoms = new Set<number>();
    acylAtoms.add(carbonylCarbonIdx);
    acylAtoms.add(oxygenIdx); // Include oxygen for completeness

    const visited = new Set<number>(chainSet);
    visited.add(oxygenIdx); // Don't traverse through oxygen
    const stack = [carbonylCarbonIdx];
    visited.add(carbonylCarbonIdx);

    while (stack.length > 0) {
      const current = stack.pop()!;

      for (const bond of molecule.bonds) {
        let neighbor = -1;
        if (bond.atom1 === current && !visited.has(bond.atom2)) {
          neighbor = bond.atom2;
        } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
          neighbor = bond.atom1;
        }

        if (neighbor >= 0) {
          visited.add(neighbor);
          acylAtoms.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    // Name the acyl group
    // Count carbons (excluding oxygen)
    const acylCarbons = Array.from(acylAtoms).filter(
      (idx) => molecule.atoms[idx]?.symbol === "C",
    );
    const carbonCount = acylCarbons.length;

    if (process.env.VERBOSE) {
      console.log(
        `[findSubstituents] Acyl group detected: carbonyl C=${carbonylCarbonIdx}, attached to chain at ${chainCarbonIdx} (position ${attachedToChainAt + 1}), ${carbonCount} carbons`,
      );
    }

    // Build acyl name
    let acylName = "";

    if (carbonCount === 1) {
      // Just C=O: formyl
      acylName = "formyl";
    } else if (carbonCount === 2) {
      // C-C(=O): acetyl (ethanoyl)
      acylName = "acetyl";
    } else {
      // Need to determine the structure of the acyl group
      // For now, use simple alkanoyl naming
      // TODO: Handle branching (e.g., "2-methylpropanoyl")

      // Find the longest carbon chain from carbonyl carbon
      const acylCarbonSet = new Set(acylCarbons);
      let longestChain: number[] = [];

      // Simple DFS to find longest path
      const dfs = (
        current: number,
        path: number[],
        visited: Set<number>,
      ): void => {
        if (path.length > longestChain.length) {
          longestChain = [...path];
        }

        for (const bond of molecule.bonds) {
          let neighbor = -1;
          if (bond.atom1 === current && !visited.has(bond.atom2)) {
            neighbor = bond.atom2;
          } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
            neighbor = bond.atom1;
          }

          if (neighbor >= 0 && acylCarbonSet.has(neighbor)) {
            visited.add(neighbor);
            path.push(neighbor);
            dfs(neighbor, path, visited);
            path.pop();
            visited.delete(neighbor);
          }
        }
      };

      const visitedDfs = new Set<number>([carbonylCarbonIdx]);
      dfs(carbonylCarbonIdx, [carbonylCarbonIdx], visitedDfs);

      const chainLength = longestChain.length;

      // Check for branching
      const hasBranching = acylCarbons.length > chainLength;

      if (hasBranching && chainLength <= 4) {
        // Handle common branched patterns
        // For example: CC(C)C(=O) -> "2-methylpropanoyl"

        // Find branch points (carbons with >2 carbon neighbors in acyl group)
        const branchInfo: Array<{ carbon: number; position: number }> = [];

        for (let i = 0; i < longestChain.length; i++) {
          const carbonIdx = longestChain[i]!;
          const carbonNeighbors = molecule.bonds
            .filter(
              (b) =>
                (b.atom1 === carbonIdx || b.atom2 === carbonIdx) &&
                b.type === "single",
            )
            .map((b) => (b.atom1 === carbonIdx ? b.atom2 : b.atom1))
            .filter((idx) => acylCarbonSet.has(idx) && idx !== oxygenIdx);

          // Count how many are in the main chain
          const inChainCount = carbonNeighbors.filter((idx) =>
            longestChain.includes(idx),
          ).length;

          if (carbonNeighbors.length > inChainCount) {
            // This carbon has branches
            branchInfo.push({ carbon: carbonIdx, position: i + 1 });
          }
        }

        if (branchInfo.length > 0) {
          // Build name with branches
          const branchNames: string[] = [];
          for (const branch of branchInfo) {
            // For now, assume methyl branches
            branchNames.push(`${branch.position}-methyl`);
          }

          const baseName = getAlkanoylName(chainLength);
          acylName = `${branchNames.join("-")}${baseName}`;
        } else {
          acylName = getAlkanoylName(chainLength);
        }
      } else {
        acylName = getAlkanoylName(chainLength);
      }
    }

    const position = isAmineChain ? 
      attachedToChainAt.toString() : 
      (attachedToChainAt + 1).toString();

    if (process.env.VERBOSE) {
      console.log(
        `[findSubstituents] Acyl substituent at position ${position}: ${acylName}`,
      );
    }

    substituents.push({
      position: position,
      type: "functional",
      size: acylAtoms.size,
      name: acylName,
      atoms: Array.from(acylAtoms), // Include atoms for deduplication
    });
  }

  if (process.env.VERBOSE)
    console.log(`[findSubstituents] result: ${JSON.stringify(substituents)}`);
  return substituents;
}
