/**
 * Blue Book Rule P-3: Substituents
 *
 * Reference: IUPAC Blue Book 2013, Section P-3
 * https://iupac.qmul.ac.uk/BlueBook/P3.html
 *
 * Description: Rules for substituent groups and prefixes in substitutive nomenclature.
 * This includes detection and naming of substituents attached to parent structures.
 */

import {
  ImmutableNamingContext,
  ExecutionPhase,
} from "../../immutable-context";
import type { ContextState } from "../../immutable-context";
import { RulePriority } from "../../types";
import type { IUPACRule } from "../../types";
import type { Atom, Molecule, Bond } from "types";
import { BondType } from "types";
import type { StructuralSubstituent as IUPACSubstituent } from "../../types";
import { getSimpleMultiplier } from "../../opsin-adapter";
import { getSharedOPSINService } from "../../opsin-service";

/**
 * Rule P-3.1: Heteroatom Parent Substituent Detection
 *
 * Detects and names substituents attached to heteroatom parent hydrides.
 * For example, in [SiH3]CH3, detects the methyl substituent on silane.
 */
export const P3_1_HETEROATOM_SUBSTITUENT_RULE: IUPACRule = {
  id: "P-3.1",
  name: "Heteroatom Parent Substituent Detection",
  description: "Detect substituents attached to heteroatom parent hydrides",
  blueBookReference: "P-3.1 - Substituent detection for heteroatom parents",
  priority: RulePriority.SIX, // was 140 - run after parent selection; use enum to keep ordering consistent
  conditions: (context: ImmutableNamingContext) => {
    const parentStructure = context.getState().parentStructure;
    if (process.env.VERBOSE) {
      console.log(
        "[P-3.1] Checking conditions: parentStructure=",
        parentStructure?.type,
      );
    }
    return parentStructure?.type === "heteroatom";
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const parentStructure = context.getState().parentStructure;

    if (process.env.VERBOSE) {
      console.log(
        "[P-3.1] Action running for heteroatom parent:",
        parentStructure,
      );
    }

    if (!parentStructure || parentStructure.type !== "heteroatom") {
      return context;
    }

    const heteroatom = parentStructure.heteroatom;
    const heteroatomIndex = molecule.atoms.indexOf(heteroatom!);

    // Find bonds connected to the heteroatom
    const connectedBonds = molecule.bonds.filter(
      (bond) =>
        bond.atom1 === heteroatomIndex || bond.atom2 === heteroatomIndex,
    );

    const substituents: IUPACSubstituent[] = [];

    for (const bond of connectedBonds) {
      const otherAtomIndex =
        bond.atom1 === heteroatomIndex ? bond.atom2 : bond.atom1;
      const otherAtom = molecule.atoms[otherAtomIndex];

      if (!otherAtom) continue;

      // Skip hydrogen atoms (they're part of the hydride)
      if (otherAtom.symbol === "H") continue;

      // Determine substituent name based on the attached atom/group
      const substituentName = getSubstituentName(
        otherAtom,
        molecule,
        heteroatomIndex,
      );

      if (substituentName) {
        if (process.env.VERBOSE) {
          console.log(
            `[P-3.1] Detected substituent on heteroatom: name=${substituentName}, atomIndex=${otherAtomIndex}, atom=${otherAtom.symbol}`,
          );
        }
        substituents.push({
          type: substituentName,
          atoms: [otherAtom], // Store Atom object, not index
          bonds: [], // No bonds for single atom substituent
          locant: 1, // Heteroatom parents use position 1
          isPrincipal: false,
          name: substituentName,
          position: "1", // Heteroatom parents don't use positional numbering
        });
      }
    }

    // Update parent structure with substituents
    const updatedParentStructure = {
      ...parentStructure,
      substituents: substituents,
    };

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        parentStructure: updatedParentStructure,
      }),
      "P-3.1",
      "Heteroatom Parent Substituent Detection",
      "P-3.1",
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${substituents.length} substituent(s) on heteroatom parent`,
    );
  },
};

/**
 * Helper function to determine substituent name from attached atom
 */
function getSubstituentName(
  attachedAtom: Atom,
  molecule: Molecule,
  fromIndex: number,
): string | null {
  if (!attachedAtom) return null;
  const symbol = attachedAtom.symbol;

  // Helper: get atom index robustly (accept atom object or numeric index)
  const getAtomIndex = (a: Atom) => {
    if (a === undefined || a === null) return -1;
    // Prefer atom.id if present
    const idx = molecule.atoms.findIndex((x: Atom) => x.id === a.id);
    return idx >= 0 ? idx : molecule.atoms.indexOf(a);
  };

  // Carbon-based substituents
  if (symbol === "C") {
    // Traverse the substituent chain starting from this carbon (use indices)
    const startIdx = getAtomIndex(attachedAtom);
    const chainIndices = traverseSubstituentChainByIndex(
      startIdx,
      molecule,
      fromIndex,
    );

    // If traversal produced no carbons, bail
    if (!chainIndices || chainIndices.length === 0) return null;

    // Single carbon substituents -> methyl/methylene/methine
    if (chainIndices.length === 1) {
      const firstIdx = chainIndices[0];
      if (typeof firstIdx !== "number") return null;
      const atom = molecule.atoms[firstIdx];
      if (!atom) return null;
      const hydrogens = atom.hydrogens || 0;
      switch (hydrogens) {
        case 3:
          return "methyl";
        case 2:
          return "methylene";
        case 1:
          return "methine";
        case 0:
          return "carbon";
        default:
          return null;
      }
    }

    // For simple linear alkyls, map by length
    const alkylNames: Record<number, string> = {
      2: "ethyl",
      3: "propyl",
      4: "butyl",
      5: "pentyl",
      6: "hexyl",
      7: "heptyl",
      8: "octyl",
      9: "nonyl",
      10: "decyl",
    };

    // Detect branching: if any carbon in chain has more than 2 carbon neighbors (excluding back to parent)
    let branched = false;
    for (const idx of chainIndices) {
      const carbonNeighbors = molecule.bonds
        .filter(
          (b: Bond) =>
            (b.atom1 === idx || b.atom2 === idx) && b.type === "single",
        )
        .map((b: Bond) => (b.atom1 === idx ? b.atom2 : b.atom1))
        .filter(
          (nid: number) =>
            molecule.atoms[nid]?.symbol === "C" && nid !== fromIndex,
        );
      if (carbonNeighbors.length > 2) {
        branched = true;
        break;
      }
    }

    if (!branched) {
      const candidate = alkylNames[chainIndices.length];
      if (candidate) return candidate;
    }

    // For branched or longer chains we currently return a generic 'alkyl' placeholder
    return "alkyl";
  }

  // Aromatic substituents
  if (symbol === "C" && attachedAtom.aromatic) {
    // Check if it's a phenyl group (benzene ring)
    const ringAtoms = findRingContainingAtom(attachedAtom, molecule);
    if (ringAtoms && ringAtoms.length === 6) {
      const allCarbon = ringAtoms.every((atom: Atom) => atom.symbol === "C");
      if (allCarbon) return "phenyl";
    }
  }

  // If the attached atom is nitrogen attached to an aromatic carbon, treat as anilino
  if (symbol === "N") {
    const nIdx = getAtomIndex(attachedAtom);
    for (const b of molecule.bonds) {
      if ((b.atom1 === nIdx || b.atom2 === nIdx) && b.type === "single") {
        const other = b.atom1 === nIdx ? b.atom2 : b.atom1;
        const otherAtom = molecule.atoms[other];
        if (otherAtom && otherAtom.symbol === "C" && otherAtom.aromatic) {
          return "anilino";
        }
      }
    }
  }

  // Other common substituents
  if (symbol === "F") return "fluoro";
  if (symbol === "Cl") return "chloro";
  if (symbol === "Br") return "bromo";
  if (symbol === "I") return "iodo";
  if (symbol === "O" && attachedAtom.hydrogens === 1) return "hydroxy";
  if (symbol === "N" && attachedAtom.hydrogens === 2) return "amino";

  // For now, return null for unrecognized substituents
  return null;
}

/**
 * Traverse a substituent chain starting from an attached atom
 */
/**
 * Traverse substituent chain starting from an atom index and return carbon atom indices
 */
function traverseSubstituentChainByIndex(
  startIndex: number,
  molecule: Molecule,
  excludeIndex: number,
): number[] {
  if (startIndex === undefined || startIndex < 0) return [];
  const visited = new Set<number>();
  const stack = [startIndex];

  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited.has(idx)) continue;
    const atom = molecule.atoms[idx];
    if (!atom || atom.symbol !== "C") continue;
    visited.add(idx);

    // push neighboring carbon atoms (single bonds), excluding the heteroatom index
    for (const b of molecule.bonds) {
      if (b.type !== BondType.SINGLE) continue;
      const other =
        b.atom1 === idx ? b.atom2 : b.atom2 === idx ? b.atom1 : undefined;
      if (other === undefined) continue;
      if (other === excludeIndex) continue;
      const otherAtom = molecule.atoms[other];
      if (otherAtom && otherAtom.symbol === "C" && !visited.has(other)) {
        stack.push(other);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Find ring containing a given atom
 */
function findRingContainingAtom(atom: Atom, molecule: Molecule): Atom[] | null {
  const atomIndex = molecule.atoms.indexOf(atom);

  // Simple ring detection - check if atom is in any ring
  if (molecule.rings) {
    for (const ring of molecule.rings) {
      if (ring.includes(atomIndex)) {
        return ring
          .map((i: number) => molecule.atoms[i])
          .filter((a): a is Atom => a !== undefined);
      }
    }
  }

  return null;
}

/**
 * Rule P-3.2: Ring Parent Substituent Detection
 *
 * Detects and names substituents attached to ring parent structures.
 * For example, in C1CCCCC1 with a methyl group, detects the methyl substituent on cyclohexane.
 */
export const P3_2_RING_SUBSTITUENT_RULE: IUPACRule = {
  id: "P-3.2",
  name: "Ring Parent Substituent Detection",
  description: "Detect substituents attached to ring parent structures",
  blueBookReference: "P-3.2 - Substituent detection for ring parents",
  priority: RulePriority.FIVE, // was 155 - should run after ring-numbering (RulePriority.TEN=100). use enum
  conditions: (context: ImmutableNamingContext) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure?.type === "ring";
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const parentStructure = context.getState().parentStructure;

    if (
      !parentStructure ||
      parentStructure.type !== "ring" ||
      !parentStructure.ring
    ) {
      return context;
    }

    const ring = parentStructure.ring;
    const ringAtomIds = new Set(ring.atoms.map((atom) => atom.id));
    const vonBaeyerNumbering = parentStructure.vonBaeyerNumbering;

    if (process.env.VERBOSE) {
      console.log(
        `[P-3.2] Ring atom IDs in order: [${ring.atoms.map((a) => a.id).join(", ")}]`,
      );
      if (vonBaeyerNumbering) {
        console.log(
          `[P-3.2] Using von Baeyer numbering:`,
          Array.from(vonBaeyerNumbering.entries()),
        );
      }
    }

    // IMPORTANT: If substituents are already detected (e.g., by ring-selection-complete),
    // check if they need refinement. Preserve properly named substituents like "methoxy"
    // (which getRingSubstituentName() doesn't handle), but re-analyze simple alkyl names
    // like "butyl" to detect branching (e.g., "2-methylpropyl").
    const existingSubstituents = parentStructure.substituents || [];

    if (process.env.VERBOSE) {
      console.log(
        `[P-3.2] Existing substituents: ${existingSubstituents.length}`,
        existingSubstituents.map(
          (s) =>
            `${s.name} at position ${"position" in s ? s.position : "locant" in s ? s.locant : "unknown"}`,
        ),
      );
      console.log(
        `[P-3.2] ringNumberingApplied: ${parentStructure.ringNumberingApplied}`,
      );
    }

    // If ring numbering has been applied, we MUST preserve the existing substituent positions
    // because they have been correctly remapped by the ring-numbering layer
    if (parentStructure.ringNumberingApplied) {
      if (process.env.VERBOSE) {
        console.log(
          `[P-3.2] Ring numbering already applied - preserving existing substituent positions`,
        );
      }
      return context; // No changes needed - positions are correct
    }

    // Only preserve substituents that are non-alkyl (e.g., alkoxy, halogen) or complex alkyl names
    // Simple alkyl names like "methyl", "ethyl", "propyl", "butyl", etc. should be re-analyzed
    const simpleAlkylNames =
      /^(methyl|ethyl|propyl|butyl|pentyl|hexyl|heptyl|octyl|nonyl|decyl)$/;
    const shouldPreserve =
      existingSubstituents.length > 0 &&
      existingSubstituents.every(
        (s) => s.type !== "alkyl" || !s.name || !simpleAlkylNames.test(s.name),
      );

    if (shouldPreserve) {
      if (process.env.VERBOSE) {
        console.log(
          `[P-3.2] Preserving existing non-alkyl or complex substituents`,
        );
      }
      return context; // No changes needed
    }

    if (existingSubstituents.length > 0 && process.env.VERBOSE) {
      console.log(
        `[P-3.2] Re-analyzing existing substituents to detect branching`,
      );
    }

    const substituents: IUPACSubstituent[] = [];

    for (const ringAtom of ring.atoms) {
      if (!ringAtom || typeof ringAtom.id !== "number") continue;

      // Find bonds from this ring atom to non-ring atoms
      const bonds = molecule.bonds.filter(
        (bond: Bond) =>
          bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id,
      );

      for (const bond of bonds) {
        const otherAtomId =
          bond.atom1 === ringAtom.id ? bond.atom2 : bond.atom1;
        if (!ringAtomIds.has(otherAtomId)) {
          // This is a substituent attached to the ring
          const substituentAtom = molecule.atoms[otherAtomId];
          if (substituentAtom && substituentAtom.symbol !== "H") {
            // Determine substituent type
            const substituentName = getRingSubstituentName(
              substituentAtom,
              molecule,
              ringAtom.id,
            );

            // Use von Baeyer numbering if available, otherwise use ring position
            let position: number;
            if (vonBaeyerNumbering && vonBaeyerNumbering.has(ringAtom.id)) {
              position = vonBaeyerNumbering.get(ringAtom.id)!;
              if (process.env.VERBOSE) {
                console.log(
                  `[P-3.2] Detected substituent: ${substituentName} at ringAtom.id=${ringAtom.id}, von Baeyer position=${position}`,
                );
              }
            } else {
              position = ring.atoms.indexOf(ringAtom) + 1; // 1-based position
              if (process.env.VERBOSE) {
                console.log(
                  `[P-3.2] Detected substituent: ${substituentName} at ringAtom.id=${ringAtom.id}, indexOf=${ring.atoms.indexOf(ringAtom)}, position=${position}`,
                );
              }
            }

            if (substituentName) {
              substituents.push({
                type: substituentName,
                atoms: [substituentAtom], // Store Atom object, not index
                bonds: [], // No bonds for single atom substituent
                locant: position,
                isPrincipal: false,
                name: substituentName,
                position: String(position), // Convert to string for IUPACSubstituent interface
                attachedToRingAtomId: ringAtom.id,
              });
            }
          }
        }
      }
    }

    // Update parent structure with substituents
    const updatedParentStructure = {
      ...parentStructure,
      substituents: substituents,
    };

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        parentStructure: updatedParentStructure,
      }),
      "P-3.2",
      "Ring Parent Substituent Detection",
      "P-3.2",
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${substituents.length} substituent(s) on ring parent`,
    );
  },
};

