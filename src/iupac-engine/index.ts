/**
 * Main entry point for the IUPAC rule engine
 */

import type { Molecule } from "../../types";
import type { NamingResult } from "./types";
import { RuleEngine } from "./engine";
import { parseSMILES } from "../parsers/smiles-parser";

/**
 * Main IUPAC namer class
 */
export class IUPACNamer {
  private engine: RuleEngine;

  constructor() {
    this.engine = new RuleEngine();
  }

  /**
   * Generate IUPAC name for a molecule
   */
  generateName(molecule: Molecule): NamingResult {
    return this.engine.generateName(molecule);
  }

  /**
   * Generate IUPAC name from SMILES string
   */
  generateNameFromSMILES(smiles: string): NamingResult {
    const parseResult = parseSMILES(smiles);
    if (
      !parseResult ||
      !parseResult.molecules ||
      parseResult.molecules.length === 0
    ) {
      throw new Error("Failed to parse SMILES for IUPAC naming");
    }

    const molecule = parseResult.molecules[0];
    return this.generateName(molecule!);
  }

  /**
   * Generate IUPAC name from SMILES and return internal context for debugging
   */
  generateNameFromSMILESWithContext(smiles: string): {
    result: NamingResult;
    context: import("./immutable-context").ImmutableNamingContext;
  } {
    const parseResult = parseSMILES(smiles);
    if (
      !parseResult ||
      !parseResult.molecules ||
      parseResult.molecules.length === 0
    ) {
      throw new Error("Failed to parse SMILES for IUPAC naming");
    }

    const molecule = parseResult.molecules[0];
    // @ts-ignore - call debug method on engine
    return (this.engine as any).generateNameWithContext(molecule!);
  }

  /**
   * Get all supported rules
   */
  getSupportedRules() {
    return this.engine.getAllRules();
  }

  /**
   * Get all layers
   */
  getLayers() {
    return this.engine.getAllLayers();
  }
}

/**
 * Simple function to generate IUPAC name
 */
export function generateIUPACName(molecule: Molecule): string {
  const namer = new IUPACNamer();
  const result = namer.generateName(molecule);
  return result.name;
}

/**
 * Export default instance
 */
export default new IUPACNamer();
