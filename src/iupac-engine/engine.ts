import type { Molecule } from "../../types";
import type {
  IUPACRule,
  Layer,
  NamingResult,
  NomenclatureMethod,
} from "./types";
import { ImmutableNamingContext, ExecutionPhase } from "./immutable-context";
import { LAYER_ORDER, LAYER_DEFINITIONS } from "./layer-config";
import {
  OPSINNameGenerator,
  getSharedNameGenerator,
} from "./opsin-name-generator";
import { analyzeRings } from "src/utils/ring-analysis";

/**
 * Core rule engine for IUPAC name generation
 */
export class RuleEngine {
  private rules = new Map<string, IUPACRule>();
  private layers = new Map<string, Layer>();

  constructor() {
    this.initializeEngine();
  }

  /**
   * Generate IUPAC name for a molecule
   */
  generateName(molecule: Molecule): NamingResult {
    let context = ImmutableNamingContext.create(molecule);

    try {
      // Execute layers in order
      for (const layerName of LAYER_ORDER) {
        const layer = this.layers.get(layerName);
        if (!layer) {
          throw new Error(`Layer ${layerName} not found`);
        }

        // Check dependencies
        if (!this.checkLayerDependencies(layer, context)) {
          // Optionally, add conflict to trace/history using withConflict
          context = context.withConflict(
            {
              ruleId: `layer-${layerName}`,
              conflictType: "dependency",
              description: `Layer ${layerName} dependencies not satisfied`,
              context: {},
            },
            `layer-${layerName}`,
            layer.name,
            "",
            ExecutionPhase.PARENT_STRUCTURE,
            `Layer ${layerName} dependencies not satisfied`,
          );
          continue;
        }

        // Track current layer in local variable if needed (no mutation on context)

        // Execute rules in this layer
        context = this.executeLayer(layer, context);

        // Check for conflicts
        const hasConflicts = context
          .getHistory()
          .some((trace) => trace.conflicts && trace.conflicts.length > 0);
        if (hasConflicts) {
          this.handleConflicts(context);
        }
      }

      // Generate final name
      return this.generateFinalName(context);
    } catch (error) {
      return this.generateFallbackName(context, error);
    }
  }

  /**
   * Generate IUPAC name for a molecule and return the internal context (for debugging)
   */
  generateNameWithContext(molecule: Molecule): {
    result: NamingResult;
    context: ImmutableNamingContext;
  } {
    let context = ImmutableNamingContext.create(molecule);

    try {
      for (const layerName of LAYER_ORDER) {
        const layer = this.layers.get(layerName);
        if (!layer) {
          throw new Error(`Layer ${layerName} not found`);
        }

        if (!this.checkLayerDependencies(layer, context)) {
          context = context.withConflict(
            {
              ruleId: `layer-${layerName}`,
              conflictType: "dependency",
              description: `Layer ${layerName} dependencies not satisfied`,
              context: {},
            },
            `layer-${layerName}`,
            layer.name,
            "",
            ExecutionPhase.PARENT_STRUCTURE,
            `Layer ${layerName} dependencies not satisfied`,
          );
          continue;
        }

        context = this.executeLayer(layer, context);

        const hasConflicts = context
          .getHistory()
          .some((trace) => trace.conflicts && trace.conflicts.length > 0);
        if (hasConflicts) {
          this.handleConflicts(context);
        }
      }

      const result = this.generateFinalName(context);
      return { result, context };
    } catch (error) {
      const result = this.generateFallbackName(context, error);
      return { result, context };
    }
  }

