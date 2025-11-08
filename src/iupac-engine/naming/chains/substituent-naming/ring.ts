import type { Molecule, Bond } from "types";
import type { NamingSubstituentInfo } from "../../iupac-types";

/**
 * Finds substituents attached to a ring (excluding the attachment point to parent chain).
 */
export function findRingSubstituents(
  molecule: Molecule,
  ring: readonly number[],
  excludeAtom: number,
): Array<{ atomIdx: number; ringPosition: number }> {
  const ringSet = new Set(ring);
  const substituents: Array<{ atomIdx: number; ringPosition: number }> = [];

  for (let i = 0; i < ring.length; i++) {
    const ringAtomIdx = ring[i]!;

    // Check all bonds from this ring atom
    for (const bond of molecule.bonds) {
      let attachedAtomIdx = -1;
      if (bond.atom1 === ringAtomIdx && !ringSet.has(bond.atom2)) {
        attachedAtomIdx = bond.atom2;
      } else if (bond.atom2 === ringAtomIdx && !ringSet.has(bond.atom1)) {
        attachedAtomIdx = bond.atom1;
      }

      // Skip if this is the attachment point to parent chain
      if (attachedAtomIdx >= 0 && attachedAtomIdx !== excludeAtom) {
        const attachedAtom = molecule.atoms[attachedAtomIdx];
        // Skip hydrogen atoms
        if (attachedAtom && attachedAtom.symbol !== "H") {
          substituents.push({
            atomIdx: attachedAtomIdx,
            ringPosition: i,
          });
        }
      }
    }
  }

  return substituents;
}

/**
 * Names a ring system as a substituent attached to the main chain.
 * Determines the ring type, the attachment position, and converts to substituent form (e.g., "thiazol-4-yl").
 * Recursively analyzes and names any substituents attached to the ring.
 */
