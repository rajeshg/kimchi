import type { Molecule, Atom } from "types";
import {
  generateClassicPolycyclicName,
  type ClassicPolycyclicNameResult,
} from "../iupac-rings/utils";
import { IUPACRuleEngine } from "../iupac-rule-engine";

export interface RingSubstituentInfo {
  ringAtoms: number[];
  ringName: string;
  attachmentPosition: number;
  fullName: string;
}

export function detectRingInAlkoxyGroup(
  alkoxyCarbonIds: Set<number>,
  molecule: Molecule,
): number[][] {
  const rings = molecule.rings ? molecule.rings.map((r) => [...r]) : [];
  const ringsInAlkoxy: number[][] = [];

  for (const ring of rings) {
    const ringIntersection = ring.filter((atomId) =>
      alkoxyCarbonIds.has(atomId),
    );
    if (ringIntersection.length >= 3) {
      ringsInAlkoxy.push(ring);
    }
  }

  return ringsInAlkoxy;
}

export function nameRingSubstituent(
  ring: number[],
  attachmentAtomId: number,
  molecule: Molecule,
): RingSubstituentInfo | null {
  const ringSize = ring.length;
  const ringAtoms = ring
    .map((id) => molecule.atoms[id])
    .filter((a): a is Atom => a !== undefined);

  const heteroatomCounts: Record<string, number> = {};
  for (const atom of ringAtoms) {
    if (atom.symbol !== "C") {
      heteroatomCounts[atom.symbol] = (heteroatomCounts[atom.symbol] || 0) + 1;
    }
  }

  const hasOxygen = heteroatomCounts["O"] || 0;
  const hasNitrogen = heteroatomCounts["N"] || 0;
  const hasSulfur = heteroatomCounts["S"] || 0;
  const totalHetero = hasOxygen + hasNitrogen + hasSulfur;

  // For heteroatom rings, reorder so heteroatom is at position 1
  let orderedRing = [...ring];
  if (totalHetero === 1) {
    const heteroAtomId = ring.find((atomId) => {
      const atom = molecule.atoms[atomId];
      return atom && atom.symbol !== "C";
    });

    if (heteroAtomId !== undefined) {
      const heteroIndex = ring.indexOf(heteroAtomId);
      if (heteroIndex > 0) {
        // Rotate the ring so heteroatom is first
        orderedRing = [
          ...ring.slice(heteroIndex),
          ...ring.slice(0, heteroIndex),
        ];
        if (process.env.VERBOSE) {
          console.log(
            `[nameRingSubstituent] Reordered ring to start with heteroatom: ${ring} -> ${orderedRing}`,
          );
        }
      }
    }
  }

  let isSaturated = true;
  for (const bond of molecule.bonds) {
    const isInRing =
      orderedRing.includes(bond.atom1) && orderedRing.includes(bond.atom2);
    if (isInRing && bond.type === "double") {
      isSaturated = false;
      break;
    }
  }

  let ringBaseName: string | null = null;

  if (isSaturated && totalHetero === 1) {
    if (ringSize === 5 && hasOxygen === 1) {
      ringBaseName = "oxolan";
    } else if (ringSize === 5 && hasNitrogen === 1) {
      ringBaseName = "pyrrolidin";
    } else if (ringSize === 5 && hasSulfur === 1) {
      ringBaseName = "thiolan";
    } else if (ringSize === 6 && hasOxygen === 1) {
      ringBaseName = "oxan";
    } else if (ringSize === 6 && hasNitrogen === 1) {
      ringBaseName = "piperidin";
    } else if (ringSize === 6 && hasSulfur === 1) {
      ringBaseName = "thian";
    }
  }

  if (!ringBaseName) {
    if (isSaturated && totalHetero === 0) {
      const cycloNames: { [key: number]: string } = {
        3: "cycloprop",
        4: "cyclobut",
        5: "cyclopent",
        6: "cyclohex",
        7: "cyclohept",
        8: "cyclooct",
      };
      ringBaseName = cycloNames[ringSize] || `cycloC${ringSize}`;
    }
  }

  if (!ringBaseName) {
    return null;
  }

  const attachmentPosition = getAttachmentPosition(
    orderedRing,
    attachmentAtomId,
    molecule,
  );

  // Check if there's an exocyclic double bond from the ring attachment point
  const hasExocyclicDoubleBond = checkExocyclicDoubleBond(
    orderedRing,
    attachmentAtomId,
    molecule,
  );

  const suffix = hasExocyclicDoubleBond ? "ylidene" : "yl";
  const fullName =
    attachmentPosition > 1
      ? `${ringBaseName}-${attachmentPosition}-${suffix}`
      : `${ringBaseName}${suffix}`;

  return {
    ringAtoms: orderedRing,
    ringName: ringBaseName,
    attachmentPosition,
    fullName,
  };
}

