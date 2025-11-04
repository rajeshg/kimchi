import { ExecutionPhase } from "../immutable-context";

/**
 * Layer contract defining dependencies and outputs
 */
export interface LayerContract {
  // Basic contract information
  name: string;
  phase: ExecutionPhase;
  description: string;

  // What this layer requires to execute
  dependencies: DependencyRequirement[];

  // What this layer provides when complete
  provides: DataStructureDefinition[];

  // Validation rules for the contract
  validationRules: ValidationRule[];

  // Contract metadata
  version: string;
  blueBookSections: string[];
}

/**
 * A dependency that must be satisfied before layer execution
 */
export interface DependencyRequirement {
  name: string;
  type: DependencyType;
  description: string;
  validation: (data: any) => boolean;
  required: boolean; // If false, dependency is optional
}

/**
 * A data structure that will be provided by this layer
 */
export interface DataStructureDefinition {
  name: string;
  type: string;
  description: string;
  validation: (data: any) => boolean;
}

/**
 * A validation rule for the contract
 */
export interface ValidationRule {
  name: string;
  description: string;
  check: (context: any) => boolean;
  severity: "error" | "warning";
}

/**
 * Types of dependencies
 */
export enum DependencyType {
  ATOMIC_ANALYSIS = "atomicAnalysis",
  FUNCTIONAL_GROUPS = "functionalGroups",
  CANDIDATE_CHAINS = "candidateChains",
  CANDIDATE_RINGS = "candidateRings",
  PARENT_STRUCTURE = "parentStructure",
  NOMENCLATURE_METHOD = "nomenclatureMethod",
}

/**
 * Contract validation result
 */
export interface ContractValidationResult {
  isValid: boolean;
  errors: ContractValidationError[];
  warnings: ContractValidationError[];
}

/**
 * A contract validation error or warning
 */
export interface ContractValidationError {
  type: "dependency" | "output" | "validation";
  message: string;
  severity: "error" | "warning";
  context?: any;
}

/**
 * Predefined layer contracts following Blue Book hierarchy
 */

// Functional Group Detection Phase Contract
export const FUNCTIONAL_GROUP_CONTRACT: LayerContract = {
  name: "functional-group-detection",
  phase: ExecutionPhase.FUNCTIONAL_GROUP,
  description: "Detect and prioritize functional groups per Blue Book P-44.1",
  dependencies: [
    {
      name: "atomicAnalysis",
      type: DependencyType.ATOMIC_ANALYSIS,
      description: "Basic atomic properties (valence, hybridization, etc.)",
      validation: (data) => data && typeof data === "object",
      required: true,
    },
  ],
  provides: [
    {
      name: "functionalGroups",
      type: "FunctionalGroup[]",
      description: "All functional groups found in the molecule",
      validation: (data) => Array.isArray(data) && data.length >= 0,
    },
    {
      name: "principalGroup",
      type: "FunctionalGroup",
      description:
        "The highest priority functional group (principal characteristic group)",
      validation: (data) => data && typeof data === "object" && data.type,
    },
    {
      name: "functionalGroupPriority",
      type: "number",
      description:
        "Numeric priority of the principal group (lower = higher priority)",
      validation: (data) => typeof data === "number" && data >= 0,
    },
  ],
  validationRules: [
    {
      name: "principalGroupExists",
      description: "A principal functional group must be identified",
      check: (context) => context.functionalGroups.length > 0,
      severity: "error",
    },
    {
      name: "priorityConsistency",
      description: "Principal group must have the lowest priority number",
      check: (context) => {
        if (context.functionalGroups.length === 0) return true;
        const principal = context.principalGroup;
        return context.functionalGroups.every(
          (group: any) => group.priority >= principal.priority,
        );
      },
      severity: "error",
    },
  ],
  version: "1.0",
  blueBookSections: ["P-44.1", "Table 5.1"],
};

// Parent Structure Selection Phase Contract
export const PARENT_STRUCTURE_CONTRACT: LayerContract = {
  name: "parent-structure-selection",
  phase: ExecutionPhase.PARENT_STRUCTURE,
  description: "Select parent structure per Blue Book P-44 hierarchy",
  dependencies: [
    {
      name: "functionalGroups",
      type: DependencyType.FUNCTIONAL_GROUPS,
      description: "Functional groups for determining parent structure",
      validation: (data) => Array.isArray(data) && data.length >= 0,
      required: true,
    },
    {
      name: "atomicAnalysis",
      type: DependencyType.ATOMIC_ANALYSIS,
      description: "Atomic properties for chain/ring analysis",
      validation: (data) => data && typeof data === "object",
      required: true,
    },
  ],
  provides: [
    {
      name: "parentStructure",
      type: "ParentStructure",
      description: "Selected parent structure (chain or ring system)",
      validation: (data) => data && typeof data === "object" && data.type,
    },
    {
      name: "selectionHistory",
      type: "SelectionTrace[]",
      description: "History of selection decisions made (for debugging)",
      validation: (data) => Array.isArray(data),
    },
    {
      name: "nomenclatureMethod",
      type: "NomenclatureMethod",
      description:
        "Selected nomenclature method (substitutive, functional class, etc.)",
      validation: (data) => data && typeof data === "string",
    },
  ],
  validationRules: [
    {
      name: "parentStructureSelected",
      description: "A parent structure must be selected",
      check: (context) => context.parentStructure !== undefined,
      severity: "error",
    },
    {
      name: "selectionHierarchyApplied",
      description: "P-44.3 chain selection hierarchy must be properly applied",
      check: (context) => {
        if (
          !context.parentStructure ||
          context.parentStructure.type !== "chain"
        ) {
          return true; // Only applies to chain selection
        }
        // Check that chain selection rules were applied
        return context.selectionHistory && context.selectionHistory.length > 0;
      },
      severity: "warning",
    },
  ],
  version: "1.0",
  blueBookSections: ["P-44", "P-44.1", "P-44.2", "P-44.3", "P-44.4", "P-51"],
};