export function nameRingSubstituent(
  molecule: Molecule,
  startAtomIdx: number,
  chainAtoms: Set<number>,
  depth = 0,
  maxDepth = 3,
): NamingSubstituentInfo | null {
  if (!molecule.rings) return null;

  // Prevent infinite recursion
  if (depth >= maxDepth) {
    if (process.env.VERBOSE) {
      console.log(
        `[nameRingSubstituent] Max depth ${maxDepth} reached, stopping recursion`,
      );
    }
    return null;
  }

  // Import aromatic naming function dynamically to avoid circular dependencies
  const {
    generateAromaticRingName,
    isRingAromatic,
  } = require("../../iupac-rings/aromatic-naming");

  // Find which ring(s) contain the starting atom
  const containingRings = molecule.rings.filter((ring) =>
    ring.includes(startAtomIdx),
  );
  if (containingRings.length === 0) return null;

  // For now, handle simple case: single ring attached to chain
  // TODO: Handle fused ring systems
  const ring = containingRings[0];
  if (!ring) return null;

  // Check if this ring is aromatic
  const aromatic = isRingAromatic(ring, molecule);

  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Ring:`, ring, `aromatic:`, aromatic);
  }

  // Get the base ring name (e.g., "thiazole", "benzene", "oxirane")
  let ringName: string;
  if (aromatic) {
    ringName = generateAromaticRingName(ring, molecule);
  } else {
    // For non-aromatic rings, use generateRingName to handle heterocycles properly
    const {
      generateRingName,
    } = require("../../../rules/ring-analysis-layer/helpers");

    // Build ring system object with atoms and bonds
    const ringAtoms = ring.map((idx: number) => molecule.atoms[idx]);
    const ringBonds = molecule.bonds.filter(
      (bond: Bond) => ring.includes(bond.atom1) && ring.includes(bond.atom2),
    );

    const ringSystem = {
      atoms: ringAtoms,
      bonds: ringBonds,
      size: ring.length,
      type: "aliphatic",
      rings: [ring],
    };

    ringName = generateRingName(ringSystem, molecule);
  }

  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Base ring name: ${ringName}`);
  }

  // Determine the attachment position in the ring
  // For heterocycles, we need IUPAC numbering starting from the most senior heteroatom
  const attachmentPosition = determineRingAttachmentPosition(
    ring,
    startAtomIdx,
    molecule,
    ringName,
  );

  if (process.env.VERBOSE) {
    console.log(
      `[nameRingSubstituent] Attachment atom: ${startAtomIdx}, position in ring: ${attachmentPosition}`,
    );
  }

  // Find any substituents attached to this ring (excluding the attachment point to main chain)
  // We need to find the atom in chainAtoms that connects to this ring
  let parentAtom = -1;
  let hasExocyclicDoubleBond = false;
  for (const bond of molecule.bonds) {
    if (
      (bond.atom1 === startAtomIdx && chainAtoms.has(bond.atom2)) ||
      (bond.atom2 === startAtomIdx && chainAtoms.has(bond.atom1))
    ) {
      parentAtom = bond.atom1 === startAtomIdx ? bond.atom2 : bond.atom1;
      // Check if this is a double bond (exocyclic)
      if (bond.type === "double") {
        hasExocyclicDoubleBond = true;
      }
      break;
    }
  }

  if (process.env.VERBOSE && hasExocyclicDoubleBond) {
    console.log(
      `[nameRingSubstituent] Detected exocyclic double bond from atom ${startAtomIdx}`,
    );
  }

  const ringSubstituents = findRingSubstituents(molecule, ring, parentAtom);

  if (process.env.VERBOSE) {
    console.log(
      `[nameRingSubstituent] Found ${ringSubstituents.length} substituents on ring`,
    );
  }

  // Recursively name each substituent attached to the ring
  const namedSubstituents: Array<{ locant: number; name: string }> = [];
  const ringSet = new Set(ring);

  // Import classifySubstituent from substituent-classification module
  const { classifySubstituent } = require("./substituent-classification");

  for (const sub of ringSubstituents) {
    // Recursively classify this substituent
    const subInfo = classifySubstituent(
      molecule,
      sub.atomIdx,
      ringSet,
      new Set(),
      depth + 1,
    );

    if (subInfo) {
      // Determine the IUPAC position number for this substituent on the ring
      const ringAtomIdx = ring[sub.ringPosition]!;
      const locant = determineRingAttachmentPosition(
        ring,
        ringAtomIdx,
        molecule,
        ringName,
      );

      if (process.env.VERBOSE) {
        console.log(
          `[nameRingSubstituent] Substituent at ring position ${sub.ringPosition} (IUPAC locant ${locant}): ${subInfo.name}`,
        );
      }

      namedSubstituents.push({ locant, name: subInfo.name });
    }
  }

  // Build the complete substituent name with nested substituents
  let fullName: string;

  if (namedSubstituents.length > 0) {
    // Sort substituents by locant
    namedSubstituents.sort((a, b) => a.locant - b.locant);

    // Separate ring substituents from simple substituents
    const _ringSubsts = namedSubstituents.filter((s) => s.name.includes("yl"));
    const _simpleSubsts = namedSubstituents.filter(
      (s) => !s.name.includes("yl"),
    );

    // Build substituent prefix
    // For ring substituents, use format: "locant-(substituent)"
    // For simple substituents, use format: "locant-substituent"
    const substParts: string[] = [];

    for (const sub of namedSubstituents) {
      if (sub.name.includes("yl")) {
        // Ring substituent - add parentheses
        substParts.push(`${sub.locant}-(${sub.name})`);
      } else {
        // Simple substituent
        substParts.push(`${sub.locant}-${sub.name}`);
      }
    }

    const subPrefix = substParts.join("-");

    // Build ring stem with proper numbering for heterocycles
    let ringStem = ringName;
    if (ringName.endsWith("ole")) {
      ringStem = ringName.slice(0, -1);
    } else if (ringName.endsWith("ine")) {
      ringStem = ringName.slice(0, -1);
    } else if (ringName.endsWith("ane")) {
      ringStem = ringName.slice(0, -1);
    } else if (ringName === "benzene") {
      ringStem = "phenyl";
    }

    // For heterocycles, we need to include heteroatom locants
    if (ringName === "thiazole") {
      // Format: "locant-(substituents)-1,3-thiazol-position-yl"
      // Find positions of N and S
      let nPos = -1,
        sPos = -1;
      for (let i = 0; i < ring.length; i++) {
        const atom = molecule.atoms[ring[i]!];
        if (atom?.symbol === "N") nPos = i;
        if (atom?.symbol === "S") sPos = i;
      }

      // Calculate their IUPAC positions
      const nIupacPos =
        nPos >= 0
          ? determineRingAttachmentPosition(
              ring,
              ring[nPos]!,
              molecule,
              ringName,
            )
          : 1;
      const sIupacPos =
        sPos >= 0
          ? determineRingAttachmentPosition(
              ring,
              ring[sPos]!,
              molecule,
              ringName,
            )
          : 3;

      // Build heteroatom locants: "1,3-" for N=1, S=3
      const heteroLocants = [nIupacPos, sIupacPos]
        .sort((a, b) => a - b)
        .join(",");

      fullName = `${subPrefix}-${heteroLocants}-${ringStem}-${attachmentPosition}-yl`;
    } else if (ringName === "benzene") {
      // Format: "locant-(substituents)phenyl"
      fullName = `${subPrefix}phenyl`;
    } else {
      // Generic format
      fullName = `${subPrefix}${ringStem}-${attachmentPosition}-yl`;
    }
  } else {
    // No substituents, use simple conversion
    fullName = convertRingNameToSubstituent(
      ringName,
      attachmentPosition,
      hasExocyclicDoubleBond,
    );
  }

  if (process.env.VERBOSE) {
    console.log(`[nameRingSubstituent] Final substituent name: ${fullName}`);
  }

  return {
    type: "ring",
    size: ring.length,
    name: fullName,
  };
}