function checkExocyclicDoubleBond(
  ring: number[],
  attachmentAtomId: number,
  molecule: Molecule,
): boolean {
  const ringSet = new Set(ring);

  for (const bond of molecule.bonds) {
    if (bond.type !== "double") continue;

    const atom1InRing = ringSet.has(bond.atom1);
    const atom2InRing = ringSet.has(bond.atom2);

    if (atom1InRing && bond.atom2 === attachmentAtomId) {
      return true;
    } else if (atom2InRing && bond.atom1 === attachmentAtomId) {
      return true;
    }
  }

  return false;
}

function getAttachmentPosition(
  ring: number[],
  attachmentAtomId: number,
  molecule: Molecule,
): number {
  const ringSet = new Set(ring);

  if (process.env.VERBOSE) {
    console.log("[getAttachmentPosition] ring:", ring);
    console.log("[getAttachmentPosition] attachmentAtomId:", attachmentAtomId);
  }

  for (const bond of molecule.bonds) {
    const inRing1 = ringSet.has(bond.atom1);
    const inRing2 = ringSet.has(bond.atom2);

    if (process.env.VERBOSE) {
      console.log(
        `[getAttachmentPosition] Checking bond ${bond.atom1}-${bond.atom2}: inRing1=${inRing1}, inRing2=${inRing2}`,
      );
    }

    if (inRing1 && !inRing2 && bond.atom2 === attachmentAtomId) {
      const position = ring.indexOf(bond.atom1) + 1;
      if (process.env.VERBOSE) {
        console.log(
          `[getAttachmentPosition] Found: ring atom ${bond.atom1} connects to attachment ${attachmentAtomId}, position=${position}`,
        );
      }
      return position;
    } else if (inRing2 && !inRing1 && bond.atom1 === attachmentAtomId) {
      const position = ring.indexOf(bond.atom2) + 1;
      if (process.env.VERBOSE) {
        console.log(
          `[getAttachmentPosition] Found: ring atom ${bond.atom2} connects to attachment ${attachmentAtomId}, position=${position}`,
        );
      }
      return position;
    }
  }

  // Fallback: explicitly search ring atoms for a direct bond to the attachment atom
  for (const ringAtom of ring) {
    for (const bond of molecule.bonds) {
      if (
        (bond.atom1 === ringAtom && bond.atom2 === attachmentAtomId) ||
        (bond.atom2 === ringAtom && bond.atom1 === attachmentAtomId)
      ) {
        return ring.indexOf(ringAtom) + 1;
      }
    }
  }

  return 1;
}

