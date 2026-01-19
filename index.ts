// Core types - essential for TypeScript users
export type {
  Atom,
  Bond,
  Molecule,
  ParseResult,
  ParseError,
  RingInfo,
  Chain,
  MultipleBond,
} from "types";
export { BondType, StereoType } from "types";

// Morgan fingerprints
export {
  computeMorganFingerprint,
  tanimotoSimilarity,
  getBitsSet,
} from "src/utils/morgan-fingerprint";
export { PackedMolecule } from "src/utils/packed-molecule";
export type {
  PackedMolecule as PackedMoleculeType,
  PackedMoleculeQuery,
} from "src/utils/packed-molecule";
export { parseSMILES } from "src/parsers/smiles-parser";
export { parseIUPACName } from "src/parsers/iupac-parser/iupac-parser";
export { IUPACTokenizer } from "src/parsers/iupac-parser/iupac-tokenizer";
export type { IUPACToken, IUPACParseResult } from "src/parsers/iupac-parser/iupac-types";
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
  AtomHighlight,
  BondHighlight,
  SubstructureHighlight,
} from "src/generators/svg-renderer";
export { kekulize } from "src/utils/kekulize";
export { computeLogP, logP, crippenLogP } from "src/utils/logp";
export { getRingInfo } from "src/utils/ring-information";
export type { RingInformation } from "src/utils/ring-information";

// Descriptors API - Clean, organized namespace for molecular properties
export { Descriptors } from "src/descriptors";
export type {
  BasicProperties,
  PhysicochemicalProperties,
  StructuralProperties,
  DrugLikenessProperties,
  TopologyProperties,
  ChiProperties,
  MolecularProperties,
  LipinskiResult,
  VeberResult,
  BBBResult,
} from "src/descriptors";

// Murcko Scaffolds
export {
  getMurckoScaffold,
  getBemisMurckoFramework,
  getScaffoldTree,
  getGraphFramework,
  haveSameScaffold,
} from "src/utils/murcko-scaffold";
export type { MurckoOptions, ScaffoldResult } from "src/utils/murcko-scaffold";

// Specialized utility functions (not part of Descriptors namespace)
export {
  getMaxPartialCharge,
  getMinPartialCharge,
  getMaxAbsPartialCharge,
  getMinAbsPartialCharge,
  getNumValenceElectrons,
  getNumRadicalElectrons,
  getNumAmideBonds,
  getNumSpiroAtoms,
  getNumBridgeheadAtoms,
  getNumSaturatedRings,
  getNumAliphaticRings,
  getNumSaturatedAliphaticRings,
  getNumHeterocycles,
  getNumAromaticHeterocycles,
  getNumSaturatedHeterocycles,
  getNumAliphaticHeterocycles,
  getNumAtomStereoCenters,
  getNumUnspecifiedAtomStereoCenters,
} from "src/utils/molecular-properties";
export { generateInChI, generateInChIKey } from "src/generators/inchi-generator";
export {
  bulkMatchSMARTS,
  bulkComputeProperties,
  bulkComputeSimilarities,
  bulkFindSimilar,
  bulkFilterDrugLike,
} from "src/utils/bulk-operations";
export type {
  BulkSMARTSResult,
  BulkPropertiesResult,
  BulkFingerprintResult,
} from "src/utils/bulk-operations";
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
export function generateIUPACNameFromSMILES(smiles: string): IUPACGenerationResult {
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
export function generateIUPACNameFromMolfile(molfile: string): IUPACGenerationResult {
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
export { layoutMolecule } from "src/utils/layout";
export type { LayoutedMolecule, AtomWithCoords, LayoutOptions } from "src/utils/layout";
export { aromatizeMolecule } from "src/utils/aromaticity";
export { checkStructure } from "src/validators/structure-validator";
export type { ValidationResult, ValidationIssue } from "src/validators/structure-validator";
export { ValidationSeverity } from "src/validators/structure-validator";
export { addExplicitHydrogens, removeExplicitHydrogens } from "src/utils/hydrogen-utils";
