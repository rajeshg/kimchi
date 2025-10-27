import type { Molecule } from 'types';
import type {
  Chain,
  MolecularStructure,
  NumberingResult,
} from './iupac-types';
import { ruleEngine } from './iupac-rule-engine';
import { ChainSelector, createDefaultChainSelector } from './chain-selector';
import type { ChainFilter } from './chain-filter';
import { StructureAnalyzer, createStructureAnalyzer } from './structure-analyzer';
import { NumberingAnalyzer, createNumberingAnalyzer } from './numbering-analyzer';

/**
 * Main result of nomenclature pipeline processing
 */
export interface NomenclatureResult {
  /** The input molecule */
  molecule: Molecule;
  /** IUPAC name generated from the molecule */
  name: string;
  /** Molecular structure analysis (chains, functional groups, etc.) */
  structure: MolecularStructure | null;
  /** Principal chain selected for naming */
  principalChain: Chain | null;
  /** Numbering information (locants) */
  numbering: NumberingResult | null;
  /** Detailed messages about the naming process */
  messages: string[];
  /** Whether the result contains errors */
  hasErrors: boolean;
}

/**
 * Configuration options for the nomenclature pipeline
 */
export interface PipelineConfig {
  /** Chain selector instance to use */
  chainSelector?: ChainSelector;
  /** Custom filters for chain selection */
  customFilters?: ChainFilter[];
  /** Whether to include detailed debug messages */
  verbose?: boolean;
  /** Maximum time allowed for processing (ms) */
  timeout?: number;
}

/**
 * Main IUPAC nomenclature processing pipeline
 * Orchestrates analysis of molecules and generation of IUPAC names
 *
 * Processing flow:
 * 1. Validate input molecule
 * 2. Analyze molecular structure (rings, chains, functional groups)
 * 3. Select principal chain
 * 4. Determine numbering
 * 5. Identify functional groups and substituents
 * 6. Construct IUPAC name
 */
export class NomenclaturePipeline {
  private chainSelector: ChainSelector;
  private verbose: boolean;
  private timeout: number;
  private structureAnalyzer: StructureAnalyzer;
  private numberingAnalyzer: NumberingAnalyzer;

  constructor(config?: PipelineConfig) {
    this.chainSelector = config?.chainSelector || createDefaultChainSelector();
    this.verbose = config?.verbose ?? false;
    this.timeout = config?.timeout ?? 5000;
    this.structureAnalyzer = createStructureAnalyzer();
    this.numberingAnalyzer = createNumberingAnalyzer();

    // Add custom filters if provided
    if (config?.customFilters) {
      for (const filter of config.customFilters) {
        this.chainSelector.addFilter(filter);
      }
    }
  }

  /**
   * Process a molecule and generate its IUPAC name
   */
  process(molecule: Molecule): NomenclatureResult {
    const startTime = Date.now();
    const messages: string[] = [];
    const errors: string[] = [];

    try {
      // Step 1: Validate input
      if (!molecule || molecule.atoms.length === 0) {
        return {
          molecule,
          name: '',
          structure: null,
          principalChain: null,
          numbering: null,
          messages: ['Empty molecule provided'],
          hasErrors: true,
        };
      }

      if (this.verbose) {
        messages.push(`Processing molecule with ${molecule.atoms.length} atoms and ${molecule.bonds.length} bonds`);
      }

      // Step 2: Analyze molecular structure
      const structure = this.analyzeStructure(molecule);
      if (!structure) {
        return {
          molecule,
          name: '',
          structure: null,
          principalChain: null,
          numbering: null,
          messages: [...messages, 'Failed to analyze molecular structure'],
          hasErrors: true,
        };
      }

      if (this.verbose) {
        messages.push(`Analyzed structure: ${structure.chains.length} chains identified`);
      }

      // Step 3: Select principal chain
      const selection = this.chainSelector.selectBestChain(structure.chains);
      if (!selection.selectedChain) {
        return {
          molecule,
          name: '',
          structure,
          principalChain: null,
          numbering: null,
          messages: [...messages, 'No suitable principal chain found'],
          hasErrors: true,
        };
      }

      const principalChain = selection.selectedChain;

      if (this.verbose) {
        messages.push(`Selected principal chain: ${principalChain.length} atoms`);
        messages.push(`Reason: ${selection.reason}`);
      }

      // Step 4: Determine numbering
      const numbering = this.determineNumbering(principalChain, molecule);
      if (!numbering) {
        errors.push('Failed to determine numbering for principal chain');
      }

      if (this.verbose && numbering) {
        messages.push(`Numbering determined with direction: ${numbering.direction}`);
      }

      // Step 5: Construct name
      const name = this.constructName(principalChain, structure);

      if (this.verbose) {
        messages.push(`Generated IUPAC name: ${name}`);
      }

      // Check for timeout
      if (Date.now() - startTime > this.timeout) {
        errors.push(`Processing exceeded timeout of ${this.timeout}ms`);
      }

      return {
        molecule,
        name,
        structure,
        principalChain,
        numbering,
        messages: [...messages, ...errors],
        hasErrors: errors.length > 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        molecule,
        name: '',
        structure: null,
        principalChain: null,
        numbering: null,
        messages: [...messages, `Error: ${errorMessage}`],
        hasErrors: true,
      };
    }
  }

    /**
     * Analyze molecular structure
     * Uses StructureAnalyzer to extract chains, rings, and functional groups
     */
    private analyzeStructure(molecule: Molecule): MolecularStructure | null {
      try {
        return this.structureAnalyzer.analyze(molecule);
      } catch {
        return null;
      }
    }

    /**
     * Determine numbering for a chain
     * Returns locants and direction based on IUPAC rules
     */
    private determineNumbering(chain: Chain, molecule: Molecule): NumberingResult | null {
      try {
        return this.numberingAnalyzer.determineNumbering(chain, molecule);
      } catch {
        return null;
      }
    }

   /**
    * Construct IUPAC name from chain and structure
    */
   private constructName(chain: Chain, structure: MolecularStructure): string {
     try {
       // Get chain length in carbons
       const carbonCount = chain.atomIndices.length; // Simplified - should filter for carbons only
       const alkanePrefix = ruleEngine.getAlkaneName(carbonCount);

       // Build functional group suffixes
       const suffixes: string[] = [];
       if (structure.functionalGroups.length > 0) {
         // Get suffix from highest priority functional group
         const mainFG = structure.functionalGroups[0];
         if (mainFG) {
           suffixes.push(mainFG.suffix);
         }
       }

       // Build the name
       const baseName = alkanePrefix ?? 'unknown';
       const suffix = suffixes.length > 0 ? suffixes[0] ?? '' : '';
       const name = baseName + suffix;

       return name;
     } catch {
       return 'unknown';
     }
   }

  /**
   * Set verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Set processing timeout
   */
  setTimeout(timeoutMs: number): void {
    this.timeout = timeoutMs;
  }

  /**
   * Replace chain selector
   */
  setChainSelector(selector: ChainSelector): void {
    this.chainSelector = selector;
  }

  /**
   * Get current chain selector
   */
  getChainSelector(): ChainSelector {
    return this.chainSelector;
  }
}

/**
 * Create a default nomenclature pipeline instance
 */
export function createDefaultPipeline(config?: PipelineConfig): NomenclaturePipeline {
  return new NomenclaturePipeline(config);
}