/**
 * Determines the IUPAC position number for the attachment point in a ring.
 * For heterocycles, numbering starts from the most senior heteroatom.
 */
export function determineRingAttachmentPosition(
  ring: readonly number[],
  attachmentAtom: number,
  molecule: Molecule,
  ringName: string,
): number {
  const posInRing = ring.indexOf(attachmentAtom);
  if (posInRing === -1) return 1; // fallback

  if (process.env.VERBOSE) {
    console.log(`[determineRingAttachmentPosition] Ring: [${ring.join(", ")}]`);
    console.log(
      `[determineRingAttachmentPosition] Attachment atom: ${attachmentAtom}, posInRing: ${posInRing}`,
    );
  }

  // Diaziridine / diaziridin-3-one: 3-membered ring with 2 nitrogens
  // IUPAC numbering: N=1, N=2, C=3
  if (ringName === "diaziridine" || ringName === "diaziridin-3-one") {
    // Find positions of the two nitrogens in the ring
    const nPositions: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const atom = molecule.atoms[ring[i]!];
      if (atom?.symbol === "N") {
        nPositions.push(i);
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        `[determineRingAttachmentPosition] Diaziridine: N atoms at ring indices ${nPositions.join(", ")}`,
      );
    }

    if (nPositions.length === 2) {
      // IUPAC numbering: first N = 1, second N = 2, C = 3
      // Check which nitrogen or carbon this is
      if (posInRing === nPositions[0]) {
        // First nitrogen
        if (process.env.VERBOSE) {
          console.log(
            `[determineRingAttachmentPosition] Diaziridine: attachment is first N, IUPAC position = 1`,
          );
        }
        return 1;
      } else if (posInRing === nPositions[1]) {
        // Second nitrogen
        if (process.env.VERBOSE) {
          console.log(
            `[determineRingAttachmentPosition] Diaziridine: attachment is second N, IUPAC position = 2`,
          );
        }
        return 2;
      } else {
        // Carbon
        if (process.env.VERBOSE) {
          console.log(
            `[determineRingAttachmentPosition] Diaziridine: attachment is C, IUPAC position = 3`,
          );
        }
        return 3;
      }
    }
  }

  // For thiazole: N=1, C=2, S=3, C=4, C=5
  // Ring array is in traversal order, need to renumber based on heteroatom priority

  if (ringName === "thiazole") {
    // Find positions of N and S in the ring
    let nPos = -1,
      sPos = -1;
    for (let i = 0; i < ring.length; i++) {
      const atom = molecule.atoms[ring[i]!];
      if (atom?.symbol === "N") nPos = i;
      if (atom?.symbol === "S") sPos = i;
    }

    if (process.env.VERBOSE) {
      console.log(
        `[determineRingAttachmentPosition] N at ring index ${nPos}, S at ring index ${sPos}`,
      );
      for (let i = 0; i < ring.length; i++) {
        const atom = molecule.atoms[ring[i]!];
        console.log(
          `[determineRingAttachmentPosition]   Ring[${i}] = atom ${ring[i]} (${atom?.symbol})`,
        );
      }
    }

    if (nPos === -1 || sPos === -1) return posInRing + 1; // fallback

    // Calculate relative position from N
    const relativePos = (posInRing - nPos + ring.length) % ring.length;

    if (process.env.VERBOSE) {
      console.log(
        `[determineRingAttachmentPosition] relativePos from N: ${relativePos}`,
      );
    }

    // Map relative position to IUPAC number
    // Relative [0,1,2,3,4] = [N, next-C, next-next-C, next-next-next-C, S]
    // IUPAC    [1,4,2,5,3] based on heteroatom priority
    const _thiazoleMapping: { [key: number]: number } = {
      0: 1, // N
      1: 4, // C after N (attachment point in our case)
      2: 2, // C between N and S
      3: 5, // C after S
      4: 3, // S
    };

    // Actually, let me recalculate: the ring is traversed as [C-6, N-7, C-8, C-9, S-10]
    // With N at position 1, we go clockwise: N(1) → C(2) → S(3) → C(4) → C(5)
    // So from N: offset 0 = N = pos 1
    //           offset 1 = next C = pos 2
    //           offset 2 = next C = ?
    //           offset 3 = next C = ?
    //           offset 4 = S = pos 3

    // Let me check the bond structure to determine direction
    // For standard thiazole: N-C-S-C-C-N (cycle)
    // Numbering: N=1, C=2, S=3, C=4, C=5

    // From our ring [C-6, N-7, C-8, C-9, S-10]:
    // If we start from N(7) and go forward: N→C(8)→C(9)→S(10)→C(6)→back to N
    // So: N(7)=1, C(8)=2, C(9)=3?, S(10)=3, C(6)=5
    // Wait, S must be at position 3...

    // Let me recalculate based on proper thiazole numbering
    // Standard thiazole: N at 1, S at 3, two carbons between them
    // From N(index 1): forward to C(8) at index 2, then C(9) at index 3, then S(10) at index 4
    // This means: N→C→C→S→C
    // But standard thiazole is: N→C→S, not N→C→C→S

    // I need to check if we traverse N→C(8)→S or N→C(6)→S
    // Looking at bonds: N(7)-C(8), C(8)-C(9), C(9)-S(10), S(10)-C(6), C(6)-N(7)
    // So the ring is: C(6)-N(7)-C(8)-C(9)-S(10)-back to C(6)
    // Wait, that's 5 atoms, so it must be: C-N-C-C-S
    // For thiazole, between N and S we have either 1 or 2 carbons
    // With 2 carbons between N and S: N-C-C-S-C
    // IUPAC: N(1)-C(2)-S(3)-C(4)-C(5)

    // So mapping from ring index (relative to N):
    // Offset 0 (N) → 1
    // Offset 1 (C after N) → 2
    // Offset 2 (next C) → must be between N and S, checking bonds...

    // Actually, let me check bonds between N and S to count carbons
    // If relativePos=1 is C(8) and relativePos=3 is C(9), and relativePos=4 is S
    // Then N→C(8) is direct, but C(8)→S is not direct
    // So: N(1) → C(2)=pos1 → ? → S(3)=pos4
    // That means C(8) is the carbon at position 2
    // And between C(8) and S we have C(9)

    // Thiazole with 2 carbons between N and S... that's not standard
    // Standard thiazole has only 1 carbon between N and S
    // Let me verify the bonds...

    // For 5-membered thiazole ring: must be N-C-S-C-C (1,2,3,4,5)
    // Let's check which direction from N leads to S

    // Check if there's a C between N and S, or two Cs
    const _nAtomIdx = ring[nPos]!;
    const _sAtomIdx = ring[sPos]!;

    // Find carbon count between N and S in forward direction
    let carbonsForward = 0;
    for (let i = 1; i < ring.length - 1; i++) {
      const idx = (nPos + i) % ring.length;
      if (idx === sPos) break;
      const atom = molecule.atoms[ring[idx]!];
      if (atom?.symbol === "C") carbonsForward++;
    }

    if (process.env.VERBOSE) {
      console.log(
        `[determineRingAttachmentPosition] carbonsForward (N to S): ${carbonsForward}`,
      );
    }

    // For standard thiazole: N-C-S-C-C, so carbonsForward should be 1
    if (carbonsForward === 1) {
      // N(1) → C(2) → S(3) → C(4) → C(5) → back to N
      const mapping: { [key: number]: number } = {
        0: 1, // N
        1: 2, // C after N
        2: 4, // C after S (continuing around)
        3: 5, // next C
        4: 3, // S
      };
      if (process.env.VERBOSE) {
        console.log(
          `[determineRingAttachmentPosition] Using standard thiazole mapping (1 C between N and S)`,
        );
      }
      return mapping[relativePos] || relativePos + 1;
    }

    // If carbonsForward === 2, we have 2 carbons between N and S in one direction
    // This means the shorter path from N to S goes the other way with only 1 carbon
    // For ring [C-6, N-7, C-8, C-9, S-10]:
    //   Path 1: N(7) → C(8) → C(9) → S(10) = 2 carbons
    //   Path 2: N(7) → C(6) → S(10) = 1 carbon ← use this path
    // IUPAC numbering: N(7)[1] → C(6)[2] → S(10)[3] → C(9)[4] → C(8)[5]

    if (carbonsForward === 2) {
      // Mapping from relativePos (position in ring array relative to N) to IUPAC position
      // Ring array: [C-6, N-7, C-8, C-9, S-10] with N at index 1
      // IUPAC numbering: N(7)=1 → C(6)=2 (shorter path to S) → S(10)=3
      //                  Then continue from N through longer path: C(8)=4 → C(9)=5
      // relativePos 0: N(7) at index 1 → IUPAC position 1
      // relativePos 1: C(8) at index 2 → IUPAC position 4 (adjacent to N)
      // relativePos 2: C(9) at index 3 → IUPAC position 5 (adjacent to S)
      // relativePos 3: S(10) at index 4 → IUPAC position 3
      // relativePos 4: C(6) at index 0 (wrapping) → IUPAC position 2
      const mapping: { [key: number]: number } = {
        0: 1, // N(7) → position 1
        1: 4, // C(8) → position 4
        2: 5, // C(9) → position 5
        3: 3, // S(10) → position 3
        4: 2, // C(6) → position 2
      };
      if (process.env.VERBOSE) {
        console.log(
          `[determineRingAttachmentPosition] Using 2-carbon thiazole mapping (1 C in shorter path)`,
        );
        console.log(
          `[determineRingAttachmentPosition] Mapped position: ${mapping[relativePos]}`,
        );
      }
      return mapping[relativePos] || relativePos + 1;
    }

    // Fallback
    return relativePos + 1;
  }

  if (ringName === "benzene" || ringName === "phenyl") {
    // For benzene, we need to find the TRUE attachment point (where benzene connects to parent)
    // and number all positions relative to that point

    // Find the attachment point: the atom bonded to a ring system (not simple substituents)
    let attachmentIdx = -1;
    const ringSet = new Set(ring);

    // Look for atom bonded to another ring or to the main chain
    for (let i = 0; i < ring.length; i++) {
      const ringAtomIdx = ring[i]!;

      // Check if this atom has bonds outside the ring
      for (const bond of molecule.bonds) {
        const otherAtom =
          bond.atom1 === ringAtomIdx
            ? bond.atom2
            : bond.atom2 === ringAtomIdx
              ? bond.atom1
              : -1;
        if (otherAtom >= 0 && !ringSet.has(otherAtom)) {
          const otherAtomObj = molecule.atoms[otherAtom];
          // Ignore hydrogen atoms
          if (otherAtomObj && otherAtomObj.symbol !== "H") {
            // Check if this is the main attachment (bonded to another ring/chain, not a simple substituent)
            // Simple substituents are typically: OH, Cl, Br, F, etc.
            const isSimpleSubstituent =
              otherAtomObj.symbol === "O" ||
              otherAtomObj.symbol === "Cl" ||
              otherAtomObj.symbol === "Br" ||
              otherAtomObj.symbol === "F" ||
              otherAtomObj.symbol === "I";

            if (!isSimpleSubstituent) {
              // This is likely the main attachment point
              attachmentIdx = i;

              if (process.env.VERBOSE) {
                console.log(
                  `[determineRingAttachmentPosition] Found main attachment at ring index ${i} (atom ${ringAtomIdx}) bonded to atom ${otherAtom} (${otherAtomObj.symbol})`,
                );
              }
              break;
            }
          }
        }
      }
      if (attachmentIdx >= 0) break;
    }

    if (attachmentIdx === -1) {
      if (process.env.VERBOSE) {
        console.log(
          `[determineRingAttachmentPosition] No main attachment found, using fallback`,
        );
      }
      // Fallback if we can't find attachment point
      return posInRing + 1;
    }

    // Calculate position relative to attachment point
    // Attachment point is numbered 1, then we continue around the ring
    // Going in the direction that gives lowest substituent locants
    // For benzene, we go backwards through array indices: [5,4,3,2,1,0] if attachment is at 5

    const relativePos = (attachmentIdx - posInRing + ring.length) % ring.length;

    if (process.env.VERBOSE) {
      console.log(
        `[determineRingAttachmentPosition] attachmentIdx=${attachmentIdx}, posInRing=${posInRing}, relativePos=${relativePos}, IUPAC position=${relativePos + 1}`,
      );
    }

    return relativePos + 1;
  }

  // For heterocyclic rings (oxolane, thiolane, pyrrolidine, etc.), renumber starting from heteroatom
  // Per IUPAC: heteroatom should be at position 1
  const heteroatomRings = [
    "oxolane",
    "thiolane",
    "pyrrolidine",
    "oxane",
    "thiane",
    "piperidine",
  ];
  if (
    heteroatomRings.some(
      (name) =>
        ringName.includes(name) || ringName.startsWith(name.slice(0, -1)),
    )
  ) {
    // Find the heteroatom in the ring
    let heteroatomPos = -1;
    for (let i = 0; i < ring.length; i++) {
      const atom = molecule.atoms[ring[i]!];
      if (atom && atom.symbol !== "C" && atom.symbol !== "H") {
        heteroatomPos = i;
        break;
      }
    }

    if (heteroatomPos !== -1) {
      // Calculate position relative to heteroatom
      const relativePos =
        (posInRing - heteroatomPos + ring.length) % ring.length;

      if (process.env.VERBOSE) {
        console.log(
          `[determineRingAttachmentPosition] Heterocycle ${ringName}: heteroatom at ring index ${heteroatomPos}, attachment at ring index ${posInRing}, relative position = ${relativePos}, IUPAC position = ${relativePos + 1}`,
        );
      }

      return relativePos + 1;
    }
  }

  // For other rings, use simple sequential numbering (1-indexed)
  return posInRing + 1;
}

