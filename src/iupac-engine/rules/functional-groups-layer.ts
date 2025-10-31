import type { IUPACRule, FunctionalGroup } from '../types';
import type { ImmutableNamingContext } from '../immutable-context';
import { ExecutionPhase, NomenclatureMethod } from '../immutable-context';
import { OPSINFunctionalGroupDetector } from '../opsin-functional-group-detector';

/**
 * Functional Group Detection Layer Rules
 * 
 * This layer detects and prioritizes functional groups according to Blue Book P-44.1.
 * The functional group priority determines the parent structure and suffix.
 * 
 * Reference: Blue Book P-44.1 - Principal characteristic group selection
 * https://iupac.qmul.ac.uk/BlueBook/RuleP44.html
 */

/**
 * Rule: Principal Group Priority Detection
 * 
 * Implements Blue Book Table 5.1 - Order of seniority of classes
 * Highest: Acids (1) → Lowest: Halides (12)
 */
export const FUNCTIONAL_GROUP_PRIORITY_RULE: IUPACRule = {
  id: 'functional-group-priority',
  name: 'Functional Group Priority Detection',
  description: 'Detect and prioritize functional groups per Blue Book Table 5.1',
  blueBookReference: 'P-44.1 - Principal characteristic group selection',
  priority: 10,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    // Use OPSIN detector directly so we can capture pattern metadata for traceability
  const mol = context.getState().molecule;
  const detected = opsinDetector.detectFunctionalGroups(mol);

    // Build normalized functional groups and a parallel trace metadata array
    const traceMeta: Array<{ pattern?: string; type?: string; atomIds: number[] }> = [];
    const functionalGroups: FunctionalGroup[] = detected.map((d: any) => {
      const rawName = (d.name || d.type || d.pattern || '').toString().toLowerCase();
      const type = rawName.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const atoms = d.atoms || [];
      const bonds = d.bonds || [];
      const priority = typeof d.priority === 'number'
        ? d.priority
        : (FUNCTIONAL_GROUP_PRIORITIES[type] || opsinDetector.getFunctionalGroupPriority(d.pattern || d.type) || 999);

      traceMeta.push({ pattern: d.pattern || d.type, type, atomIds: atoms.map((a: any) => a?.id ?? -1) });

      return {
        type,
        atoms,
        bonds,
        suffix: d.suffix || opsinDetector.getFunctionalGroupSuffix(d.pattern || d.type) || undefined,
        prefix: d.prefix || undefined,
        priority,
        isPrincipal: false,
        locants: atoms.map((a: any) => (a && typeof a.id === 'number') ? a.id : -1)
      } as FunctionalGroup;
    });

    // sort by priority
    functionalGroups.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const principalGroup = selectPrincipalGroup(functionalGroups);
    const priorityScore = calculateFunctionalGroupPriority(functionalGroups);

    // Update functional groups
    let updatedContext = context.withFunctionalGroups(
      functionalGroups,
      'functional-group-priority',
      'Functional Group Priority Detection',
      'P-44.1',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Detected and prioritized functional groups'
    );

    // Attach OPSIN trace metadata into context state (not on FunctionalGroup objects)
    updatedContext = updatedContext.withStateUpdate(
      (state: any) => ({ ...state, functionalGroupTrace: traceMeta }),
      'functional-group-trace',
      'Functional Group Trace Metadata',
      'P-44.1',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Attach OPSIN pattern metadata for detected functional groups'
    );

    // Update principal group and priority in state
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        principalGroup,
        functionalGroupPriority: priorityScore
      }),
      'functional-group-priority',
      'Functional Group Priority Detection',
      'P-44.1',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Set principal group and priority score'
    );

    return updatedContext;
  }
};

/**
 * Rule: Functional Class Nomenclature Detection
 * 
 * Determines if the compound should be named using functional class nomenclature
 * according to P-51.2
 */
