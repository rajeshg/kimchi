import type { IUPACRule } from "../types";
import { RulePriority } from "../types";
import { ExecutionPhase, type ContextState } from "../immutable-context";
import type { ImmutableNamingContext } from "../immutable-context";
import type {
  FunctionalGroup,
  ParentStructure,
  MultipleBond,
  StructuralSubstituent,
} from "../types";
import type { NamingSubstituent } from "../naming/iupac-types";
import type { Molecule, Atom } from "types";
import { buildEsterName } from "../utils/ester-naming";
import { buildAmideName } from "../utils/amide-naming";
import {
  nameAlkylSulfanylSubstituent,
  namePhosphorylSubstituent,
  namePhosphanylSubstituent,
} from "../naming/iupac-chains";

/**
 * Extended ParentStructure type with assembly-phase properties
 */
type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
  substituents?: (StructuralSubstituent | NamingSubstituent)[];
  size?: number;
};

/**
 * Extended FunctionalGroup with optional locant property for assembly
 */
type FunctionalGroupExtended = FunctionalGroup & {
  locant?: number;
};

/**
 * Extended StructuralSubstituent with optional assembly properties
 */
type StructuralSubstituentExtended = StructuralSubstituent & {
  assembledName?: string;
  prefix?: string;
  locants?: number[];
  suffix?: string;
};

/**
 * Union type for items that can be either FunctionalGroup or StructuralSubstituent with extensions
 */
type StructuralSubstituentOrFunctionalGroup =
  | FunctionalGroupExtended
  | StructuralSubstituentExtended;

/**
 * Name Assembly Layer Rules
 *
 * This layer assembles the final IUPAC name from all the processed
 * information, following Blue Book rules for name construction.
 *
 * Reference: Blue Book - Name construction and assembly rules
 * https://iupac.qmul.ac.uk/BlueBook/
 */

/**
 * Traverse the molecular graph from a sulfur atom to collect all connected atoms
 * that are part of the substituent (excluding the main chain).
 *
 * @param molecule - The molecule
 * @param sulfurIdx - Index of the sulfur atom
 * @param mainChainAtoms - Set of atom indices that are part of the main chain (to exclude)
 * @returns Set of atom indices that make up the complete substituent
 */
function collectSubstituentAtoms(
  molecule: Molecule,
  sulfurIdx: number,
  mainChainAtoms: Set<number>,
): Set<number> {
  const substituentAtoms = new Set<number>();
  const visited = new Set<number>();
  const queue: number[] = [sulfurIdx];

  // Add sulfur to the substituent
  substituentAtoms.add(sulfurIdx);
  visited.add(sulfurIdx);

  while (queue.length > 0) {
    const currentIdx = queue.shift();
    if (currentIdx === undefined) continue;

    const currentAtom = molecule.atoms[currentIdx];
    if (!currentAtom) continue;

    // Find all bonds connected to this atom
    for (const bond of molecule.bonds) {
      let neighborIdx: number | null = null;

      if (bond.atom1 === currentAtom.id) {
        neighborIdx = molecule.atoms.findIndex((a) => a.id === bond.atom2);
      } else if (bond.atom2 === currentAtom.id) {
        neighborIdx = molecule.atoms.findIndex((a) => a.id === bond.atom1);
      }

      if (neighborIdx !== null && neighborIdx !== -1) {
        // Skip if already visited
        if (visited.has(neighborIdx)) continue;

        // Skip if this atom is part of the main chain
        if (mainChainAtoms.has(neighborIdx)) continue;

        // Add to substituent and continue traversal
        substituentAtoms.add(neighborIdx);
        visited.add(neighborIdx);
        queue.push(neighborIdx);
      }
    }
  }

  if (process.env.VERBOSE) {
    console.log(
      `[collectSubstituentAtoms] sulfur=${sulfurIdx}, collected ${substituentAtoms.size} atoms: ${Array.from(substituentAtoms).join(",")}`,
    );
  }

  return substituentAtoms;
}

/**
 * Rule: StructuralSubstituent Alphabetization
 *
 * Arrange substituents in alphabetical order according to Blue Book rules.
 */
export const SUBSTITUENT_ALPHABETIZATION_RULE: IUPACRule = {
  id: "substituent-alphabetization",
  name: "StructuralSubstituent Alphabetization",
  description: "Arrange substituents in alphabetical order",
  blueBookReference: "P-14.3 - Alphabetization of substituents",
  priority: RulePriority.TEN, // 100 - Run first in assembly phase
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState()
      .functionalGroups as FunctionalGroup[];
    return functionalGroups && functionalGroups.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState()
      .functionalGroups as FunctionalGroup[];

    if (!functionalGroups || functionalGroups.length === 0) {
      return context;
    }

    // Separate principal groups from substituents
    const principalGroups = functionalGroups.filter(
      (group: FunctionalGroup) => group.isPrincipal,
    );
    const substituentGroups = functionalGroups.filter(
      (group: FunctionalGroup) => !group.isPrincipal,
    );

    // Alphabetize substituents
    const alphabetizedStructuralSubstituents = substituentGroups.sort(
      (a: FunctionalGroup, b: FunctionalGroup) => {
        const prefixA = a.prefix || a.type;
        const prefixB = b.prefix || b.type;
        return prefixA.localeCompare(prefixB);
      },
    );

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        functionalGroups: [
          ...principalGroups,
          ...alphabetizedStructuralSubstituents,
        ],
      }),
      "substituent-alphabetization",
      "StructuralSubstituent Alphabetization",
      "P-14.3",
      ExecutionPhase.ASSEMBLY,
      `Alphabetized ${alphabetizedStructuralSubstituents.length} substituent(s)`,
    );
  },
};

/**
 * Rule: Locant Assignment Assembly
 *
 * Combine locants with their corresponding substituents/groups.
 */
export const LOCANT_ASSIGNMENT_ASSEMBLY_RULE: IUPACRule = {
  id: "locant-assembly",
  name: "Locant Assignment Assembly",
  description: "Combine locants with substituents and functional groups",
  blueBookReference: "P-14 - Locant assignment assembly",
  priority: RulePriority.NINE, // 90 - After alphabetization
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState()
      .functionalGroups as FunctionalGroup[];
    return functionalGroups && functionalGroups.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState()
      .functionalGroups as FunctionalGroup[];
    const parentStructure = context.getState().parentStructure;

    if (!functionalGroups || !parentStructure) {
      return context;
    }

    // Build named groups with locants
    const assembledGroups = functionalGroups.map((group: FunctionalGroup) => {
      const locants =
        group.locants && group.locants.length > 0
          ? group.locants.sort((a: number, b: number) => a - b).join(",")
          : "";

      if (process.env.VERBOSE) {
        console.log(
          `[LOCANT_ASSEMBLY] Processing group: type=${group.type}, prefix=${group.prefix}, isPrincipal=${group.isPrincipal}, locants array=${JSON.stringify(group.locants)}, locants string=${locants}`,
        );
      }

      const prefix = group.prefix || "";
      const suffix = group.suffix || "";
      const type = group.type;

      let name = "";

      // For NON-PRINCIPAL functional groups, use only the prefix as substituent name
      // Example: alcohol (non-principal) → "hydroxy" not "hydroxyalcoholol"
      if (!group.isPrincipal && prefix) {
        name = locants ? `${locants}-${prefix}` : prefix;
      }
      // For alkoxy groups, the prefix IS the full substituent name (e.g., 'methoxy')
      // So we don't append the type 'alkoxy'
      else if (type === "alkoxy" && prefix) {
        name = locants ? `${locants}-${prefix}` : prefix;
      }
      // For PRINCIPAL functional groups, use the full name assembly
      else {
        if (locants) {
          name = `${locants}-${prefix}${type}${suffix}`;
        } else {
          name = `${prefix}${type}${suffix}`;
        }
      }

      return {
        ...group,
        assembledName: name,
        locantString: locants,
      };
    });

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        functionalGroups: assembledGroups,
      }),
      "locant-assembly",
      "Locant Assignment Assembly",
      "P-14",
      ExecutionPhase.ASSEMBLY,
      `Assembled names for ${assembledGroups.length} group(s)`,
    );
  },
};

/**
 * Rule: Multiplicative Prefixes
 *
 * Apply multiplicative prefixes (di-, tri-, tetra-, etc.) for identical groups.
 */
export const MULTIPLICATIVE_PREFIXES_RULE: IUPACRule = {
  id: "multiplicative-prefixes",
  name: "Multiplicative Prefixes",
  description: "Apply multiplicative prefixes for identical groups",
  blueBookReference: "P-16.1 - Multiplicative prefixes",
  priority: RulePriority.EIGHT, // 80 - After locant assembly
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState()
      .functionalGroups as FunctionalGroup[];
    if (!functionalGroups || functionalGroups.length === 0) return false;

    // Check for duplicate group types
    const groupTypes = functionalGroups.map((group) => group.type);
    return groupTypes.some(
      (type) => groupTypes.filter((t) => t === type).length > 1,
    );
  },
  action: (context) => {
    const functionalGroups = context.getState().functionalGroups;

    if (!functionalGroups) {
      return context;
    }

    // Group identical types (only consider principal groups for multiplicative prefixes)
    const groupedTypes = new Map<string, FunctionalGroup[]>();
    functionalGroups.forEach((group: FunctionalGroup) => {
      // Only apply multiplicative prefixes to principal groups
      // Non-principal groups should be treated as substituents
      if (!group.isPrincipal) {
        return;
      }
      const type = group.type;
      if (!groupedTypes.has(type)) {
        groupedTypes.set(type, []);
      }
      groupedTypes.get(type)!.push(group);
    });

    // Apply multiplicative prefixes
    const processedGroups: FunctionalGroup[] = [];

    for (const [type, groups] of groupedTypes.entries()) {
      if (groups.length > 1) {
        // Multiple identical groups - apply prefix
        const count = groups.length;
        const prefix = getMultiplicativePrefix(count);
        const firstGroup = groups[0];
        if (!firstGroup) continue;

        const baseName = firstGroup.assembledName || type;

        // Remove individual locants and apply multiplicative prefix
        const cleanName = baseName.replace(/^\d+,?-/, ""); // Remove leading locants
        const finalName = `${prefix}${cleanName}`;

        processedGroups.push({
          ...firstGroup,
          assembledName: finalName,
          isMultiplicative: true,
          multiplicity: count,
          locantString: groups
            .map((g: FunctionalGroup) => g.locants?.[0] || -1)
            .filter((l) => l > 0)
            .sort((a, b) => a - b)
            .join(","),
        });
      } else {
        // Single group - keep as is
        const singleGroup = groups[0];
        if (singleGroup) {
          processedGroups.push(singleGroup);
        }
      }
    }

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        functionalGroups: processedGroups,
      }),
      "multiplicative-prefixes",
      "Multiplicative Prefixes",
      "P-16.1",
      ExecutionPhase.ASSEMBLY,
      `Applied multiplicative prefixes to ${groupedTypes.size} group type(s)`,
    );
  },
};

/**
 * Rule: Parent Structure Name Assembly
 *
 * Build the complete parent structure name with appropriate suffixes.
 */
export const PARENT_NAME_ASSEMBLY_RULE: IUPACRule = {
  id: "parent-name-assembly",
  name: "Parent Structure Name Assembly",
  description: "Build complete parent structure name",
  blueBookReference: "P-2 - Parent structure names",
  priority: RulePriority.SEVEN, // 70 - Build parent name structure
  conditions: (context) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure !== undefined;
  },
  action: (context) => {
    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;

    if (!parentStructure) {
      return context;
    }

    let parentName = "";

    if (parentStructure.type === "chain") {
      parentName = buildChainName(parentStructure, functionalGroups);
    } else if (parentStructure.type === "ring") {
      parentName = buildRingName(parentStructure, functionalGroups);
    } else if (parentStructure.type === "heteroatom") {
      parentName = buildHeteroatomName(parentStructure, functionalGroups);
    } else {
      parentName = parentStructure.name || "unknown";
    }

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          assembledName: parentName,
        },
      }),
      "parent-name-assembly",
      "Parent Structure Name Assembly",
      "P-2",
      ExecutionPhase.ASSEMBLY,
      `Assembled parent name: ${parentName}`,
    );
  },
};

