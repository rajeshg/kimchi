import { classifyRingSystems } from "../../../utils/ring-analysis";
import type { Molecule, Atom, Bond } from "../../../../types";
import { BondType } from "../../../../types";

/**
 * Helper function to detect ring systems in a molecule
 * Groups connected rings (fused/bridged/spiro) into single ring systems
 */
export function detectRingSystems(molecule: Molecule): unknown[] {
  const ringSystems: unknown[] = [];

  // Get rings - prefer parser-provided rings, fallback to ring analysis
  const rings = molecule.rings ? molecule.rings.map((r) => [...r]) : [];

  if (rings.length === 0) {
    return ringSystems; // No rings detected
  }

  // Use classifyRingSystems to properly detect fused/bridged/spiro rings
  const classification = classifyRingSystems(molecule.atoms, molecule.bonds);

  // Build lookup for ring classification
  const ringClassification = new Map<
    number,
    "isolated" | "fused" | "spiro" | "bridged"
  >();
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (!ring) continue;

    if (classification.isolated.some((r) => arraysEqual(r, ring))) {
      ringClassification.set(i, "isolated");
    } else if (classification.fused.some((r) => arraysEqual(r, ring))) {
      ringClassification.set(i, "fused");
    } else if (classification.spiro.some((r) => arraysEqual(r, ring))) {
      ringClassification.set(i, "spiro");
    } else if (classification.bridged.some((r) => arraysEqual(r, ring))) {
      ringClassification.set(i, "bridged");
    } else {
      ringClassification.set(i, "isolated");
    }
  }

  // Group connected rings into ring systems using union-find
  const parent: number[] = rings.map((_, i) => i);

  const find = (x: number): number => {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]!);
    }
    return parent[x]!;
  };

  const union = (x: number, y: number): void => {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent[rootX] = rootY;
    }
  };

  // Union rings that share atoms
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const ring1 = rings[i]!;
      const ring2 = rings[j]!;
      // Check if rings share any atoms
      const sharedAtoms = ring1.filter((atom) => ring2.includes(atom));
      if (sharedAtoms.length > 0) {
        union(i, j);
      }
    }
  }

  // Group rings by their root parent
  const groups = new Map<number, number[]>();
  for (let i = 0; i < rings.length; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(i);
  }

  // DEBUG: Log groups for debugging
  if (process.env.VERBOSE) {
    console.log(`[detectRingSystems] Total rings: ${rings.length}`);
    console.log(
      `[detectRingSystems] Groups Map:`,
      Array.from(groups.entries()),
    );
    for (const [root, ringIndices] of groups) {
      console.log(
        `  Group ${root}: ${ringIndices.length} rings, indices: [${ringIndices.join(", ")}]`,
      );
      for (const idx of ringIndices) {
        console.log(`    Ring ${idx}:`, rings[idx]);
      }
    }
  }

  // Build ring systems from groups
  for (const [_root, ringIndices] of groups) {
    // Collect all unique atoms and bonds from all rings in this system
    const atomSet = new Set<number>();
    const bondSet = new Set<string>();

    for (const ringIdx of ringIndices) {
      const ring = rings[ringIdx]!;
      for (const atomIdx of ring) {
        atomSet.add(atomIdx);
      }
      // Add bonds within this ring
      for (let i = 0; i < ring.length; i++) {
        const atom1 = ring[i]!;
        const atom2 = ring[(i + 1) % ring.length]!;
        const bondKey =
          atom1 < atom2 ? `${atom1}-${atom2}` : `${atom2}-${atom1}`;
        bondSet.add(bondKey);
      }
    }

    // Convert atom indices to atom objects
    const atoms = Array.from(atomSet)
      .map((idx) => molecule.atoms[idx])
      .filter(Boolean) as Atom[];

    // Convert bond keys to bond objects
    const bonds = Array.from(bondSet)
      .map((key) => {
        const [a1, a2] = key.split("-").map(Number);
        return molecule.bonds.find(
          (b) =>
            (b.atom1 === a1 && b.atom2 === a2) ||
            (b.atom1 === a2 && b.atom2 === a1),
        );
      })
      .filter((b) => b) as Bond[];

    // Determine classification (take first ring's classification as representative)
    const primaryClassification =
      ringClassification.get(ringIndices[0]!) || "isolated";

    // Construct ring system object
    const ringSystem = {
      atoms,
      bonds,
      size: atoms.length,
      type: determineRingType({ atoms, bonds }),
      rings: ringIndices.map((idx) => rings[idx]!),
      classification: primaryClassification,
    } as unknown;

    ringSystems.push(ringSystem);
  }

  return ringSystems;
}

