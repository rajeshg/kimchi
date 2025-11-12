import type { Atom, Molecule, Bond } from "../../../../types";
import type { IUPACRule, FunctionalGroup } from "../../types";
import { RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase, NomenclatureMethod } from "../../immutable-context";
import { normalizePriority, isCarbonyl, getCarbonFromCarbonyl } from "./utils";
import { selectPrincipalGroup } from "./priority-selection";

// Type exports
export type AlkoxyGroupInfo = {
  carbonylCarbon: Atom;
  esterOxygen: Atom;
  alkoxyCarbon: Atom | undefined;
  alkyl: string | undefined;
};

export type HierarchyAnalysis = {
  isHierarchical: boolean;
  primaryEsterAtoms?: number[];
};



/**
 * Analyze ester connectivity to detect hierarchical vs symmetric diesters
 *
 * Hierarchical ester: One ester's alkyl group contains another ester
 *   Example: CCCC(=O)OCC(OCC)OC(=O)CCC
 *   Structure: R-C(=O)-O-[alkyl group containing another ester]
 *   Named as: (2-butanoyloxy-2-ethoxyethyl)butanoate (monoester with complex alkyl)
 *
 * Symmetric diester: Two independent ester groups
 *   Example: CH3OC(=O)CC(=O)OCH3
 *   Structure: R1-O-C(=O)-R-C(=O)-O-R2
 *   Named as: dimethyl butanedioate
 *
 * Returns: { isHierarchical: boolean, primaryEsterAtoms?: number[] }
 */
export function analyzeEsterHierarchy(
  context: ImmutableNamingContext,
  esters: FunctionalGroup[],
): {
  isHierarchical: boolean;
  primaryEsterAtoms?: number[];
} {
  if (esters.length < 2) {
    return { isHierarchical: false };
  }

  const mol = context.getState().molecule;

  if (process.env.VERBOSE) {
    console.log(
      "[analyzeEsterHierarchy] Starting analysis with",
      esters.length,
      "esters",
    );
  }

  // For each ester, identify:
  // - carbonylCarbon: C in C(=O)O
  // - esterOxygen: O in C(=O)-O-C
  // - alkoxyCarbon: first C in C(=O)-O-C

  const esterStructures = esters
    .map((ester, idx) => {
      if (process.env.VERBOSE) {
        console.log(`[analyzeEsterHierarchy] Analyzing ester ${idx}:`, ester);
        if (process.env.VERBOSE) {
          console.log(
            `[analyzeEsterHierarchy] Ester atoms type:`,
            typeof ester.atoms,
            Array.isArray(ester.atoms),
          );
        }
        if (Array.isArray(ester.atoms)) {
          if (process.env.VERBOSE) {
            console.log(`[analyzeEsterHierarchy] First atom:`, ester.atoms[0]);
          }
        }
      }
      // ester.atoms might be an array of atom IDs (numbers) or Atom objects
      // Let's handle both cases
      const esterAtomIds = new Set(
        ester.atoms.map((a) => (typeof a === "number" ? a : (a?.id ?? -1))),
      );
      if (process.env.VERBOSE) {
        console.log(
          `[analyzeEsterHierarchy] Ester ${idx} atom IDs:`,
          Array.from(esterAtomIds),
        );
      }
      let carbonylCarbon: number | undefined;
      let carbonylOxygen: number | undefined;
      let esterOxygen: number | undefined;
      let alkoxyCarbon: number | undefined;

      // Find C=O bond
      for (const bond of mol.bonds) {
        if (bond.type === "double") {
          const atom1 = mol.atoms[bond.atom1];
          const atom2 = mol.atoms[bond.atom2];

          if (
            atom1?.symbol === "C" &&
            atom2?.symbol === "O" &&
            esterAtomIds.has(bond.atom1)
          ) {
            carbonylCarbon = bond.atom1;
            carbonylOxygen = bond.atom2;
            break;
          } else if (
            atom1?.symbol === "O" &&
            atom2?.symbol === "C" &&
            esterAtomIds.has(bond.atom2)
          ) {
            carbonylCarbon = bond.atom2;
            carbonylOxygen = bond.atom1;
            break;
          }
        }
      }

      if (!carbonylCarbon) return null;

      // Find C-O-C bond (ester linkage)
      for (const bond of mol.bonds) {
        if (bond.type === "single") {
          const atom1 = mol.atoms[bond.atom1];
          const atom2 = mol.atoms[bond.atom2];

          if (
            bond.atom1 === carbonylCarbon &&
            atom1?.symbol === "C" &&
            atom2?.symbol === "O"
          ) {
            esterOxygen = bond.atom2;
          } else if (
            bond.atom2 === carbonylCarbon &&
            atom2?.symbol === "C" &&
            atom1?.symbol === "O"
          ) {
            esterOxygen = bond.atom1;
          }
        }
      }

      if (!esterOxygen) return null;

      // Find alkoxy carbon
      for (const bond of mol.bonds) {
        if (bond.type === "single") {
          const atom1 = mol.atoms[bond.atom1];
          const atom2 = mol.atoms[bond.atom2];

          if (
            bond.atom1 === esterOxygen &&
            atom2?.symbol === "C" &&
            bond.atom2 !== carbonylCarbon
          ) {
            alkoxyCarbon = bond.atom2;
            break;
          } else if (
            bond.atom2 === esterOxygen &&
            atom1?.symbol === "C" &&
            bond.atom1 !== carbonylCarbon
          ) {
            alkoxyCarbon = bond.atom1;
            break;
          }
        }
      }

      if (!alkoxyCarbon) return null;

      return {
        carbonylCarbon,
        carbonylOxygen,
        esterOxygen,
        alkoxyCarbon,
        esterAtomIds,
      };
    })
    .filter((s) => s !== null);

  if (esterStructures.length < 2) {
    return { isHierarchical: false };
  }

  // Check if any ester's alkyl group contains another ester's carbonyl carbon
  // We need to traverse from alkoxyCarbon and see if we reach another ester's carbonyl

  for (let i = 0; i < esterStructures.length; i++) {
    const ester1 = esterStructures[i];
    if (!ester1) continue;

    // Traverse the alkyl group starting from ester1's alkoxyCarbon
    const visited = new Set<number>();
    const queue = [ester1.alkoxyCarbon];
    const alkylGroupAtoms = new Set<number>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      alkylGroupAtoms.add(currentId);

      // Find all neighbors
      for (const bond of mol.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;

          // Don't go back through the ester oxygen
          if (otherId === ester1.esterOxygen) continue;

          if (!visited.has(otherId)) {
            queue.push(otherId);
          }
        }
      }
    }

    // Check if any other ester's carbonyl carbon is in this alkyl group
    for (let j = 0; j < esterStructures.length; j++) {
      if (i === j) continue;
      const ester2 = esterStructures[j];
      if (!ester2) continue;

      if (alkylGroupAtoms.has(ester2.carbonylCarbon)) {
        if (process.env.VERBOSE) {
          console.log(
            `[analyzeEsterHierarchy] Hierarchical ester detected: ester at atom ${ester2.carbonylCarbon} is nested in alkyl group of ester at atom ${ester1.carbonylCarbon}`,
          );
        }
        // ester1 is the primary ester, ester2 is nested in its alkyl group
        return {
          isHierarchical: true,
          primaryEsterAtoms: [ester1.carbonylCarbon, ester1.esterOxygen],
        };
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      "[analyzeEsterHierarchy] No hierarchical relationship found - independent diesters",
    );
  }

  return { isHierarchical: false };
}

