import type { IUPACRule } from "../../types";
import { BLUE_BOOK_RULES, RulePriority } from "../../types";
import type { ImmutableNamingContext } from "../../immutable-context";
import { ExecutionPhase } from "../../immutable-context";

/**
 * Rule: Acyl Substituent Correction
 *
 * After parent chain selection, identify ketone groups that are NOT on the main chain.
 * These are acyl substituents (e.g., acetyl, propanoyl) and should NOT be counted
 * as principal functional groups.
 *
 * This rule must run AFTER parent chain selection but BEFORE P-14.3 numbering.
 */
export const ACYL_SUBSTITUENT_CORRECTION_RULE: IUPACRule = {
  id: "acyl-substituent-correction",
  name: "Acyl Substituent Correction",
  description:
    "Mark ketones NOT on main chain as non-principal (acyl substituents)",
  blueBookReference: "P-62.2.1.1 - Acyl groups as substituents",
  priority: RulePriority.ONE, // Run after PARENT_CHAIN_SELECTION_COMPLETE (priority TEN=100)
  conditions: (context: ImmutableNamingContext) => {
    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;

    if (process.env.VERBOSE) {
      console.log(
        `[ACYL_SUBSTITUENT_CORRECTION conditions] parentStructure=${parentStructure?.type}, functionalGroups count=${functionalGroups.length}`,
      );
      functionalGroups.forEach((fg, i) => {
        console.log(
          `[ACYL_SUBSTITUENT_CORRECTION conditions] FG ${i}: type=${fg.type}, name=${fg.name}, isPrincipal=${fg.isPrincipal}`,
        );
      });
    }

    // Only run if we have a parent chain and ketone functional groups
    if (!parentStructure || parentStructure.type !== "chain") {
      if (process.env.VERBOSE) {
        console.log(
          `[ACYL_SUBSTITUENT_CORRECTION conditions] SKIP - no parent chain`,
        );
      }
      return false;
    }

    const hasKetones = functionalGroups.some(
      (fg) => (fg.name === "ketone" || fg.type === "ketone") && fg.isPrincipal,
    );
    if (process.env.VERBOSE) {
      console.log(
        `[ACYL_SUBSTITUENT_CORRECTION conditions] hasKetones=${hasKetones}`,
      );
    }
    return hasKetones;
  },
  action: (context: ImmutableNamingContext) => {
    if (process.env.VERBOSE) {
      console.log(`[ACYL_SUBSTITUENT_CORRECTION action] START`);
    }

    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;
    const molecule = context.getState().molecule;

    if (!parentStructure || parentStructure.type !== "chain") {
      if (process.env.VERBOSE) {
        console.log(
          `[ACYL_SUBSTITUENT_CORRECTION action] No parent chain, returning`,
        );
      }
      return context;
    }

    const mainChain = parentStructure.chain?.atoms || [];
    // Build a set of atom IDs in the main chain
    const chainSet = new Set(
      mainChain.map((a) => (typeof a === "number" ? a : a.id)),
    );

    if (process.env.VERBOSE) {
      console.log(
        `[ACYL_SUBSTITUENT_CORRECTION action] Chain has ${mainChain.length} atoms, chainSet IDs: ${Array.from(chainSet).join(",")}`,
      );
    }

    // Filter ketones and check if they're on the main chain
    const ketoneGroups = functionalGroups.filter(
      (fg) =>
        (fg.name === "ketone" || fg.type === "ketone") &&
        fg.atoms &&
        fg.atoms.length >= 2,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[ACYL_SUBSTITUENT_CORRECTION action] Found ${ketoneGroups.length} ketone groups`,
      );
    }

    let updatedFunctionalGroups = [...functionalGroups];
    let correctionsMade = 0;

    for (const ketoneGroup of ketoneGroups) {
      // Find the carbonyl carbon in this ketone
      // ketoneGroup.atoms contains Atom objects (per FunctionalGroup interface)
      if (process.env.VERBOSE) {
        console.log(
          `[ACYL_SUBSTITUENT_CORRECTION action] Ketone atoms:`,
          ketoneGroup.atoms.map((a) => `${a.id}:${a.symbol}`).join(", "),
        );
      }

      const carbonylCarbon = ketoneGroup.atoms.find(
        (atom) => atom.symbol === "C",
      );

      if (!carbonylCarbon) {
        if (process.env.VERBOSE) {
          console.log(
            `[ACYL_SUBSTITUENT_CORRECTION action] Could not find carbonyl carbon in ketone`,
          );
        }
        continue;
      }

      const carbonylCarbonIdx = carbonylCarbon.id;

      if (process.env.VERBOSE) {
        console.log(
          `[ACYL_SUBSTITUENT_CORRECTION action] Checking ketone with carbonyl at atom ${carbonylCarbonIdx}`,
        );
      }

      // Check if carbonyl carbon is in the main chain
      if (chainSet.has(carbonylCarbonIdx)) {
        // This ketone IS on the main chain - keep it as principal
        if (process.env.VERBOSE) {
          console.log(
            `[ACYL_SUBSTITUENT_CORRECTION action] Ketone at ${carbonylCarbonIdx} IS on main chain - keeping as principal`,
          );
        }
        continue;
      }

      if (process.env.VERBOSE) {
        console.log(
          `[ACYL_SUBSTITUENT_CORRECTION action] Ketone at ${carbonylCarbonIdx} is NOT on main chain - marking as non-principal`,
        );
      }

      // This ketone is NOT on the main chain - it's an acyl substituent
      // Mark it as non-principal
      const index = updatedFunctionalGroups.indexOf(ketoneGroup);
      if (index !== -1 && ketoneGroup.isPrincipal) {
        updatedFunctionalGroups[index] = {
          ...ketoneGroup,
          isPrincipal: false,
        };
        correctionsMade++;

        if (process.env.VERBOSE) {
          console.log(
            `[ACYL_SUBSTITUENT_CORRECTION] Marked ketone at atom ${carbonylCarbonIdx} as non-principal (acyl substituent)`,
          );
        }
      }
    }

    if (correctionsMade === 0) {
      if (process.env.VERBOSE) {
        console.log(
          `[ACYL_SUBSTITUENT_CORRECTION action] No corrections needed`,
        );
      }
      return context; // No changes needed
    }

    if (process.env.VERBOSE) {
      console.log(
        `[ACYL_SUBSTITUENT_CORRECTION] Corrected ${correctionsMade} ketone functional groups`,
      );
    }

    // Update context with corrected functional groups
    let updatedContext = context.withFunctionalGroups(
      updatedFunctionalGroups,
      "acyl-substituent-correction",
      "Acyl Substituent Correction",
      BLUE_BOOK_RULES.P62_2_1_1,
      ExecutionPhase.PARENT_STRUCTURE,
      `Marked ${correctionsMade} ketone(s) as non-principal acyl substituents`,
    );

    if (process.env.VERBOSE) {
      console.log(
        `[ACYL_SUBSTITUENT_CORRECTION action] DONE - updated context`,
      );
    }

    return updatedContext;
  },
};