// Helper function to compare arrays
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

/**
 * Determine ring type (aromatic, aliphatic, heterocyclic)
 */
function determineRingType(ringSystem: {
  atoms: Atom[];
  bonds: Bond[];
}): string {
  const hasAromaticAtoms = ringSystem.atoms.some((atom) => atom.aromatic);
  const hasHeteroatoms = ringSystem.atoms.some((atom) => atom.symbol !== "C");

  if (hasAromaticAtoms) {
    return "aromatic";
  } else if (hasHeteroatoms) {
    return "heterocyclic";
  } else {
    return "aliphatic";
  }
}

/**
 * Generate ring name from ring system
 */
export function generateRingName(
  ringSystem: {
    size: number;
    type: string;
    atoms: Atom[];
    classification: string;
    bonds: Bond[];
    rings: number[][];
  },
  molecule?: Molecule,
): string {
  const size = ringSystem.size;
  const type = ringSystem.type;
  const atoms = ringSystem.atoms || [];
  const classification = ringSystem.classification;

  // Handle fused ring systems (naphthalene, anthracene, etc.)
  if (
    classification === "fused" &&
    molecule &&
    ringSystem.rings &&
    ringSystem.rings.length > 1
  ) {
    const fusedName = generateFusedPolycyclicName(ringSystem.rings, molecule);
    if (fusedName) {
      return fusedName;
    }
  }

  // Handle bridged ring systems (bicyclo, tricyclo, etc.)
  if (
    classification === "bridged" &&
    molecule &&
    ringSystem.rings &&
    ringSystem.rings.length > 1
  ) {
    const bridgedResult = generateBridgedPolycyclicName(
      ringSystem.rings,
      molecule,
    );
    if (bridgedResult && bridgedResult.name) {
      return bridgedResult.name;
    }
  }

  // Handle spiro ring systems
  if (
    classification === "spiro" &&
    molecule &&
    ringSystem.rings &&
    ringSystem.rings.length > 1
  ) {
    const spiroName = generateSpiroPolycyclicName(ringSystem.rings, molecule);
    if (spiroName) {
      return spiroName;
    }
  }

  // Count heteroatoms first (used by both aromatic and saturated checks)
  const heteroCount: Record<string, number> = {};
  if (atoms.length >= 3 && atoms.length <= 6) {
    for (const atom of atoms) {
      if (atom && atom.symbol && atom.symbol !== "C") {
        heteroCount[atom.symbol] = (heteroCount[atom.symbol] || 0) + 1;
      }
    }
  }

  const hasOxygen = heteroCount["O"] || 0;
  const hasNitrogen = heteroCount["N"] || 0;
  const hasSulfur = heteroCount["S"] || 0;
  const totalHetero = hasOxygen + hasNitrogen + hasSulfur;

  // Check aromatic heterocycles FIRST (before saturated heterocycles)
  if (type === "aromatic" && totalHetero > 0) {
    // If we have molecule object and ring atoms, use proper aromatic naming
    // which can distinguish pyrimidine from pyrazine based on nitrogen positions
    if (molecule && ringSystem.rings && ringSystem.rings.length > 0) {
      // Get ring indices from the atoms in the ring
      const ringIndices: number[] = [];
      for (const atom of atoms) {
        const atomIndex = molecule.atoms.findIndex(
          (a) => a === atom || (a && atom && a.id === atom.id),
        );
        if (atomIndex !== -1) {
          ringIndices.push(atomIndex);
        }
      }

      if (ringIndices.length === atoms.length) {
        // Import the proper aromatic naming function
        const {
          generateAromaticRingName,
        } = require("../../naming/iupac-rings/aromatic-naming");
        const aromaticName = generateAromaticRingName(ringIndices, molecule);
        if (aromaticName && !aromaticName.startsWith("aromatic_C")) {
          return aromaticName;
        }
      }
    }

    // Fallback to simple heuristics for aromatic rings
    // 6-membered aromatic heterocycles
    if (size === 6) {
      if (hasNitrogen === 1 && totalHetero === 1) return "pyridine";
      if (hasNitrogen === 2 && totalHetero === 2) {
        // Without proper position analysis, default to pyrimidine (more common)
        // This should rarely be reached now that we use generateAromaticRingName above
        return "pyrimidine";
      }
      if (hasNitrogen === 3 && totalHetero === 3) return "triazine";
      if (hasOxygen === 1 && totalHetero === 1) return "pyran";
    }

    // 5-membered aromatic heterocycles
    if (size === 5) {
      if (hasOxygen === 1 && totalHetero === 1) return "furan";
      if (hasNitrogen === 1 && totalHetero === 1) return "pyrrole";
      if (hasSulfur === 1 && totalHetero === 1) return "thiophene";
      if (hasNitrogen === 2 && totalHetero === 2) return "imidazole";
      if (hasNitrogen === 1 && hasSulfur === 1 && totalHetero === 2)
        return "thiazole";
      if (hasNitrogen === 1 && hasOxygen === 1 && totalHetero === 2)
        return "oxazole";
    }
  }

  // Check for 3-membered heterocycles with one unsaturation (azirine, oxirene)
  if (type !== "aromatic" && totalHetero === 1 && size === 3) {
    const ringIndices = atoms.map((atom) => atom.id);
    const doubleBondsInRing = (ringSystem.bonds || []).filter((bond) => {
      const isInRing =
        ringIndices.includes(bond.atom1) && ringIndices.includes(bond.atom2);
      return isInRing && bond.type === BondType.DOUBLE;
    });

    // Azirine: 3-membered ring with 1 nitrogen and exactly 1 double bond (C=N)
    if (hasNitrogen === 1 && doubleBondsInRing.length === 1) {
      const doubleBond = doubleBondsInRing[0]!;
      const atom1 = atoms.find((a) => a.id === doubleBond.atom1);
      const atom2 = atoms.find((a) => a.id === doubleBond.atom2);
      // Check if double bond involves nitrogen
      if (
        (atom1?.symbol === "N" || atom2?.symbol === "N") &&
        (atom1?.symbol === "C" || atom2?.symbol === "C")
      ) {
        return "azirine";
      }
    }
  }

  // Diaziridine (3-membered ring with 2 nitrogens: N1CN1)
  // Can have a carbonyl making it diaziridin-3-one (lactam)
  if (
    type !== "aromatic" &&
    size === 3 &&
    hasNitrogen === 2 &&
    hasOxygen === 0 &&
    hasSulfur === 0
  ) {
    // Check for exocyclic carbonyl (C=O where C is in ring, O is exocyclic)
    let hasRingCarbonyl = false;
    if (molecule) {
      const ringIndices = atoms.map((atom) => atom.id);
      for (const bond of molecule.bonds) {
        if (bond.type === BondType.DOUBLE) {
          const atom1 = molecule.atoms[bond.atom1];
          const atom2 = molecule.atoms[bond.atom2];

          // Check if one atom is a ring carbon and the other is an exocyclic oxygen
          if (atom1 && atom2) {
            const atom1InRing = ringIndices.includes(atom1.id);
            const atom2InRing = ringIndices.includes(atom2.id);

            if (
              (atom1InRing &&
                atom1.symbol === "C" &&
                !atom2InRing &&
                atom2.symbol === "O") ||
              (atom2InRing &&
                atom2.symbol === "C" &&
                !atom1InRing &&
                atom1.symbol === "O")
            ) {
              hasRingCarbonyl = true;
              break;
            }
          }
        }
      }
    }

    if (hasRingCarbonyl) {
      return "diaziridin-3-one";
    }
    return "diaziridine";
  }

  // Check for saturated multi-heteroatom heterocycles (5-membered rings)
  if (type !== "aromatic" && totalHetero >= 2 && size === 5) {
    // Check if saturated (no double bonds in ring)
    const ringIndices = atoms.map((atom) => atom.id);
    const doubleBondsInRing = (ringSystem.bonds || []).filter((bond) => {
      const isInRing =
        ringIndices.includes(bond.atom1) && ringIndices.includes(bond.atom2);
      return isInRing && bond.type === BondType.DOUBLE;
    });

    const isSaturated = doubleBondsInRing.length === 0;

    if (isSaturated) {
      // Imidazolidine: 5-membered ring with 2 nitrogens (N-C-C-N-C pattern)
      if (hasNitrogen === 2 && totalHetero === 2) {
        // Check for exocyclic carbonyl on ring carbon
        let hasRingCarbonyl = false;
        if (molecule) {
          for (const bond of molecule.bonds) {
            if (bond.type === BondType.DOUBLE) {
              const atom1 = molecule.atoms[bond.atom1];
              const atom2 = molecule.atoms[bond.atom2];

              if (atom1 && atom2) {
                const atom1InRing = ringIndices.includes(atom1.id);
                const atom2InRing = ringIndices.includes(atom2.id);

                // Check if one atom is a ring carbon and the other is an exocyclic oxygen
                if (
                  (atom1InRing &&
                    atom1.symbol === "C" &&
                    !atom2InRing &&
                    atom2.symbol === "O") ||
                  (atom2InRing &&
                    atom2.symbol === "C" &&
                    !atom1InRing &&
                    atom1.symbol === "O")
                ) {
                  hasRingCarbonyl = true;
                  break;
                }
              }
            }
          }
        }

        if (hasRingCarbonyl) {
          return "imidazolidin-4-one";
        }
        return "imidazolidine";
      }

      // Thiazolidine: 5-membered ring with 1 nitrogen + 1 sulfur (C-S-C-N-C pattern)
      if (hasNitrogen === 1 && hasSulfur === 1 && totalHetero === 2) {
        return "thiazolidine";
      }

      // Oxazolidine: 5-membered ring with 1 nitrogen + 1 oxygen (O-C-N-C-C pattern)
      if (hasNitrogen === 1 && hasOxygen === 1 && totalHetero === 2) {
        return "oxazolidine";
      }

      // Dioxolane: 5-membered ring with 2 oxygens
      if (hasOxygen === 2 && totalHetero === 2) {
        return "dioxolane";
      }
    }

    // Check for partially unsaturated 5-membered heterocycles (one double bond)
    // Examples: thiazoline, imidazoline, oxazoline
    if (!isSaturated) {
      const doubleBondCount = doubleBondsInRing.length;

      // Thiazoline: 5-membered ring with 1 nitrogen + 1 sulfur + 1 C=N double bond
      if (
        hasNitrogen === 1 &&
        hasSulfur === 1 &&
        totalHetero === 2 &&
        doubleBondCount === 1
      ) {
        const doubleBond = doubleBondsInRing[0]!;
        const atom1 = atoms.find((a) => a.id === doubleBond.atom1);
        const atom2 = atoms.find((a) => a.id === doubleBond.atom2);
        // Check if double bond is C=N
        if (
          (atom1?.symbol === "N" && atom2?.symbol === "C") ||
          (atom1?.symbol === "C" && atom2?.symbol === "N")
        ) {
          return "thiazoline";
        }
      }

      // Imidazoline: 5-membered ring with 2 nitrogens + 1 C=N double bond
      if (hasNitrogen === 2 && totalHetero === 2 && doubleBondCount === 1) {
        const doubleBond = doubleBondsInRing[0]!;
        const atom1 = atoms.find((a) => a.id === doubleBond.atom1);
        const atom2 = atoms.find((a) => a.id === doubleBond.atom2);
        // Check if double bond is C=N
        if (
          (atom1?.symbol === "N" && atom2?.symbol === "C") ||
          (atom1?.symbol === "C" && atom2?.symbol === "N")
        ) {
          return "imidazoline";
        }
      }

      // Oxazoline: 5-membered ring with 1 nitrogen + 1 oxygen + 1 C=N double bond
      if (
        hasNitrogen === 1 &&
        hasOxygen === 1 &&
        totalHetero === 2 &&
        doubleBondCount === 1
      ) {
        const doubleBond = doubleBondsInRing[0]!;
        const atom1 = atoms.find((a) => a.id === doubleBond.atom1);
        const atom2 = atoms.find((a) => a.id === doubleBond.atom2);
        // Check if double bond is C=N
        if (
          (atom1?.symbol === "N" && atom2?.symbol === "C") ||
          (atom1?.symbol === "C" && atom2?.symbol === "N")
        ) {
          return "oxazoline";
        }
      }
    }
  }

  // Check for saturated heterocycles (3-6 membered rings with one heteroatom)
  if (type !== "aromatic" && totalHetero === 1) {
    // Check if saturated (no double bonds in ring)
    const _molecule = { atoms, bonds: ringSystem.bonds || [] };
    const ringIndices = atoms.map((atom) => atom.id);
    const isSaturated = !ringIndices.some((_atomIdx: number) => {
      return (ringSystem.bonds || []).some((bond) => {
        const isInRing =
          ringIndices.includes(bond.atom1) && ringIndices.includes(bond.atom2);
        return isInRing && bond.type === BondType.DOUBLE;
      });
    });

    if (isSaturated) {
      // 3-membered rings
      if (size === 3 && hasOxygen === 1) return "oxirane";
      if (size === 3 && hasNitrogen === 1) return "azirane";
      if (size === 3 && hasSulfur === 1) return "thiirane";

      // 4-membered rings
      if (size === 4 && hasOxygen === 1) return "oxetane";
      if (size === 4 && hasNitrogen === 1) return "azetane";
      if (size === 4 && hasSulfur === 1) return "thietane";

      // 5-membered rings
      if (size === 5 && hasOxygen === 1) return "oxolane";
      if (size === 5 && hasNitrogen === 1) return "azolane";
      if (size === 5 && hasSulfur === 1) return "thiolane";

      // 6-membered rings
      if (size === 6 && hasOxygen === 1) return "oxane";
      if (size === 6 && hasNitrogen === 1) return "azane";
      if (size === 6 && hasSulfur === 1) return "thiane";
    }
  }

  // For aromatic carbocycles
  if (type === "aromatic") {
    if (size === 6) return "benzene";
    if (size === 5) return "cyclopentadiene";
    if (size === 7) return "cycloheptatriene";
    return `aromatic-${size}-membered`;
  }

  // Default aliphatic ring names
  const ringNames: { [key: number]: string } = {
    3: "cyclopropane",
    4: "cyclobutane",
    5: "cyclopentane",
    6: "cyclohexane",
    7: "cycloheptane",
    8: "cyclooctane",
  };

  return ringNames[size] || `cyclo${size}ane`;
}