/**
 * Check if an ester group is part of a ring (lactone)
 * A lactone has both the carbonyl carbon and ester oxygen in the ring
 *
 * For esters detected by OPSIN, esterGroup.atoms contains:
 * [carbonyl C id, carbonyl O id, ester O id] (3 atom IDs as numbers)
 */
export function isEsterInRing(mol: Molecule, esters: FunctionalGroup[]): boolean {
  // First detect all rings in the molecule
  const rings = findAllRings(mol);
  if (rings.length === 0) return false;

  // For each ester, check if both carbonyl C and ester O are in the same ring
  for (const ester of esters) {
    if (!ester.atoms || ester.atoms.length < 3) continue;

    // OPSIN returns atoms as numbers: [carbonyl C id, carbonyl O id, ester O id]
    const carbonylCarbon = ester.atoms[0] as unknown as number;
    const esterOxygen = ester.atoms[2] as unknown as number;

    if (process.env.VERBOSE) {
      console.log(
        "[isEsterInRing] Checking ester: carbonylC=",
        carbonylCarbon,
        "esterO=",
        esterOxygen,
      );
    }

    // Check if both atoms are in the same ring
    for (const ring of rings) {
      const inRing =
        ring.includes(carbonylCarbon) && ring.includes(esterOxygen);
      if (inRing) {
        if (process.env.VERBOSE) {
          console.log(
            "[isEsterInRing] Lactone detected: ester atoms",
            [carbonylCarbon, esterOxygen],
            "in ring",
            ring,
          );
        }
        return true;
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log("[isEsterInRing] Not a lactone: ester not in any ring");
  }
  return false;
}

/**
 * Find all rings in a molecule using DFS cycle detection
 * Returns array of rings, where each ring is an array of atom IDs
 */
function findAllRings(mol: Molecule): number[][] {
  const adj = new Map<number, number[]>();
  for (const atom of mol.atoms) {
    adj.set(atom.id, []);
  }

  for (const bond of mol.bonds) {
    const neighbors1 = adj.get(bond.atom1);
    const neighbors2 = adj.get(bond.atom2);
    if (neighbors1) neighbors1.push(bond.atom2);
    if (neighbors2) neighbors2.push(bond.atom1);
  }

  const rings: number[][] = [];
  const visited = new Set<number>();

  function findRingDFS(atomId: number, parent: number, path: number[]): void {
    visited.add(atomId);
    path.push(atomId);

    const neighbors = adj.get(atomId) || [];
    for (const neighborId of neighbors) {
      if (neighborId === parent) continue;

      const cycleStart = path.indexOf(neighborId);
      if (cycleStart >= 0) {
        // Found a cycle
        const ring = path.slice(cycleStart);
        rings.push(ring);
      } else if (!visited.has(neighborId)) {
        findRingDFS(neighborId, atomId, path);
      }
    }

    path.pop();
  }

  for (const atom of mol.atoms) {
    if (!visited.has(atom.id)) {
      findRingDFS(atom.id, -1, []);
    }
  }

  return rings;
}

/**
 * Inspect the alkoxy side of an ester functional group
 * Returns information about the alkoxy group: set of carbon atom IDs, whether chain is branched,
 * and whether any other functional groups are attached to the alkoxy carbons.
 */
export function getAlkoxyGroupInfo(
  context: ImmutableNamingContext,
  ester: FunctionalGroup,
) {
  const mol = context.getState().molecule;
  const esterAtomIds = (ester.atoms || []).map((a: Atom | number) =>
    typeof a === "number" ? a : (a?.id ?? -1),
  );

  // Find carbonyl carbon
  let carbonylCarbon: number | undefined;
  for (const bond of mol.bonds) {
    if (bond.type === "double") {
      const a1 = mol.atoms[bond.atom1];
      const a2 = mol.atoms[bond.atom2];
      if (
        a1?.symbol === "C" &&
        a2?.symbol === "O" &&
        esterAtomIds.includes(bond.atom1)
      ) {
        carbonylCarbon = bond.atom1;
        break;
      }
      if (
        a2?.symbol === "C" &&
        a1?.symbol === "O" &&
        esterAtomIds.includes(bond.atom2)
      ) {
        carbonylCarbon = bond.atom2;
        break;
      }
    }
  }
  if (!carbonylCarbon)
    return {
      alkoxyCarbonIds: new Set<number>(),
      chainLength: 0,
      branched: false,
      hasAttachedFG: false,
    };

  // find ester oxygen bonded to carbonyl carbon
  let esterOxygen: number | undefined;
  for (const bond of mol.bonds) {
    if (bond.type === "single") {
      if (
        bond.atom1 === carbonylCarbon &&
        mol.atoms[bond.atom2]?.symbol === "O"
      ) {
        esterOxygen = bond.atom2;
        break;
      } else if (
        bond.atom2 === carbonylCarbon &&
        mol.atoms[bond.atom1]?.symbol === "O"
      ) {
        esterOxygen = bond.atom1;
        break;
      }
    }
  }
  if (!esterOxygen)
    return {
      alkoxyCarbonIds: new Set<number>(),
      chainLength: 0,
      branched: false,
      hasAttachedFG: false,
    };

  // find the alkoxy carbon (carbon bonded to ester oxygen, not the carbonyl carbon)
  let alkoxyCarbon: number | undefined;
  for (const bond of mol.bonds) {
    if (bond.type === "single") {
      if (
        bond.atom1 === esterOxygen &&
        mol.atoms[bond.atom2]?.symbol === "C" &&
        bond.atom2 !== carbonylCarbon
      ) {
        alkoxyCarbon = bond.atom2;
        break;
      } else if (
        bond.atom2 === esterOxygen &&
        mol.atoms[bond.atom1]?.symbol === "C" &&
        bond.atom1 !== carbonylCarbon
      ) {
        alkoxyCarbon = bond.atom1;
        break;
      }
    }
  }
  if (!alkoxyCarbon)
    return {
      alkoxyCarbonIds: new Set<number>(),
      chainLength: 0,
      branched: false,
      hasAttachedFG: false,
    };

  // BFS from alkoxyCarbon to collect connected alkoxy carbons (do not cross ester oxygen)
  const visited = new Set<number>();
  const queue = [alkoxyCarbon];
  const alkoxyCarbonIds = new Set<number>();
  let branched = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    alkoxyCarbonIds.add(cur);

    // find single-bonded carbon neighbors excluding the ester oxygen and the carbonyl region
    const neighborCarbons: number[] = [];
    for (const b of mol.bonds) {
      if (b.type !== "single") continue;
      if (b.atom1 === cur && mol.atoms[b.atom2]?.symbol === "C")
        neighborCarbons.push(b.atom2);
      if (b.atom2 === cur && mol.atoms[b.atom1]?.symbol === "C")
        neighborCarbons.push(b.atom1);
    }

    // Exclude going back through the ester oxygen
    const filtered = neighborCarbons.filter((n) => n !== esterOxygen);

    // Determine side-branches (neighbors that are not part of the main alkoxy carbon set)
    const sideBranches = filtered.filter((n) => !alkoxyCarbonIds.has(n));

    if (sideBranches.length > 0) {
      // If side branches exist, check whether they are *only* silyl-type branches
      // (carbon attached to an O which in turn is bonded to Si). If ALL side branches
      // are silyl-type, do not treat as true branching for complexity purposes.
      let nonSilylFound = false;
      for (const sb of sideBranches) {
        const sbAtom = mol.atoms[sb];
        if (!sbAtom) {
          nonSilylFound = true;
          break;
        }

        // Find oxygen neighbors of this side-branch carbon
        const oxyNeighbors = mol.bonds
          .filter(
            (bb: Bond) =>
              (bb.atom1 === sb || bb.atom2 === sb) && bb.type === "single",
          )
          .map((bb: Bond) => (bb.atom1 === sb ? bb.atom2 : bb.atom1))
          .map((id: number) => mol.atoms[id])
          .filter(
            (a: Atom | undefined): a is Atom =>
              a !== undefined && a.symbol === "O",
          );

        if (oxyNeighbors.length === 0) {
          nonSilylFound = true;
          break;
        }

        // For each oxygen neighbor, check if it connects to silicon
        const connectsToSi = oxyNeighbors.some((o: Atom) => {
          const neigh = mol.bonds
            .filter(
              (bb: Bond) =>
                (bb.atom1 === o.id || bb.atom2 === o.id) &&
                bb.type === "single",
            )
            .map((bb: Bond) => (bb.atom1 === o.id ? bb.atom2 : bb.atom1))
            .map((id: number) => mol.atoms[id]);
          return neigh.some(
            (na: Atom | undefined) => na !== undefined && na.symbol === "Si",
          );
        });

        if (!connectsToSi) {
          nonSilylFound = true;
          break;
        }
      }

      if (nonSilylFound) {
        branched = true;
      } else {
        // side branches are only silyl-type — treat as not branched for complexity
        branched = branched || false;
      }
    } else {
      // No side branches; if multiple continuation neighbors exist, that's true branching
      if (filtered.length > 1) branched = true;
    }

    for (const n of filtered) {
      if (!visited.has(n)) queue.push(n);
    }
  }

  const chainLength = alkoxyCarbonIds.size;

  // Check if any heteroatoms or substituents are attached to the alkoxy carbons
  // (this is a conservative proxy for attached functional groups)
  let hasAttachedFG = false;
  for (const cid of Array.from(alkoxyCarbonIds)) {
    for (const b of mol.bonds) {
      const other =
        b.atom1 === cid ? b.atom2 : b.atom2 === cid ? b.atom1 : undefined;
      if (other === undefined) continue;
      if (other === esterOxygen) continue;
      const otherAtom = mol.atoms[other];
      if (!otherAtom) continue;
      // If the alkoxy carbon is bonded to a heteroatom (non-C, non-H) or to a carbon that is not part of the straight alkoxy chain,
      // treat as having an attached functional group. However, silyl-protection (O-SiR3) is common and
      // should NOT by itself make the alkoxy "complex". Detect an oxygen that connects to a silicon
      // (silyl group) and ignore it for complexity purposes.
      if (otherAtom.symbol !== "C" && otherAtom.symbol !== "H") {
        // If the heteroatom is an oxygen, check if it connects to a silicon (silyl protection)
        if (otherAtom.symbol === "O") {
          // Look for a silicon neighbor of this oxygen (excluding the alkoxy carbon)
          const neighs = mol.bonds
            .filter(
              (bb: Bond) =>
                (bb.atom1 === other || bb.atom2 === other) &&
                bb.type === "single",
            )
            .map((bb: Bond) => (bb.atom1 === other ? bb.atom2 : bb.atom1))
            .filter((id: number) => id !== cid);
          const hasSi = neighs.some(
            (nid: number) => mol.atoms[nid] && mol.atoms[nid].symbol === "Si",
          );
          if (hasSi) {
            // silyl-protected oxygen — ignore for complexity
            continue;
          }
        }
        hasAttachedFG = true;
        break;
      }
      // If bonded carbon is not in the alkoxyCarbonIds set, it may indicate branching/substituent
      if (otherAtom.symbol === "C" && !alkoxyCarbonIds.has(other)) {
        hasAttachedFG = true;
        break;
      }
    }
    if (hasAttachedFG) break;
  }

  return { alkoxyCarbonIds, chainLength, branched, hasAttachedFG };
}

/**
 * Check if an ester is suitable for functional class nomenclature
 * Functional class nomenclature is used for:
 * - Simple esters (single ester, no complex features)
 * - Diesters and polyesters (multiple ester groups)
 *
 * Substitutive nomenclature is used when:
 * - The ester is a lactone (ester group is part of a ring)
 * - The molecule has other high-priority functional groups
 * - Hierarchical esters (one ester nested in another's alkyl group)
 */
export function checkIfSimpleEster(
  context: ImmutableNamingContext,
  esters: FunctionalGroup[],
): boolean {
  const mol = context.getState().molecule;
  const allFunctionalGroups = context.getState().functionalGroups || [];

  if (process.env.VERBOSE) {
    console.log("[checkIfSimpleEster] Checking ester complexity:", {
      esterCount: esters.length,
      atomCount: mol.atoms.length,
    });
  }

  // Check if ester is a LACTONE (ester group is part of a ring)
  // If the ester C=O and O are both in a ring → lactone → use substitutive nomenclature
  // If there are rings but ester is NOT in the ring → use functional class nomenclature
  const isLactone = isEsterInRing(mol, esters);
  if (isLactone) {
    if (process.env.VERBOSE)
      console.log(
        "[checkIfSimpleEster] Ester is lactone (in ring) → use substitutive",
      );
    return false;
  }

  if (process.env.VERBOSE) {
    const hasRings = detectSimpleRings(mol);
    if (hasRings) {
      if (process.env.VERBOSE) {
        console.log(
          "[checkIfSimpleEster] Has rings but ester NOT in ring → use functional class",
        );
      }
    }
  }

  // Check for higher-priority functional groups that would override ester as principal group
  // Use dynamic comparison with normalized priorities so scales match (engine uses larger numbers
  // for higher priority). Normalize the detector-provided priority to the engine scale.
  const detector = context.getDetector();
  const rawEsterPriority =
    typeof detector.getFunctionalGroupPriority === "function"
      ? detector.getFunctionalGroupPriority("ester") || 0
      : 0;
  const esterPriority = normalizePriority(rawEsterPriority);
  const higherPriorityGroups = allFunctionalGroups.filter(
    (fg) =>
      fg.type !== "ester" &&
      fg.type !== "ether" &&
      fg.type !== "alkoxy" &&
      (fg.priority || detector.getFunctionalGroupPriority(fg.type) || 0) >
        esterPriority,
  );

  // Has higher-priority functional groups → use substitutive nomenclature
  if (higherPriorityGroups.length > 0) {
    if (process.env.VERBOSE)
      console.log(
        "[checkIfSimpleEster] Higher priority FGs:",
        higherPriorityGroups.map((fg) => fg.type),
      );
    return false;
  }

  if (process.env.VERBOSE) {
    const otherFunctionalGroups = allFunctionalGroups.filter(
      (fg) =>
        fg.type !== "ester" && fg.type !== "ether" && fg.type !== "alkoxy",
    );
    if (otherFunctionalGroups.length > 0) {
      if (process.env.VERBOSE) {
        console.log(
          "[checkIfSimpleEster] Other (lower priority) FGs that are OK:",
          otherFunctionalGroups.map((fg) => `${fg.type}(${fg.priority})`),
        );
      }
    }
  }

  // Check for hierarchical esters (nested esters) → use substitutive nomenclature
  if (esters.length >= 2) {
    if (process.env.VERBOSE)
      console.log(
        "[checkIfSimpleEster] Checking for hierarchical esters, count:",
        esters.length,
      );
    const hierarchy = analyzeEsterHierarchy(context, esters);
    if (hierarchy.isHierarchical) {
      if (process.env.VERBOSE)
        console.log(
          "[checkIfSimpleEster] Hierarchical ester detected → complex",
        );
      return false;
    }
  }

  // Inspect alkoxy groups for branching or substituents
  // NOTE: Branching and attached functional groups are OK for functional class nomenclature
  // The complex alkoxy name will be handled by getAlkoxyGroupName() using bracket notation
  // e.g., [2-methyl-1-[4-nitro-3-(trifluoromethyl)anilino]-1-oxopropan-2-yl]butanoate
  // Only truly problematic cases (nested esters within alkoxy chain) should use substitutive
  for (const ester of esters) {
    try {
      const info = getAlkoxyGroupInfo(context, ester as FunctionalGroup);
      if (process.env.VERBOSE)
        console.log("[checkIfSimpleEster] Alkoxy info:", info);

      // Allow branched and substituted alkoxy chains - functional class can handle these
      // The naming logic in ester-naming.ts will generate proper bracketed names
      if (process.env.VERBOSE && (info.branched || info.hasAttachedFG)) {
        if (process.env.VERBOSE) {
          console.log(
            "[checkIfSimpleEster] Alkoxy chain is branched or has attached FG -> will use complex functional class naming",
          );
        }
      }

      // No restrictions here - functional class nomenclature can handle complexity
    } catch (_e) {
      if (process.env.VERBOSE)
        console.log("[checkIfSimpleEster] Error analyzing alkoxy group:", _e);
      // On error, still allow functional class - the ester-naming.ts logic will handle it
    }
  }

  if (process.env.VERBOSE)
    console.log(
      "[checkIfSimpleEster] Suitable for functional class nomenclature",
    );
  // All checks passed → use functional class nomenclature
  return true;
}

/**
 * Simple ring detection to check if molecule contains rings
 * Returns true if any atom is part of a ring
 */
function detectSimpleRings(mol: Molecule): boolean {
  // Build adjacency list
  const adj = new Map<number, number[]>();
  for (const atom of mol.atoms) {
    adj.set(atom.id, []);
  }

  for (const bond of mol.bonds) {
    const neighbors1 = adj.get(bond.atom1);
    const neighbors2 = adj.get(bond.atom2);
    if (neighbors1) neighbors1.push(bond.atom2);
    if (neighbors2) neighbors2.push(bond.atom1);
  }

  // DFS to detect cycles
  const visited = new Set<number>();
  const recStack = new Set<number>();

  function hasCycleDFS(atomId: number, parent: number): boolean {
    visited.add(atomId);
    recStack.add(atomId);

    const neighbors = adj.get(atomId) || [];
    for (const neighborId of neighbors) {
      if (neighborId === parent) continue; // Skip the edge we came from

      if (recStack.has(neighborId)) {
        return true; // Found a cycle
      }

      if (!visited.has(neighborId)) {
        if (hasCycleDFS(neighborId, atomId)) {
          return true;
        }
      }
    }

    recStack.delete(atomId);
    return false;
  }

  // Check each connected component
  for (const atom of mol.atoms) {
    if (!visited.has(atom.id)) {
      if (hasCycleDFS(atom.id, -1)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Rule: Ester Detection
 *
 * Special case for esters which prefer functional class nomenclature
 * Example: CH3COOCH3 → methyl acetate (not methoxymethanone)
 *
 * Complex molecules with esters should use substitutive nomenclature instead
 */

export const ESTER_DETECTION_RULE: IUPACRule = {
  id: "ester-detection",
  name: "Ester Detection",
  description: "Detect ester functional groups for functional class naming",
  blueBookReference: "P-51.2.1 - Esters",
  priority: RulePriority.FIVE, // 50 - Must run AFTER FUNCTIONAL_GROUP_PRIORITY_RULE (60)
  conditions: (context: ImmutableNamingContext) => {
    // Check if there are any esters in the functional groups (detected by OPSIN or other detectors)
    const functionalGroups = context.getState().functionalGroups;
    const esters = functionalGroups.filter((fg) => fg.type === "ester");
    if (process.env.VERBOSE)
      console.log(
        "[ESTER_DETECTION_RULE] Checking conditions, esters found:",
        esters.length,
      );
    return esters.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    // Get esters from already-detected functional groups
    const functionalGroups = context.getState().functionalGroups;
    const esters = functionalGroups.filter((fg) => fg.type === "ester");

    if (process.env.VERBOSE)
      console.log(
        "[ESTER_DETECTION_RULE] Found esters in functional groups:",
        esters.length,
      );

    let updatedContext = context;

    // Only use functional class nomenclature for simple esters
    // Complex molecules should use substitutive nomenclature
    const isSimpleEster = checkIfSimpleEster(context, esters);

    if (process.env.VERBOSE)
      console.log("[ESTER_DETECTION_RULE] isSimpleEster:", isSimpleEster);

    if (isSimpleEster) {
      updatedContext = updatedContext.withNomenclatureMethod(
        NomenclatureMethod.FUNCTIONAL_CLASS,
        "ester-detection",
        "Ester Detection",
        "P-51.2.1",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Set nomenclature method to functional class for simple esters",
      );
    } else {
      // For complex esters, explicitly set substitutive nomenclature
      updatedContext = updatedContext.withNomenclatureMethod(
        NomenclatureMethod.SUBSTITUTIVE,
        "ester-detection",
        "Ester Detection",
        "P-51.2.1",
        ExecutionPhase.FUNCTIONAL_GROUP,
        "Set nomenclature method to substitutive for complex esters",
      );
    }

    return updatedContext;
  },
};

/**
 * Rule: Lactone to Ketone Conversion
 *
 * Lactones (cyclic esters) are heterocycles and should be named as such.
 * The ester C(=O)O group in a ring is treated as a ketone (C=O) suffix.
 *
 * Reference: Blue Book P-66.1.1.4 - Lactones are named as heterocycles
 * Example: CC1(CC(OC1=O)C(C)(C)I)C → 5-(2-iodopropan-2-yl)-3,3-dimethyloxolan-2-one
 */
export const LACTONE_TO_KETONE_RULE: IUPACRule = {
  id: "lactone-to-ketone",
  name: "Lactone to Ketone Conversion",
  description:
    "Convert cyclic esters (lactones) to ketones for heterocycle naming",
  blueBookReference: "P-66.1.1.4 - Lactones",
  priority: RulePriority.FOUR, // 40 - Must run AFTER ESTER_DETECTION_RULE (priority FIVE = 50)
  conditions: (context: ImmutableNamingContext) => {
    // Detect lactones: look for carbonyl C=O in a ring where an ester oxygen
    // is also in the same ring. The pattern can be:
    // 1. C(=O)-O (oxygen directly bonded to carbonyl carbon) - simple lactones
    // 2. C(=O)-C-...-O (oxygen connected through the ring) - bicyclic lactones
    const functionalGroups = context.getState().functionalGroups;
    const mol = context.getState().molecule;
    const rings = mol.rings || [];

    if (process.env.VERBOSE) {
      const esters = functionalGroups.filter(
        (fg: FunctionalGroup) => fg.type === "ester",
      );
      if (process.env.VERBOSE) {
        console.log(
          "[LACTONE_TO_KETONE] Checking conditions: esters=",
          esters.length,
          "rings=",
          rings.length,
        );
      }
    }

    if (!rings || rings.length === 0) {
      if (process.env.VERBOSE)
        console.log("[LACTONE_TO_KETONE] No rings in molecule");
      return false;
    }

    const ringAtomSets = rings.map((r: readonly number[]) => new Set(r));

    // Scan for carbonyl double bonds
    for (const bond of mol.bonds) {
      if (bond.type !== "double") continue;
      const a1 = mol.atoms[bond.atom1];
      const a2 = mol.atoms[bond.atom2];
      if (!a1 || !a2 || !isCarbonyl(a1, a2)) continue;
      const carbonylCarbon = getCarbonFromCarbonyl(a1, a2);

      if (process.env.VERBOSE)
        console.log(
          "[LACTONE_TO_KETONE] Examining carbonyl at",
          carbonylCarbon.id,
        );

      // Check which rings contain this carbonyl carbon
      for (let ringIdx = 0; ringIdx < ringAtomSets.length; ringIdx++) {
        const ringSet = ringAtomSets[ringIdx];
        if (!ringSet || !ringSet.has(carbonylCarbon.id)) continue;

        // Pattern 1: Check if ester oxygen is directly bonded to carbonyl carbon (simple lactones)
        for (const b of mol.bonds) {
          if (b.type !== "single") continue;
          const oxId =
            b.atom1 === carbonylCarbon.id
              ? b.atom2
              : b.atom2 === carbonylCarbon.id
                ? b.atom1
                : -1;
          if (oxId === -1) continue;
          const oxAtom = mol.atoms[oxId];

          if (oxAtom?.symbol === "O" && ringSet.has(oxId)) {
            // Count how many carbons this oxygen is bonded to
            let carbonCount = 0;
            for (const b2 of mol.bonds) {
              if (b2.atom1 === oxId || b2.atom2 === oxId) {
                const neighborId = b2.atom1 === oxId ? b2.atom2 : b2.atom1;
                if (mol.atoms[neighborId]?.symbol === "C") carbonCount++;
              }
            }

            // If oxygen is bonded to exactly 2 carbons, it's an ester oxygen forming a simple lactone
            if (carbonCount === 2) {
              if (process.env.VERBOSE)
                console.log(
                  "[LACTONE_TO_KETONE]   Simple lactone detected: C(=O)-O at carbonyl",
                  carbonylCarbon.id,
                  ", ester O at",
                  oxId,
                );
              return true;
            }
          }
        }

        // Pattern 2: Check if ester oxygen is bonded to an alpha carbon (bicyclic lactones)
        // Find all carbons bonded to the carbonyl carbon (alpha carbons)
        const alphaAtomIds: number[] = [];
        for (const b of mol.bonds) {
          if (b.type !== "single") continue;
          const otherId =
            b.atom1 === carbonylCarbon.id
              ? b.atom2
              : b.atom2 === carbonylCarbon.id
                ? b.atom1
                : -1;
          if (otherId === -1) continue;
          const otherAtom = mol.atoms[otherId];
          if (otherAtom?.symbol === "C" && ringSet.has(otherId)) {
            alphaAtomIds.push(otherId);
          }
        }

        if (process.env.VERBOSE)
          console.log(
            "[LACTONE_TO_KETONE]   Alpha carbons in ring:",
            alphaAtomIds,
          );

        // For each alpha carbon, check if it's bonded to an ester oxygen in the same ring
        for (const alphaId of alphaAtomIds) {
          for (const b of mol.bonds) {
            if (b.type !== "single") continue;
            const oxId =
              b.atom1 === alphaId
                ? b.atom2
                : b.atom2 === alphaId
                  ? b.atom1
                  : -1;
            if (oxId === -1) continue;
            const oxAtom = mol.atoms[oxId];

            // Check if this is an ester oxygen (O bonded to two carbons, one of which is the alpha carbon)
            if (oxAtom?.symbol === "O" && ringSet.has(oxId)) {
              // Count how many carbons this oxygen is bonded to
              let carbonCount = 0;
              for (const b2 of mol.bonds) {
                if (b2.atom1 === oxId || b2.atom2 === oxId) {
                  const neighborId = b2.atom1 === oxId ? b2.atom2 : b2.atom1;
                  if (mol.atoms[neighborId]?.symbol === "C") carbonCount++;
                }
              }

              // If oxygen is bonded to exactly 2 carbons, it's an ester oxygen forming a bicyclic lactone
              if (carbonCount === 2) {
                if (process.env.VERBOSE)
                  console.log(
                    "[LACTONE_TO_KETONE]   Bicyclic lactone detected: C(=O)-C-O at carbonyl",
                    carbonylCarbon.id,
                    ", alpha C at",
                    alphaId,
                    ", ester O at",
                    oxId,
                  );
                return true;
              }
            }
          }
        }
      }
    }

    if (process.env.VERBOSE)
      console.log("[LACTONE_TO_KETONE] No lactone patterns found");
    return false;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups || [];
    const mol = context.getState().molecule;
    const rings = mol.rings || [];

    if (process.env.VERBOSE) {
      console.log(
        "[LACTONE_TO_KETONE] Converting cyclic esters to ketones (if any)",
      );
      if (process.env.VERBOSE) {
        console.log(
          "[LACTONE_TO_KETONE] Current functionalGroups:",
          functionalGroups.map((fg: FunctionalGroup) => ({
            type: fg.type,
            atoms: fg.atoms?.map((a: Atom | number) =>
              typeof a === "number" ? a : a.id,
            ),
          })),
        );
      }
    }

    // Find lactone carbonyls using the same logic as conditions function
    // Pattern can be:
    // 1. C(=O)-O (oxygen directly bonded to carbonyl carbon) - simple lactones
    // 2. C(=O)-C-...-O (oxygen connected through alpha carbon) - bicyclic lactones
    const ringAtomSets = (rings || []).map(
      (r: readonly number[]) => new Set(r),
    );
    const lactoneCarbonIds = new Set<number>();

    for (const bond of mol.bonds) {
      if (bond.type !== "double") continue;
      const a1 = mol.atoms[bond.atom1];
      const a2 = mol.atoms[bond.atom2];
      if (!a1 || !a2 || !isCarbonyl(a1, a2)) continue;
      const carbonylCarbon = getCarbonFromCarbonyl(a1, a2);

      // Check which rings contain this carbonyl carbon
      for (const ringSet of ringAtomSets) {
        if (!ringSet.has(carbonylCarbon.id)) continue;

        // Pattern 1: Check if ester oxygen is directly bonded to carbonyl carbon (simple lactones)
        for (const b of mol.bonds) {
          if (b.type !== "single") continue;
          const oxId =
            b.atom1 === carbonylCarbon.id
              ? b.atom2
              : b.atom2 === carbonylCarbon.id
                ? b.atom1
                : -1;
          if (oxId === -1) continue;
          const oxAtom = mol.atoms[oxId];

          if (oxAtom?.symbol === "O" && ringSet.has(oxId)) {
            // Count how many carbons this oxygen is bonded to
            let carbonCount = 0;
            for (const b2 of mol.bonds) {
              if (b2.atom1 === oxId || b2.atom2 === oxId) {
                const neighborId = b2.atom1 === oxId ? b2.atom2 : b2.atom1;
                if (mol.atoms[neighborId]?.symbol === "C") carbonCount++;
              }
            }

            // If oxygen is bonded to exactly 2 carbons, it's an ester oxygen forming a simple lactone
            if (carbonCount === 2) {
              lactoneCarbonIds.add(carbonylCarbon.id);
              if (process.env.VERBOSE)
                console.log(
                  "[LACTONE_TO_KETONE] Detected simple lactone carbonyl at",
                  carbonylCarbon.id,
                  ", ester O at",
                  oxId,
                );
            }
          }
        }

        // Pattern 2: Check if ester oxygen is bonded to an alpha carbon (bicyclic lactones)
        // Find all carbons bonded to the carbonyl carbon (alpha carbons)
        const alphaAtomIds: number[] = [];
        for (const b of mol.bonds) {
          if (b.type !== "single") continue;
          const otherId =
            b.atom1 === carbonylCarbon.id
              ? b.atom2
              : b.atom2 === carbonylCarbon.id
                ? b.atom1
                : -1;
          if (otherId === -1) continue;
          const otherAtom = mol.atoms[otherId];
          if (otherAtom?.symbol === "C" && ringSet.has(otherId)) {
            alphaAtomIds.push(otherId);
          }
        }

        // For each alpha carbon, check if it's bonded to an ester oxygen in the same ring
        for (const alphaId of alphaAtomIds) {
          for (const b of mol.bonds) {
            if (b.type !== "single") continue;
            const oxId =
              b.atom1 === alphaId
                ? b.atom2
                : b.atom2 === alphaId
                  ? b.atom1
                  : -1;
            if (oxId === -1) continue;
            const oxAtom = mol.atoms[oxId];

            // Check if this is an ester oxygen (O bonded to two carbons, one of which is the alpha carbon)
            if (oxAtom?.symbol === "O" && ringSet.has(oxId)) {
              // Count how many carbons this oxygen is bonded to
              let carbonCount = 0;
              for (const b2 of mol.bonds) {
                if (b2.atom1 === oxId || b2.atom2 === oxId) {
                  const neighborId = b2.atom1 === oxId ? b2.atom2 : b2.atom1;
                  if (mol.atoms[neighborId]?.symbol === "C") carbonCount++;
                }
              }

              // If oxygen is bonded to exactly 2 carbons, it's an ester oxygen forming a bicyclic lactone
              if (carbonCount === 2) {
                lactoneCarbonIds.add(carbonylCarbon.id);
                if (process.env.VERBOSE)
                  console.log(
                    "[LACTONE_TO_KETONE] Detected bicyclic lactone carbonyl at",
                    carbonylCarbon.id,
                    ", alpha C at",
                    alphaId,
                    ", ester O at",
                    oxId,
                  );
              }
            }
          }
        }
      }
    }

    // If we found any lactone carbonyls, ensure they're present as ketone functional groups
    const detector = context.getDetector();
    const ketonePriority = normalizePriority(
      detector.getFunctionalGroupPriority("ketone") || 0,
    );
    let updatedFunctionalGroups = functionalGroups.slice();
    if (lactoneCarbonIds.size > 0) {
      // Remove any existing ester entries that correspond to these lactones and replace with ketone entries
      updatedFunctionalGroups = updatedFunctionalGroups.map((fg) => {
        if (fg.type === "ester") {
          const fgAtomIds = (fg.atoms || []).map((a) =>
            typeof a === "number" ? a : (a?.id ?? -1),
          );
          const carbonylId = fgAtomIds.length > 0 ? fgAtomIds[0] : undefined;
          if (carbonylId && lactoneCarbonIds.has(carbonylId)) {
            // convert to ketone FG
            return {
              ...fg,
              type: "ketone",
              name: "ketone",
              suffix: "one",
              priority: ketonePriority,
              atoms: [mol.atoms.find((a) => a.id === carbonylId)].filter(
                (a): a is Atom => a !== undefined,
              ),
              prefix: "oxo",
              isPrincipal: false,
            } as FunctionalGroup;
          }
        }
        return fg;
      });

      // For any lactone carbonyls not represented by an ester FG, add ketone FG entries
      for (const cid of Array.from(lactoneCarbonIds)) {
        const exists = updatedFunctionalGroups.some(
          (fg) =>
            fg.type === "ketone" &&
            (fg.atoms || []).some((a) => (a?.id || a) === cid),
        );
        if (!exists) {
          const carbonAtom = mol.atoms.find((a) => a.id === cid);
          updatedFunctionalGroups.push({
            type: "ketone",
            name: "ketone",
            suffix: "one",
            prefix: "oxo",
            atoms: carbonAtom ? [carbonAtom] : [],
            bonds: [],
            priority: ketonePriority,
            isPrincipal: false,
            locants: carbonAtom ? [carbonAtom.id] : [],
          } as FunctionalGroup);
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log(
        "[LACTONE_TO_KETONE] After conversion/update, functionalGroups:",
        updatedFunctionalGroups.map((fg) => ({
          type: fg.type,
          suffix: fg.suffix,
          atoms: fg.atoms?.map((a) => (typeof a === "number" ? a : a.id)),
        })),
      );
    }

    // Re-select principal group after lactone-to-ketone conversion
    // The ketone from the lactone should now be the principal group
    // Special case: if we detected lactones, the ketone MUST be principal
    // (lactones are cyclic esters that should be named as ketones in heterocycles)
    const newPrincipalGroup =
      lactoneCarbonIds.size > 0
        ? updatedFunctionalGroups.find(
            (fg) =>
              fg.type === "ketone" &&
              (fg.atoms || []).some((a) => {
                const atomId = typeof a === "number" ? a : a?.id;
                return atomId !== undefined && lactoneCarbonIds.has(atomId);
              }),
          ) ||
          selectPrincipalGroup(
            updatedFunctionalGroups,
            mol,
            context.getDetector(),
          )
        : selectPrincipalGroup(
            updatedFunctionalGroups,
            mol,
            context.getDetector(),
          );

    if (process.env.VERBOSE) {
      console.log(
        "[LACTONE_TO_KETONE] Re-selected principal group:",
        newPrincipalGroup
          ? {
              type: newPrincipalGroup.type,
              priority: newPrincipalGroup.priority,
            }
          : null,
      );
    }

    // Mark all functional groups of the principal type as principal
    // IMPORTANT: Only update isPrincipal for groups matching the new principal type
    // Leave other groups' isPrincipal status unchanged (don't reset to false)
    const finalFunctionalGroups = newPrincipalGroup
      ? updatedFunctionalGroups.map((g) => {
          if (
            g.type === newPrincipalGroup.type &&
            g.priority === newPrincipalGroup.priority
          ) {
            return { ...g, isPrincipal: true };
          }
          return g; // Keep existing isPrincipal status
        })
      : updatedFunctionalGroups;

    return context.withStateUpdate(
      (state) => ({
        ...state,
        functionalGroups: finalFunctionalGroups,
        principalGroup: newPrincipalGroup || state.principalGroup,
      }),
      "lactone-to-ketone",
      "Lactone to Ketone Conversion",
      "P-66.1.1.4",
      ExecutionPhase.FUNCTIONAL_GROUP,
      "Converted cyclic esters (lactones) to ketones for heterocycle naming and re-selected principal group",
    );
  },
};
