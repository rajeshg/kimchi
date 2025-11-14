import type {
  IUPACParseResult,
  IUPACParserConfig,
  OPSINRules,
} from "./iupac-types";
import type { ParseError } from "types";
import { IUPACTokenizer } from "./iupac-tokenizer";
import { IUPACGraphBuilder } from "./iupac-graph-builder";
import { validateValences } from "src/validators/valence-validator";
import opsinRulesData from "opsin-rules.json";

type ValidationError = ParseError;

/**
 * Parse an IUPAC chemical name and convert it to a Molecule object
 * @param name IUPAC chemical name (e.g., "methane", "propan-1-ol", "benzene")
 * @param config Optional configuration
 * @returns Parse result containing molecule or errors
 */
export function parseIUPACName(
  name: string,
  config?: IUPACParserConfig,
): IUPACParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    if (!name || name.trim().length === 0) {
      return {
        molecule: null,
        errors: ["IUPAC name cannot be empty"],
        warnings: [],
      };
    }

    // Get OPSIN rules (from opsin-rules.json)
    const rules =
      (opsinRulesData as OPSINRules) ||
      config?.customRules ||
      ({} as OPSINRules);

    // Stage 1: Tokenize the IUPAC name
    const tokenizer = new IUPACTokenizer(rules);
    const tokenResult = tokenizer.tokenize(name);

    if (tokenResult.errors.length > 0) {
      return {
        molecule: null,
        errors: tokenResult.errors,
        warnings,
      };
    }

    if (tokenResult.tokens.length === 0) {
      return {
        molecule: null,
        errors: ["No valid tokens found in IUPAC name"],
        warnings,
      };
    }

    // Stage 2: Build molecule from tokens
    const builder = new IUPACGraphBuilder(rules);
    let molecule;

    try {
      molecule = builder.build(tokenResult.tokens);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        molecule: null,
        errors: [`Failed to build molecule: ${message}`],
        warnings,
      };
    }

    // Stage 3: Validate molecule (valence only, skip strict stereo/aromaticity for MVP)
    const valenceErrors: ParseError[] = [];
    validateValences(molecule.atoms, molecule.bonds, valenceErrors);
    if (valenceErrors.length > 0) {
      if (config?.strictMode) {
        return {
          molecule: null,
          errors: valenceErrors.map((err) => err.message),
          warnings,
        };
      }
      if (config?.collectWarnings) {
        warnings.push(...valenceErrors.map((err) => err.message));
      }
    }

    return {
      molecule,
      errors,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      molecule: null,
      errors: [`Unexpected error parsing IUPAC name: ${message}`],
      warnings,
    };
  }
}
