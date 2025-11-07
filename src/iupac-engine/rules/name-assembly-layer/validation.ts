import type { ParentStructure } from "../../types";
import type { ContextState } from "../../immutable-context";

type ParentStructureExtended = ParentStructure & {
  assembledName?: string;
};

export function validateIUPACName(
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

export function applyFinalFormatting(name: string): string {
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

export function calculateNameConfidence(state: ContextState): number {
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