/**
 * Analyze substituent structure to detect branching and create systematic name
 */
interface SubstituentStructure {
  mainChain: number[];
  branches: Map<number, { atoms: number[]; substituents: string[] }>;
  attachmentPoint: number;
}

function analyzeSubstituentStructure(
  attachedAtomId: number,
  molecule: Molecule,
  fromRingAtomId: number,
): SubstituentStructure | null {
  // For substituents, we need to find the longest carbon chain
  // The chain can extend in both directions from the attachment atom
  // For example: CH3-C(I)(CH3)-C(ring) forms a propyl group with the attachment in the middle

  const findPathsFromAtom = (
    startId: number,
    excludeIds: Set<number>,
  ): number[][] => {
    const paths: number[][] = [];
    const stack: { currentId: number; path: number[]; visited: Set<number> }[] =
      [{ currentId: startId, path: [startId], visited: new Set([startId]) }];

    while (stack.length > 0) {
      const { currentId, path, visited: localVisited } = stack.pop()!;
      const currentAtom = molecule.atoms[currentId];

      if (!currentAtom || currentAtom.symbol !== "C") continue;

      const neighbors = molecule.bonds
        .filter((b: Bond) => b.atom1 === currentId || b.atom2 === currentId)
        .map((b: Bond) => (b.atom1 === currentId ? b.atom2 : b.atom1))
        .filter(
          (id: number) =>
            !excludeIds.has(id) &&
            !localVisited.has(id) &&
            molecule.atoms[id]?.symbol === "C",
        );

      if (neighbors.length === 0) {
        paths.push(path);
      } else {
        for (const neighborId of neighbors) {
          const newVisited = new Set(localVisited);
          newVisited.add(neighborId);
          stack.push({
            currentId: neighborId,
            path: [...path, neighborId],
            visited: newVisited,
          });
        }
      }
    }

    return paths;
  };

  // Find all paths from the attached atom (excluding the ring atom we came from)
  const pathsFromAttached = findPathsFromAtom(
    attachedAtomId,
    new Set([fromRingAtomId]),
  );

  // The longest chain should go through the attachment point
  // Find the two longest paths in opposite directions, then combine them
  let mainChain: number[];

  if (pathsFromAttached.length === 0) {
    // No carbon neighbors, just the attachment atom
    mainChain = [attachedAtomId];
  } else if (pathsFromAttached.length === 1) {
    // Linear chain in one direction
    mainChain = pathsFromAttached[0] || [attachedAtomId];
  } else {
    // Multiple branches - need to find longest chain through attachment point
    // Sort paths by length
    const sortedPaths = pathsFromAttached.sort((a, b) => b.length - a.length);

    // Take two longest paths
    const path1 = sortedPaths[0] || [attachedAtomId];
    const path2 = sortedPaths[1];

    if (!path2 || path2.length === 1) {
      // Only one real path
      mainChain = path1;
    } else {
      // Check if paths diverge immediately from attachment point (Case 1)
      // vs. sharing a common prefix before branching (Case 2)
      const path1Next = path1[1];
      const path2Next = path2[1];

      if (path1Next !== path2Next) {
        // Paths diverge immediately - combine them through attachment point
        // Example: [1,0] and [1,2] → [0,1,2]
        const reversedPath2 = [...path2].reverse();
        mainChain = [...reversedPath2.slice(0, -1), ...path1];
      } else {
        // Paths share a common prefix - they're branches, not opposite directions
        // Just use the longest path
        mainChain = path1;
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[SubstituentAnalysis] Paths from attached:`,
      pathsFromAttached,
    );
    console.log(`[SubstituentAnalysis] Main chain:`, mainChain);
  }

  // Find where the attachment point is in the main chain
  const attachmentIdx = mainChain.indexOf(attachedAtomId);

  // Find branches and substituents on each main chain atom
  const branches = new Map<
    number,
    { atoms: number[]; substituents: string[] }
  >();

  for (let i = 0; i < mainChain.length; i++) {
    const chainAtomId = mainChain[i];
    const prevAtomId = i > 0 ? mainChain[i - 1] : -1;
    const nextAtomId = i < mainChain.length - 1 ? mainChain[i + 1] : -1;

    const neighbors = molecule.bonds
      .filter((b: Bond) => b.atom1 === chainAtomId || b.atom2 === chainAtomId)
      .map((b: Bond) => (b.atom1 === chainAtomId ? b.atom2 : b.atom1))
      .filter(
        (id: number) =>
          id !== fromRingAtomId && id !== prevAtomId && id !== nextAtomId,
      );

    if (neighbors.length > 0) {
      const branchAtoms: number[] = [];
      const substituents: string[] = [];

      for (const neighborId of neighbors) {
        const neighborAtom = molecule.atoms[neighborId];
        if (!neighborAtom) continue;

        if (neighborAtom.symbol === "C") {
          branchAtoms.push(neighborId);
          substituents.push("methyl");
        } else if (neighborAtom.symbol === "I") {
          substituents.push("iodo");
        } else if (neighborAtom.symbol === "Br") {
          substituents.push("bromo");
        } else if (neighborAtom.symbol === "Cl") {
          substituents.push("chloro");
        } else if (neighborAtom.symbol === "F") {
          substituents.push("fluoro");
        } else if (
          neighborAtom.symbol === "O" &&
          neighborAtom.hydrogens === 1
        ) {
          substituents.push("hydroxy");
        } else if (
          neighborAtom.symbol === "N" &&
          neighborAtom.hydrogens === 2
        ) {
          substituents.push("amino");
        }
      }

      if (branchAtoms.length > 0 || substituents.length > 0) {
        branches.set(i, { atoms: branchAtoms, substituents });
      }
    }
  }

  return {
    mainChain,
    branches,
    attachmentPoint: attachmentIdx,
  };
}

/**
 * Get parent chain name based on carbon count
 */
function getParentChainName(carbonCount: number): string | null {
  const names = [
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
  if (carbonCount <= 0 || carbonCount > names.length) return null;
  const name = names[carbonCount - 1];
  return name || null;
}

/**
 * Helper function to detect and name common heterocyclic rings
 * Returns the heterocycle name with attachment locant (e.g., "furan-3-yl")
 */
function detectHeterocyclicRing(
  atomId: number,
  molecule: Molecule,
  fromAtomId: number,
): string | null {
  if (process.env.VERBOSE) {
    console.log(
      `[detectHeterocyclicRing] Checking atomId=${atomId}, fromAtomId=${fromAtomId}`,
    );
  }

  // Find which ring(s) contain this atom
  const rings = molecule.rings || [];
  const ringContainingAtom = rings.find((ring) => ring.includes(atomId));

  if (!ringContainingAtom) {
    if (process.env.VERBOSE) {
      console.log(`[detectHeterocyclicRing] Atom ${atomId} not in any ring`);
    }
    return null;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectHeterocyclicRing] Found ring containing atom ${atomId}: [${ringContainingAtom.join(",")}]`,
    );
  }

  const ringSize = ringContainingAtom.length;
  const ringAtoms = ringContainingAtom
    .map((id) => molecule.atoms[id])
    .filter((a): a is Atom => a !== undefined);

  if (ringAtoms.length !== ringSize) {
    if (process.env.VERBOSE) {
      console.log(
        `[detectHeterocyclicRing] Ring atom count mismatch: ${ringAtoms.length} vs ${ringSize}`,
      );
    }
    return null;
  }

  // Count heteroatoms
  const heteroAtoms = ringAtoms.filter((a) => a.symbol !== "C");
  const oxygenCount = heteroAtoms.filter((a) => a.symbol === "O").length;
  const nitrogenCount = heteroAtoms.filter((a) => a.symbol === "N").length;
  const sulfurCount = heteroAtoms.filter((a) => a.symbol === "S").length;

  // Check aromaticity
  const isAromatic = ringAtoms.some((a) => a.aromatic);

  if (process.env.VERBOSE) {
    console.log(
      `[detectHeterocyclicRing] Ring size=${ringSize}, O=${oxygenCount}, N=${nitrogenCount}, S=${sulfurCount}, aromatic=${isAromatic}`,
    );
  }

  let heterocycleName: string | null = null;

  // 5-membered aromatic rings
  if (ringSize === 5 && isAromatic) {
    if (oxygenCount === 1 && nitrogenCount === 0 && sulfurCount === 0) {
      heterocycleName = "furan";
    } else if (nitrogenCount === 1 && oxygenCount === 0 && sulfurCount === 0) {
      heterocycleName = "pyrrole";
    } else if (sulfurCount === 1 && oxygenCount === 0 && nitrogenCount === 0) {
      heterocycleName = "thiophene";
    } else if (nitrogenCount === 2 && oxygenCount === 0 && sulfurCount === 0) {
      // Could be imidazole or pyrazole - need more analysis
      heterocycleName = "imidazole"; // Default to imidazole for now
    }
  }

  // 6-membered aromatic rings
  if (ringSize === 6 && isAromatic) {
    if (nitrogenCount === 1 && oxygenCount === 0 && sulfurCount === 0) {
      heterocycleName = "pyridine";
    } else if (nitrogenCount === 2 && oxygenCount === 0 && sulfurCount === 0) {
      heterocycleName = "pyrimidine"; // or pyrazine/pyridazine - needs more analysis
    }
  }

  if (!heterocycleName) {
    if (process.env.VERBOSE) {
      console.log(`[detectHeterocyclicRing] No heterocycle name matched`);
    }
    return null;
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectHeterocyclicRing] Matched heterocycle: ${heterocycleName}`,
    );
  }

  // Determine attachment locant (position number in the ring)
  const attachmentIndex = ringContainingAtom.indexOf(atomId);
  if (attachmentIndex === -1) {
    return null;
  }

  // Number the ring to give the attachment point and heteroatoms the lowest locants
  // For simplicity, we'll number starting from the first heteroatom
  const heteroatomIndices = ringContainingAtom
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => {
      const atom = molecule.atoms[id];
      return atom && atom.symbol !== "C";
    })
    .map(({ idx }) => idx);

  let locant = attachmentIndex + 1; // Default 1-based numbering

  // If there's a heteroatom, renumber from it
  if (heteroatomIndices.length > 0) {
    const firstHeteroIndex = heteroatomIndices[0];
    if (firstHeteroIndex !== undefined) {
      // Try both directions from the heteroatom and choose the one giving lower locant
      const clockwise =
        ((attachmentIndex - firstHeteroIndex + ringSize) % ringSize) + 1;
      const counterclockwise =
        ((firstHeteroIndex - attachmentIndex + ringSize) % ringSize) + 1;

      // Choose the direction that gives the lower locant
      locant = Math.min(clockwise, counterclockwise);

      if (process.env.VERBOSE) {
        console.log(
          `[detectHeterocyclicRing] Heteroatom at index ${firstHeteroIndex}, attachment at ${attachmentIndex}`,
        );
        console.log(
          `[detectHeterocyclicRing] Clockwise=${clockwise}, Counterclockwise=${counterclockwise}, chosen=${locant}`,
        );
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[detectHeterocyclicRing] Returning: ${heterocycleName}-${locant}-yl`,
    );
  }
  return `${heterocycleName}-${locant}-yl`;
}

