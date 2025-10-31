import type { IUPACRule } from '../types';
import { ExecutionPhase } from '../immutable-context';
import type { ImmutableNamingContext } from '../immutable-context';
import type { FunctionalGroup } from '../types';

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
 * Rule: Substituent Alphabetization
 * 
 * Arrange substituents in alphabetical order according to Blue Book rules.
 */
export const SUBSTITUENT_ALPHABETIZATION_RULE: IUPACRule = {
  id: 'substituent-alphabetization',
  name: 'Substituent Alphabetization',
  description: 'Arrange substituents in alphabetical order',
  blueBookReference: 'P-14.3 - Alphabetization of substituents',
  priority: 100,
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    return functionalGroups && functionalGroups.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    
    if (!functionalGroups || functionalGroups.length === 0) {
      return context;
    }
    
    // Separate principal groups from substituents
  const principalGroups = functionalGroups.filter((group: FunctionalGroup) => group.isPrincipal);
  const substituentGroups = functionalGroups.filter((group: FunctionalGroup) => !group.isPrincipal);
    
    // Alphabetize substituents
    const alphabetizedSubstituents = substituentGroups.sort((a: FunctionalGroup, b: FunctionalGroup) => {
      const prefixA = a.prefix || a.type;
      const prefixB = b.prefix || b.type;
      return prefixA.localeCompare(prefixB);
    });
    
    return context.withStateUpdate(
        (state: any) => ({
        ...state,
        functionalGroups: [...principalGroups, ...alphabetizedSubstituents]
      }),
      'substituent-alphabetization',
      'Substituent Alphabetization',
      'P-14.3',
      ExecutionPhase.ASSEMBLY,
      `Alphabetized ${alphabetizedSubstituents.length} substituent(s)`
    );
  }
};

/**
 * Rule: Locant Assignment Assembly
 * 
 * Combine locants with their corresponding substituents/groups.
 */
export const LOCANT_ASSIGNMENT_ASSEMBLY_RULE: IUPACRule = {
  id: 'locant-assembly',
  name: 'Locant Assignment Assembly',
  description: 'Combine locants with substituents and functional groups',
  blueBookReference: 'P-14 - Locant assignment assembly',
  priority: 95,
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    return functionalGroups && functionalGroups.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    const parentStructure = context.getState().parentStructure;
    
    if (!functionalGroups || !parentStructure) {
      return context;
    }
    
    // Build named groups with locants
    const assembledGroups = functionalGroups.map((group: FunctionalGroup) => {
      const locants = group.locants && group.locants.length > 0 
        ? group.locants.sort((a: number, b: number) => a - b).join(',')
        : '';
      
      const prefix = group.prefix || '';
      const suffix = group.suffix || '';
      const type = group.type;
      
      let name = '';
      if (locants) {
        name = `${locants}-${prefix}${type}${suffix}`;
      } else {
        name = `${prefix}${type}${suffix}`;
      }
      
      return {
        ...group,
        assembledName: name,
        locantString: locants
      };
    });
    
    return context.withStateUpdate(
          (state: any) => ({
        ...state,
        functionalGroups: assembledGroups
      }),
      'locant-assembly',
      'Locant Assignment Assembly',
      'P-14',
      ExecutionPhase.ASSEMBLY,
      `Assembled names for ${assembledGroups.length} group(s)`
    );
  }
};

/**
 * Rule: Multiplicative Prefixes
 * 
 * Apply multiplicative prefixes (di-, tri-, tetra-, etc.) for identical groups.
 */