/**
 * Rule: Complete Name Assembly
 *
 * Assemble the final IUPAC name from all components.
 */
export const COMPLETE_NAME_ASSEMBLY_RULE: IUPACRule = {
  id: "complete-name-assembly",
  name: "Complete Name Assembly",
  description: "Assemble the final IUPAC name from all components",
  blueBookReference: "Complete name construction",
  priority: RulePriority.SIX, // 60 - Assemble complete name
  conditions: (context) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure !== undefined;
  },
  action: (context) => {
    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;
    const nomenclatureMethod = context.getState().nomenclatureMethod;
    const molecule = context.getState().molecule;

    if (process.env.VERBOSE) {
      console.log(
        "[COMPLETE_NAME_ASSEMBLY_RULE] nomenclatureMethod:",
        nomenclatureMethod,
      );
      console.log(
        "[COMPLETE_NAME_ASSEMBLY_RULE] parentStructure:",
        parentStructure?.type,
      );
      console.log(
        "[COMPLETE_NAME_ASSEMBLY_RULE] functionalGroups:",
        functionalGroups?.map((g) => g.type),
      );
    }

    if (!parentStructure) {
      return context.withConflict(
        {
          ruleId: "complete-name-assembly",
          conflictType: "state_inconsistency",
          description: "No parent structure available for name assembly",
          context: {},
        },
        "complete-name-assembly",
        "Complete Name Assembly",
        "Complete construction",
        ExecutionPhase.ASSEMBLY,
        "No parent structure available for name assembly",
      );
    }

    // Build final name based on nomenclature method
    let finalName = "";

    if (nomenclatureMethod === "functional_class") {
      if (process.env.VERBOSE)
        console.log(
          "[COMPLETE_NAME_ASSEMBLY_RULE] Building functional class name",
        );
      finalName = buildFunctionalClassName(
        parentStructure,
        functionalGroups,
        molecule,
      );
    } else {
      if (process.env.VERBOSE)
        console.log("[COMPLETE_NAME_ASSEMBLY_RULE] Building substitutive name");
      finalName = buildSubstitutiveName(
        parentStructure,
        functionalGroups,
        molecule,
      );
    }

    if (process.env.VERBOSE)
      console.log("[COMPLETE_NAME_ASSEMBLY_RULE] finalName:", finalName);

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        finalName: finalName,
        nameAssemblyComplete: true,
      }),
      "complete-name-assembly",
      "Complete Name Assembly",
      "Complete construction",
      ExecutionPhase.ASSEMBLY,
      `Final name assembled: ${finalName}`,
    );
  },
};

/**
 * Rule: Name Validation and Finalization
 *
 * Validate the complete name and make final adjustments.
 */
export const NAME_VALIDATION_RULE: IUPACRule = {
  id: "name-validation",
  name: "Name Validation and Finalization",
  description: "Validate and finalize the IUPAC name",
  blueBookReference: "Complete name validation",
  priority: RulePriority.FIVE, // 50 - Validate assembled name
  conditions: (context) => {
    const finalName = context.getState().finalName;
    return !!finalName && finalName.length > 0;
  },
  action: (context) => {
    const finalName = context.getState().finalName;
    const parentStructure = context.getState().parentStructure;

    if (!finalName) {
      return context.withConflict(
        {
          ruleId: "name-validation",
          conflictType: "state_inconsistency",
          description: "No final name available for validation",
          context: {},
        },
        "name-validation",
        "Name Validation and Finalization",
        "Validation",
        ExecutionPhase.ASSEMBLY,
        "No final name available for validation",
      );
    }

    // Validate name structure
    const validationResult = validateIUPACName(finalName, parentStructure);

    // Apply final formatting
    const formattedName = applyFinalFormatting(finalName);

    // Calculate confidence based on completeness
    const confidence = calculateNameConfidence(context.getState());

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        finalName: formattedName,
        nameValidation: validationResult,
        confidence: confidence,
      }),
      "name-validation",
      "Name Validation and Finalization",
      "Validation",
      ExecutionPhase.ASSEMBLY,
      `Name validated and formatted: ${formattedName}`,
    );
  },
};

/**
 * Rule: Name Assembly Complete
 *
 * Final rule to mark the assembly phase as complete.
 */
export const NAME_ASSEMBLY_COMPLETE_RULE: IUPACRule = {
  id: "name-assembly-complete",
  name: "Name Assembly Complete",
  description: "Mark the name assembly phase as complete",
  blueBookReference: "Assembly phase completion",
  priority: RulePriority.FOUR, // 40 - Final completion step
  conditions: (context) => {
    const finalName = context.getState().finalName;
    return !!finalName && finalName.length > 0;
  },
  action: (context) => {
    const finalName = context.getState().finalName;

    if (!finalName) {
      return context.withConflict(
        {
          ruleId: "name-assembly-complete",
          conflictType: "state_inconsistency",
          description: "No final name available for completion",
          context: {},
        },
        "name-assembly-complete",
        "Name Assembly Complete",
        "Assembly",
        ExecutionPhase.ASSEMBLY,
        "No final name available for completion",
      );
    }

    return context.withPhaseCompletion(
      ExecutionPhase.ASSEMBLY,
      "name-assembly-complete",
      "Name Assembly Complete",
      "Assembly",
      ExecutionPhase.ASSEMBLY,
      `Name assembly phase completed successfully: ${finalName}`,
    );
  },
};

/**
 * Helper functions for name assembly
 */

function buildChainName(
  parentStructure: ParentStructure,
  functionalGroups: FunctionalGroup[],
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
      const multiplicativePrefix = getMultiplicativePrefix(doubleBonds.length);
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

function buildRingName(
  parentStructure: ParentStructure,
  _functionalGroups: FunctionalGroup[],
): string {
  const ring = parentStructure.ring;
  if (!ring) {
    return parentStructure.name || "unknown-ring";
  }

  // PRIORITY ORDER: Use name from parent structure identification phase if already set
  // This respects IUPAC P-22 (monocyclic) naming which handles heterocycles
  // The parent structure name was set by generateRingName() which properly identifies
  // heterocycles like pyridine, furan, thiophene, etc.
  //
  // NOTE: We return the BASE NAME only (without substituents) because buildSubstitutiveName()
  // will handle all substituent assembly with proper bis/tris vs di/tri logic.
  if (
    parentStructure.name &&
    parentStructure.name !== "unknown" &&
    parentStructure.name !== "unknown-ring"
  ) {
    return parentStructure.name;
  }

  // FALLBACK: Generic ring naming for carbocycles without specific names
  // This is simplified - real implementation would use comprehensive ring naming
  const ringNames: { [key: number]: string } = {
    3: "cyclopropane",
    4: "cyclobutane",
    5: "cyclopentane",
    6: "cyclohexane",
    7: "cycloheptane",
    8: "cyclooctane",
  };

  const size = ring.size || (ring.atoms ? ring.atoms.length : 0);
  const baseName = ringNames[size] || `cyclo${size - 1}ane`;

  // NOTE: StructuralSubstituents will be handled by buildSubstitutiveName() with proper bis/tris logic
  // Check for aromatic naming
  if (ring.type === "aromatic" && size === 6) {
    return "benzene";
  }

  return baseName;
}

function buildHeteroatomName(
  parentStructure: ParentStructure,
  _functionalGroups: FunctionalGroup[],
): string {
  const heteroatom = parentStructure.heteroatom;
  if (!heteroatom) {
    return parentStructure.name || "unknown-heteroatom";
  }

  // For simple heteroatom hydrides, just return the parent hydride name
  // StructuralSubstituents would be handled by prefix addition in substitutive nomenclature
  return parentStructure.name || "unknown-heteroatom";
}

function buildFunctionalClassName(
  parentStructure: ParentStructure,
  functionalGroups: FunctionalGroup[],
  molecule: Molecule,
): string {
  // Functional class nomenclature: substituent name + parent name + functional class term
  const functionalGroup = functionalGroups.find(
    (group) =>
      group.type === "ester" ||
      group.type === "amide" ||
      group.type === "thiocyanate",
  );

  if (process.env.VERBOSE) {
    console.log("[buildFunctionalClassName] functionalGroup:", functionalGroup);
  }

  if (!functionalGroup) {
    return buildSubstitutiveName(parentStructure, functionalGroups, molecule);
  }

  // Functional class naming
  switch (functionalGroup.type) {
    case "ester":
      return buildEsterName(
        parentStructure,
        functionalGroup,
        molecule,
        functionalGroups,
      );
    case "amide":
      return buildAmideName(
        parentStructure,
        functionalGroup,
        molecule,
        functionalGroups,
      );
    case "thiocyanate":
      return buildThiocyanateName(parentStructure, functionalGroups);
    default:
      return buildSubstitutiveName(parentStructure, functionalGroups, molecule);
  }
}

function buildThiocyanateName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
): string {
  // Thiocyanate functional class nomenclature: [alkyl]thiocyanate
  // Example: CC(=O)CCSC#N → 3-oxobutylthiocyanate

  if (process.env.VERBOSE) {
    console.log(
      "[buildThiocyanateName] parentStructure:",
      JSON.stringify(parentStructure, null, 2),
    );
    console.log(
      "[buildThiocyanateName] functionalGroups:",
      functionalGroups.map((g: FunctionalGroup) => ({
        type: g.type,
        atoms: g.atoms,
      })),
    );
  }

  // Get all functional groups except the thiocyanate
  const otherGroups = functionalGroups.filter(
    (group) => group.type !== "thiocyanate",
  );

  if (process.env.VERBOSE) {
    console.log(
      "[buildThiocyanateName] otherGroups:",
      otherGroups.map((g: FunctionalGroup) => ({
        type: g.type,
        atoms: g.atoms,
      })),
    );
  }

  // Build the alkyl portion name from parent structure + other substituents
  const alkylName = buildAlkylGroupName(parentStructure, otherGroups);

  if (process.env.VERBOSE) {
    console.log("[buildThiocyanateName] alkylName:", alkylName);
  }

  // Add "thiocyanate" at the end with space (functional class nomenclature)
  return `${alkylName} thiocyanate`;
}