// Numbering Phase Contract
export const NUMBERING_CONTRACT: LayerContract = {
  name: "numbering-assignment",
  phase: ExecutionPhase.NUMBERING,
  description: "Assign locants per Blue Book P-14.4",
  dependencies: [
    {
      name: "parentStructure",
      type: DependencyType.PARENT_STRUCTURE,
      description: "Selected parent structure to number",
      validation: (data) => data && typeof data === "object" && data.type,
      required: true,
    },
  ],
  provides: [
    {
      name: "numberedStructure",
      type: "ParentStructure",
      description: "Parent structure with assigned locants",
      validation: (data) =>
        data && typeof data === "object" && Array.isArray(data.locants),
    },
    {
      name: "locantAssignments",
      type: "Map<string, number>",
      description: "Mapping of substituent names to their locants",
      validation: (data) =>
        data instanceof Map || (data && typeof data === "object"),
    },
  ],
  validationRules: [
    {
      name: "lowestLocantSet",
      description: "Must use lowest possible locant set (P-14.2)",
      check: (context) => {
        // This would implement the actual lowest locant set validation
        return true; // Placeholder
      },
      severity: "warning",
    },
  ],
  version: "1.0",
  blueBookSections: ["P-14", "P-14.1", "P-14.2", "P-14.3", "P-14.4"],
};

/**
 * Contract validation utilities
 */
export class ContractValidator {
  /**
   * Validate that a context satisfies a layer contract
   */
  static validateContract(
    contract: LayerContract,
    context: any,
  ): ContractValidationResult {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationError[] = [];

    // Check dependencies
    for (const dep of contract.dependencies) {
      if (dep.required && !this.checkDependency(dep, context)) {
        errors.push({
          type: "dependency",
          message: `Required dependency '${dep.name}' is not satisfied`,
          severity: "error",
          context: { dependency: dep.name },
        });
      } else if (!dep.required && !this.checkDependency(dep, context)) {
        warnings.push({
          type: "dependency",
          message: `Optional dependency '${dep.name}' is not satisfied`,
          severity: "warning",
          context: { dependency: dep.name },
        });
      }
    }

    // Check provided outputs
    for (const output of contract.provides) {
      if (!this.checkOutput(output, context)) {
        warnings.push({
          type: "output",
          message: `Expected output '${output.name}' was not provided or is invalid`,
          severity: "warning",
          context: { output: output.name },
        });
      }
    }

    // Check validation rules
    // If expected outputs are not yet provided, downgrade rule failures to warnings
    const missingProvides = contract.provides.filter(
      (p) => !this.checkOutput(p, context),
    );
    const shouldDowngrade = missingProvides.length > 0;

    for (const rule of contract.validationRules) {
      if (!rule.check(context)) {
        const validationError: ContractValidationError = {
          type: "validation",
          message: rule.description,
          severity: rule.severity,
          context: { rule: rule.name },
        };

        if (shouldDowngrade) {
          // Provide as a warning so contracts with missing outputs but satisfied dependencies
          // still return a valid result while signalling that further outputs are required
          warnings.push({ ...validationError, severity: "warning" });
        } else {
          if (rule.severity === "error") {
            errors.push(validationError);
          } else {
            warnings.push(validationError);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if a dependency is satisfied
   */
  private static checkDependency(
    dep: DependencyRequirement,
    context: any,
  ): boolean {
    const data = context[dep.name];
    return dep.validation(data);
  }

  /**
   * Check if an output is properly provided
   */
  private static checkOutput(
    output: DataStructureDefinition,
    context: any,
  ): boolean {
    const data = context[output.name];
    return output.validation(data);
  }

  /**
   * Generate a human-readable contract summary
   */
  static generateContractSummary(contract: LayerContract): string {
    let summary = `${contract.name} (${contract.phase})\n`;
    summary += `Description: ${contract.description}\n\n`;

    summary += `Dependencies:\n`;
    for (const dep of contract.dependencies) {
      summary += `  - ${dep.name} (${dep.type}) ${dep.required ? "[required]" : "[optional]"}\n`;
    }

    summary += `\nProvides:\n`;
    for (const output of contract.provides) {
      summary += `  - ${output.name} (${output.type})\n`;
    }

    summary += `\nBlue Book Sections: ${contract.blueBookSections.join(", ")}\n`;

    return summary;
  }
}