export const MULTIPLICATIVE_PREFIXES_RULE: IUPACRule = {
  id: 'multiplicative-prefixes',
  name: 'Multiplicative Prefixes',
  description: 'Apply multiplicative prefixes for identical groups',
  blueBookReference: 'P-16.1 - Multiplicative prefixes',
  priority: 90,
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    if (!functionalGroups || functionalGroups.length === 0) return false;
    
    // Check for duplicate group types
    const groupTypes = functionalGroups.map(group => group.type);
    return groupTypes.some(type => 
      groupTypes.filter(t => t === type).length > 1
    );
  },
  action: (context) => {
    const functionalGroups = context.getState().functionalGroups;
    
    if (!functionalGroups) {
      return context;
    }
    
    // Group identical types
    const groupedTypes = new Map<string, FunctionalGroup[]>();
    functionalGroups.forEach((group: FunctionalGroup) => {
      const type = group.type;
      if (!groupedTypes.has(type)) {
        groupedTypes.set(type, []);
      }
      groupedTypes.get(type)!.push(group);
    });
    
    // Apply multiplicative prefixes
    const processedGroups: any[] = [];
    
    for (const [type, groups] of groupedTypes.entries()) {
      if (groups.length > 1) {
        // Multiple identical groups - apply prefix
        const count = groups.length;
        const prefix = getMultiplicativePrefix(count);
  const baseName = (groups[0]?.assembledName) || type;
        
        // Remove individual locants and apply multiplicative prefix
        const cleanName = baseName.replace(/^\d+,?-/, ''); // Remove leading locants
        const finalName = `${prefix}${cleanName}`;
        
        processedGroups.push({
          ...groups[0],
          assembledName: finalName,
          isMultiplicative: true,
          multiplicity: count,
          locantString: groups.map((g: any) => g.locantString).filter(Boolean).join(',')
        });
      } else {
        // Single group - keep as is
        processedGroups.push(groups[0]);
      }
    }
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        functionalGroups: processedGroups
      }),
      'multiplicative-prefixes',
      'Multiplicative Prefixes',
      'P-16.1',
      ExecutionPhase.ASSEMBLY,
      `Applied multiplicative prefixes to ${groupedTypes.size} group type(s)`
    );
  }
};

/**
 * Rule: Parent Structure Name Assembly
 * 
 * Build the complete parent structure name with appropriate suffixes.
 */
export const PARENT_NAME_ASSEMBLY_RULE: IUPACRule = {
  id: 'parent-name-assembly',
  name: 'Parent Structure Name Assembly',
  description: 'Build complete parent structure name',
  blueBookReference: 'P-2 - Parent structure names',
  priority: 85,
  conditions: (context) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure !== undefined;
  },
  action: (context) => {
    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;
    
    if (!parentStructure) {
      return context;
    }
    
    let parentName = '';
    
    if (parentStructure.type === 'chain') {
      parentName = buildChainName(parentStructure, functionalGroups);
    } else {
      parentName = buildRingName(parentStructure, functionalGroups);
    }
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          assembledName: parentName
        }
      }),
      'parent-name-assembly',
      'Parent Structure Name Assembly',
      'P-2',
      ExecutionPhase.ASSEMBLY,
      `Assembled parent name: ${parentName}`
    );
  }
};

/**
 * Rule: Complete Name Assembly
 * 
 * Assemble the final IUPAC name from all components.
 */
export const COMPLETE_NAME_ASSEMBLY_RULE: IUPACRule = {
  id: 'complete-name-assembly',
  name: 'Complete Name Assembly',
  description: 'Assemble the final IUPAC name from all components',
  blueBookReference: 'Complete name construction',
  priority: 80,
  conditions: (context) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure !== undefined;
  },
  action: (context) => {
    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;
    const nomenclatureMethod = context.getState().nomenclatureMethod;
    
    if (!parentStructure) {
      return context.withConflict(
        {
          ruleId: 'complete-name-assembly',
          conflictType: 'state_inconsistency',
          description: 'No parent structure available for name assembly',
          context: {}
        },
        'complete-name-assembly',
        'Complete Name Assembly',
        'Complete construction',
        ExecutionPhase.ASSEMBLY,
        'No parent structure available for name assembly'
      );
    }
    
    // Build final name based on nomenclature method
    let finalName = '';
    
    if (nomenclatureMethod === 'functional_class') {
      finalName = buildFunctionalClassName(parentStructure, functionalGroups);
    } else {
      finalName = buildSubstitutiveName(parentStructure, functionalGroups);
    }
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        finalName: finalName,
        nameAssemblyComplete: true
      }),
      'complete-name-assembly',
      'Complete Name Assembly',
      'Complete construction',
      ExecutionPhase.ASSEMBLY,
      `Final name assembled: ${finalName}`
    );
  }
};

/**
 * Rule: Name Validation and Finalization
 * 
 * Validate the complete name and make final adjustments.
 */
export const NAME_VALIDATION_RULE: IUPACRule = {
  id: 'name-validation',
  name: 'Name Validation and Finalization',
  description: 'Validate and finalize the IUPAC name',
  blueBookReference: 'Complete name validation',
  priority: 70,
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
          ruleId: 'name-validation',
          conflictType: 'state_inconsistency',
          description: 'No final name available for validation',
          context: {}
        },
        'name-validation',
        'Name Validation and Finalization',
        'Validation',
        ExecutionPhase.ASSEMBLY,
        'No final name available for validation'
      );
    }
    
    // Validate name structure
    const validationResult = validateIUPACName(finalName, parentStructure);
    
    // Apply final formatting
    const formattedName = applyFinalFormatting(finalName);
    
    // Calculate confidence based on completeness
    const confidence = calculateNameConfidence(context.getState());
    
    return context.withStateUpdate(
        (state: any) => ({
        ...state,
        finalName: formattedName,
        nameValidation: validationResult,
        confidence: confidence
      }),
      'name-validation',
      'Name Validation and Finalization',
      'Validation',
      ExecutionPhase.ASSEMBLY,
      `Name validated and formatted: ${formattedName}`
    );
  }
};

