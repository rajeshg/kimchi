export {
  computeMorganFingerprint,
  tanimotoSimilarity,
  getBitsSet,
} from "src/utils/morgan-fingerprint";
export { parseSMILES } from "src/parsers/smiles-parser";
export { parseIUPACName } from "src/parsers/iupac-parser";
export type { IUPACParseResult, IUPACParserConfig } from "src/parsers/iupac-types";
export { generateSMILES } from "src/generators/smiles-generator";
export { generateMolfile } from "src/generators/mol-generator";
export { parseMolfile } from "src/parsers/molfile-parser";
export { parseSDF } from "src/parsers/sdf-parser";
export { writeSDF } from "src/generators/sdf-writer";
export { parseSMARTS } from "src/parsers/smarts-parser";
export { matchSMARTS } from "src/matchers/smarts-matcher";
export { renderSVG } from "src/generators/svg-renderer";
export type {
  SVGRendererOptions,
  SVGRenderResult,
} from "src/generators/svg-renderer";
export { kekulize } from "src/utils/kekulize";
export { computeLogP, logP, crippenLogP } from "src/utils/logp";
export {
  getMolecularFormula,
  getMolecularMass,
  getExactMass,
  getHeavyAtomCount,
  getHeteroAtomCount,
  getRingCount,
  getAromaticRingCount,
  getFractionCSP3,
  getHBondAcceptorCount,
  getHBondDonorCount,
  getTPSA,
  getRotatableBondCount,
  checkLipinskiRuleOfFive,
  checkVeberRules,
  checkBBBPenetration,
} from "src/utils/molecular-properties";
export { getRingInfo } from "src/utils/ring-information";
export type { RingInformation } from "src/utils/ring-information";
export {
  generateInChI,
  generateInChIKey,
} from "src/generators/inchi-generator";
// IUPAC naming using the new rule engine
import { IUPACNamer } from "src/iupac-engine";
import { parseMolfile } from "src/parsers/molfile-parser";
import type { Molecule } from "types";
import type { NamingResult } from "src/iupac-engine/types";

// Export IUPACNamer class for advanced usage
export { IUPACNamer };
export type { NamingResult };

// Lazy singleton instance for efficiency
let iupacNamer: IUPACNamer | null = null;
function getIUPACNamer(): IUPACNamer {
  if (!iupacNamer) {
    iupacNamer = new IUPACNamer();
  }
  return iupacNamer;
}

/**
 * Generate IUPAC name for a molecule
 */
export function generateIUPACName(
  molecule: Molecule,
  _options?: IUPACGeneratorOptions,
): IUPACGenerationResult {
  try {
    const result = getIUPACNamer().generateName(molecule);
    return {
      name: result.name,
      errors: [],
      warnings: [],
      confidence: result.confidence,
      rules: result.rules,
    };
  } catch (error) {
    return {
      name: "",
      errors: [error instanceof Error ? error.message : "Unknown error"],
      warnings: [],
      confidence: 0,
      rules: [],
    };
  }
}

/**
 * Generate IUPAC name from SMILES string
 */
export function generateIUPACNameFromSMILES(
  smiles: string,
): IUPACGenerationResult {
  try {
    const result = getIUPACNamer().generateNameFromSMILES(smiles);
    return {
      name: result.name,
      errors: [],
      warnings: [],
      confidence: result.confidence,
      rules: result.rules,
    };
  } catch (error) {
    return {
      name: "",
      errors: [error instanceof Error ? error.message : "Unknown error"],
      warnings: [],
      confidence: 0,
      rules: [],
    };
  }
}

/**
 * Generate IUPAC name from MOL file content
 */
export function generateIUPACNameFromMolfile(
  molfile: string,
): IUPACGenerationResult {
  try {
    const parseResult = parseMolfile(molfile);
    if (!parseResult.molecule) {
      return {
        name: "",
        errors: ["Failed to parse MOL file"],
        warnings: [],
        confidence: 0,
        rules: [],
      };
    }
    return generateIUPACName(parseResult.molecule);
  } catch (error) {
    return {
      name: "",
      errors: [error instanceof Error ? error.message : "Unknown error"],
      warnings: [],
      confidence: 0,
      rules: [],
    };
  }
}

// Compatible types for backward compatibility
export interface IUPACGenerationResult {
  name: string;
  errors: string[];
  warnings: string[];
  confidence?: number;
  rules?: string[];
}

export interface IUPACGeneratorOptions {
  includeStereochemistry?: boolean;
  useCommonNames?: boolean;
  useSystematicNaming?: boolean;
  includeCommonNames?: boolean;
}
export { enumerateTautomers, canonicalTautomer } from "src/utils/tautomer";