export const FUNCTIONAL_CLASS_RULE: IUPACRule = {
  id: 'functional-class-nomenclature',
  name: 'Functional Class Nomenclature Detection',
  description: 'Detect if functional class nomenclature should be used (P-51.2)',
  blueBookReference: 'P-51.2 - Functional class nomenclature',
  priority: 15,
  conditions: (context: ImmutableNamingContext) => context.getState().functionalGroups.length > 0,
  action: (context: ImmutableNamingContext) => {
    const principalGroup = context.getState().principalGroup;
    let updatedContext: ImmutableNamingContext;
    if (isFunctionalClassPreferred(principalGroup)) {
      updatedContext = context.withNomenclatureMethod(
        NomenclatureMethod.FUNCTIONAL_CLASS,
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set nomenclature method to functional class'
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({ ...state, useFunctionalClass: true }),
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set useFunctionalClass to true'
      );
    } else {
      updatedContext = context.withNomenclatureMethod(
        NomenclatureMethod.SUBSTITUTIVE,
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set nomenclature method to substitutive'
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({ ...state, useFunctionalClass: false }),
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set useFunctionalClass to false'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Ester Detection
 * 
 * Special case for esters which prefer functional class nomenclature
 * Example: CH3COOCH3 → methyl acetate (not methoxymethanone)
 */

export const ESTER_DETECTION_RULE: IUPACRule = {
  id: 'ester-detection',
  name: 'Ester Detection',
  description: 'Detect ester functional groups for functional class naming',
  blueBookReference: 'P-51.2.1 - Esters',
  priority: 20,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.bonds.length > 0,
  action: (context: ImmutableNamingContext) => {
    const esters: FunctionalGroup[] = detectEsters(context);
    let updatedContext = context;
    if (esters.length > 0) {
      updatedContext = updatedContext.withFunctionalGroups(
        esters,
        'ester-detection',
        'Ester Detection',
        'P-51.2.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected ester functional groups'
      );
      updatedContext = updatedContext.withNomenclatureMethod(
        NomenclatureMethod.FUNCTIONAL_CLASS,
        'ester-detection',
        'Ester Detection',
        'P-51.2.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set nomenclature method to functional class for esters'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Carboxylic Acid Detection
 * 
 * Highest priority functional group
 * Example: CH3COOH → acetic acid
 */
export const CARBOXYLIC_ACID_RULE: IUPACRule = {
  id: 'carboxylic-acid-detection',
  name: 'Carboxylic Acid Detection',
  description: 'Detect carboxylic acid groups (-COOH)',
  blueBookReference: 'P-44.1.1 - Carboxylic acids',
  priority: 1,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.bonds.length > 0,
  action: (context: ImmutableNamingContext) => {
    const carboxylicAcids: FunctionalGroup[] = detectCarboxylicAcids(context);
    let updatedContext = context;
    if (carboxylicAcids.length > 0) {
      updatedContext = updatedContext.withFunctionalGroups(
        carboxylicAcids,
        'carboxylic-acid-detection',
        'Carboxylic Acid Detection',
        'P-44.1.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected carboxylic acid groups'
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({
          ...state,
          principalGroup: carboxylicAcids[0],
          functionalGroupPriority: 1
        }),
        'carboxylic-acid-detection',
        'Carboxylic Acid Detection',
        'P-44.1.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set principal group to carboxylic acid and priority to 1'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Alcohol Detection
 * 
 * Medium priority functional group
 * Example: CH3CH2OH → ethanol
 */
export const ALCOHOL_DETECTION_RULE: IUPACRule = {
  id: 'alcohol-detection',
  name: 'Alcohol Detection',
  description: 'Detect alcohol groups (-OH)',
  blueBookReference: 'P-44.1.9 - Alcohols',
  priority: 9,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const alcohols: FunctionalGroup[] = detectAlcohols(context);
    let updatedContext = context;
    if (alcohols.length > 0) {
      updatedContext = updatedContext.withFunctionalGroups(
        alcohols,
        'alcohol-detection',
        'Alcohol Detection',
        'P-44.1.9',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected alcohol groups'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Amine Detection
 * 
 * Medium priority functional group
 * Example: CH3NH2 → methanamine
 */
export const AMINE_DETECTION_RULE: IUPACRule = {
  id: 'amine-detection',
  name: 'Amine Detection',
  description: 'Detect amine groups (-NH2, -NHR, -NR2)',
  blueBookReference: 'P-44.1.10 - Amines',
  priority: 10,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const amines: FunctionalGroup[] = detectAmines(context);
    let updatedContext = context;
    if (amines.length > 0) {
      updatedContext = updatedContext.withFunctionalGroups(
        amines,
        'amine-detection',
        'Amine Detection',
        'P-44.1.10',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected amine groups'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Ketone Detection
 * 
 * Medium priority functional group
 * Example: CH3COCH3 → propan-2-one
 */
export const KETONE_DETECTION_RULE: IUPACRule = {
  id: 'ketone-detection',
  name: 'Ketone Detection',
  description: 'Detect ketone groups (>C=O)',
  blueBookReference: 'P-44.1.8 - Ketones',
  priority: 8,
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.bonds.length > 0,
  action: (context: ImmutableNamingContext) => {
    const ketones: FunctionalGroup[] = detectKetones(context);
    let updatedContext = context;
    if (ketones.length > 0) {
      updatedContext = updatedContext.withFunctionalGroups(
        ketones,
        'ketone-detection',
        'Ketone Detection',
        'P-44.1.8',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected ketone groups'
      );
    }
    return updatedContext;
  }
};

/**
 * Functional group priority table (Blue Book Table 5.1)
 */
// Expanded functional group priority mapping (lower = higher priority)
const FUNCTIONAL_GROUP_PRIORITIES: Record<string, number> = {
  carboxylic_acid: 1,
  sulfonic_acid: 1,
  anhydride: 2,
  ester: 3,
  acyl_halide: 4,
  amide: 5,
  nitrile: 6,
  aldehyde: 7,
  ketone: 8,
  alcohol: 9,
  amine: 10,
  ether: 11,
  halide: 12,
  nitro: 13,
  peroxide: 14,
  isocyanate: 15,
  sulfoxide: 16,
  sulfide: 17
};

// Singleton OPSIN detector for the module
const opsinDetector = new OPSINFunctionalGroupDetector();

/**
 * Detect all functional groups in the molecule
 */
function detectAllFunctionalGroups(context: any): FunctionalGroup[] {
  const mol = context.getState ? context.getState().molecule : context.molecule;
  const detected = opsinDetector.detectFunctionalGroups(mol || context.molecule);

  const normalized: FunctionalGroup[] = detected.map((d: any) => {
    const rawName = (d.name || d.type || d.pattern || '').toString().toLowerCase();
    const type = rawName.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const atoms = d.atoms || [];
    const bonds = d.bonds || [];
    const priority = typeof d.priority === 'number'
      ? d.priority
      : (FUNCTIONAL_GROUP_PRIORITIES[type] || opsinDetector.getFunctionalGroupPriority(d.pattern || d.type) || 999);

    return {
      type,
      atoms,
      bonds,
      suffix: d.suffix || opsinDetector.getFunctionalGroupSuffix(d.pattern || d.type) || undefined,
      prefix: d.prefix || undefined,
      priority,
      isPrincipal: false,
      locants: atoms.map((a: any) => (a && typeof a.id === 'number') ? a.id : -1)
    } as FunctionalGroup;
  });

  normalized.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return normalized;
}

/**
 * Select the principal functional group
 */
function selectPrincipalGroup(functionalGroups: any[]): any | null {
  if (functionalGroups.length === 0) {
    return null;
  }
  
  // Sort by priority (lower number = higher priority)
  const sortedGroups = functionalGroups.sort((a, b) => {
    const priorityA = FUNCTIONAL_GROUP_PRIORITIES[a.type as keyof typeof FUNCTIONAL_GROUP_PRIORITIES] || 999;
    const priorityB = FUNCTIONAL_GROUP_PRIORITIES[b.type as keyof typeof FUNCTIONAL_GROUP_PRIORITIES] || 999;
    return priorityA - priorityB;
  });
  
  return sortedGroups[0];
}

/**
 * Calculate functional group priority score
 */
function calculateFunctionalGroupPriority(functionalGroups: any[]): number {
  if (functionalGroups.length === 0) {
    return 999;
  }
  
  const principal = selectPrincipalGroup(functionalGroups);
  return FUNCTIONAL_GROUP_PRIORITIES[principal.type as keyof typeof FUNCTIONAL_GROUP_PRIORITIES] || 999;
}

/**
 * Determine if functional class nomenclature is preferred
 */
function isFunctionalClassPreferred(principalGroup: any): boolean {
  if (!principalGroup) {
    return false;
  }
  
  // Functional class is preferred for certain groups
  const functionalClassPreferred = [
    'ester',
    'anhydride',
    'acyl_halide',
    'nitrile'
  ];
  
  return functionalClassPreferred.includes(principalGroup.type);
}

/**
 * Detect carboxylic acid groups (-COOH)
 */
function detectCarboxylicAcids(context: any): any[] {
  const carboxylicAcids = [];
  const molecules = context.molecule;
  
  // Look for C=O bonds followed by O-H
  for (const bond of molecules.bonds) {
    if (bond.type === 'double') {
      const atom1 = molecules.atoms[bond.atom1];
      const atom2 = molecules.atoms[bond.atom2];
      
      if (isCarbonyl(atom1, atom2)) {
        // Check if attached to OH
        const carbon = getCarbonFromCarbonyl(atom1, atom2);
        const ohBond = findOHBond(carbon, molecules);
        
        if (ohBond) {
          carboxylicAcids.push({
            type: 'carboxylic_acid',
            atoms: [carbon, ohBond.atom1, ohBond.atom2],
            bonds: [bond, ohBond],
            suffix: 'oic acid',
            priority: FUNCTIONAL_GROUP_PRIORITIES.carboxylic_acid,
            isPrincipal: false
          });
        }
      }
    }
  }
  
  return carboxylicAcids;
}

/**
 * Detect alcohol groups (-OH)
 */
function detectAlcohols(context: any): any[] {
  const alcohols = [];
  const molecules = context.molecule;
  
  for (const atom of molecules.atoms) {
    if (atom.symbol === 'O') {
      const bonds = molecules.bonds.filter((b: any) => 
        (b.atom1 === atom.id || b.atom2 === atom.id) && b.type === 'single'
      );
      
      // Check if oxygen is bonded to carbon and has one hydrogen
      const carbonBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'C';
      });
      
      const hydrogenBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'H';
      });
      
      if (carbonBonds.length === 1 && hydrogenBonds.length === 1) {
        alcohols.push({
          type: 'alcohol',
          atoms: [atom],
          bonds: bonds,
          suffix: 'ol',
          prefix: 'hydroxy',
          priority: FUNCTIONAL_GROUP_PRIORITIES.alcohol,
          isPrincipal: false
        });
      }
    }
  }
  
  return alcohols;
}

/**
 * Detect amine groups (-NH2, -NHR, -NR2)
 */
function detectAmines(context: any): any[] {
  const amines = [];
  const molecules = context.molecule;
  
  for (const atom of molecules.atoms) {
    if (atom.symbol === 'N') {
      const bonds = molecules.bonds.filter((b: any) => 
        (b.atom1 === atom.id || b.atom2 === atom.id) && b.type === 'single'
      );
      
      const carbonBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'C';
      });
      
      const hydrogenBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'H';
      });
      
      if (carbonBonds.length > 0) {
        amines.push({
          type: 'amine',
          atoms: [atom],
          bonds: bonds,
          suffix: 'amine',
          prefix: 'amino',
          priority: FUNCTIONAL_GROUP_PRIORITIES.amine,
          isPrincipal: false
        });
      }
    }
  }
  
  return amines;
}

/**
 * Detect ketone groups (>C=O)
 */
function detectKetones(context: any): any[] {
  const ketones = [];
  const molecules = context.molecule;
  
  for (const bond of molecules.bonds) {
    if (bond.type === 'double') {
      const atom1 = molecules.atoms[bond.atom1];
      const atom2 = molecules.atoms[bond.atom2];
      
      if (isCarbonyl(atom1, atom2)) {
        // Check if the carbon is not part of carboxylic acid
        const carbon = getCarbonFromCarbonyl(atom1, atom2);
        
        // Simple heuristic: if carbon has two other carbon bonds, it's likely a ketone
        const carbonBonds = molecules.bonds.filter((b: any) => 
          (b.atom1 === carbon.id || b.atom2 === carbon.id) && b.type === 'single'
        );
        
        const carbonAtomBonds = carbonBonds.filter((b: any) => {
          const otherAtom = b.atom1 === carbon.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
          return otherAtom.symbol === 'C';
        });
        
        if (carbonAtomBonds.length === 2) {
          ketones.push({
            type: 'ketone',
            atoms: [carbon, atom1, atom2],
            bonds: [bond],
            suffix: 'one',
            prefix: 'oxo',
            priority: FUNCTIONAL_GROUP_PRIORITIES.ketone,
            isPrincipal: false
          });
        }
      }
    }
  }
  
  return ketones;
}

/**
 * Detect ester groups (-COOR)
 */
function detectEsters(context: any): any[] {
  const esters = [];
  const molecules = context.molecule;
  
  // Look for carboxylic acid oxygen bonded to carbon (R-O-C=O)
  const carboxylicAcids = detectCarboxylicAcids(context);
  
  for (const acid of carboxylicAcids) {
    // Find the oxygen not bonded to hydrogen
    const oxygens = acid.atoms.filter((a: any) => a.symbol === 'O');
    
    for (const oxygen of oxygens) {
      const bonds = molecules.bonds.filter((b: any) => 
        (b.atom1 === oxygen.id || b.atom2 === oxygen.id) && b.type === 'single'
      );
      
      const carbonBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === oxygen.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'C';
      });
      
      if (carbonBonds.length > 0) {
        esters.push({
          type: 'ester',
          atoms: acid.atoms.concat(carbonBonds.map((b: any) => 
            b.atom1 === oxygen.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1]
          )),
          bonds: acid.bonds.concat(carbonBonds),
          priority: FUNCTIONAL_GROUP_PRIORITIES.ester,
          isPrincipal: false
        });
      }
    }
  }
  
  return esters;
}

/**
 * Helper functions
 */
function isCarbonyl(atom1: any, atom2: any): boolean {
  return (atom1.symbol === 'C' && atom2.symbol === 'O') || 
         (atom2.symbol === 'C' && atom1.symbol === 'O');
}

function getCarbonFromCarbonyl(atom1: any, atom2: any): any {
  return atom1.symbol === 'C' ? atom1 : atom2;
}

function findOHBond(carbon: any, molecules: any): any | null {
  for (const bond of molecules.bonds) {
    if (bond.atom1 === carbon.id || bond.atom2 === carbon.id) {
      const otherAtom = bond.atom1 === carbon.id ? molecules.atoms[bond.atom2] : molecules.atoms[bond.atom1];
      if (otherAtom.symbol === 'O') {
        // Check for H bonded to O
        for (const bond2 of molecules.bonds) {
          if ((bond2.atom1 === otherAtom.id || bond2.atom2 === otherAtom.id)) {
            const otherAtom2 = bond2.atom1 === otherAtom.id ? molecules.atoms[bond2.atom2] : molecules.atoms[bond2.atom1];
            if (otherAtom2.symbol === 'H') {
              return bond2;
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Export all functional group layer rules
 */
export const FUNCTIONAL_GROUP_LAYER_RULES: IUPACRule[] = [
  CARBOXYLIC_ACID_RULE,
  KETONE_DETECTION_RULE,
  ALCOHOL_DETECTION_RULE,
  AMINE_DETECTION_RULE,
  ESTER_DETECTION_RULE,
  FUNCTIONAL_GROUP_PRIORITY_RULE,
  FUNCTIONAL_CLASS_RULE
];