/**
 * Rule: Name Assembly Complete
 * 
 * Final rule to mark the assembly phase as complete.
 */
export const NAME_ASSEMBLY_COMPLETE_RULE: IUPACRule = {
  id: 'name-assembly-complete',
  name: 'Name Assembly Complete',
  description: 'Mark the name assembly phase as complete',
  blueBookReference: 'Assembly phase completion',
  priority: 50,
  conditions: (context) => {
    const finalName = context.getState().finalName;
    return !!finalName && finalName.length > 0;
  },
  action: (context) => {
    const finalName = context.getState().finalName;
    
    if (!finalName) {
      return context.withConflict(
        {
          ruleId: 'name-assembly-complete',
          conflictType: 'state_inconsistency',
          description: 'No final name available for completion',
          context: {}
        },
        'name-assembly-complete',
        'Name Assembly Complete',
        'Assembly',
        ExecutionPhase.ASSEMBLY,
        'No final name available for completion'
      );
    }
    
    return context.withPhaseCompletion(
      ExecutionPhase.ASSEMBLY,
      'name-assembly-complete',
      'Name Assembly Complete',
      'Assembly',
      ExecutionPhase.ASSEMBLY,
      `Name assembly phase completed successfully: ${finalName}`
    );
  }
};

/**
 * Helper functions for name assembly
 */

function buildChainName(parentStructure: any, functionalGroups: any[]): string {
  const chain = parentStructure.chain;
  if (!chain) {
    return parentStructure.name || 'unknown-chain';
  }
  
  const length = chain.length;
  
  // Base chain name
  const chainNames = [
    '', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec',
    'undec', 'dodec', 'tridec', 'tetradec', 'pentadec', 'hexadec', 'heptadec', 'octadec', 'nonadec'
  ];
  
  let baseName = 'unknown';
  if (length < chainNames.length) {
    baseName = chainNames[length] ?? 'unknown';
  } else {
    baseName = `tetracos`; // For very long chains
  }
  
  // Add unsaturation suffixes based on multiple bonds
  const doubleBonds = chain.multipleBonds?.filter((bond: any) => bond.type === 'double').length || 0;
  const tripleBonds = chain.multipleBonds?.filter((bond: any) => bond.type === 'triple').length || 0;
  
  if (tripleBonds > 0 && doubleBonds === 0) {
    baseName = baseName.replace(/[aeiou]+$/, ''); // Remove trailing vowels
    baseName += 'yne';
  } else if (doubleBonds > 0 && tripleBonds === 0) {
    baseName = baseName.replace(/[aeiou]+$/, ''); // Remove trailing vowels
    baseName += 'ene';
  } else if (doubleBonds > 0 && tripleBonds > 0) {
    baseName = baseName.replace(/[aeiou]+$/, ''); // Remove trailing vowels
    baseName += 'en-yne';
  } else {
    baseName += 'ane'; // Saturated
  }
  
  return baseName;
}

function buildRingName(parentStructure: any, functionalGroups: any[]): string {
  const ring = parentStructure.ring;
  if (!ring) {
    return parentStructure.name || 'unknown-ring';
  }
  
  // This is simplified - real implementation would use comprehensive ring naming
  const ringNames: { [key: number]: string } = {
    3: 'cyclopropane', 4: 'cyclobutane', 5: 'cyclopentane', 
    6: 'cyclohexane', 7: 'cycloheptane', 8: 'cyclooctane'
  };
  
  const size = ring.size;
  const baseName = ringNames[size] || `cyclo${size - 1}ane`;
  
  // If substituents are present on the ring, build a substituted ring name
  const subs = parentStructure.substituents || ring.substituents || [];
  if (subs && subs.length > 0) {
    // Group substituents by root name and build position lists
    const grouped = new Map<string, { positions: string[]; count: number }>();
    for (const s of subs) {
      const root = s.name || s.type || 'sub';
      const pos = s.position ? s.position.toString() : '';
      const prev = grouped.get(root);
      if (prev) {
        prev.positions.push(pos);
        prev.count += 1;
      } else {
        grouped.set(root, { positions: pos ? [pos] : [], count: pos ? 1 : 0 });
      }
    }

    const prefixParts: string[] = [];
    for (const [root, data] of grouped.entries()) {
      const positions = data.positions.sort((a, b) => parseInt(a) - parseInt(b));
      const count = data.count;
      const multiplier = count === 1 ? '' : getMultiplicativePrefix(count);
      const text = count === 1 ? `${positions.join(',')}-${root}` : `${positions.join(',')}-${multiplier}${root}`;
      prefixParts.push(text);
    }
    prefixParts.sort((a, b) => {
      // alphabetical by root ignoring multiplicative prefixes
      const ar = a.replace(/^[0-9,\-]+-/, '').replace(/^(di|tri|tetra|bis|tris|tetr)/i, '');
      const br = b.replace(/^[0-9,\-]+-/, '').replace(/^(di|tri|tetra|bis|tris|tetr)/i, '');
      return ar.localeCompare(br);
    });

    const prefix = prefixParts.join('-');
    if (ring.type === 'aromatic' && size === 6) {
      return `${prefix}-benzene`;
    }
    return `${prefix}-${baseName}`;
  }

  // Check for aromatic naming
  if (ring.type === 'aromatic' && size === 6) {
    return 'benzene';
  }

  return baseName;
}

