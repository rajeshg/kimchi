import type {
  IUPACRule,
  FunctionalGroup,
  StructuralSubstituent,
} from "../../types";
import type { Atom, Bond, Molecule } from "types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import { ExecutionPhase } from "../../immutable-context";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  findSubstituentsOnMonocyclicRing: _findSubstituentsOnMonocyclicRing,
  getHeterocyclicName: _getHeterocyclicName,
} = require("../../naming/iupac-rings");

/**
 * Rule: P-44.2 - Ring System Seniority
 *
 * Prefer ring systems over chains when applicable.
 */
export const P44_2_RING_SENIORITY_RULE: IUPACRule = {
  id: "P-44.2",
  name: "Ring System Seniority",
  description: "Prefer ring systems over chains when applicable",
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.TEN,
  conditions: (context) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      return false;
    }
    const rings = state.candidateRings;
    if (!rings || rings.length === 0) {
      return false;
    }

    // P-44.1.1: Count principal FGs on rings vs chains
    // Only defer to chain selection if chains have MORE FGs than rings
    const chains = state.candidateChains;
    const functionalGroups = state.functionalGroups || [];
    const principalFGs = functionalGroups.filter((fg) => fg.isPrincipal);

    if (
      chains &&
      chains.length > 0 &&
      rings &&
      rings.length > 0 &&
      principalFGs.length > 0
    ) {
      const molecule = state.molecule;

      // Count FGs on rings
      // IMPORTANT: Count FG as "on ring" if:
      // 1. Its attachment point is in the ring, OR
      // 2. It's attached to a ring atom (e.g., amine linking two rings)
      let ringFGCount = 0;
      const ringAtomIds = new Set<number>();
      for (const ring of rings) {
        for (const atom of ring.atoms) {
          ringAtomIds.add(atom.id);
        }
      }

      for (const fg of principalFGs) {
        const fgAtoms = fg.atoms || [];
        if (fgAtoms.length === 0) continue;

        // Get the attachment point (first atom in the FG)
        const attachmentAtom = fgAtoms[0];
        if (!attachmentAtom) continue;

        const attachmentAtomId = attachmentAtom.id;

        // Check if attachment point is in ring
        let isOnRing = ringAtomIds.has(attachmentAtomId);

        // If not directly in ring, check if it's attached to a ring atom
        if (!isOnRing) {
          // Check if the FG atom is bonded to any ring atom
          const bonds = molecule.bonds.filter(
            (b: Bond) =>
              b.atom1 === attachmentAtomId || b.atom2 === attachmentAtomId,
          );

          for (const bond of bonds) {
            const neighborId =
              bond.atom1 === attachmentAtomId ? bond.atom2 : bond.atom1;

            // Check if neighbor is in a ring
            if (ringAtomIds.has(neighborId)) {
              // Additional check: prefer heterocycles over carbocycles for amines
              // An amine connecting two rings should be counted with the heterocycle
              const neighborAtom = molecule.atoms.find(
                (a: Atom) => a.id === neighborId,
              );

              if (neighborAtom) {
                // Find which ring(s) contain this neighbor
                for (const ring of rings) {
                  const ringContainsNeighbor = ring.atoms.some(
                    (a: Atom) => a.id === neighborId,
                  );

                  if (ringContainsNeighbor) {
                    // Check if this ring is a heterocycle
                    const isHeterocycle = ring.atoms.some(
                      (a: Atom) => a.symbol !== "C" && a.symbol !== "H",
                    );

                    if (isHeterocycle) {
                      // Amine attached to heterocycle - count it with the heterocycle
                      isOnRing = true;
                      break;
                    }
                  }
                }

                // If no heterocycle found but attached to a ring, still count it
                if (!isOnRing) {
                  isOnRing = true;
                }
              }
              break;
            }
          }
        }

        if (isOnRing) {
          ringFGCount++;
        }
      }

      // Count FGs on chains
      // IMPORTANT: Only count FG as "on chain" if its ATTACHMENT POINT is in the chain
      // The attachment point is the first atom in fg.atoms (e.g., C=O carbon for amides/ketones)
      let chainFGCount = 0;
      for (const chain of chains) {
        const chainAtomIds = new Set(chain.atoms.map((a) => a.id));
        for (const fg of principalFGs) {
          const fgAtoms = fg.atoms || [];
          if (fgAtoms.length === 0) continue;

          // Get the attachment point (first atom in the FG)
          const attachmentAtom = fgAtoms[0];
          if (!attachmentAtom) continue;

          const attachmentAtomId = attachmentAtom.id;

          // Check if attachment point is in chain
          if (chainAtomIds.has(attachmentAtomId)) {
            chainFGCount++;
            break; // Count each FG only once per chain
          }
        }
      }

      if (process.env.VERBOSE) {
        console.log(
          `[P-44.2 conditions] FG count: ring=${ringFGCount}, chain=${chainFGCount}`,
        );
      }

      // P-44.1.1: If chains have MORE FGs than rings, defer to chain selection
      if (chainFGCount > ringFGCount) {
        if (process.env.VERBOSE) {
          console.log(
            `[P-44.2 conditions] Chains have more FGs (${chainFGCount} > ${ringFGCount}) - deferring to chain selection per P-44.1.1`,
          );
        }
        return false;
      }

      // P-44.1.2.2: Rings have priority when FG counts are equal or rings have more
      if (process.env.VERBOSE) {
        console.log(
          `[P-44.2 conditions] Ring has priority (ring FGs=${ringFGCount}, chain FGs=${chainFGCount}) per P-44.1.2.2`,
        );
      }
    }

    return true;
  },
  action: (context) => {
    const state = context.getState();
    const rings = state.candidateRings;
    if (!rings || rings.length === 0) return context;

    const molecule = (state as { molecule: Molecule }).molecule;
    const functionalGroups =
      (state as { functionalGroups: FunctionalGroup[] }).functionalGroups || [];

    // Get principal functional groups (highest priority groups like carboxylic acids, ketones, etc.)
    const principalFGs = functionalGroups.filter(
      (fg: FunctionalGroup) => fg.isPrincipal,
    );

    // For each ring, count how many principal functional groups are attached
    const ringFGScores = rings.map((ring) => {
      const ringAtomIds = new Set(ring.atoms.map((a: Atom) => a.id));

      let fgCount = 0;
      let highestPriority = Infinity;

      for (const fg of principalFGs) {
        // Check if any FG atom is in the ring
        const fgInRing = (fg.atoms || []).some((atom: Atom) =>
          ringAtomIds.has(atom.id),
        );

        // Check if any FG atom is bonded to a ring atom
        let fgAttachedToRing = false;
        if (!fgInRing && molecule) {
          for (const fgAtom of fg.atoms || []) {
            const bonds = molecule.bonds.filter(
              (b: Bond) => b.atom1 === fgAtom.id || b.atom2 === fgAtom.id,
            );

            for (const bond of bonds) {
              const neighborId =
                bond.atom1 === fgAtom.id ? bond.atom2 : bond.atom1;
              if (ringAtomIds.has(neighborId)) {
                fgAttachedToRing = true;
                break;
              }
            }
            if (fgAttachedToRing) break;
          }
        }

        if (fgInRing || fgAttachedToRing) {
          fgCount++;
          // Track highest priority (lowest number = highest priority)
          if (fg.priority < highestPriority) {
            highestPriority = fg.priority;
          }
        }
      }

      return { ring, fgCount, highestPriority, size: ring.atoms.length };
    });

    // Sort rings by:
    // 1. Number of functional groups (descending)
    // 2. Priority of highest functional group (ascending - lower number = higher priority)
    // 3. Ring size (descending)
    ringFGScores.sort((a, b) => {
      if (a.fgCount !== b.fgCount) return b.fgCount - a.fgCount;
      if (a.highestPriority !== b.highestPriority)
        return a.highestPriority - b.highestPriority;
      return b.size - a.size;
    });

    const ring = ringFGScores[0]?.ring;
    if (!ring) return context;
    const size = ring.atoms ? ring.atoms.length : ring.size || 0;
    const type =
      ring.type ||
      (ring.atoms && ring.atoms.some((a: Atom) => a.aromatic)
        ? "aromatic"
        : "aliphatic");

    // Check for heterocyclic name first
    let name = "";
    const mol = (context.getState() as { molecule: Molecule }).molecule;
    if (ring && ring.atoms && mol) {
      const atomIndices = ring.atoms.map((a: Atom) => a.id);
      const heterocyclicName = _getHeterocyclicName(atomIndices, mol);
      if (heterocyclicName) {
        name = heterocyclicName;
        if (process.env.VERBOSE) {
          console.log("[P-44.2] Using heterocyclic name:", name);
        }
      }
    }

    // Fallback to generic names if no heterocyclic name found
    if (!name) {
      if (type === "aromatic") {
        const aromaticNames: { [key: number]: string } = {
          6: "benzene",
          5: "cyclopentadiene",
          7: "cycloheptatriene",
        };
        name = aromaticNames[size] || `aromatic-${size}-membered`;
      } else {
        const ringNames: { [key: number]: string } = {
          3: "cyclopropane",
          4: "cyclobutane",
          5: "cyclopentane",
          6: "cyclohexane",
          7: "cycloheptane",
          8: "cyclooctane",
        };
        name = ringNames[size] || `cyclo${size}ane`;
      }
    }
    const locants = ring.atoms
      ? ring.atoms.map((_: Atom, idx: number) => idx + 1)
      : [];
    // Try to find substituents on the ring atoms so substituted ring names can be produced
    let substituents: StructuralSubstituent[] = [];
    try {
      const mol = (context.getState() as { molecule: Molecule }).molecule;
      if (ring && ring.atoms && mol) {
        const atomIds = ring.atoms.map((a: Atom) => a.id);
        if (process.env.VERBOSE) {
          console.log(
            "[P-44.2] Finding substituents on ring with atom IDs:",
            atomIds,
          );
        }
        substituents =
          (_findSubstituentsOnMonocyclicRing(
            atomIds,
            mol,
          ) as StructuralSubstituent[]) || [];
        if (process.env.VERBOSE) {
          console.log("[P-44.2] Found substituents:", substituents);
        }
      }
    } catch (_e) {
      substituents = [];
    }

    const parentStructure = {
      type: "ring" as const,
      ring,
      name,
      locants,
      substituents,
    };
    return context.withParentStructure(
      parentStructure,
      "P-44.2",
      "Ring System Seniority",
      BLUE_BOOK_RULES.P44_2,
      ExecutionPhase.PARENT_STRUCTURE,
      "Selected largest ring system as parent structure",
    );
  },
};