/**
 * Helper function to detect and name macrocyclic ring substituents
 * Handles large rings with heteroatoms (e.g., azacyclohexacos-1-yl)
 */
function detectMacrocyclicRingSubstituent(
  attachedAtomId: number,
  fromIndex: number,
  molecule: Molecule,
): string | null {
  // Find which ring(s) contain the attached atom
  const rings = molecule.rings || [];
  const containingRing = rings.find((ring) => ring.includes(attachedAtomId));

  if (!containingRing) {
    return null; // Not part of a ring
  }

  const ringSize = containingRing.length;

  if (process.env.VERBOSE) {
    console.log(
      `[detectMacrocyclicRingSubstituent] Found ring of size ${ringSize} containing atom ${attachedAtomId}`,
    );
  }

  // Count heteroatoms in the ring
  const heteroatomCounts: Record<string, number> = {};
  const heteroatomPositions: Map<string, number[]> = new Map();

  for (let i = 0; i < containingRing.length; i++) {
    const atomId = containingRing[i];
    if (atomId === undefined) continue;
    const atom = molecule.atoms[atomId];
    if (!atom) continue;

    if (atom.symbol !== "C") {
      heteroatomCounts[atom.symbol] = (heteroatomCounts[atom.symbol] || 0) + 1;
      if (!heteroatomPositions.has(atom.symbol)) {
        heteroatomPositions.set(atom.symbol, []);
      }
      heteroatomPositions.get(atom.symbol)?.push(i + 1); // 1-based position
    }
  }

  const totalHeteroatoms = Object.values(heteroatomCounts).reduce(
    (a, b) => a + b,
    0,
  );

  if (process.env.VERBOSE) {
    console.log(
      `[detectMacrocyclicRingSubstituent] Heteroatoms:`,
      heteroatomCounts,
      `Total: ${totalHeteroatoms}`,
    );
  }

  // Only handle simple cases: one heteroatom type
  if (totalHeteroatoms !== 1 || Object.keys(heteroatomCounts).length !== 1) {
    return null; // Complex heteroatom pattern - not supported yet
  }

  // Get the heteroatom type and its prefix
  const heteroSymbol = Object.keys(heteroatomCounts)[0];
  if (!heteroSymbol) return null;

  const heteroPrefix = getHeteroatomPrefix(heteroSymbol);
  if (!heteroPrefix) return null;

  // Get the multiplier for the ring size from OPSIN
  const opsinService = getSharedOPSINService();
  let sizePrefix: string;
  try {
    sizePrefix = opsinService.getMultiplicativePrefix(ringSize, "basic") || "";
  } catch {
    return null; // Ring size not supported
  }

  if (!sizePrefix) return null;

  // Check if the ring is saturated
  let _isSaturated = true;
  for (const bond of molecule.bonds) {
    const isInRing =
      containingRing.includes(bond.atom1) &&
      containingRing.includes(bond.atom2);
    if (isInRing && bond.type === "double") {
      _isSaturated = false;
      break;
    }
  }

  // Detect substituents on the ring (e.g., ketones, hydroxy groups)
  const ringSubstituents: Array<{ locant: number; name: string }> = [];

  for (let i = 0; i < containingRing.length; i++) {
    const atomId = containingRing[i];
    if (atomId === undefined) continue;
    const atom = molecule.atoms[atomId];
    if (!atom) continue;

    // Check for ketone (C=O)
    if (atom.symbol === "C") {
      for (const bond of molecule.bonds) {
        if (bond.type === "double") {
          const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
          if (bond.atom1 === atomId || bond.atom2 === atomId) {
            const otherAtom = molecule.atoms[otherAtomId];
            if (
              otherAtom?.symbol === "O" &&
              !containingRing.includes(otherAtomId)
            ) {
              // This is a ketone attached to the ring
              ringSubstituents.push({ locant: i + 1, name: "oxo" });
            }
          }
        }
      }
    }
  }

  // Find the attachment point (which carbon in the parent structure is bonded to this ring)
  let attachmentPosition = 1; // Default to position 1

  // The attachment point should be at the heteroatom (position 1 after reordering)
  const heteroatomIndex = containingRing.findIndex(
    (atomId) => atomId === attachedAtomId,
  );
  if (heteroatomIndex >= 0) {
    // Reorder ring so heteroatom is at position 1
    attachmentPosition = 1;
  }

  // Build the name
  // Format: [substituents-]aza-cyclo-[size]-[position]-yl
  // Example: 14-oxo-azacyclohexacos-1-yl
  // Note: For substituents, we use the base multiplier (hexacos), not alkane (hexacosan)

  let name = "";

  // Add substituents
  if (ringSubstituents.length > 0) {
    const substituentParts = ringSubstituents.map(
      (sub) => `${sub.locant}-${sub.name}`,
    );
    name += substituentParts.join(",") + "-";
  }

  // Add heteroatom prefix + cyclo + size (use multiplier directly, not alkane form)
  name += `${heteroPrefix}cyclo${sizePrefix}`;

  // Add attachment point (always include for clarity)
  name += `-${attachmentPosition}-yl`;

  if (process.env.VERBOSE) {
    console.log(`[detectMacrocyclicRingSubstituent] Generated name: ${name}`);
  }

  return name;
}

