import type { Atom, Molecule } from "types";
import type { IUPACRule } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";

/**
 * Rule: Fix Pending Alkoxy Functional Groups After Parent Selection
 *
 * This rule handles alkoxy functional groups that were marked as "pending-analysis"
 * during the functional group phase:
 * - For CHAINS: Remove alkoxy groups (they're duplicates, handled as substituents)
 * - For RINGS: Analyze and set proper alkoxy prefix (methoxy, ethoxy, etc.)
 *
 * This fixes the "phantom substituent" bug where alkoxy groups appeared twice in chains,
 * and ensures ring alkoxy groups have proper prefixes.
 */
export const RE_ANALYZE_ALKOXY_AFTER_PARENT_RULE: IUPACRule = {
  id: "re-analyze-alkoxy-after-parent",
  name: "Fix Pending Alkoxy Functional Groups",
  description:
    "For chains: remove alkoxy FGs (duplicates). For rings: analyze and set prefix",
  blueBookReference: "P-63.2.2 - Ethers as substituents",
  priority: 5, // Run AFTER parent chain selection complete (priority 100) - using low number since sort is descending
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups;
    const parentStructure = context.getState().parentStructure;
    // Run if we have a parent structure and pending alkoxy groups
    return (
      parentStructure !== undefined &&
      functionalGroups.some(
        (g) => g.type === "alkoxy" && g.prefix === "pending-analysis",
      )
    );
  },
  action: (context: ImmutableNamingContext) => {
    const mol = context.getState().molecule;
    const functionalGroups = context.getState().functionalGroups;
    const parentStructure = context.getState().parentStructure;
    const isChain = parentStructure?.type === "chain";

    if (process.env.VERBOSE) {
      console.log(
        `[RE_ANALYZE_ALKOXY_AFTER_PARENT_RULE] Parent is ${isChain ? "chain" : "ring"}`,
      );
    }

    let updatedGroups;
    if (isChain) {
      // For chains: Remove alkoxy groups entirely (they're duplicates)
      updatedGroups = functionalGroups.filter((fg) => {
        const shouldRemove =
          fg.type === "alkoxy" && fg.prefix === "pending-analysis";
        if (shouldRemove && process.env.VERBOSE) {
          console.log(
            `  Removing alkoxy FG at oxygen ${fg.atoms?.[0] ? (typeof fg.atoms[0] === "number" ? fg.atoms[0] : fg.atoms[0].id) : "unknown"}`,
          );
        }
        return !shouldRemove;
      });
    } else {
      // For rings: Analyze alkoxy groups and set proper prefix
      updatedGroups = functionalGroups.map((fg) => {
        if (fg.type === "alkoxy" && fg.prefix === "pending-analysis") {
          // Analyze the alkoxy group to determine its name
          const alkoxyName = analyzeAlkoxyGroup(mol, fg);
          if (process.env.VERBOSE) {
            console.log(
              `  Analyzed alkoxy FG at oxygen ${fg.atoms?.[0] ? (typeof fg.atoms[0] === "number" ? fg.atoms[0] : fg.atoms[0].id) : "unknown"} → ${alkoxyName}`,
            );
          }
          return {
            ...fg,
            prefix: alkoxyName,
          };
        }
        return fg;
      });
    }

    return context.withFunctionalGroups(
      updatedGroups,
      "re-analyze-alkoxy-after-parent",
      isChain
        ? "Remove Pending Alkoxy Functional Groups"
        : "Analyze Pending Alkoxy Prefixes",
      "P-63.2.2",
      ExecutionPhase.PARENT_STRUCTURE,
      isChain
        ? "Removed pending alkoxy FGs (handled as substituents)"
        : "Analyzed and set alkoxy prefixes for ring substituents",
    );
  },
};

/**
 * Analyze an alkoxy functional group to determine its name (methoxy, ethoxy, etc.)
 * This is a simplified version of the analysis in functional-groups-layer.ts
 */
function analyzeAlkoxyGroup(
  mol: Molecule,
  fg: { atoms?: (Atom | number)[] },
): string {
  if (!fg.atoms || fg.atoms.length === 0) return "oxy";

  // Find the oxygen atom
  const oxygenAtom = fg.atoms.find((atomOrId) => {
    const atomId = typeof atomOrId === "number" ? atomOrId : atomOrId.id;
    return mol.atoms[atomId]?.symbol === "O";
  });

  if (!oxygenAtom) return "oxy";

  const oxygenId = typeof oxygenAtom === "number" ? oxygenAtom : oxygenAtom.id;
  const oxyAtom = mol.atoms[oxygenId];
  if (!oxyAtom) return "oxy";

  // Find carbons bonded to oxygen
  const bondedCarbons = mol.bonds
    .filter(
      (bond) =>
        (bond.atom1 === oxygenId || bond.atom2 === oxygenId) &&
        bond.type === "single",
    )
    .map((bond) => {
      const otherId = bond.atom1 === oxygenId ? bond.atom2 : bond.atom1;
      return mol.atoms[otherId];
    })
    .filter((atom): atom is Atom => atom?.symbol === "C");

  if (bondedCarbons.length !== 2) return "oxy";

  // For ring alkoxy groups, we need to determine which carbon is the substituent
  // Simple heuristic: the substituent is the smaller carbon chain
  const carbon1 = bondedCarbons[0];
  const carbon2 = bondedCarbons[1];
  if (!carbon1 || !carbon2) return "oxy";

  const chain1Size = getChainSize(mol, carbon1, oxyAtom);
  const chain2Size = getChainSize(mol, carbon2, oxyAtom);

  // The substituent is the smaller chain
  const substituentCarbon = chain1Size <= chain2Size ? carbon1 : carbon2;
  const substituentSize = Math.min(chain1Size, chain2Size);

  // Simple alkoxy names based on chain length
  const simpleNames = [
    "methoxy", // 1 carbon
    "ethoxy", // 2 carbons
    "propoxy", // 3 carbons
    "butoxy", // 4 carbons
    "pentoxy", // 5 carbons
    "hexoxy", // 6 carbons
    "heptoxy", // 7 carbons
    "octoxy", // 8 carbons
  ];

  if (substituentSize >= 1 && substituentSize <= simpleNames.length) {
    return simpleNames[substituentSize - 1] || "alkoxy";
  }

  return "alkoxy";
}

/**
 * Get the size of a carbon chain starting from a carbon atom
 * Stop at the oxygen atom (don't traverse back through it)
 */
function getChainSize(
  mol: Molecule,
  startCarbon: Atom,
  oxygenAtom: Atom,
): number {
  const visited = new Set<number>([oxygenAtom.id]);
  const queue = [startCarbon];
  let count = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;

    visited.add(current.id);
    if (current.symbol === "C") count++;

    // Find neighbors
    const neighbors = mol.bonds
      .filter(
        (bond) =>
          (bond.atom1 === current.id || bond.atom2 === current.id) &&
          bond.type === "single",
      )
      .map((bond) => {
        const otherId = bond.atom1 === current.id ? bond.atom2 : bond.atom1;
        return mol.atoms[otherId];
      })
      .filter(
        (atom): atom is Atom => atom !== undefined && !visited.has(atom.id),
      );

    queue.push(...neighbors);
  }

  return count;
}