function buildFunctionalClassName(parentStructure: any, functionalGroups: any[]): string {
  // Functional class nomenclature: substituent name + parent name + functional class term
  const functionalGroup = functionalGroups.find(group => group.type === 'ester' || group.type === 'amide');
  
  if (!functionalGroup) {
    return buildSubstitutiveName(parentStructure, functionalGroups);
  }
  
  // Simplified functional class naming
  switch (functionalGroup.type) {
    case 'ester':
      return `alkyl ${functionalGroup.assembledName || 'carboxylate'}`;
    case 'amide':
      return `${functionalGroup.assembledName || 'amide'}`;
    default:
      return buildSubstitutiveName(parentStructure, functionalGroups);
  }
}

function buildSubstitutiveName(parentStructure: any, functionalGroups: any[]): string {
  let name = '';
  
  // Add substituents (excluding principal group)
  const substituents = functionalGroups.filter(group => !group.isPrincipal);
  if (substituents.length > 0) {
    const substituentNames = substituents
      .map(group => group.assembledName)
      .filter(Boolean)
      .join('-');
    name += substituentNames + '-';
  }
  
  // Add parent structure
  name += parentStructure.assembledName || parentStructure.name || 'unknown';
  
  // Add principal functional group suffix
  const principalGroup = functionalGroups.find(group => group.isPrincipal);
  if (principalGroup && principalGroup.suffix) {
    name = name.replace(/ane$|ene$|yne$/, ''); // Remove hydrocarbon suffix
    name += principalGroup.suffix;
  }
  
  return name;
}

function getMultiplicativePrefix(count: number): string {
  const prefixes: { [key: number]: string } = {
    2: 'di', 3: 'tri', 4: 'tetra', 5: 'penta', 6: 'hexa',
    7: 'hepta', 8: 'octa', 9: 'nona', 10: 'deca'
  };
  
  return prefixes[count] || `${count}-`;
}

function validateIUPACName(name: string, parentStructure: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Basic validation rules
  if (!name || name.trim().length === 0) {
    errors.push('Name is empty');
  }
  
  if (name.length > 200) {
    errors.push('Name is unusually long (>200 characters)');
  }
  
  // Check for basic naming patterns
  if (!/[a-zA-Z]/.test(name)) {
    errors.push('Name contains no letters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function applyFinalFormatting(name: string): string {
  // Apply final formatting rules
  let formatted = name.trim();
  
  // Remove multiple consecutive hyphens
  formatted = formatted.replace(/--+/g, '-');
  
  // Ensure proper spacing around locants
  formatted = formatted.replace(/(\d)-([a-zA-Z])/g, '$1-$2');
  
  // Capitalize appropriately (IUPAC names typically don't use capitals except at start)
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  
  return formatted;
}

function calculateNameConfidence(state: any): number {
  let confidence = 1.0;
  
  // Reduce confidence if components are missing
  if (!state.parentStructure) confidence -= 0.3;
  if (!state.functionalGroups || state.functionalGroups.length === 0) confidence -= 0.1;
  
  // Reduce confidence if conflicts were detected
  if (state.conflicts && state.conflicts.length > 0) {
    confidence -= state.conflicts.length * 0.1;
  }
  
  // Reduce confidence if validation failed
  if (state.nameValidation && !state.nameValidation.isValid) {
    confidence -= 0.2;
  }
  
  return Math.max(0.1, Math.min(1.0, confidence));
}

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
  NAME_ASSEMBLY_COMPLETE_RULE
];