/**
 * Converts a ring name to substituent form with position.
 * Examples: "thiazole" + position 4 -> "thiazol-4-yl"
 *           "benzene" -> "phenyl"
 *           "cyclopropane" + exocyclic double bond -> "cyclopropylidene"
 */
export function convertRingNameToSubstituent(
  ringName: string,
  position: number,
  hasExocyclicDoubleBond = false,
): string {
  // Special case: benzene becomes phenyl (no position needed for monosubstituted)
  if (ringName === "benzene") {
    return "phenyl";
  }

  // For heterocycles ending in -ole, -ine, -ane, etc., convert to -yl form
  // thiazole -> thiazol-4-yl
  // pyridine -> pyridin-3-yl
  // furan -> furan-2-yl
  // cyclopropane + exocyclic double bond -> cyclopropylidene

  let stem = ringName;

  // If there's an exocyclic double bond, use -ylidene suffix instead of -yl
  if (hasExocyclicDoubleBond) {
    // For -ane rings: cyclopropane -> cyclopropyl -> cyclopropylidene
    if (ringName.endsWith("ane")) {
      stem = ringName.slice(0, -3) + "yl"; // "cyclohexane" -> "cyclohexyl"
    } else if (ringName.endsWith("ole")) {
      stem = ringName.slice(0, -1) + "yl"; // "thiazole" -> "thiazolyl"
    } else if (ringName.endsWith("ine")) {
      stem = ringName.slice(0, -1) + "yl"; // "pyridine" -> "pyridinyl"
    } else if (ringName.endsWith("ene")) {
      stem = ringName.slice(0, -1) + "yl"; // future: handle alkene rings
    }
    return `${stem}idene`;
  }

  // Remove common ring suffixes for regular -yl substituents
  if (ringName.endsWith("ole")) {
    stem = ringName.slice(0, -1); // "thiazole" -> "thiazol"
  } else if (ringName.endsWith("ine")) {
    stem = ringName.slice(0, -1); // "pyridine" -> "pyridin"
  } else if (ringName.endsWith("ane")) {
    stem = ringName.slice(0, -1); // "cyclohexane" -> "cyclohexan"
  } else if (ringName.endsWith("ene")) {
    stem = ringName.slice(0, -1); // "benzene" -> "benzen" (but benzene is handled above)
  }

  // Add position and -yl suffix
  return `${stem}-${position}-yl`;
}
