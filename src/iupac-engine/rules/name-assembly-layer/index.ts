import type { IUPACRule } from "../../types";
import { RulePriority } from "../../types";
import { ExecutionPhase, type ContextState } from "../../immutable-context";
import type { ImmutableNamingContext } from "../../immutable-context";
import type { FunctionalGroup } from "../../types";
import { buildChainName } from "./chain-naming";
import { buildFunctionalClassName } from "./special-naming";
import { getMultiplicativePrefix } from "./utils";
import { buildRingName, buildHeteroatomName } from "./ring-naming";
import { buildSubstitutiveName } from "./substitutive-naming";
import {
  validateIUPACName,
  applyFinalFormatting,
  calculateNameConfidence,
} from "./validation";

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

    if (process.env.VERBOSE) {
      console.log(
        "[SUBSTITUENT_ALPHABETIZATION_RULE] Input functionalGroups:",
        functionalGroups.map((g) => ({
          type: g.type,
          isPrincipal: g.isPrincipal,
          locants: g.locants,
          locant: g.locant,
        })),
      );
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

    if (process.env.VERBOSE) {
      console.log(
        "[SUBSTITUENT_ALPHABETIZATION_RULE] Output functionalGroups:",
        [...principalGroups, ...alphabetizedStructuralSubstituents].map(
          (g) => ({
            type: g.type,
            isPrincipal: g.isPrincipal,
            locants: g.locants,
            locant: g.locant,
          }),
        ),
      );
    }

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

      // Check if we can omit locant "1" for C1 chains (methane)
      const isC1Chain =
        parentStructure.type === "chain" &&
        (parentStructure.chain?.length ?? 0) === 1;
      const shouldOmitC1Locant = isC1Chain && locants === "1";

      // Check if we can omit locant "1" for terminal positions on short chains
      // Per IUPAC: for unbranched chains with a single terminal substituent, omit locant "1"
      // Only omit for C1 (methane) and C2 (ethane); C3+ chains MUST keep terminal locants
      const chainLength = parentStructure.chain?.length ?? 0;
      const isShortChain =
        parentStructure.type === "chain" && chainLength === 2;
      const nonPrincipalSubstituentCount = functionalGroups.filter(
        (fg: FunctionalGroup) => !fg.isPrincipal,
      ).length;
      const shouldOmitTerminalLocant =
        isShortChain && locants === "1" && nonPrincipalSubstituentCount === 1;

      if (process.env.VERBOSE && locants === "1") {
        console.log(
          `[LOCANT_ASSEMBLY] Terminal locant check: chainLength=${chainLength}, isShortChain=${isShortChain}, ` +
            `nonPrincipalSubstituentCount=${nonPrincipalSubstituentCount}, shouldOmitTerminalLocant=${shouldOmitTerminalLocant}`,
        );
      }

      // Check if we can omit locant "1" for single substituent on symmetric rings
      // Per IUPAC P-14.3.4.1: For symmetric rings (benzene, cyclohexane, etc.),
      // a single substituent at position 1 doesn't need a locant
      const parentName =
        parentStructure.assembledName || parentStructure.name || "";
      const isSymmetricRing =
        parentStructure.type === "ring" &&
        (parentName.includes("benzene") || parentName.includes("cyclo"));
      const shouldOmitRingLocant =
        isSymmetricRing &&
        locants === "1" &&
        nonPrincipalSubstituentCount === 1;

      let name = "";

      // For NON-PRINCIPAL functional groups, use only the prefix as substituent name
      // Example: alcohol (non-principal) → "hydroxy" not "hydroxyalcoholol"
      if (!group.isPrincipal && prefix) {
        name =
          locants &&
          !shouldOmitC1Locant &&
          !shouldOmitTerminalLocant &&
          !shouldOmitRingLocant
            ? `${locants}-${prefix}`
            : prefix;
      }
      // For alkoxy groups, the prefix IS the full substituent name (e.g., 'methoxy')
      // So we don't append the type 'alkoxy'
      else if (type === "alkoxy" && prefix) {
        name =
          locants &&
          !shouldOmitC1Locant &&
          !shouldOmitTerminalLocant &&
          !shouldOmitRingLocant
            ? `${locants}-${prefix}`
            : prefix;
      }
      // For PRINCIPAL functional groups, use the full name assembly
      else {
        if (
          locants &&
          !shouldOmitC1Locant &&
          !shouldOmitTerminalLocant &&
          !shouldOmitRingLocant
        ) {
          name = `${locants}-${prefix}${type}${suffix}`;
        } else {
          name = `${prefix}${type}${suffix}`;
        }
      }

      // If we omitted the locant in the assembled name, clear the locants array
      // to prevent substitutive-naming.ts from re-adding it
      const shouldClearLocants =
        shouldOmitC1Locant || shouldOmitTerminalLocant || shouldOmitRingLocant;

      return {
        ...group,
        assembledName: name,
        locantString: locants,
        ...(shouldClearLocants ? { locants: [] } : {}),
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

    if (process.env.VERBOSE) {
      console.log(
        "[MULTIPLICATIVE_PREFIXES_RULE] Input functionalGroups:",
        functionalGroups.map((g) => ({
          type: g.type,
          isPrincipal: g.isPrincipal,
          locants: g.locants,
        })),
      );
    }

    // IMPORTANT: Do NOT aggregate principal groups here!
    // Principal group aggregation (e.g., multiple alcohols → diol) is handled
    // by buildSubstitutiveName() which needs to receive ALL individual principal groups.
    // This rule should only handle non-principal substituents (e.g., multiple methyl groups).

    // Separate principal groups from non-principal substituents
    const principalGroups = functionalGroups.filter(
      (group: FunctionalGroup) => group.isPrincipal,
    );
    const nonPrincipalGroups = functionalGroups.filter(
      (group: FunctionalGroup) => !group.isPrincipal,
    );

    if (process.env.VERBOSE) {
      console.log(
        "[MULTIPLICATIVE_PREFIXES_RULE] principalGroups:",
        principalGroups.length,
        principalGroups.map((g) => ({ type: g.type, locants: g.locants })),
      );
      if (process.env.VERBOSE) {
        console.log(
          "[MULTIPLICATIVE_PREFIXES_RULE] nonPrincipalGroups:",
          nonPrincipalGroups.length,
          nonPrincipalGroups.map((g) => ({ type: g.type, locants: g.locants })),
        );
      }
    }

    // Group identical non-principal types for multiplicative prefixes (di-methyl, tri-chloro, etc.)
    const groupedTypes = new Map<string, FunctionalGroup[]>();
    nonPrincipalGroups.forEach((group: FunctionalGroup) => {
      const type = group.type;
      if (!groupedTypes.has(type)) {
        groupedTypes.set(type, []);
      }
      groupedTypes.get(type)!.push(group);
    });

    // Apply multiplicative prefixes to non-principal substituents only
    const processedNonPrincipal: FunctionalGroup[] = [];

    for (const [type, groups] of groupedTypes.entries()) {
      if (groups.length > 1) {
        // Multiple identical groups - apply prefix
        const count = groups.length;
        const opsinService = context.getOPSIN();
        const firstGroup = groups[0];
        if (!firstGroup) continue;

        const baseName = firstGroup.assembledName || type;

        // Remove individual locants and apply multiplicative prefix
        const cleanName = baseName.replace(/^\d+,?-/, ""); // Remove leading locants
        const nextChar = cleanName.charAt(0);
        const prefix = getMultiplicativePrefix(
          count,
          false,
          opsinService,
          nextChar,
        );
        const finalName = `${prefix}${cleanName}`;

        // Collect all locants from all groups
        const allLocants = groups
          .flatMap((g: FunctionalGroup) => g.locants || [])
          .filter((l) => l > 0)
          .sort((a, b) => a - b);

        processedNonPrincipal.push({
          ...firstGroup,
          assembledName: finalName,
          isMultiplicative: true,
          multiplicity: count,
          locants: allLocants,
          locantString: allLocants.join(","),
        });
      } else {
        // Single group - keep as is
        const singleGroup = groups[0];
        if (singleGroup) {
          processedNonPrincipal.push(singleGroup);
        }
      }
    }

    // Combine principal groups (unchanged) with processed non-principal groups
    const allProcessedGroups = [...principalGroups, ...processedNonPrincipal];

    return context.withStateUpdate(
      (state: ContextState) => ({
        ...state,
        functionalGroups: allProcessedGroups,
      }),
      "multiplicative-prefixes",
      "Multiplicative Prefixes",
      "P-16.1",
      ExecutionPhase.ASSEMBLY,
      `Applied multiplicative prefixes to ${groupedTypes.size} non-principal group type(s); preserved ${principalGroups.length} principal group(s)`,
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
    const opsinService = context.getOPSIN();

    if (!parentStructure) {
      return context;
    }

    let parentName = "";

    if (parentStructure.type === "chain") {
      parentName = buildChainName(
        parentStructure,
        functionalGroups,
        opsinService,
      );
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
    const opsinService = context.getOPSIN();

    if (process.env.VERBOSE) {
      console.log(
        "[COMPLETE_NAME_ASSEMBLY_RULE] nomenclatureMethod:",
        nomenclatureMethod,
      );
      if (process.env.VERBOSE) {
        console.log(
          "[COMPLETE_NAME_ASSEMBLY_RULE] parentStructure:",
          parentStructure?.type,
        );
      }
      if (process.env.VERBOSE) {
        console.log(
          "[COMPLETE_NAME_ASSEMBLY_RULE] functionalGroups:",
          functionalGroups?.map((g) => g.type),
        );
      }
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
        buildSubstitutiveName,
        opsinService,
      );
    } else {
      if (process.env.VERBOSE)
        console.log("[COMPLETE_NAME_ASSEMBLY_RULE] Building substitutive name");
      finalName = buildSubstitutiveName(
        parentStructure,
        functionalGroups,
        molecule,
        opsinService,
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