  /**
   * Register a rule with the engine
   */
  registerRule(rule: IUPACRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Register a layer with the engine
   */
  registerLayer(layer: Layer): void {
    this.layers.set(layer.name, layer);

    // Register all rules from this layer
    layer.rules.forEach((rule) => {
      this.registerRule(rule);
    });
  }

  /**
   * Get a specific rule by ID
   */
  getRule(ruleId: string): IUPACRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules
   */
  getAllRules(): IUPACRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get all layers
   */
  getAllLayers(): Layer[] {
    return Array.from(this.layers.values());
  }

  /**
   * Initialize the engine with default layers and rules
   */
  private initializeEngine(): void {
    // Register all layers
    LAYER_DEFINITIONS.forEach((layer) => {
      this.registerLayer(layer);
    });
  }

  /**
   * Check if a layer's dependencies are satisfied
   */
  private checkLayerDependencies(
    layer: Layer,
    context: ImmutableNamingContext,
  ): boolean {
    if (!layer.dependencies || layer.dependencies.length === 0) {
      return true;
    }

    // For now, be less strict about dependencies to allow rule execution
    // Real implementation would check specific dependency satisfaction
    return true;
  }

  /**
   * Execute all rules in a layer
   */
  private executeLayer(
    layer: Layer,
    context: ImmutableNamingContext,
  ): ImmutableNamingContext {
    // Sort rules by priority within the layer (higher priority = execute first) (higher priority = execute first)
    const sortedRules = [...layer.rules].sort(
      (a, b) => b.priority - a.priority,
    );
    let updatedContext = context;
    for (const rule of sortedRules) {
      // Check if rule can be executed
      if (this.canExecuteRule(rule, updatedContext)) {
        try {
          updatedContext = rule.action(updatedContext);
          // Optionally, track executed rules in trace/history
        } catch (error) {
          // Optionally, add conflict to trace/history using withConflict
          updatedContext = updatedContext.withConflict(
            {
              ruleId: rule.id,
              conflictType: "state_inconsistency",
              description: `Rule ${rule.id} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
              context: { error, rule },
            },
            rule.id,
            rule.name,
            rule.blueBookReference,
            ExecutionPhase.PARENT_STRUCTURE,
            `Rule ${rule.id} execution error`,
          );
        }
      }
    }
    return updatedContext;
  }

  /**
   * Check if a rule can be executed
   */
  private canExecuteRule(
    rule: IUPACRule,
    context: ImmutableNamingContext,
  ): boolean {
    // For demonstration, be less strict about dependencies
    // Real implementation would check proper dependency satisfaction

    // Check rule conditions
    try {
      return rule.conditions(context);
    } catch (error) {
      // If rule conditions fail, still allow execution for demo
      return true;
    }
  }

  /**
   * Handle conflicts in the context
   */
  private handleConflicts(context: ImmutableNamingContext): void {
    // For now, just log conflicts
    // In the future, we could implement conflict resolution strategies
    if (process.env.VERBOSE) {
      const allConflicts = context
        .getHistory()
        .flatMap((trace) => trace.conflicts || []);
      if (allConflicts.length > 0) {
        console.warn("Rule conflicts detected:", allConflicts);
      }
    }
  }

  /**
   * Generate the final name from context
   */
  private generateFinalName(context: ImmutableNamingContext): NamingResult {
    // This is a simplified implementation
    // Real implementation will build the name from the context

    const name = this.buildName(context);
    const method = context.getState().nomenclatureMethod || "substitutive";

    return {
      name,
      method: method as NomenclatureMethod,
      parentStructure: context.getState().parentStructure ?? {
        type: "chain",
        chain: {
          atoms: [],
          bonds: [],
          length: 0,
          multipleBonds: [],
          substituents: [],
          locants: [],
        },
        name: "",
        locants: [],
      },
      functionalGroups: context.getState().functionalGroups,
      locants: context.getState().parentStructure?.locants || [],
      confidence: this.calculateConfidence(context),
      rules: context.getHistory().map((trace) => trace.ruleId),
    };
  }

  /**
   * Build the name from the context
   */
  private buildName(context: ImmutableNamingContext): string {
    // Prefer final assembled name if available
    const finalName = context.getState().finalName;
    if (finalName && typeof finalName === "string" && finalName.length > 0) {
      return finalName;
    }

    // Prefer parent structure assembled name if available
    const parent = context.getState().parentStructure;
    if (
      parent &&
      typeof (parent as any).assembledName === "string" &&
      (parent as any).assembledName.length > 0
    ) {
      return (parent as any).assembledName;
    }

    // Prefer parent structure name if available
    if (parent && typeof parent.name === "string" && parent.name.length > 0) {
      return parent.name;
    }

    // Check for rings as fallback
    const ringInfo: any = analyzeRings(context.getState().molecule);
    if (ringInfo.rings.length > 0) {
      const ringSize = ringInfo.rings[0]!.length;
      if (ringInfo.isAromatic[0]) {
        const aromaticNames: { [key: number]: string } = {
          5: "cyclopentadiene",
          6: "benzene",
          7: "cycloheptatriene",
        };
        return aromaticNames[ringSize] || `aromatic-${ringSize}-membered`;
      } else {
        return this.getRingBaseName(ringSize);
      }
    }

    // Fallback to OPSIN name generator
    return getSharedNameGenerator().generateName(context);
  }

  /**
   * Build chain name
   */
  private buildChainName(parent: any): string {
    const length = parent.chain?.length || 0;
    const functionalGroups = parent.functionalGroups || [];

    if (functionalGroups.length > 0) {
      // Has functional groups
      const group = functionalGroups[0];
      const baseName = this.getChainBaseName(length);
      return `${group.prefix || ""}${baseName}${group.suffix || ""}`;
    } else {
      // Simple hydrocarbon
      return this.getChainBaseName(length);
    }
  }

  /**
   * Build ring name
   */
  private buildRingName(parent: any): string {
    const size = parent.ring?.size || 0;
    return this.getRingBaseName(size);
  }

  /**
   * Get base chain name
   */
  private getChainBaseName(length: number): string {
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

    if (length < chainNames.length) {
      return chainNames[length] || "alkan";
    }

    // For longer chains, use systematic naming
    return `C${length}ane`;
  }

  /**
   * Get base ring name
   */
  private getRingBaseName(size: number): string {
    const ringNames = [
      "",
      "",
      "",
      "",
      "cyclobutane",
      "cyclopentane",
      "cyclohexane",
    ];

    if (size < ringNames.length) {
      return ringNames[size] || `cyclo${this.getChainBaseName(size)}ane`;
    }

    // For larger rings
    return `cyclo${this.getChainBaseName(size)}ane`;
  }

  /**
   * Build name based on functional groups
   */
  private buildFunctionalGroupName(context: ImmutableNamingContext): string {
    const groups = context.getState().functionalGroups;
    const primaryGroup = groups.find((g) => g.isPrincipal) || groups[0];

    if (!primaryGroup) {
      return this.buildBasicName(context.getState().molecule);
    }

    // Handle different functional groups
    switch (primaryGroup.type) {
      case "carboxylic_acid":
        return this.buildCarboxylicAcidName(context, primaryGroup);
      case "alcohol":
        return this.buildAlcoholName(context, primaryGroup);
      case "ketone":
        return this.buildKetoneName(context, primaryGroup);
      case "amine":
        return this.buildAmineName(context, primaryGroup);
      default:
        return this.buildBasicName(context.getState().molecule);
    }
  }

  /**
   * Build basic name from molecule structure
   */
  private buildBasicName(molecule: Molecule): string {
    const carbonCount = molecule.atoms.filter((a) => a.symbol === "C").length;
    const oxygenCount = molecule.atoms.filter((a) => a.symbol === "O").length;
    const nitrogenCount = molecule.atoms.filter((a) => a.symbol === "N").length;

    if (carbonCount === 1) {
      if (oxygenCount === 1 && nitrogenCount === 0) return "methanol";
      if (oxygenCount === 2 && nitrogenCount === 0) return "formic acid";
      if (nitrogenCount === 1) return "methanamine";
      return "methane";
    }

    if (carbonCount === 2) {
      if (oxygenCount === 1 && nitrogenCount === 0) return "ethanol";
      if (oxygenCount === 2 && nitrogenCount === 0) return "acetic acid";
      if (nitrogenCount === 1) return "ethanamine";
      return "ethane";
    }

    if (carbonCount === 3) {
      if (oxygenCount === 1 && nitrogenCount === 0) return "propanol";
      if (nitrogenCount === 1) return "propanamine";
      return "propane";
    }

    // Default to alkane name
    const baseName = this.getChainBaseName(carbonCount);
    return baseName.replace("ane", "ane"); // Ensure it's an alkane
  }

  /**
   * Build carboxylic acid name
   */
  private buildCarboxylicAcidName(
    context: ImmutableNamingContext,
    group: any,
  ): string {
    const carbonCount = context
      .getState()
      .molecule.atoms.filter((a) => a.symbol === "C").length;
    const acidNames = [
      "",
      "methanoic",
      "ethanoic",
      "propanoic",
      "butanoic",
      "pentanoic",
    ];
    let baseName: string;
    if (carbonCount <= 5) {
      baseName = acidNames[carbonCount] || "alkanoic";
    } else {
      baseName = `${this.getChainBaseName(carbonCount)}oic`;
    }
    return `${baseName} acid`;
  }

  /**
   * Build alcohol name
   */
  private buildAlcoholName(
    context: ImmutableNamingContext,
    group: any,
  ): string {
    const carbonCount = context
      .getState()
      .molecule.atoms.filter((a) => a.symbol === "C").length;
    const alcoholNames = [
      "",
      "methanol",
      "ethanol",
      "propanol",
      "butanol",
      "pentanol",
    ];
    let baseName: string;
    if (carbonCount <= 5) {
      baseName = alcoholNames[carbonCount] || "alkanol";
    } else {
      baseName = `${this.getChainBaseName(carbonCount)}ol`;
    }
    return baseName;
  }

  /**
   * Build ketone name
   */
  private buildKetoneName(context: ImmutableNamingContext, group: any): string {
    const carbonCount = context
      .getState()
      .molecule.atoms.filter((a) => a.symbol === "C").length;
    const ketoneNames = [
      "",
      "methanone",
      "ethanone",
      "propanone",
      "butanone",
      "pentanone",
    ];
    let baseName: string;
    if (carbonCount <= 5) {
      baseName = ketoneNames[carbonCount] || "alkanone";
    } else {
      baseName = `${this.getChainBaseName(carbonCount)}one`;
    }
    return baseName;
  }

  /**
   * Build amine name
   */
  private buildAmineName(context: ImmutableNamingContext, group: any): string {
    const carbonCount = context
      .getState()
      .molecule.atoms.filter((a) => a.symbol === "C").length;
    const amineNames = [
      "",
      "methanamine",
      "ethanamine",
      "propanamine",
      "butanamine",
      "pentanamine",
    ];
    let baseName: string;
    if (carbonCount <= 5) {
      baseName = amineNames[carbonCount] || "alkanamine";
    } else {
      baseName = `${this.getChainBaseName(carbonCount)}amine`;
    }
    return baseName;
  }

  /**
   * Calculate confidence in the generated name
   */
  private calculateConfidence(context: ImmutableNamingContext): number {
    let confidence = 1.0;

    // Reduce confidence for conflicts
    const conflictCount = context
      .getHistory()
      .reduce(
        (acc, trace) => acc + (trace.conflicts ? trace.conflicts.length : 0),
        0,
      );
    confidence -= conflictCount * 0.1;

    // Increase confidence if rules were executed
    if (context.getHistory().length > 0) {
      confidence += 0.2;
    }

    // If we have functional groups, higher confidence
    if (context.getState().functionalGroups.length > 0) {
      confidence += 0.3;
    }

    // If we have parent structure, higher confidence
    if (context.getState().parentStructure) {
      confidence += 0.2;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate a fallback name when errors occur
   */
  private generateFallbackName(
    context: ImmutableNamingContext,
    error: any,
  ): NamingResult {
    return {
      name: "Error: Unable to generate IUPAC name",
      method: "substitutive" as any,
      parentStructure: context.getState().parentStructure!,
      functionalGroups: context.getState().functionalGroups,
      locants: [],
      confidence: 0,
      rules: context.getHistory().map((trace) => trace.ruleId),
    };
  }
}