function buildAlkylGroupName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
): string {
  // Build alkyl group name (like "3-oxobutyl")
  // This is similar to buildSubstitutiveName but ends with "yl" instead of "ane"

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] parentStructure keys:",
      Object.keys(parentStructure),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.substituents:",
      parentStructure.substituents?.map((s) => ({
        type: s.type,
        locant: "locant" in s ? s.locant : undefined,
      })),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.chain keys:",
      Object.keys(parentStructure.chain || {}),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.chain.substituents:",
      parentStructure.chain?.substituents?.map((s: StructuralSubstituent) => ({
        type: s.type,
        locant: s.locant,
      })),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.chain keys:",
      Object.keys(parentStructure.chain || {}),
    );
    console.log(
      "[buildAlkylGroupName] parentStructure.chain.substituents:",
      parentStructure.chain?.substituents?.map((s: StructuralSubstituent) => ({
        type: s.type,
        locant: s.locant,
      })),
    );
  }

  // For functional class nomenclature with thiocyanate:
  // The chain needs to be renumbered from the attachment point (where thiocyanate was attached)
  // The attachment point is the first atom in the chain (lowest locant becomes 1)

  let name = "";

  // If the parentStructure already has an assembledName,
  // convert it to alkyl form to use as base name
  let useAssembledNameAsBase = false;
  if (parentStructure && parentStructure.assembledName) {
    // For alkyl group names, we need to convert the assembledName (e.g., "methane")
    // to alkyl form (e.g., "methyl") by removing "ane" and adding "yl"
    const assembledName = parentStructure.assembledName;
    if (process.env.VERBOSE) {
      console.log("[buildAlkylGroupName] Using assembledName:", assembledName);
    }
    if (assembledName.endsWith("ane")) {
      name = assembledName.replace(/ane$/, "yl");
    } else {
      name = assembledName + "yl";
    }
    if (process.env.VERBOSE) {
      console.log("[buildAlkylGroupName] Converted to alkyl name:", name);
    }
    // Use assembledName as base but still allow substituents
    useAssembledNameAsBase = true;
  }

  // Add substituents from functional groups
  // For functional class nomenclature, ALL functional groups (except thiocyanate) become substituents
  const fgStructuralSubstituents = functionalGroups; // Don't filter by isPrincipal - include all
  const parentStructuralSubstituents = parentStructure.substituents || [];

  // Filter out thiocyanate substituents from parent
  const chainStructuralSubstituents = parentStructure.chain?.substituents || [];
  const allParentStructuralSubstituents = [
    ...parentStructuralSubstituents,
    ...chainStructuralSubstituents,
  ];
  // Filter out thiocyanate substituents and deduplicate by type+locant
  const seen = new Set<string>();
  const filteredParentStructuralSubstituents = allParentStructuralSubstituents
    .filter(
      (sub) =>
        sub.type !== "thiocyanate" &&
        sub.type !== "thiocyano" &&
        sub.name !== "thiocyano",
    )
    .filter((sub) => {
      const key = `${sub.type}:${"locant" in sub ? sub.locant || "" : ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] parentStructuralSubstituents:",
      parentStructuralSubstituents.map((s) => ({
        type: s.type,
        locant: "locant" in s ? s.locant : undefined,
      })),
    );
    console.log(
      "[buildAlkylGroupName] chainStructuralSubstituents:",
      chainStructuralSubstituents.map((s: StructuralSubstituent) => ({
        type: s.type,
        locant: s.locant,
      })),
    );
    console.log(
      "[buildAlkylGroupName] filteredParentStructuralSubstituents:",
      filteredParentStructuralSubstituents.map((s) => ({
        type: s.type,
        locant: "locant" in s ? s.locant : undefined,
      })),
    );
  }

  // Renumber functional groups based on chain position
  const chain = parentStructure.chain;
  const chainAtomIds = chain?.atoms?.map((a: Atom) => a.id) || [];

  // Create a map from atom ID to new locant (1-indexed from start of chain)
  // For functional class nomenclature, number from the ATTACHMENT POINT (end of chain)
  // back toward the other end. This means we reverse the chain numbering.
  // Example: CC(=O)CCSC#N
  // Chain: [C(0), C(1), C(3), C(4)] where C(4) is attached to S-C≡N
  // Standard numbering: C(0)=1, C(1)=2, C(3)=3, C(4)=4
  // Functional class numbering: C(4)=1, C(3)=2, C(1)=3, C(0)=4
  // So ketone at C(1) gets locant 3 → "3-oxobutyl thiocyanate"
  const atomIdToLocant = new Map<number, number>();
  chainAtomIds.forEach((atomId: number, index: number) => {
    // Reverse the numbering: last atom gets 1, first atom gets length
    const reversedLocant = chainAtomIds.length - index;
    atomIdToLocant.set(atomId, reversedLocant);
  });

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] atomIdToLocant:",
      Array.from(atomIdToLocant.entries()),
    );
  }

  // Renumber functional groups
  const renumberedFgStructuralSubstituents: FunctionalGroupExtended[] =
    fgStructuralSubstituents.map((group) => {
      if (group.atoms && group.atoms.length > 0) {
        // For ketone, the carbon of C=O is the position
        const carbonAtom = group.atoms[0]; // First atom is typically the C in C=O
        if (!carbonAtom) return group; // Safety check
        const carbonAtomId: number =
          typeof carbonAtom === "object"
            ? carbonAtom.id
            : (carbonAtom as number); // Extract ID if it's an object
        const newLocant = atomIdToLocant.get(carbonAtomId);
        if (newLocant !== undefined) {
          if (process.env.VERBOSE) {
            console.log(
              "[buildAlkylGroupName] Renumbering group:",
              group.type,
              "carbonAtomId:",
              carbonAtomId,
              "newLocant:",
              newLocant,
            );
          }
          return { ...group, locants: [newLocant], locant: newLocant };
        } else {
          if (process.env.VERBOSE) {
            console.log(
              "[buildAlkylGroupName] No locant found for group:",
              group.type,
              "carbonAtomId:",
              carbonAtomId,
              "available locants:",
              Array.from(atomIdToLocant.entries()),
            );
          }
        }
      }
      return group;
    });

  const allStructuralSubstituents: StructuralSubstituentOrFunctionalGroup[] = [
    ...renumberedFgStructuralSubstituents,
    ...filteredParentStructuralSubstituents.filter(
      (sub): sub is StructuralSubstituent => "bonds" in sub,
    ),
  ];

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] renumberedFgStructuralSubstituents:",
      renumberedFgStructuralSubstituents.map((s: FunctionalGroupExtended) => ({
        type: s.type,
        locants: s.locants,
      })),
    );
    console.log(
      "[buildAlkylGroupName] allStructuralSubstituents:",
      allStructuralSubstituents.map(
        (s: StructuralSubstituentOrFunctionalGroup) => ({
          type: s.type,
          name: s.name,
          locant: "locant" in s ? s.locant : undefined,
          locants: "locants" in s ? s.locants : undefined,
        }),
      ),
    );
  }

  // Determine whether the assembledName already includes substituent text
  const parentAssembled = parentStructure.assembledName || "";
  const parentHasAssembledStructuralSubstituents = !!(
    parentAssembled &&
    parentStructure.substituents &&
    parentStructure.substituents.length > 0 &&
    parentStructure.substituents.some((s) => {
      const nameToFind = s.name || s.type;
      return nameToFind && parentAssembled.includes(String(nameToFind));
    })
  );
  const hasFgStructuralSubstituents =
    renumberedFgStructuralSubstituents.length > 0;

  if (process.env.VERBOSE) {
    console.log(
      "[buildAlkylGroupName] parentHasAssembledStructuralSubstituents:",
      parentHasAssembledStructuralSubstituents,
    );
    console.log(
      "[buildAlkylGroupName] allStructuralSubstituents.length:",
      allStructuralSubstituents.length,
    );
    console.log(
      "[buildAlkylGroupName] hasFgStructuralSubstituents:",
      hasFgStructuralSubstituents,
    );
    console.log(
      "[buildAlkylGroupName] useAssembledNameAsBase:",
      useAssembledNameAsBase,
    );
  }

  // If the parent structure already has an assembledName that includes substituents,
  // avoid re-assembling substituents here to prevent duplication. However, we still
  // want to include functional group substituents (like ketones) in alkyl names.
  // Only skip if there are NO functional group substituents to add.
  if (
    allStructuralSubstituents.length > 0 &&
    (hasFgStructuralSubstituents || !parentHasAssembledStructuralSubstituents)
  ) {
    const substituentParts: string[] = [];
    const substituentGroups = new Map<string, number[]>();

    for (const sub of allStructuralSubstituents) {
      // For ketone groups, use "oxo" prefix
      let subName = sub.assembledName || sub.name || sub.prefix || sub.type;

      if (sub.type === "[CX3](=O)[CX4]" || sub.type === "ketone") {
        subName = "oxo";
      }

      if (subName) {
        if (!substituentGroups.has(subName)) {
          substituentGroups.set(subName, []);
        }
        const locant = sub.locant || sub.locants?.[0];
        if (locant) {
          substituentGroups.get(subName)!.push(locant);
        }
      }
    }

    for (const [subName, locants] of substituentGroups.entries()) {
      locants.sort((a, b) => a - b);
      const locantStr = locants.length > 0 ? locants.join(",") + "-" : "";
      const multiplicativePrefix =
        locants.length > 1 ? getMultiplicativePrefix(locants.length) : "";
      const fullSubName = `${locantStr}${multiplicativePrefix}${subName}`;
      substituentParts.push(fullSubName);
    }

    substituentParts.sort((a, b) => {
      const aName = a.split("-").slice(1).join("-");
      const bName = b.split("-").slice(1).join("-");
      return aName.localeCompare(bName);
    });

    if (substituentParts.length > 0) {
      // Join substituent parts with commas if multiple, no trailing hyphen
      const substituentPrefix = substituentParts.join(",");
      if (useAssembledNameAsBase) {
        // For assembled names, prepend substituents to create proper alkyl names like "3-oxobutyl"
        name = substituentPrefix + name;
      } else {
        // For regular names, append substituents
        name += substituentPrefix;
      }
    }
  }

  // Add parent chain name with "yl" ending (no hyphen between prefix and base)
  // Only if we haven't already processed an assembledName
  if (!useAssembledNameAsBase) {
    if (parentStructure.type === "chain") {
      const chain = parentStructure.chain;
      const length = chain?.length || 0;

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
      ];

      let baseName = "alkyl";
      if (length < chainNames.length) {
        baseName = (chainNames[length] ?? "alk") + "yl";
      }

      name += baseName;
    } else {
      name += "alkyl";
    }
  }

  return name;
}

function buildSubstitutiveName(
  parentStructure: ParentStructureExtended,
  functionalGroups: FunctionalGroup[],
  molecule: Molecule,
): string {
  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] parentStructure.type:",
      parentStructure.type,
    );
    console.log(
      "[buildSubstitutiveName] parentStructure.substituents:",
      JSON.stringify(
        parentStructure.substituents?.map((s) => ({
          type: s.type,
          locant: "locant" in s ? s.locant : undefined,
        })),
      ),
    );
    console.log(
      "[buildSubstitutiveName] functionalGroups:",
      JSON.stringify(
        functionalGroups.map((g) => ({
          type: g.type,
          atoms: g.atoms,
          isPrincipal: g.isPrincipal,
          prefix: g.prefix,
          suffix: g.suffix,
        })),
      ),
    );
  }

  let name = "";

  // Add substituents from functional groups (excluding principal group)
  const fgStructuralSubstituents: FunctionalGroupExtended[] =
    functionalGroups.filter((group) => !group.isPrincipal);

  // Find principal functional group atoms to exclude from substituents
  const principalFG = functionalGroups.find((group) => group.isPrincipal);
  const principalGroupAtomIds = principalFG
    ? new Set(principalFG.atoms || [])
    : new Set();
  const principalFGPrefix = principalFG?.prefix; // e.g., "hydroxy" for alcohol

  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] principalGroupAtomIds:",
      Array.from(principalGroupAtomIds),
    );
    console.log(
      "[buildSubstitutiveName] principalFGPrefix:",
      principalFGPrefix,
    );
  }

  // Collect all functional group atoms (both principal and non-principal)
  const allFGAtomIds = new Set<number>();
  for (const fg of functionalGroups) {
    if (fg.atoms) {
      for (const atom of fg.atoms) {
        allFGAtomIds.add(atom.id);
      }
    }
  }

  // For chain parent structures, use parent substituents if they exist
  // Only add functional groups that are NOT already represented in parent substituents
  // This prevents double-counting ethers that are already named as alkoxy substituents
  const parentStructuralSubstituents = (
    parentStructure.substituents || []
  ).filter((sub) => {
    // Exclude if this substituent matches the principal functional group prefix
    // E.g., "hydroxy" substituent matches "alcohol" FG with prefix="hydroxy"
    if (principalFGPrefix && sub.type === principalFGPrefix) {
      if (process.env.VERBOSE) {
        const locant = "locant" in sub ? sub.locant : undefined;
        console.log(
          `[buildSubstitutiveName] excluding substituent ${sub.type} (locant=${locant}) - matches principal FG prefix`,
        );
      }
      return false;
    }

    // Also check by atoms if available
    const subAtoms = sub.atoms || [];
    if (subAtoms.length > 0) {
      // Handle union type: StructuralSubstituent has Atom[], NamingSubstituent has number[]
      const isPrincipal = subAtoms.some((atom) => {
        const atomId = typeof atom === "number" ? atom : atom.id;
        return principalGroupAtomIds.has(atomId);
      });
      if (isPrincipal && process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] excluding substituent ${sub.type} - atoms overlap with principal FG`,
        );
      }
      return !isPrincipal;
    }

    return true;
  });

  // ============================================================================
  // CRITICAL SECTION: Ring Atom Filtering for Heterocycles
  // ============================================================================
  // This section prevents heteroatoms in ring structures from being incorrectly
  // classified as functional group substituents.
  //
  // EXAMPLE: diaziridin-3-one (SMILES: CCC(C)(C)N1C(=O)N1C(C)(C)CC)
  //   Structure: N-C(=O)-N three-membered ring with two tert-butyl substituents
  //   Problem: Without this filtering, N atoms (part of ring) would be
  //            incorrectly identified as "azetidide" or other N-containing FGs
  //   Solution: Collect all ring atom IDs and filter out FGs that overlap
  //
  // IMPORTANT: This logic must run BEFORE name-based filtering because we need
  //            to filter by atom topology (which atoms are IN the ring) before
  //            checking if FG names appear in the parent structure name.
  //
  // FRAGILITY WARNING:
  //   - parentStructure.ring.atoms MUST contain Atom objects with .id property
  //   - fgSub.atoms MUST contain Atom objects with .id property
  //   - If either structure changes to use plain IDs instead of objects,
  //     you MUST update the .id extraction below
  //   - Test case: test/unit/iupac-engine/regressions/heteroatom-groups.test.ts
  // ============================================================================

  const parentRingAtomIds = new Set<number>();
  if (parentStructure.type === "ring" && parentStructure.ring?.atoms) {
    // GUARD: Validate that ring.atoms is an array
    if (!Array.isArray(parentStructure.ring.atoms)) {
      if (process.env.VERBOSE) {
        console.warn(
          `[buildSubstitutiveName] WARNING: parentStructure.ring.atoms is not an array`,
        );
      }
    } else {
      for (const atom of parentStructure.ring.atoms) {
        // CRITICAL: parentStructure.ring.atoms contains Atom objects, not plain IDs
        // We must extract atom.id (Number) from each Atom object
        if (atom && typeof atom === "object" && "id" in atom) {
          parentRingAtomIds.add(atom.id);
        } else {
          // GUARD: Log warning if atom structure is unexpected
          if (process.env.VERBOSE) {
            console.warn(
              `[buildSubstitutiveName] WARNING: Unexpected atom structure in ring.atoms:`,
              atom,
            );
          }
        }
      }
      if (process.env.VERBOSE && parentRingAtomIds.size > 0) {
        console.log(
          `[buildSubstitutiveName] Parent ring atom IDs:`,
          Array.from(parentRingAtomIds),
        );
      }
    }
  }

  // Filter out functional groups whose atoms are part of the parent ring structure
  // This prevents ring heteroatoms from being misidentified as substituents
  const fgStructuralSubstituentFilteredByAtoms =
    fgStructuralSubstituents.filter((fgSub: FunctionalGroupExtended) => {
      // GUARD: Validate fgSub.atoms structure
      if (!fgSub.atoms || !Array.isArray(fgSub.atoms)) {
        // If no atoms array, we can't filter by atom overlap - keep the FG
        return true;
      }

      // Skip filtering if there are no ring atoms to check against
      if (parentRingAtomIds.size === 0) {
        return true;
      }

      // CRITICAL: Extract atom IDs from Atom objects
      // fgSub.atoms contains Atom objects with .id property, not plain numbers
      const fgAtomIds: number[] = [];
      for (const atom of fgSub.atoms) {
        if (atom && typeof atom === "object" && "id" in atom) {
          fgAtomIds.push(atom.id);
        } else {
          // GUARD: Log warning if atom structure is unexpected
          if (process.env.VERBOSE) {
            console.warn(
              `[buildSubstitutiveName] WARNING: Unexpected atom structure in fgSub.atoms:`,
              atom,
            );
          }
        }
      }

      // Check for overlap: if ANY atom in this FG is part of the ring, filter it out
      const hasOverlap = fgAtomIds.some((atomId: number) =>
        parentRingAtomIds.has(atomId),
      );
      if (hasOverlap) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Filtering out FG "${fgSub.type}" (atoms: ${fgAtomIds}) - overlaps with parent ring atoms (ring: ${Array.from(parentRingAtomIds)})`,
          );
        }
        return false; // Exclude this functional group
      }

      return true; // Keep this functional group
    });

  // ============================================================================
  // CRITICAL SECTION: Name-Based Filtering to Prevent Duplicate FG Names
  // ============================================================================
  // Filter out functional groups that are already incorporated in the parent
  // structure name or parent substituent names. This prevents duplicates like:
  //   - "2,2-dimethylpropylsulfonylsulfinyl-5-sulfinyl-7-sulfonyl..."
  //
  // EXAMPLE: sulfonyl-sulfinyl (SMILES: CC(C)(C)CS(=O)S(=O)(=O)CC(C)(C)C)
  //   Structure: Chain with both S=O (sulfinyl) and S(=O)(=O) (sulfonyl) groups
  //   Problem: Without this filtering, "sulfonyl" and "sulfinyl" appear twice:
  //            - Once in parent substituent "2,2-dimethylpropylsulfonylsulfinyl"
  //            - Again as standalone FG substituents "5-sulfinyl" and "7-sulfonyl"
  //   Solution: Check both parent structure name AND parent substituent names
  //
  // IMPORTANT: This must run AFTER atom-based filtering but BEFORE building
  //            the fgLocantTypeMap for deduplication
  //
  // FRAGILITY WARNING:
  //   - Relies on string matching (fgType/fgPrefix appearing in names)
  //   - Length threshold (> 10) prevents false positives but is somewhat arbitrary
  //   - If naming conventions change, this may break
  //   - Test cases: test/unit/iupac-engine/regressions/heteroatom-groups.test.ts
  // ============================================================================

  const parentStructureName = parentStructure.assembledName || "";

  // GUARD: Validate parent substituents structure
  const parentStructuralSubstituentNames: string[] = [];
  if (Array.isArray(parentStructuralSubstituents)) {
    for (const sub of parentStructuralSubstituents) {
      if (sub && typeof sub === "object") {
        const subName = sub.name || sub.type || "";
        if (typeof subName === "string") {
          parentStructuralSubstituentNames.push(subName);
        }
      }
    }
  }

  const fgTypesToFilter = new Set<string>();

  // Check parent structure name for FG type inclusion
  if (parentStructureName && typeof parentStructureName === "string") {
    for (const fgSub of fgStructuralSubstituentFilteredByAtoms) {
      // GUARD: Validate fgSub structure
      if (!fgSub || typeof fgSub !== "object") continue;

      const fgType = fgSub.type;
      const fgPrefix = fgSub.prefix || fgType;

      // GUARD: Validate fgType is a string
      if (typeof fgType !== "string") continue;

      if (
        parentStructureName.includes(fgType) ||
        (fgPrefix && parentStructureName.includes(fgPrefix))
      ) {
        fgTypesToFilter.add(fgType);
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] FG type "${fgType}" already in parent structure name "${parentStructureName}"`,
          );
        }
      }
    }
  }

  // Check parent substituent names for complex substituents
  // CRITICAL: Only filter if FG name appears in a COMPLEX substituent (length > 10)
  // This avoids false positives like filtering "oxy" from "hydroxy"
  if (process.env.VERBOSE) {
    console.log(
      `[buildSubstitutiveName] parentStructuralSubstituentNames for FG filtering:`,
      parentStructuralSubstituentNames,
    );
  }
  for (const fgSub of fgStructuralSubstituentFilteredByAtoms) {
    // GUARD: Validate fgSub structure
    if (!fgSub || typeof fgSub !== "object") continue;

    const fgType = fgSub.type;
    const fgPrefix = fgSub.prefix || fgType;

    // GUARD: Validate fgType is a string
    if (typeof fgType !== "string") continue;

    if (process.env.VERBOSE) {
      console.log(
        `[buildSubstitutiveName] Checking FG type="${fgType}", prefix="${fgPrefix}" against parent subs`,
      );
    }

    // Special handling for alkoxy groups: check by atom overlap instead of name matching
    // because alkoxy FG name is generic "alkoxy" but parent substituent name is specific (e.g., "methoxy", "ethoxy", "2,2-dimethylpropoxy")
    if (
      fgType === "alkoxy" &&
      fgSub.atoms &&
      Array.isArray(fgSub.atoms) &&
      fgSub.atoms.length > 0
    ) {
      // Extract oxygen atom ID from functional group
      const fgAtomIds = new Set<number>();
      for (const atom of fgSub.atoms) {
        const atomId =
          atom && typeof atom === "object" && "id" in atom ? atom.id : atom;
        if (typeof atomId === "number") {
          fgAtomIds.add(atomId);
        }
      }

      // Check if any parent substituent contains this oxygen atom
      for (const parentSub of parentStructuralSubstituents) {
        if (parentSub.atoms && Array.isArray(parentSub.atoms)) {
          const parentSubAtomIds = new Set<number>(
            parentSub.atoms.map((a) =>
              typeof a === "object" && a !== null ? a.id : a,
            ),
          );
          const hasOverlap = Array.from(fgAtomIds).some((atomId) =>
            parentSubAtomIds.has(atomId),
          );
          if (hasOverlap) {
            fgTypesToFilter.add(fgType);
            if (process.env.VERBOSE) {
              console.log(
                `[buildSubstitutiveName] FG type "${fgType}" (atoms: ${Array.from(fgAtomIds)}) overlaps with parent substituent "${parentSub.name || parentSub.type}" (atoms: ${Array.from(parentSubAtomIds)})`,
              );
            }
            break;
          }
        }
      }
      continue; // Skip name-based matching for alkoxy groups
    }

    for (const parentSubName of parentStructuralSubstituentNames) {
      if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName]   Comparing "${fgType}" with parentSubName="${parentSubName}" (length=${parentSubName.length})`,
        );
        console.log(
          `[buildSubstitutiveName]   includes check: ${parentSubName.includes(fgType)}, length check: ${parentSubName.length > 10}`,
        );
      }
      // CRITICAL: Length threshold (> 10) prevents simple false positive matches
      // e.g., "oxy" in "hydroxy" vs "oxy" in "2,2-dimethylpropylsulfonylsulfinyl"
      if (
        parentSubName.length > 10 &&
        (parentSubName.includes(fgType) ||
          (fgPrefix && parentSubName.includes(fgPrefix)))
      ) {
        fgTypesToFilter.add(fgType);
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] FG type "${fgType}" already in parent substituent "${parentSubName}"`,
          );
        }
        break; // No need to check other parent substituents for this FG
      }
    }
  }

  // Apply the filter: remove FGs that are already incorporated in names
  const fgStructuralSubstituentsFinal: FunctionalGroupExtended[] =
    fgStructuralSubstituentFilteredByAtoms.filter(
      (fgSub: FunctionalGroupExtended) => {
        // GUARD: Validate fgSub structure
        if (
          !fgSub ||
          typeof fgSub !== "object" ||
          typeof fgSub.type !== "string"
        ) {
          if (process.env.VERBOSE) {
            console.warn(
              `[buildSubstitutiveName] WARNING: Invalid fgSub structure, keeping it:`,
              fgSub,
            );
          }
          return true; // Keep invalid entries to avoid silent data loss
        }
        return !fgTypesToFilter.has(fgSub.type);
      },
    );

  // ============================================================================
  // CRITICAL SECTION: Locant-Based Deduplication Map
  // ============================================================================
  // Build a map of FG locants and types for deduplication (AFTER filtering)
  // This ensures we only deduplicate against FGs that are actually included in the final name
  //
  // EXAMPLE: bicyclo compound (SMILES: CC1CC2C(=O)CCC(C1O)O2)
  //   Expected: 6-hydroxy-7-methyl-9-oxabicyclo[3.3.1]nonan-2-one
  //   Problem: If we build this map BEFORE filtering, parent substituents get
  //            deduplicated against FGs that are later filtered out, causing
  //            substituents like "6-hydroxy" to be missing from the final name
  //   Solution: Build fgLocantTypeMap from fgStructuralSubstituentsFinal (after filtering)
  //
  // IMPORTANT: This map MUST be built from fgStructuralSubstituentsFinal, NOT fgStructuralSubstituents
  //            Building from the unfiltered list causes incorrect deduplication
  //
  // FRAGILITY WARNING:
  //   - Order matters: this MUST come after all FG filtering steps
  //   - Changing the order of operations will break bicyclo and similar cases
  //   - Test case: test/unit/iupac-engine/regressions/duplicated-substituent.test.ts
  // ============================================================================
  const fgLocantTypeMap = new Map<string, FunctionalGroupExtended>();
  for (const fgSub of fgStructuralSubstituentsFinal) {
    const locant = fgSub.locant ?? fgSub.locants?.[0];
    const type = fgSub.type;
    if (locant !== undefined) {
      // Map alcohol -> hydroxy for comparison
      const normalizedType = type === "alcohol" ? "hydroxy" : type;
      const key = `${locant}-${normalizedType}`;
      fgLocantTypeMap.set(key, fgSub);
    }
  }

  // Filter out parent substituents that duplicate functional group substituents
  const deduplicatedParentSubs = parentStructuralSubstituents.filter((pSub) => {
    // Handle both StructuralSubstituent and NamingSubstituent
    const locant = "locant" in pSub ? pSub.locant : undefined;
    const type = pSub.type;
    if (locant !== undefined && type) {
      const normalizedType = type === "hydroxy" ? "hydroxy" : type;
      const key = `${locant}-${normalizedType}`;
      if (fgLocantTypeMap.has(key)) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] deduplicating parent substituent ${type} at locant ${locant} - already in FG substituents`,
          );
        }
        return false;
      }
    }
    return true;
  });

  const allStructuralSubstituents = [
    ...fgStructuralSubstituentsFinal,
    ...deduplicatedParentSubs,
  ];

  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] fgStructuralSubstituents:",
      JSON.stringify(
        fgStructuralSubstituents.map((s) => ({
          type: s.type,
          name: s.name,
          locant: s.locant ?? s.locants?.[0],
        })),
      ),
    );
    console.log(
      "[buildSubstitutiveName] fgStructuralSubstituentsFinal:",
      JSON.stringify(
        fgStructuralSubstituentsFinal.map((s: FunctionalGroupExtended) => ({
          type: s.type,
          name: s.name,
          locant: s.locant ?? s.locants?.[0],
        })),
      ),
    );
    console.log(
      "[buildSubstitutiveName] parentStructuralSubstituents:",
      JSON.stringify(
        parentStructuralSubstituents.map((s) => ({
          type: s.type,
          name: s.name,
          locant: "locant" in s ? s.locant : undefined,
        })),
      ),
    );
    console.log(
      "[buildSubstitutiveName] deduplicatedParentSubs:",
      JSON.stringify(
        deduplicatedParentSubs.map((s) => ({
          type: s.type,
          name: s.name,
          locant: "locant" in s ? s.locant : undefined,
        })),
      ),
    );
    console.log(
      "[buildSubstitutiveName] allStructuralSubstituents:",
      JSON.stringify(
        allStructuralSubstituents.map((s) => ({
          type: s.type,
          name: s.name,
          locant:
            "locant" in s
              ? s.locant
              : "locants" in s
                ? s.locants?.[0]
                : undefined,
        })),
      ),
    );
  }

  if (allStructuralSubstituents.length > 0) {
    // Build substituent names with locants and multiplicative prefixes
    const substituentParts: string[] = [];
    const _size =
      parentStructure.type === "ring" ? parentStructure.size || 0 : 0;
    const isHeteroatomParent = parentStructure.type === "heteroatom";

    if (isHeteroatomParent) {
      // For heteroatom parents, group identical substituents and add multiplicative prefixes
      const groupedSubs = new Map<string, number>();
      for (const sub of allStructuralSubstituents) {
        // Skip the principal functional group - it will be handled as a suffix
        // But non-principal functional groups should be included as substituents even if they have a suffix property
        const hasSuffix = "suffix" in sub && sub.suffix;
        if (hasSuffix && sub.isPrincipal) continue;

        const assembledName =
          "assembledName" in sub ? sub.assembledName : undefined;
        let subName = assembledName || sub.name || sub.type;

        // Convert thioether to sulfanyl when used as substituent
        if (subName === "thioether") {
          // Extract locant prefix if present (e.g., "10-" from "10-thioether")
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          // For thioethers, use proper naming function to detect phenyl groups
          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            // Check if atoms is Atom[] (StructuralSubstituent/FunctionalGroup)
            // vs number[] (NamingSubstituent)
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              // This is an array of Atom objects
              const atoms = sub.atoms as Atom[];
              // Find the sulfur atom
              const sulfurAtom = atoms.find(
                (atom: Atom) => atom.symbol === "S",
              );
              if (sulfurAtom) {
                const sulfurIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === sulfurAtom.id,
                );
                if (sulfurIdx !== -1) {
                  // Collect main chain atoms to exclude from traversal
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  // Convert to indices
                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  // Traverse from sulfur to collect all substituent atoms
                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    sulfurIdx,
                    mainChainAtomIndices,
                  );

                  // Call the proper naming function
                  const baseName = nameAlkylSulfanylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    sulfurIdx,
                  );
                  // Preserve locant prefix if it was present
                  subName = locantPrefix + baseName;
                  named = true;
                }
              }
            } else if (typeof firstAtom === "number") {
              // This is an array of atom indices (NamingSubstituent)
              const atomIndices = sub.atoms as number[];
              // Find the sulfur atom
              const sulfurIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "S",
              );
              if (sulfurIdx !== undefined) {
                // Collect main chain atoms to exclude from traversal
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                // Traverse from sulfur to collect all substituent atoms
                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  sulfurIdx,
                  mainChainAtomIndices,
                );

                const baseName = nameAlkylSulfanylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  sulfurIdx,
                );
                // Preserve locant prefix if it was present
                subName = locantPrefix + baseName;
                named = true;
              }
            }
          }

          // Fallback to simple replacement if we couldn't use the proper naming function
          if (!named) {
            subName = "sulfanyl";
          }
        }

        if (subName) {
          groupedSubs.set(subName, (groupedSubs.get(subName) || 0) + 1);
        }
      }
      for (const [subName, count] of groupedSubs.entries()) {
        const prefix = count > 1 ? getMultiplicativePrefix(count) : "";
        substituentParts.push(`${prefix}${subName}`);
      }
      // Sort alphabetically
      substituentParts.sort();
    } else {
      // For chain/ring parents, group by name and add locants
      const substituentGroups = new Map<string, number[]>();
      for (const sub of allStructuralSubstituents) {
        // Skip the principal functional group - it will be handled as a suffix
        // But non-principal functional groups should be included as substituents even if they have a suffix property
        const hasSuffix = "suffix" in sub && sub.suffix;
        if (hasSuffix && sub.isPrincipal) continue;

        // For alkoxy groups, use the prefix (e.g., 'methoxy') instead of type ('alkoxy')
        const assembledName =
          "assembledName" in sub ? sub.assembledName : undefined;
        const prefix = "prefix" in sub ? sub.prefix : undefined;
        let subName =
          assembledName ||
          sub.name ||
          (sub.type === "alkoxy" ? prefix : sub.type);

        if (process.env.VERBOSE) {
          console.log(
            `[SUBNAME DEBUG] sub.type=${sub.type}, sub.assembledName=${assembledName}, sub.name=${sub.name}, sub.prefix=${prefix}, final subName=${subName}`,
          );
        }

        // Convert thioether to sulfanyl when used as substituent
        // Handle both "thioether" and "3-thioether" (with locant prefix)
        if (
          subName &&
          (subName === "thioether" || subName.includes("-thioether"))
        ) {
          // Extract locant prefix if present (e.g., "10-" from "10-thioether")
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          // For thioethers, use proper naming function to detect phenyl groups
          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            // Check if atoms is Atom[] (StructuralSubstituent/FunctionalGroup)
            // vs number[] (NamingSubstituent)
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              // This is an array of Atom objects
              const atoms = sub.atoms as Atom[];
              // Find the sulfur atom
              const sulfurAtom = atoms.find(
                (atom: Atom) => atom.symbol === "S",
              );
              if (sulfurAtom) {
                const sulfurIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === sulfurAtom.id,
                );
                if (sulfurIdx !== -1) {
                  // Collect main chain atoms to exclude from traversal
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  // Convert to indices
                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  // Traverse from sulfur to collect all substituent atoms
                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    sulfurIdx,
                    mainChainAtomIndices,
                  );

                  // Call the proper naming function
                  const baseName = nameAlkylSulfanylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    sulfurIdx,
                  );
                  // Preserve locant prefix if it was present
                  subName = locantPrefix + baseName;
                  named = true;

                  if (process.env.VERBOSE) {
                    console.log(
                      `[THIOETHER NAMING] Named thioether as: ${subName} (sulfur at ${sulfurIdx})`,
                    );
                  }
                }
              }
            } else if (typeof firstAtom === "number") {
              // This is an array of atom indices (NamingSubstituent)
              const atomIndices = sub.atoms as number[];
              // Find the sulfur atom
              const sulfurIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "S",
              );
              if (sulfurIdx !== undefined) {
                // Collect main chain atoms to exclude from traversal
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                // Traverse from sulfur to collect all substituent atoms
                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  sulfurIdx,
                  mainChainAtomIndices,
                );

                const baseName = nameAlkylSulfanylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  sulfurIdx,
                );
                // Preserve locant prefix if it was present
                subName = locantPrefix + baseName;
                named = true;

                if (process.env.VERBOSE) {
                  console.log(
                    `[THIOETHER NAMING] Named thioether as: ${subName} (sulfur at ${sulfurIdx})`,
                  );
                }
              }
            }
          }

          // Fallback to simple replacement if we couldn't use the proper naming function
          if (!named) {
            subName = subName.replace("thioether", "sulfanyl");
          }
        }

        // Convert phosphoryl to proper phosphoryl substituent name
        if (
          subName &&
          (subName === "phosphoryl" || subName.includes("-phosphoryl"))
        ) {
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              const atoms = sub.atoms as Atom[];
              const phosphorusAtom = atoms.find(
                (atom: Atom) => atom.symbol === "P",
              );
              if (phosphorusAtom) {
                const phosphorusIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === phosphorusAtom.id,
                );
                if (phosphorusIdx !== -1) {
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    phosphorusIdx,
                    mainChainAtomIndices,
                  );

                  const baseName = namePhosphorylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    phosphorusIdx,
                  );
                  subName = locantPrefix + baseName;
                  named = true;

                  if (process.env.VERBOSE) {
                    console.log(
                      `[PHOSPHORYL NAMING] Named phosphoryl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                    );
                  }
                }
              }
            } else if (typeof firstAtom === "number") {
              const atomIndices = sub.atoms as number[];
              const phosphorusIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "P",
              );
              if (phosphorusIdx !== undefined) {
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  phosphorusIdx,
                  mainChainAtomIndices,
                );

                const baseName = namePhosphorylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  phosphorusIdx,
                );
                subName = locantPrefix + baseName;
                named = true;

                if (process.env.VERBOSE) {
                  console.log(
                    `[PHOSPHORYL NAMING] Named phosphoryl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                  );
                }
              }
            }
          }

          if (!named) {
            subName = "phosphoryl";
          }
        }

        // Convert phosphanyl to proper phosphanyl substituent name
        if (
          subName &&
          (subName === "phosphanyl" || subName.includes("-phosphanyl"))
        ) {
          const locantMatch = subName.match(/^(\d+)-/);
          const locantPrefix = locantMatch ? locantMatch[1] + "-" : "";

          let named = false;
          if ("atoms" in sub && sub.atoms && sub.atoms.length > 0) {
            const firstAtom = sub.atoms[0];
            if (typeof firstAtom === "object" && "symbol" in firstAtom) {
              const atoms = sub.atoms as Atom[];
              const phosphorusAtom = atoms.find(
                (atom: Atom) => atom.symbol === "P",
              );
              if (phosphorusAtom) {
                const phosphorusIdx = molecule.atoms.findIndex(
                  (a: Atom) => a.id === phosphorusAtom.id,
                );
                if (phosphorusIdx !== -1) {
                  const mainChainAtomIds = new Set<number>();
                  if (parentStructure.chain?.atoms) {
                    for (const chainAtom of parentStructure.chain.atoms) {
                      mainChainAtomIds.add(chainAtom.id);
                    }
                  }
                  if (parentStructure.ring?.atoms) {
                    for (const ringAtom of parentStructure.ring.atoms) {
                      mainChainAtomIds.add(ringAtom.id);
                    }
                  }

                  const mainChainAtomIndices = new Set<number>();
                  for (const atomId of mainChainAtomIds) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === atomId,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }

                  const substituentAtomIndices = collectSubstituentAtoms(
                    molecule,
                    phosphorusIdx,
                    mainChainAtomIndices,
                  );

                  const baseName = namePhosphanylSubstituent(
                    molecule,
                    substituentAtomIndices,
                    phosphorusIdx,
                  );
                  subName = locantPrefix + baseName;
                  named = true;

                  if (process.env.VERBOSE) {
                    console.log(
                      `[PHOSPHANYL NAMING] Named phosphanyl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                    );
                  }
                }
              }
            } else if (typeof firstAtom === "number") {
              const atomIndices = sub.atoms as number[];
              const phosphorusIdx = atomIndices.find(
                (idx: number) => molecule.atoms[idx]?.symbol === "P",
              );
              if (phosphorusIdx !== undefined) {
                const mainChainAtomIndices = new Set<number>();
                if (parentStructure.chain?.atoms) {
                  for (const chainAtom of parentStructure.chain.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === chainAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }
                if (parentStructure.ring?.atoms) {
                  for (const ringAtom of parentStructure.ring.atoms) {
                    const idx = molecule.atoms.findIndex(
                      (a: Atom) => a.id === ringAtom.id,
                    );
                    if (idx !== -1) mainChainAtomIndices.add(idx);
                  }
                }

                const substituentAtomIndices = collectSubstituentAtoms(
                  molecule,
                  phosphorusIdx,
                  mainChainAtomIndices,
                );

                const baseName = namePhosphanylSubstituent(
                  molecule,
                  substituentAtomIndices,
                  phosphorusIdx,
                );
                subName = locantPrefix + baseName;
                named = true;

                if (process.env.VERBOSE) {
                  console.log(
                    `[PHOSPHANYL NAMING] Named phosphanyl as: ${subName} (phosphorus at ${phosphorusIdx})`,
                  );
                }
              }
            }
          }

          if (!named) {
            subName = "phosphanyl";
          }
        }

        if (subName) {
          // Check if assembledName already includes locants (e.g., "4-methoxy")
          const alreadyHasLocants =
            assembledName && /^\d+-/.test(assembledName);

          if (alreadyHasLocants) {
            // If assembledName already has locants, use it as-is without grouping
            substituentParts.push(subName);
          } else {
            // Otherwise, collect locants and group by name
            if (!substituentGroups.has(subName)) {
              substituentGroups.set(subName, []);
            }
            // Get locant from substituent - handle both IUPACStructuralSubstituent (position) and StructuralSubstituent (locant/locants)
            let locant: number | undefined;
            if ("locant" in sub && sub.locant !== undefined) {
              locant = sub.locant;
            } else if ("locants" in sub && sub.locants?.[0] !== undefined) {
              locant = sub.locants[0];
            } else if ("position" in sub && sub.position !== undefined) {
              // IUPACStructuralSubstituent uses 'position' field (string) - convert to number
              locant = Number.parseInt(sub.position as string, 10);
            }
            if (process.env.VERBOSE) {
              const subLocant = "locant" in sub ? sub.locant : undefined;
              const subLocants = "locants" in sub ? sub.locants : undefined;
              const subPosition =
                "position" in sub
                  ? (sub as { position: string }).position
                  : undefined;
              console.log(
                `[LOCANT DEBUG] sub.type=${sub.type}, sub.name=${sub.name}, sub.locant=${subLocant}, sub.locants=${JSON.stringify(subLocants)}, sub.position=${subPosition}, calculated locant=${locant}`,
              );
            }
            if (locant && !Number.isNaN(locant)) {
              substituentGroups.get(subName)!.push(locant);
            }
          }
        }
      }
      // Check if there are multiple substituent types or multiple positions
      const _hasMultipleStructuralSubstituentTypes = substituentGroups.size > 1;
      const totalStructuralSubstituents = Array.from(
        substituentGroups.values(),
      ).reduce((sum, locs) => sum + locs.length, 0);

      for (const [subName, locants] of substituentGroups.entries()) {
        locants.sort((a, b) => a - b);
        // For single substituent at position 1 on symmetric rings, omit locant
        // This applies to benzene, cyclohexane, cyclopentane, and other symmetric rings
        // BUT only if it's the ONLY substituent on the ring
        const parentName =
          parentStructure.assembledName || parentStructure.name || "";
        const isSymmetricRing =
          parentName.includes("benzene") || parentName.includes("cyclo");
        const isSingleStructuralSubstituentOnly =
          locants.length === 1 &&
          locants[0] === 1 &&
          isSymmetricRing &&
          totalStructuralSubstituents === 1;

        // IUPAC terminal halogen rule: Omit position 1 locant for terminal halogens
        // on simple unbranched saturated chains with no heteroatoms
        // Example: CCCl -> "chloroethane" not "1-chloroethane"
        const isChainParent = parentStructure.type === "chain";
        const isTerminalPosition = locants.length === 1 && locants[0] === 1;
        const isSingleSubstituent = totalStructuralSubstituents === 1;
        const isHalogen = ["chloro", "bromo", "fluoro", "iodo"].includes(
          subName,
        );
        const isSaturated =
          isChainParent &&
          (parentStructure.chain?.multipleBonds?.length ?? 0) === 0;
        const hasNoHeteroatoms =
          isChainParent &&
          (parentStructure.chain?.atoms?.every((atom) => atom.symbol === "C") ??
            true);
        const isSimpleTerminalHalogen =
          isChainParent &&
          isTerminalPosition &&
          isSingleSubstituent &&
          isHalogen &&
          isSaturated &&
          hasNoHeteroatoms;

        const needsLocant =
          !isSingleStructuralSubstituentOnly && !isSimpleTerminalHalogen;

        // For amines, replace numeric position "1" with "N" if position 1 is nitrogen
        const isAmine = principalFG?.type === "amine";
        const firstAtomIsNitrogen =
          isAmine && parentStructure.chain?.atoms?.[0]?.symbol === "N";
        const locantList = needsLocant
          ? locants.map((loc) =>
              firstAtomIsNitrogen && loc === 1 ? "N" : String(loc),
            )
          : [];
        const locantStr = needsLocant ? locantList.join(",") + "-" : "";

        // Check if substituent name contains nested parentheses
        // Per IUPAC P-14.4: square brackets are used for complex substituents with nested structure
        // that require clarification for alphabetization (e.g., "[1-(2-methylbutoxy)ethoxy]")
        //
        // Pattern to detect:
        // - Contains parentheses AND additional locants: "1-(2-methylbutoxy)ethoxy"
        // - This indicates nested substituents that need square brackets for clarity
        //
        // Do NOT use square brackets for:
        // - Simple locants: "2,2-dimethylpropyl" (just use parentheses)
        // - Linear chains: "2,2-dimethylpropylsulfonyl" (no nesting, use parentheses)
        const hasNestedParentheses =
          subName.includes("(") && subName.includes(")");

        // Also check for complex yl groups that need wrapping
        const hasComplexYlGroup = /\d+-\w+an-\d+-yl/.test(subName); // Pattern: 2-methylbutan-2-yl

        // Check for ring substituents that need wrapping: oxolan-2-yl, thiolane-3-yl, phenyl derivatives, etc.
        // Pattern matches: heterocycle names ending in -an-N-yl or -ol-N-yl
        const hasRingYlGroup =
          /\w+(olan|olane|etane|irane|azol|thiazol)-\d+-yl/.test(subName);

        // Determine if this substituent needs ANY wrapping (brackets or parentheses)
        const needsWrapping =
          hasNestedParentheses ||
          hasComplexYlGroup ||
          hasRingYlGroup ||
          /\d+,\d+/.test(subName);

        // Add multiplicative prefix if there are multiple identical substituents
        // Use bis/tris for complex substituents (those that need wrapping)
        const multiplicativePrefix =
          locants.length > 1
            ? getMultiplicativePrefix(locants.length, needsWrapping)
            : "";

        // Check if already wrapped in brackets or parentheses
        const alreadyWrapped =
          (subName.startsWith("(") && subName.endsWith(")")) ||
          (subName.startsWith("[") && subName.endsWith("]"));

        // Use square brackets ONLY for nested substituents with parentheses
        // Use regular parentheses for simple complex substituents
        // Per IUPAC P-14.4: square brackets distinguish nested complex substituents for alphabetization
        if (
          process.env.VERBOSE &&
          (subName.includes("methyl") || subName.includes("propyl"))
        ) {
          console.log(
            `[WRAP DEBUG] subName="${subName}", hasNestedParentheses=${hasNestedParentheses}, needsWrapping=${needsWrapping}, alreadyWrapped=${alreadyWrapped}`,
          );
        }

        const wrappedSubName = alreadyWrapped
          ? subName
          : hasNestedParentheses
            ? `[${subName}]`
            : needsWrapping
              ? `(${subName})`
              : subName;

        const fullSubName = `${locantStr}${multiplicativePrefix}${wrappedSubName}`;
        substituentParts.push(fullSubName);
      }
    }

    // Sort alphabetically by substituent name
    // Per IUPAC P-14.3: ignore multiplicative prefixes (di-, tri-, tetra-, etc.) when alphabetizing
    substituentParts.sort((a, b) => {
      // Extract name after locants: "2,2-dichloro" → "dichloro" or "2-[1-(2-methylbutoxy)ethoxy]" → "[1-(2-methylbutoxy)ethoxy]"
      const aName = a.split("-").slice(1).join("-");
      const bName = b.split("-").slice(1).join("-");

      // Strip multiplicative prefixes for comparison: "dichloro" → "chloro"
      const stripMultiplicativePrefix = (name: string): string => {
        const prefixes = [
          "di",
          "tri",
          "tetra",
          "penta",
          "hexa",
          "hepta",
          "octa",
          "nona",
          "deca",
        ];
        for (const prefix of prefixes) {
          if (name.startsWith(prefix)) {
            return name.slice(prefix.length);
          }
        }
        return name;
      };

      // Extract the principal substituent name for complex substituents for alphabetization
      // Per IUPAC P-14.4: For complex substituents, alphabetize by the first letter of the complex name
      // ignoring locants, multiplicative prefixes, and opening delimiters
      // Example: "[1-(2-methylbutoxy)ethoxy]" → alphabetize by first letter inside: "m" (from methylbutoxy)
      // Example: "bis(1,1-dimethylethyl)" → alphabetize by "d" (from dimethylethyl)
      const extractPrincipalName = (name: string): string => {
        let result = name;

        // Remove leading brackets/parentheses and locants recursively
        // "[1-(2-methylbutoxy)ethoxy]" → "1-(2-methylbutoxy)ethoxy" → "(2-methylbutoxy)ethoxy"
        while (true) {
          const before = result;

          // Remove leading brackets/parentheses
          if (result.startsWith("(") || result.startsWith("[")) {
            result = result.slice(1);
          }
          // Remove trailing brackets/parentheses
          if (result.endsWith(")") || result.endsWith("]")) {
            result = result.slice(0, -1);
          }
          // Remove leading locants (number followed by hyphen)
          result = result.replace(/^\d+-/, "");

          // If nothing changed, we're done
          if (result === before) break;
        }

        // Now for complex substituents with nested parentheses/brackets,
        // we need to find the first alphabetic character
        // "(2-methylbutoxy)ethoxy" → look inside the first parenthetical → "methylbutoxy"
        if (result.startsWith("(") || result.startsWith("[")) {
          // Find the matching closing delimiter
          const openDelim = result[0];
          const closeDelim = openDelim === "(" ? ")" : "]";
          let depth = 1;
          let i = 1;
          while (i < result.length && depth > 0) {
            if (result[i] === openDelim) depth++;
            else if (result[i] === closeDelim) depth--;
            i++;
          }
          // Extract content inside the first parenthetical
          const insideFirst = result.substring(1, i - 1);
          // Recursively extract from inside, removing any locants
          result = extractPrincipalName(insideFirst);
        }

        return result;
      };

      let aBase = stripMultiplicativePrefix(aName);
      let bBase = stripMultiplicativePrefix(bName);

      // Extract principal names for alphabetization
      aBase = extractPrincipalName(aBase);
      bBase = extractPrincipalName(bBase);

      return aBase.localeCompare(bBase);
    });

    // IUPAC hyphenation rules:
    // 1. If single substituent with no locant (e.g., "methyl"): join directly to parent → "methylcyclohexane"
    // 2. If single substituent with locant (e.g., "2-methyl"): already has hyphen, join directly → "2-methylcyclohexane"
    // 3. If multiple substituents on chain/ring: join with hyphens between them → "2,2-dichloro-1-methylcyclohexane"
    // 4. If multiple substituents on heteroatom (no locants): join directly → "ethylmethylsilane"

    if (process.env.VERBOSE) {
      console.log(
        "[DEBUG] substituentParts before join:",
        JSON.stringify(substituentParts),
      );
      console.log("[DEBUG] isHeteroatomParent:", isHeteroatomParent);
    }

    if (substituentParts.length > 0) {
      // Avoid duplicating substituent text if the parent name already includes it.
      // Normalize strings for a more robust contains check (ignore locants, hyphens and multiplicative prefixes)
      const normalize = (s: string) => {
        return s
          .toString()
          .toLowerCase()
          .replace(/\b(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)\b/g, "") // remove multiplicative prefixes
          .replace(/[\d,[\]()-]/g, "") // remove digits, commas, hyphens and brackets
          .replace(/\s+/g, "")
          .trim();
      };

      const parentAssembled = (
        parentStructure.assembledName ||
        parentStructure.name ||
        ""
      ).toString();
      const normalizedParent = normalize(parentAssembled);

      // If principal functional group exists (e.g., alcohol with prefix 'hydroxy'),
      // remove any substituent entries that are the same as the principal prefix
      const principalPrefix =
        principalFG && principalFG.prefix
          ? principalFG.prefix.toString().toLowerCase()
          : null;

      const extractBaseName = (s: string) => {
        // Remove locants, multiplicative prefixes and delimiters, then return first alpha token
        let t = s.toString().toLowerCase();
        t = t.replace(
          /\b(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)\b/g,
          "",
        );
        t = t.replace(/[\d,[\]()-]/g, "");
        t = t.replace(/\s+/g, "");
        // Return only leading letters
        const m = t.match(/^[a-z]+/);
        return m ? m[0] : t;
      };

      // Filter out parts that duplicate the principal functional-group prefix
      let filteredStructuralSubstituentParts = substituentParts.filter((p) => {
        if (!principalPrefix) return true;
        const base = extractBaseName(p);
        if (!base) return true;
        // Treat 'hydroxy' as duplicate when principal prefix is 'hydroxy'
        if (base === principalPrefix) return false;
        return true;
      });

      // If principal suffix is an alcohol (ol), also filter out any 'hydroxy' substituents
      const principalSuffix =
        principalFG && principalFG.suffix
          ? (principalFG.suffix as string).toLowerCase()
          : "";
      if (principalSuffix.includes("ol")) {
        const beforeFilter = [...filteredStructuralSubstituentParts];
        filteredStructuralSubstituentParts =
          filteredStructuralSubstituentParts.filter((p) => {
            // Keep complex substituents that contain hydroxy as part of their internal structure
            // Complex substituents are identified by having parentheses (e.g., "2-(2-hydroxypropan-2-yl)")
            const isComplexStructuralSubstituent =
              p.includes("(") && p.includes(")");
            const containsHydroxy = /hydroxy/i.test(p);

            // Only filter out simple "hydroxy" substituents, not complex ones
            if (isComplexStructuralSubstituent) {
              return true; // Keep all complex substituents
            }
            return !containsHydroxy; // Filter out simple hydroxy substituents
          });
        if (
          process.env.VERBOSE &&
          beforeFilter.length !== filteredStructuralSubstituentParts.length
        ) {
          console.log(
            `[buildSubstitutiveName] Hydroxy filter removed: ${beforeFilter.filter((p) => !filteredStructuralSubstituentParts.includes(p)).join(", ")}`,
          );
          console.log(
            `[buildSubstitutiveName] Remaining after hydroxy filter: ${filteredStructuralSubstituentParts.join(", ")}`,
          );
        }
      }

      // Find substituentParts that are not (approximately) present in parent
      const missingParts = filteredStructuralSubstituentParts.filter((part) => {
        const normalizedPart = normalize(part);
        const isMissing =
          normalizedPart.length > 0 &&
          !normalizedParent.includes(normalizedPart);
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Checking part "${part}": normalized="${normalizedPart}", parent="${parentAssembled}", normalizedParent="${normalizedParent}", isMissing=${isMissing}`,
          );
        }
        return isMissing;
      });

      if (missingParts.length === 0) {
        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] Skipping adding substituentParts because parent already contains them (approx match)",
          );
          console.log(
            `[buildSubstitutiveName] filteredStructuralSubstituentParts: ${JSON.stringify(filteredStructuralSubstituentParts)}`,
          );
          console.log(
            `[buildSubstitutiveName] normalizedParent: "${normalizedParent}"`,
          );
        }
      } else {
        // Normalize individual missing parts to ensure locant hyphens exist (e.g., "6hydroxy" -> "6-hydroxy")
        const fixPart = (p: string) => {
          let s = p.toString();
          // Ensure leading locant has a hyphen: "6hydroxy" -> "6-hydroxy"
          // Match: digit(s) followed by a letter (not another digit or hyphen)
          s = s.replace(/^(\d+)(?=[A-Za-z])/, "$1-");
          return s;
        };

        const fixedParts = missingParts.map(fixPart);

        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] fixedParts:",
            JSON.stringify(fixedParts),
          );
        }

        if (fixedParts.length === 1) {
          name += fixedParts[0];
        } else if (fixedParts.length > 1) {
          if (isHeteroatomParent) {
            name += fixedParts.join("");
          } else {
            const joined = fixedParts.join("-");
            if (process.env.VERBOSE) {
              console.log(
                "[buildSubstitutiveName] joining with hyphen:",
                joined,
              );
            }
            name += joined;
          }
        }

        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] name after adding substituents:",
            name,
          );
        }
      }
    }
  }

  // Add parent structure
  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] parentStructure.assembledName:",
      parentStructure.assembledName,
    );
    console.log(
      "[buildSubstitutiveName] parentStructure.substituents:",
      JSON.stringify(parentStructure.substituents),
    );
  }

  const parentName =
    parentStructure.assembledName || parentStructure.name || "unknown";

  // If we have substituents and the parent name starts with a digit (locant), add hyphen
  // Example: "5-methoxy" + "2-hexyl-2-methylbutane" → "5-methoxy-2-hexyl-2-methylbutane"
  if (
    allStructuralSubstituents.length > 0 &&
    name.length > 0 &&
    /^\d/.test(parentName)
  ) {
    name += "-";
  }

  name += parentName;

  // Add principal functional group suffix
  const principalGroup = functionalGroups.find((group) => group.isPrincipal);
  if (process.env.VERBOSE) {
    console.log(
      "[buildSubstitutiveName] principalGroup:",
      JSON.stringify(principalGroup),
    );
  }
  if (principalGroup && principalGroup.suffix) {
    // PREFERRED NAMES: Use retained names for simple carboxylic acids (C1-C3)
    // According to IUPAC Blue Book:
    // - formic acid (C1): HCOOH - no substituents (nowhere to put them)
    // - acetic acid (C2): CH3COOH - retained name can be used WITH substituents
    // - propionic acid (C3): CH3CH2COOH - retained name can be used WITH substituents
    const chainLength = parentStructure.chain?.length || 0;
    if (process.env.VERBOSE) {
      console.log(
        `[PREFERRED NAME CHECK] principalGroup.type=${principalGroup.type}`,
      );
      console.log(
        `[PREFERRED NAME CHECK] principalGroup.suffix=${principalGroup.suffix}`,
      );
      console.log(
        `[PREFERRED NAME CHECK] parentStructure.type=${parentStructure.type}`,
      );
      console.log(
        `[PREFERRED NAME CHECK] parentStructure.chain?.multipleBonds?.length=${parentStructure.chain?.multipleBonds?.length}`,
      );
      console.log(
        `[PREFERRED NAME CHECK] allStructuralSubstituents.length=${allStructuralSubstituents.length}`,
      );
      console.log(`[PREFERRED NAME CHECK] chainLength=${chainLength}`);
    }
    if (
      principalGroup.type === "carboxylic_acid" &&
      principalGroup.suffix === "oic acid" &&
      parentStructure.type === "chain" &&
      !parentStructure.chain?.multipleBonds?.length && // no double/triple bonds in parent chain
      ((chainLength === 1 && allStructuralSubstituents.length === 0) || // formic acid: no substituents
        (chainLength >= 2 && chainLength <= 3)) // acetic/propionic acid: substituents allowed
    ) {
      const preferredAcidNames: { [key: number]: string } = {
        1: "formic acid",
        2: "acetic acid",
        3: "propionic acid",
      };

      if (preferredAcidNames[chainLength]) {
        if (process.env.VERBOSE) {
          console.log(
            `[buildSubstitutiveName] Using retained name for C${chainLength} carboxylic acid: ${preferredAcidNames[chainLength]}`,
          );
        }
        // The retained name replaces both the parent name (e.g., "ethane") and suffix (e.g., "oic acid")
        // At this point, `name` contains: substituents + parentName
        // We need to remove the parentName and replace with the retained name
        // e.g., "2-[thiazol-4-yl]ethane" → "2-[thiazol-4-yl]acetic acid"
        const nameWithoutParent = name.slice(
          0,
          name.length - parentName.length,
        );
        return nameWithoutParent + preferredAcidNames[chainLength];
      }
    }

    // Handle multiplicative suffix (e.g., dione, trione)
    if (
      principalGroup.isMultiplicative &&
      (principalGroup.multiplicity ?? 0) > 1
    ) {
      // For multiplicative suffixes starting with a consonant, keep the terminal 'e'
      // This follows IUPAC rule P-16.3.1: hexane-2,4-dione (not hexan-2,4-dione)
      // Build suffix: "dione", "trione", etc.
      const multiplicityPrefix = getMultiplicativePrefix(
        principalGroup.multiplicity ?? 1,
      );
      const baseSuffix = principalGroup.suffix;
      const multipliedSuffix = `${multiplicityPrefix}${baseSuffix}`;

      // Get locants from locantString (e.g., "2,4")
      const locants = principalGroup.locantString || "";

      if (process.env.VERBOSE) {
        console.log(
          `[buildSubstitutiveName] multiplicative suffix: ${locants}-${multipliedSuffix}`,
        );
      }

      if (locants) {
        name += `-${locants}-${multipliedSuffix}`;
      } else {
        name += multipliedSuffix;
      }
    } else {
      // Single functional group - replace terminal 'e' if suffix starts with vowel
      // Replace ending with "an" for saturated systems, "en" for unsaturated
      // This applies to both carbocycles (alkane, alkene) and heterocycles (oxolane, thiolane, etc.)
      if (name.endsWith("ane")) {
        name = name.replace(/ane$/, "an");
      } else if (name.endsWith("ene")) {
        name = name.replace(/ene$/, "en");
      } else if (name.endsWith("yne")) {
        name = name.replace(/yne$/, "yn");
      } else if (name.endsWith("olane")) {
        // Heterocycles ending in "olane" (oxolane, thiolane, etc.) → "olan"
        name = name.replace(/olane$/, "olan");
      } else if (name.endsWith("etane")) {
        // 4-membered heterocycles (oxetane, thietane) → "etan"
        name = name.replace(/etane$/, "etan");
      } else if (name.endsWith("irane")) {
        // 3-membered heterocycles (oxirane, azirane, thiirane) → "iran"
        name = name.replace(/irane$/, "iran");
      } else if (name.endsWith("idine")) {
        // N-heterocycles (pyrrolidine, azetidine, piperidine) → "idin"
        name = name.replace(/idine$/, "idin");
      }

      // Get locant for the principal functional group
      // Try to find it from parentStructure.substituents first
      // by matching the prefix (e.g., "hydroxy" for alcohol)
      let fgLocant: number | undefined;
      if (principalGroup.prefix && parentStructure.substituents) {
        const matchingStructuralSubstituent = parentStructure.substituents.find(
          (sub) => sub.type === principalGroup.prefix,
        );
        if (
          matchingStructuralSubstituent &&
          "locant" in matchingStructuralSubstituent
        ) {
          fgLocant = matchingStructuralSubstituent.locant;
          if (process.env.VERBOSE) {
            console.log(
              `[buildSubstitutiveName] mapped principal FG locant from substituent: ${fgLocant}`,
            );
          }
        }
      }

      // Fallback to locant/locants from the principal group if not found
      if (!fgLocant) {
        // Prefer principalGroup.locant (computed by numbering rules) over locants[0]
        fgLocant = principalGroup.locant ?? principalGroup.locants?.[0];
        if (process.env.VERBOSE) {
          console.log(
            "[buildSubstitutiveName] using fallback fgLocant:",
            fgLocant,
            "(from principalGroup.locant or locants[0])",
          );
        }
      }

      // Add locant if present and not position 1 on a chain
      // For chain structures: amide, carboxylic acid, aldehyde, nitrile at position 1 never need locant
      // (e.g., "butanamide" not "butan-1-amide", "hexanal" not "hexan-1-al", "heptanenitrile" not "heptan-1-nitrile")
      // According to IUPAC nomenclature, locants should always be included for principal functional groups
      // including alcohols at position 1 (e.g., "pentan-1-ol" not "pentanol")
      // Exception: very simple cases like "ethanol" may omit the locant by common usage
      const _parentName =
        parentStructure.assembledName || parentStructure.name || "";

      // For amines, count only carbons in the chain (nitrogen is not counted)
      const isAmine = principalGroup.type === "amine";
      const chainLength =
        isAmine && parentStructure.chain?.atoms
          ? parentStructure.chain.atoms.filter((a) => a.symbol === "C").length
          : parentStructure.chain?.length || parentStructure.size || 0;
      const needsLocant = fgLocant !== undefined && fgLocant !== null;

      // Functional groups that never need locant when at position 1 on a chain (terminal groups)
      const terminalGroups = ["amide", "carboxylic_acid", "aldehyde", "nitrile"];
      const isTerminalGroup = terminalGroups.includes(principalGroup.type);

      // Omit locant for:
      // 1. C1 and C2 chains with functional groups at position 1
      //    C1: methanol (not methan-1-ol), methanamine (not methan-1-amine)
      //    C2: ethanol (not ethan-1-ol), ethanamine (not ethan-1-amine), ethene (not eth-1-ene)
      //    C3+: propan-1-ol, propan-1-amine, prop-1-ene (locant required)
      // 2. Terminal groups (amide, carboxylic acid, aldehyde, nitrile) at position 1, regardless of chain length
      //    e.g., "hexanal" not "hexan-1-al", "heptanoic acid" not "heptan-1-oic acid"
      const shouldOmitLocant =
        (chainLength <= 2 && fgLocant === 1 && parentStructure.type === "chain") ||
        (isTerminalGroup && fgLocant === 1 && parentStructure.type === "chain");

      if (process.env.VERBOSE) {
        console.log(
          `[needsLocant calc] principalGroup.type="${principalGroup.type}", fgLocant=${fgLocant}, type=${parentStructure.type}, chainLength=${chainLength}, needsLocant=${needsLocant}, isTerminalGroup=${isTerminalGroup}, shouldOmitLocant=${shouldOmitLocant}`,
        );
      }

      if (needsLocant && fgLocant && !shouldOmitLocant) {
        name += `-${fgLocant}-${principalGroup.suffix}`;
      } else {
        // For nitrile suffix, we need to add 'e' before it (hexane + nitrile = hexanenitrile)
        // For other suffixes starting with vowels, the 'e' is already dropped (hexan + al = hexanal)
        if (principalGroup.suffix === "nitrile") {
          name += "e" + principalGroup.suffix;
        } else {
          name += principalGroup.suffix;
        }
      }
    }
  }

  return name;
}

function getMultiplicativePrefix(
  count: number,
  isComplex: boolean = false,
): string {
  // For complex substituents (those with internal locants), use bis/tris/tetrakis
  // For simple substituents, use di/tri/tetra
  if (isComplex) {
    const complexPrefixes: { [key: number]: string } = {
      2: "bis",
      3: "tris",
      4: "tetrakis",
      5: "pentakis",
      6: "hexakis",
      7: "heptakis",
      8: "octakis",
      9: "nonakis",
      10: "decakis",
    };
    return complexPrefixes[count] || `${count}-`;
  }

  const prefixes: { [key: number]: string } = {
    2: "di",
    3: "tri",
    4: "tetra",
    5: "penta",
    6: "hexa",
    7: "hepta",
    8: "octa",
    9: "nona",
    10: "deca",
  };

  return prefixes[count] || `${count}-`;
}

function validateIUPACName(
  name: string,
  _parentStructure?: ParentStructureExtended,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic validation rules
  if (!name || name.trim().length === 0) {
    errors.push("Name is empty");
  }

  if (name.length > 200) {
    errors.push("Name is unusually long (>200 characters)");
  }

  // Check for basic naming patterns
  if (!/[a-zA-Z]/.test(name)) {
    errors.push("Name contains no letters");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function applyFinalFormatting(name: string): string {
  // Apply final formatting rules
  let formatted = name.trim();

  if (process.env.VERBOSE) {
    console.log("[applyFinalFormatting] input:", formatted);
  }

  // Ensure there's a hyphen between a locant digit and the following text when missing
  // e.g., convert "6hydroxy7methyl" -> "6-hydroxy7-methyl" (further hyphenation follows)
  formatted = formatted.replace(/(\d)(?=[A-Za-z])/g, "$1-");

  if (process.env.VERBOSE) {
    console.log(
      "[applyFinalFormatting] after digit-letter hyphenation:",
      formatted,
    );
  }

  // Ensure hyphen between letters and following locant digit when missing,
  // but do not insert a hyphen if the digit is already followed by a hyphen
  // (e.g., "dimethyl2-propoxy" should NOT become "dimethyl-2-propoxy").
  formatted = formatted.replace(/([A-Za-z])(?=\d(?!-))/g, "$1-");

  // Remove multiple consecutive hyphens
  formatted = formatted.replace(/--+/g, "-");

  // Fix stray hyphens around locant commas that can be introduced by
  // earlier assembly steps (e.g. "2-,2-dimethyl" -> "2,2-dimethyl").
  //  - Remove hyphen immediately before a comma when it separates locants
  //  - Remove any stray "-," sequences
  //  - Remove leading hyphen at start of name
  formatted = formatted.replace(/(\d)-,(\d)/g, "$1,$2");
  formatted = formatted.replace(/-,(?=\d)/g, ",");
  formatted = formatted.replace(/^-/g, "");
  // Remove accidental hyphen directly following a comma (",-" -> ",")
  formatted = formatted.replace(/,-+/g, ",");

  // Ensure proper spacing around locants
  formatted = formatted.replace(/(\d)-([a-zA-Z])/g, "$1-$2");

  // IUPAC names should be lowercase unless they start with a locant
  // Don't capitalize the first letter - IUPAC names are lowercase
  // Exception: If the name starts with "N" as a locant (e.g., "N,N-dimethylethanamine" or "N-methylethanamine"), keep it uppercase
  if (
    formatted.charAt(0) !== "N" ||
    (!formatted.startsWith("N,") && !formatted.startsWith("N-"))
  ) {
    formatted = formatted.charAt(0).toLowerCase() + formatted.slice(1);
  }

  // Post-cleanup: if a hydroxy substituent is present as a locant (e.g., "1-hydroxy")
  // but the name already contains the corresponding "-1-ol" suffix, remove the redundant "1-hydroxy".
  try {
    const hydroxyMatches = Array.from(formatted.matchAll(/(\d+)-?hydroxy/gi));
    for (const m of hydroxyMatches) {
      const loc = m[1];
      if (loc && formatted.includes(`${loc}-ol`)) {
        // Remove the hydroxy occurrence (with optional leading hyphen/comma)
        formatted = formatted.replace(
          new RegExp(`[,-]?${loc}-?hydroxy`, "gi"),
          "",
        );
        // Clean up any accidental double hyphens created
        formatted = formatted.replace(/--+/g, "-");
      }
    }
  } catch (_e) {
    if (process.env.VERBOSE)
      console.log("[applyFinalFormatting] hydroxy cleanup error", _e);
  }

  return formatted;
}

function calculateNameConfidence(state: ContextState): number {
  let confidence = 1.0;

  // Reduce confidence if components are missing
  if (!state.parentStructure) confidence -= 0.3;
  if (!state.functionalGroups || state.functionalGroups.length === 0)
    confidence -= 0.1;

  // Reduce confidence if conflicts were detected (if available in extended state)
  const conflicts = (state as unknown as { conflicts?: Array<unknown> })
    .conflicts;
  if (conflicts && conflicts.length > 0) {
    confidence -= conflicts.length * 0.1;
  }

  // Reduce confidence if validation failed (if available in extended state)
  const nameValidation = (
    state as unknown as { nameValidation?: { isValid: boolean } }
  ).nameValidation;
  if (nameValidation && !nameValidation.isValid) {
    confidence -= 0.2;
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Export all name assembly layer rules
 */
export const NAME_ASSEMBLY_LAYER_RULES: IUPACRule[] = [
  SUBSTITUENT_ALPHABETIZATION_RULE,
  LOCANT_ASSIGNMENT_ASSEMBLY_RULE,
  MULTIPLICATIVE_PREFIXES_RULE,
  PARENT_NAME_ASSEMBLY_RULE,
  COMPLETE_NAME_ASSEMBLY_RULE,
  NAME_VALIDATION_RULE,
  NAME_ASSEMBLY_COMPLETE_RULE,
];