/**
 * Get heteroatom prefix for ring nomenclature
 */
function getHeteroatomPrefix(symbol: string): string | null {
  switch (symbol) {
    case "N":
      return "aza";
    case "O":
      return "oxa";
    case "S":
      return "thia";
    default:
      return null;
  }
}

/**
 * Helper function to determine substituent name for ring attachments
 */
function getRingSubstituentName(
  attachedAtom: Atom,
  molecule: Molecule,
  fromIndex: number,
): string | null {
  if (!attachedAtom) return null;

  const symbol = attachedAtom.symbol;
  const attachedAtomId = molecule.atoms.indexOf(attachedAtom);

  // Carbon-based substituents
  if (symbol === "C") {
    // First, check if this carbon is part of a heterocyclic ring
    const heterocycleName = detectHeterocyclicRing(
      attachedAtomId,
      molecule,
      fromIndex,
    );

    if (heterocycleName) {
      if (process.env.VERBOSE) {
        console.log(
          `[P-3.2] Detected heterocyclic ring substituent: ${heterocycleName}`,
        );
      }
      return heterocycleName;
    }

    // Analyze the substituent structure
    const structure = analyzeSubstituentStructure(
      attachedAtomId,
      molecule,
      fromIndex,
    );

    if (!structure) {
      if (process.env.VERBOSE) {
        console.log(`[P-3.2] Failed to analyze substituent structure`);
      }
      return null;
    }

    const chainLength = structure.mainChain.length;
    const hasBranches = structure.branches.size > 0;

    if (process.env.VERBOSE) {
      console.log(
        `[P-3.2] Substituent chain length: ${chainLength}, branches: ${structure.branches.size}`,
      );
    }

    // Simple unbranched substituents
    if (!hasBranches) {
      if (chainLength === 1) {
        const firstAtomId = structure.mainChain[0];
        if (firstAtomId === undefined) return null;
        const atom = molecule.atoms[firstAtomId];
        if (!atom) return null;
        const hydrogens = atom.hydrogens || 0;
        switch (hydrogens) {
          case 3:
            return "methyl";
          case 2:
            return "methylene";
          case 1:
            return "methine";
          case 0:
            return "carbon";
          default:
            return null;
        }
      } else {
        const baseName = getParentChainName(chainLength);
        return baseName ? `${baseName}yl` : null;
      }
    }

    // Branched substituents - need systematic naming
    const baseName = getParentChainName(chainLength);
    if (!baseName) return null;

    // Determine numbering: attachment point should get a low number
    // For substituents, number from the end that gives lowest locants to branches
    // But attachment point must be indicated

    // Calculate locants for each branch position based on numbering from position 0
    const locantMap = new Map<number, number>();
    for (let i = 0; i < chainLength; i++) {
      locantMap.set(i, i + 1); // 1-based numbering
    }

    // Build substituent list with locants
    const substituentParts: string[] = [];
    const sortedPositions = Array.from(structure.branches.keys()).sort(
      (a, b) => {
        const locantA = locantMap.get(a) || 0;
        const locantB = locantMap.get(b) || 0;
        return locantA - locantB;
      },
    );

    for (const position of sortedPositions) {
      const branch = structure.branches.get(position);
      if (!branch) continue;

      const locant = locantMap.get(position) || 1;

      // Count identical substituents at this position
      const substituentCounts = new Map<string, number>();
      for (const sub of branch.substituents) {
        substituentCounts.set(sub, (substituentCounts.get(sub) || 0) + 1);
      }

      // Format substituents with multipliers
      const sortedSubs = Array.from(substituentCounts.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      for (const [subName, count] of sortedSubs) {
        if (count > 1) {
          const multiplier = getSimpleMultiplier(
            count,
            getSharedOPSINService(),
          );
          substituentParts.push(`${locant},${locant}-${multiplier}${subName}`);
        } else {
          substituentParts.push(`${locant}-${subName}`);
        }
      }
    }

    // Combine parts: substituents + parent chain + attachment locant + "yl"
    if (substituentParts.length > 0) {
      const substituentPrefix = substituentParts.join("-");
      const attachmentLocant = locantMap.get(structure.attachmentPoint) || 1;

      // Omit locant if it's position 1 (terminal position) - use "propyl" not "propan-1-yl"
      if (attachmentLocant === 1) {
        return `(${substituentPrefix}${baseName}yl)`;
      } else {
        return `(${substituentPrefix}${baseName}an-${attachmentLocant}-yl)`;
      }
    }

    return `${baseName}yl`;
  }

  // Sulfur-based substituents (thioethers: R-S-)
  if (symbol === "S") {
    if (process.env.VERBOSE) {
      console.log(
        `[getSubstituentNameFromIndex] Sulfur at attachedAtomId=${attachedAtomId}, fromIndex=${fromIndex}`,
      );
    }
    // Find what the sulfur is bonded to (excluding the ring atom)
    const sulfurBonds = molecule.bonds.filter(
      (b: Bond) => b.atom1 === attachedAtomId || b.atom2 === attachedAtomId,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[getSubstituentNameFromIndex] Found ${sulfurBonds.length} sulfur bonds`,
      );
    }

    for (const bond of sulfurBonds) {
      const otherAtomId =
        bond.atom1 === attachedAtomId ? bond.atom2 : bond.atom1;

      // Skip the ring atom we came from
      if (otherAtomId === fromIndex) {
        if (process.env.VERBOSE) {
          console.log(
            `[getSubstituentNameFromIndex] Skipping otherAtomId=${otherAtomId} (same as fromIndex)`,
          );
        }
        continue;
      }

      const otherAtom = molecule.atoms[otherAtomId];
      if (!otherAtom) continue;

      if (process.env.VERBOSE) {
        console.log(
          `[getSubstituentNameFromIndex] Checking otherAtomId=${otherAtomId}, symbol=${otherAtom.symbol}, aromatic=${otherAtom.aromatic}`,
        );
      }

      // Check if sulfur is bonded to a carbon chain or aromatic ring
      if (otherAtom.symbol === "C") {
        // Check if the carbon is part of an aromatic ring (e.g., phenyl)
        if (otherAtom.aromatic) {
          if (process.env.VERBOSE) {
            console.log(
              `[getSubstituentNameFromIndex] Aromatic carbon detected! Looking for phenyl ring...`,
            );
          }
          // Find which ring contains this carbon
          const ringContainingCarbon = molecule.rings?.find((ring) =>
            ring.includes(otherAtomId),
          );

          if (ringContainingCarbon) {
            const ringSize = ringContainingCarbon.length;
            if (process.env.VERBOSE) {
              console.log(
                `[getSubstituentNameFromIndex] Found ring: size=${ringSize}, atoms=${ringContainingCarbon}`,
              );
            }
            // Check if it's a 6-membered aromatic ring (phenyl)
            if (ringSize === 6) {
              // Check if all atoms in ring are carbons (not heteroaromatic)
              const allCarbons = ringContainingCarbon.every(
                (atomId: number) => {
                  const atom = molecule.atoms[atomId];
                  return atom?.symbol === "C";
                },
              );

              if (process.env.VERBOSE) {
                console.log(
                  `[getSubstituentNameFromIndex] All carbons in ring: ${allCarbons}`,
                );
              }

              if (allCarbons) {
                if (process.env.VERBOSE) {
                  console.log(
                    `[getSubstituentNameFromIndex] ✓ RETURNING phenylsulfanyl`,
                  );
                }
                return "phenylsulfanyl";
              }
            }
          }
        }

        // Traverse the carbon chain attached to sulfur
        const chainIndices = traverseSubstituentChainByIndex(
          otherAtomId,
          molecule,
          attachedAtomId,
        );

        if (chainIndices.length === 1) {
          // Single carbon: methylsulfanyl, ethylsulfanyl, etc.
          const carbonIdx = chainIndices[0];
          if (carbonIdx === undefined) continue;
          const carbonAtom = molecule.atoms[carbonIdx];
          if (!carbonAtom) continue;

          const hydrogens = carbonAtom.hydrogens || 0;
          if (hydrogens === 3) {
            return "methylsulfanyl";
          } else if (hydrogens === 2) {
            return "methylidenesulfanyl";
          }
        } else if (chainIndices.length === 2) {
          return "ethylsulfanyl";
        } else if (chainIndices.length === 3) {
          // Check if it's branched (isopropyl) or linear (propyl)
          // For isopropyl: one carbon is bonded to two other carbons in the chain
          let isBranched = false;
          for (const carbonIdx of chainIndices) {
            let carbonBondCount = 0;
            for (const otherIdx of chainIndices) {
              if (carbonIdx === otherIdx) continue;
              // Check if there's a bond between carbonIdx and otherIdx
              for (const bond of molecule.bonds) {
                if (
                  (bond.atom1 === carbonIdx && bond.atom2 === otherIdx) ||
                  (bond.atom2 === carbonIdx && bond.atom1 === otherIdx)
                ) {
                  carbonBondCount++;
                  break;
                }
              }
            }
            // If this carbon is bonded to 2 other carbons in the chain, it's branched
            if (carbonBondCount === 2) {
              isBranched = true;
              break;
            }
          }

          if (isBranched) {
            return "propan-2-ylsulfanyl";
          } else {
            return "propylsulfanyl";
          }
        } else if (chainIndices.length > 0) {
          // For longer chains, use generic alkylsulfanyl
          const baseName = getParentChainName(chainIndices.length);
          return baseName ? `${baseName}ylsulfanyl` : "alkylsulfanyl";
        }
      }
    }

    // If no carbon chain found, return generic sulfanyl
    return "sulfanyl";
  }

  // Halogens
  if (symbol === "F") return "fluoro";
  if (symbol === "Cl") return "chloro";
  if (symbol === "Br") return "bromo";
  if (symbol === "I") return "iodo";

  // Other common substituents
  if (symbol === "O" && attachedAtom.hydrogens === 1) return "hydroxy";
  if (symbol === "N" && attachedAtom.hydrogens === 2) return "amino";

  // Check if the attached atom is part of a ring system (macrocycle or other ring)
  if (symbol === "N" || symbol === "O" || symbol === "S" || symbol === "C") {
    const ringSubstituentName = detectMacrocyclicRingSubstituent(
      attachedAtomId,
      fromIndex,
      molecule,
    );
    if (ringSubstituentName) {
      return ringSubstituentName;
    }
  }

  return null;
}

/**
 * Export all P-3 substituent rules
 */
export const P3_SUBSTITUENT_RULES: IUPACRule[] = [
  P3_1_HETEROATOM_SUBSTITUENT_RULE,
  P3_2_RING_SUBSTITUENT_RULE,
];