/**
 * Generate locants for ring atoms
 */
export function generateRingLocants(ringSystem: { atoms: Atom[] }): number[] {
  return ringSystem.atoms.map((atom, index: number) => index + 1);
}

/**
 * Helper function to generate von Baeyer bicyclo/tricyclo names
 */
export function generateBridgedPolycyclicName(
  bridgedRings: number[][],
  molecule: Molecule,
): { name: string; vonBaeyerNumbering?: Map<number, number> } | null {
  // Use the engine's own naming function
  const {
    generateClassicPolycyclicName,
  } = require("../../naming/iupac-rings/utils");
  return generateClassicPolycyclicName(molecule, bridgedRings);
}

/**
 * Helper function to generate spiro names
 */
export function generateSpiroPolycyclicName(
  spiroRings: number[][],
  molecule: Molecule,
): string | null {
  // Use the engine's own naming function
  const { generateSpiroName } = require("../../naming/iupac-rings/index");
  return generateSpiroName(spiroRings, molecule);
}

/**
 * Helper function to generate fused system names
 */
export function generateFusedPolycyclicName(
  fusedRings: number[][],
  molecule: Molecule,
): string | null {
  // For now, delegate to existing fused naming logic
  // This could be enhanced with specific P-2.5 rules
  const {
    identifyPolycyclicPattern,
  } = require("../../naming/iupac-rings/fused-naming");
  return identifyPolycyclicPattern(fusedRings, molecule);
}