export function buildRingSubstituentAlkylName(
  alkoxyStartAtomId: number,
  esterOxygenId: number,
  molecule: Molecule,
): string | null {
  if (process.env.VERBOSE) {
    console.log(
      "[buildRingSubstituentAlkylName] Starting with alkoxyStartAtomId:",
      alkoxyStartAtomId,
      "esterOxygenId:",
      esterOxygenId,
    );
  }

  const visited = new Set<number>();
  const alkoxyCarbonIds = new Set<number>();
  const queue = [alkoxyStartAtomId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === "C") {
      alkoxyCarbonIds.add(currentId);

      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          const otherAtom = molecule.atoms[otherId];

          if (
            otherAtom?.symbol === "C" &&
            !visited.has(otherId) &&
            otherId !== esterOxygenId
          ) {
            queue.push(otherId);
          }
        }
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildRingSubstituentAlkylName] alkoxyCarbonIds:",
      Array.from(alkoxyCarbonIds),
    );
  }

  const ringsInAlkoxy = detectRingInAlkoxyGroup(alkoxyCarbonIds, molecule);

  if (process.env.VERBOSE) {
    console.log(
      "[buildRingSubstituentAlkylName] ringsInAlkoxy:",
      ringsInAlkoxy,
    );
  }

  if (ringsInAlkoxy.length === 0) {
    if (process.env.VERBOSE) {
      console.log(
        "[buildRingSubstituentAlkylName] No rings found, returning null",
      );
    }
    return null;
  }

  // Check if this is a polycyclic system (2+ rings sharing atoms = fused system)
  if (ringsInAlkoxy.length >= 2) {
    if (process.env.VERBOSE) {
      console.log(
        `[buildRingSubstituentAlkylName] Detected polycyclic system with ${ringsInAlkoxy.length} rings`,
      );
    }

    // Try to generate von Baeyer nomenclature
    const polycyclicResult = generateClassicPolycyclicName(
      molecule,
      ringsInAlkoxy,
      ringsInAlkoxy.length,
    );

    if (polycyclicResult) {
      if (process.env.VERBOSE) {
        console.log(
          "[buildRingSubstituentAlkylName] Generated polycyclic name:",
          polycyclicResult.name,
        );
      }

      // Count aromatic double bonds in the ring system
      const ringAtomSet = new Set(ringsInAlkoxy.flat());
      const aromaticAtoms = Array.from(ringAtomSet).filter((atomId) => {
        const atom = molecule.atoms[atomId];
        return atom?.aromatic === true;
      });

      let unsaturationSuffix = "";
      if (aromaticAtoms.length > 0) {
        // Count aromatic bonds in the aromatic ring and track their positions
        // Note: aromatic bonds represent alternating double bonds
        // For IUPAC naming, we count the number of C=C double bonds
        // In benzene: 6 aromatic bonds = 3 C=C double bonds
        let aromaticBondCount = 0;
        const aromaticAtomSet = new Set(aromaticAtoms);
        const aromaticBondPositions: Array<[number, number]> = [];

        for (const bond of molecule.bonds) {
          if (
            bond.type === "aromatic" &&
            aromaticAtomSet.has(bond.atom1) &&
            aromaticAtomSet.has(bond.atom2)
          ) {
            aromaticBondCount++;
            
            // Get von Baeyer positions for both atoms
            let pos1 = bond.atom1 + 1;
            let pos2 = bond.atom2 + 1;
            if (polycyclicResult.vonBaeyerNumbering) {
              if (polycyclicResult.vonBaeyerNumbering.has(bond.atom1)) {
                pos1 = polycyclicResult.vonBaeyerNumbering.get(bond.atom1)!;
              }
              if (polycyclicResult.vonBaeyerNumbering.has(bond.atom2)) {
                pos2 = polycyclicResult.vonBaeyerNumbering.get(bond.atom2)!;
              }
            }
            aromaticBondPositions.push([Math.min(pos1, pos2), Math.max(pos1, pos2)]);
          }
        }

        // Convert aromatic bond count to double bond count
        // Aromatic rings have alternating double bonds, so divide by 2 (rounded up)
        const doubleBondCount = Math.ceil(aromaticBondCount / 2);

        if (doubleBondCount === 3) {
          unsaturationSuffix = "trien";
        } else if (doubleBondCount === 2) {
          unsaturationSuffix = "dien";
        } else if (doubleBondCount === 1) {
          unsaturationSuffix = "en";
        }

        // Add locants if we have double bonds
        // Format: -1(30),27(31),28-trien
        if (aromaticBondPositions.length > 0 && doubleBondCount > 0) {
          // Sort by first position, then by second position
          aromaticBondPositions.sort((a, b) => {
            if (a[0] !== b[0]) return a[0] - b[0];
            return a[1] - b[1];
          });
          

          
          // Select bonds to minimize position repeats and get lowest locants
          // Use greedy algorithm that tries to maximize non-overlapping selection
          const selectedBonds: Array<[number, number]> = [];
          const usedPositions = new Set<number>();
          
          // First, try to find a complete set of non-overlapping bonds
          function findNonOverlappingSet(bonds: Array<[number, number]>, count: number): Array<[number, number]> | null {
            if (count === 0) return [];
            if (bonds.length < count) return null;
            
            for (let i = 0; i <= bonds.length - count; i++) {
              const bond = bonds[i];
              if (!bond) continue;
              
              const remaining = bonds.slice(i + 1);
              const availableRemaining = remaining.filter(b => 
                b && b[0] !== bond[0] && b[1] !== bond[1] && b[0] !== bond[1] && b[1] !== bond[0]
              );
              
              const subResult = findNonOverlappingSet(availableRemaining, count - 1);
              if (subResult !== null) {
                return [bond, ...subResult];
              }
            }
            return null;
          }
          
          const nonOverlappingSet = findNonOverlappingSet(aromaticBondPositions, doubleBondCount);
          
          if (nonOverlappingSet) {
            selectedBonds.push(...nonOverlappingSet);
          } else {
            // Fallback: use greedy selection
            for (const bond of aromaticBondPositions) {
              if (selectedBonds.length >= doubleBondCount) break;
              const hasOverlap = usedPositions.has(bond[0]) || usedPositions.has(bond[1]);
              if (!hasOverlap) {
                selectedBonds.push(bond);
                usedPositions.add(bond[0]);
                usedPositions.add(bond[1]);
              }
            }
            
            // Fill remaining with any bonds
            if (selectedBonds.length < doubleBondCount) {
              for (const bond of aromaticBondPositions) {
                if (selectedBonds.length >= doubleBondCount) break;
                if (!selectedBonds.some(b => b[0] === bond[0] && b[1] === bond[1])) {
                  selectedBonds.push(bond);
                }
              }
            }
          }
          
          // Sort selected bonds by first position
          selectedBonds.sort((a, b) => {
            if (a[0] !== b[0]) return a[0] - b[0];
            return a[1] - b[1];
          });
          
          // Format locants with simplified notation for consecutive positions
          // IUPAC uses "n" instead of "n(n+1)" when positions are consecutive
          const locantStr = selectedBonds
            .map(([p1, p2]) => {
              // If positions are consecutive (e.g., 28 and 29), use simplified notation
              if (p2 === p1 + 1) {
                return `${p1}`;
              }
              return `${p1}(${p2})`;
            })
            .join(",");
          unsaturationSuffix = `-${locantStr}-${unsaturationSuffix}`;
        }

        if (process.env.VERBOSE) {
          console.log(
            `[buildRingSubstituentAlkylName] Aromatic ring has ${aromaticBondCount} aromatic bonds (${doubleBondCount} double bonds) → ${unsaturationSuffix}`,
          );
          console.log(
            `[buildRingSubstituentAlkylName] Aromatic bond positions:`,
            aromaticBondPositions,
          );
        }
      }

      // Find attachment point to ester oxygen
      let attachmentAtomId: number | null = null;
      for (const atomId of ringAtomSet) {
        for (const bond of molecule.bonds) {
          if (
            (bond.atom1 === atomId && bond.atom2 === esterOxygenId) ||
            (bond.atom2 === atomId && bond.atom1 === esterOxygenId)
          ) {
            attachmentAtomId = atomId;
            break;
          }
        }
        if (attachmentAtomId !== null) break;
      }

      if (process.env.VERBOSE) {
        console.log(
          "[buildRingSubstituentAlkylName] attachmentAtomId:",
          attachmentAtomId,
        );
      }

      // Find any substituents on the ring system that need to be named
      const substituentParts: string[] = [];

      // Check for acetoxy substituents
      for (const atomId of ringAtomSet) {
        const atom = molecule.atoms[atomId];
        if (!atom) continue;

        // Skip the attachment atom - its acetoxy is the MAIN ester, not a substituent
        if (atomId === attachmentAtomId) continue;

        // Find oxygen atoms bonded to this ring atom
        for (const bond of molecule.bonds) {
          if (bond.atom1 === atomId || bond.atom2 === atomId) {
            const otherAtomId =
              bond.atom1 === atomId ? bond.atom2 : bond.atom1;
            const otherAtom = molecule.atoms[otherAtomId];

            if (otherAtom?.symbol === "O" && !ringAtomSet.has(otherAtomId)) {
              // Check if this oxygen is part of an acetoxy group (O-C(=O)-C)
              let acetoxyCarbon: number | null = null;

              for (const bond2 of molecule.bonds) {
                if (
                  bond2.atom1 === otherAtomId ||
                  bond2.atom2 === otherAtomId
                ) {
                  const carbonylId =
                    bond2.atom1 === otherAtomId ? bond2.atom2 : bond2.atom1;
                  const carbonylAtom = molecule.atoms[carbonylId];

                  if (
                    carbonylAtom?.symbol === "C" &&
                    carbonylId !== atomId &&
                    carbonylId !== esterOxygenId
                  ) {
                    // Check for C=O double bond
                    const hasDoubleBond = molecule.bonds.some(
                      (b) =>
                        b.type === "double" &&
                        ((b.atom1 === carbonylId &&
                          molecule.atoms[b.atom2]?.symbol === "O") ||
                          (b.atom2 === carbonylId &&
                            molecule.atoms[b.atom1]?.symbol === "O")),
                    );

                    if (hasDoubleBond) {
                      acetoxyCarbon = carbonylId;
                      break;
                    }
                  }
                }
              }

              if (acetoxyCarbon !== null) {
                // Map atom position to von Baeyer numbering
                // Use polycyclicResult.vonBaeyerNumbering (original numbering from structure analysis)
                // NOT parentStructure.vonBaeyerNumbering (optimized numbering for principal groups)
                // The substituent positions should reflect the original structural numbering
                let vonBaeyerPos = atomId + 1; // Fallback
                if (polycyclicResult.vonBaeyerNumbering && polycyclicResult.vonBaeyerNumbering.has(atomId)) {
                  vonBaeyerPos = polycyclicResult.vonBaeyerNumbering.get(atomId)!;
                }

                substituentParts.push(`${vonBaeyerPos}-acetyloxy`);

                if (process.env.VERBOSE) {
                  console.log(
                    `[buildRingSubstituentAlkylName] Found acetoxy at atom ${atomId} → position ${vonBaeyerPos}`,
                  );
                }
              }
            }
          }
        }
      }

      // Check for external ring substituents (e.g., azacycles attached to the bicyclic system)
      // Find all rings in the molecule that are NOT part of ringsInAlkoxy
      const allRings = molecule.rings || [];
      const bicyclicRingSet = new Set(ringsInAlkoxy.flat());
      
      for (let ringIdx = 0; ringIdx < allRings.length; ringIdx++) {
        const externalRing = allRings[ringIdx];
        if (!externalRing) continue;
        
        // Check if this ring is not part of the bicyclic system
        const isPartOfBicyclic = externalRing.some(atomId => 
          ringsInAlkoxy.some(r => r.includes(atomId))
        );
        
        if (!isPartOfBicyclic) {
          // This ring is external to the bicyclic system
          // Check if it's connected to the bicyclic system
          let connectionPoint: number | null = null;
          
          for (const extAtomId of externalRing) {
            for (const bond of molecule.bonds) {
              if (bond.atom1 === extAtomId || bond.atom2 === extAtomId) {
                const otherAtomId = bond.atom1 === extAtomId ? bond.atom2 : bond.atom1;
                
                // Check if the other atom is in the bicyclic system
                if (ringAtomSet.has(otherAtomId)) {
                  connectionPoint = otherAtomId;
                  break;
                }
              }
            }
            if (connectionPoint !== null) break;
          }
          
          if (connectionPoint !== null) {
            // We found an external ring connected to the bicyclic system
            // Name it as a substituent
            const hasNitrogen = externalRing.some(atomId => 
              molecule.atoms[atomId]?.symbol === "N"
            );
            
            if (hasNitrogen) {
              // This is an azacycle
              const ringSize = externalRing.length;
              
              // Find the nitrogen position in the ring (for "azacyclohexacos-1-yl" the N is at position 1)
              // Find ketone groups (=O) in the ring
              let ketonePosition: number | null = null;
              for (let i = 0; i < externalRing.length; i++) {
                const ringAtomId = externalRing[i];
                if (!ringAtomId) continue;
                
                const ringAtom = molecule.atoms[ringAtomId];
                if (ringAtom?.symbol === "C") {
                  // Check for C=O
                  for (const bond of molecule.bonds) {
                    if (
                      (bond.atom1 === ringAtomId || bond.atom2 === ringAtomId) &&
                      bond.type === "double"
                    ) {
                      const otherAtomId = bond.atom1 === ringAtomId ? bond.atom2 : bond.atom1;
                      const otherAtom = molecule.atoms[otherAtomId];
                      
                      if (otherAtom?.symbol === "O" && !externalRing.includes(otherAtomId)) {
                        // Found ketone - position is i+1 (1-based)
                        ketonePosition = i + 1;
                        break;
                      }
                    }
                  }
                }
                if (ketonePosition !== null) break;
              }
              
              // Generate azacycle name
              const ruleEngine = new IUPACRuleEngine();
              const alkaneName = ruleEngine.getAlkaneName(ringSize);
              const cycleName = alkaneName?.replace(/ane$/, "") || `C${ringSize}`;
              
              let azacycleName = `azacyclo${cycleName}-1-yl`;
              
              if (ketonePosition !== null) {
                azacycleName = `${ketonePosition}-oxo-${azacycleName}`;
              }
              
              // Get von Baeyer position for connection point
              // Use polycyclicResult.vonBaeyerNumbering (original numbering from structure analysis)
              // NOT parentStructure.vonBaeyerNumbering (optimized numbering for principal groups)
              let connectionPos = connectionPoint + 1;
              if (polycyclicResult.vonBaeyerNumbering && polycyclicResult.vonBaeyerNumbering.has(connectionPoint)) {
                connectionPos = polycyclicResult.vonBaeyerNumbering.get(connectionPoint)!;
              }
              
              substituentParts.push(`${connectionPos}-(${azacycleName})`);
              
              if (process.env.VERBOSE) {
                console.log(
                  `[buildRingSubstituentAlkylName] Found azacycle substituent at atom ${connectionPoint} → position ${connectionPos}: ${azacycleName}`,
                );
              }
            }
          }
        }
      }
      
      // Legacy nitrogen substituent detection (keep for compatibility)
      for (const atomId of ringAtomSet) {
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === "N") {
          // Find attached groups on nitrogen
          for (const bond of molecule.bonds) {
            if (bond.atom1 === atomId || bond.atom2 === atomId) {
              const otherAtomId =
                bond.atom1 === atomId ? bond.atom2 : bond.atom1;

              if (!ringAtomSet.has(otherAtomId)) {
                // This is an exocyclic attachment - could be part of an azacycle
                // For now, we'll note this for the final naming
                if (process.env.VERBOSE) {
                  console.log(
                    `[buildRingSubstituentAlkylName] N at ${atomId} has exocyclic attachment to ${otherAtomId}`,
                  );
                }
              }
            }
          }
        }
      }

      // Construct the final name
      let radicalName = polycyclicResult.name;

      // Add unsaturation if present
      if (unsaturationSuffix) {
        radicalName = radicalName + unsaturationSuffix;
      }

      // Add -yl suffix for radical
      radicalName = radicalName + "yl";

      // Add attachment position prefix (where the radical connects)
      if (attachmentAtomId !== null) {
        let attachmentPos = attachmentAtomId + 1; // Fallback
        if (
          polycyclicResult.vonBaeyerNumbering &&
          polycyclicResult.vonBaeyerNumbering.has(attachmentAtomId)
        ) {
          attachmentPos = polycyclicResult.vonBaeyerNumbering.get(
            attachmentAtomId,
          )!;
        }
        radicalName = `${attachmentPos}-${radicalName}`;
      }

      // Add substituents if present
      if (substituentParts.length > 0) {
        radicalName = `${substituentParts.join("-")}-${radicalName}`;
      }

      // Use square brackets for complex radicals
      radicalName = `[${radicalName}]`;

      if (process.env.VERBOSE) {
        console.log(
          "[buildRingSubstituentAlkylName] Final polycyclic radical name:",
          radicalName,
        );
      }

      return radicalName;
    }
  }

  const ring = ringsInAlkoxy[0]!;
  const chainCarbons = Array.from(alkoxyCarbonIds).filter(
    (id) => !ring.includes(id),
  );

  if (process.env.VERBOSE) {
    console.log("[buildRingSubstituentAlkylName] ring:", ring);
    console.log("[buildRingSubstituentAlkylName] chainCarbons:", chainCarbons);
  }

  if (chainCarbons.length === 0) {
    const ringSubInfo = nameRingSubstituent(ring, esterOxygenId, molecule);
    return ringSubInfo ? ringSubInfo.fullName : null;
  }

  let attachmentToRing: number | null = null;
  for (const bond of molecule.bonds) {
    const inRing1 = ring.includes(bond.atom1);
    const inRing2 = ring.includes(bond.atom2);
    const inChain1 = chainCarbons.includes(bond.atom1);
    const inChain2 = chainCarbons.includes(bond.atom2);

    if (inRing1 && inChain2) {
      attachmentToRing = bond.atom1;
      break;
    } else if (inRing2 && inChain1) {
      attachmentToRing = bond.atom2;
      break;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildRingSubstituentAlkylName] attachmentToRing:",
      attachmentToRing,
    );
  }

  if (!attachmentToRing) {
    return null;
  }

  // Find which carbon in the chain is attached to the ring
  let chainCarbonAttachedToRing: number | null = null;
  for (const bond of molecule.bonds) {
    const inRing1 = ring.includes(bond.atom1);
    const inRing2 = ring.includes(bond.atom2);
    const inChain1 = chainCarbons.includes(bond.atom1);
    const inChain2 = chainCarbons.includes(bond.atom2);

    if (inRing1 && inChain2) {
      chainCarbonAttachedToRing = bond.atom2;
      break;
    } else if (inRing2 && inChain1) {
      chainCarbonAttachedToRing = bond.atom1;
      break;
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildRingSubstituentAlkylName] chainCarbonAttachedToRing:",
      chainCarbonAttachedToRing,
    );
  }

  if (!chainCarbonAttachedToRing) {
    return null;
  }

  const ringSubInfo = nameRingSubstituent(
    ring,
    chainCarbonAttachedToRing,
    molecule,
  );
  if (!ringSubInfo) {
    return null;
  }

  const chainLength = chainCarbons.length;
  const alkylPrefixes = [
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
  const chainName =
    chainLength < alkylPrefixes.length
      ? alkylPrefixes[chainLength]
      : `C${chainLength}-alk`;

  if (process.env.VERBOSE) {
    console.log(
      "[buildRingSubstituentAlkylName] chainLength:",
      chainLength,
      "chainName:",
      chainName,
    );
  }

  // Determine the position of that carbon in the chain
  // If it's the alkoxyStartAtomId, it's position 1
  // Otherwise we need to find its position
  let chainPositionOnRing = 1;
  if (chainCarbonAttachedToRing === alkoxyStartAtomId) {
    chainPositionOnRing = 1;
  } else {
    // For now, assume simple case where position correlates with distance from start
    // This would need BFS to find the actual position for complex branched chains
    chainPositionOnRing = chainLength; // fallback
  }

  if (process.env.VERBOSE) {
    console.log(
      "[buildRingSubstituentAlkylName] chainPositionOnRing:",
      chainPositionOnRing,
    );
    console.log(
      "[buildRingSubstituentAlkylName] ringSubInfo.fullName:",
      ringSubInfo.fullName,
    );
    console.log(
      "[buildRingSubstituentAlkylName] result:",
      `${chainPositionOnRing}-(${ringSubInfo.fullName})${chainName}yl`,
    );
  }

  return `${chainPositionOnRing}-(${ringSubInfo.fullName})${chainName}yl`;
}
