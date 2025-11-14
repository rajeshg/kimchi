import type { Molecule } from 'types';
import type { IUPACToken, OPSINRules } from './iupac-types';
import { MoleculeGraphBuilder } from './molecule-graph-builder';

/**
 * Graph-based IUPAC builder - constructs molecules directly from tokens
 * Uses MoleculeGraphBuilder instead of string manipulation
 * 
 * Strategy:
 * 1. Build parent chain (linear or cyclic) → get atom indices
 * 2. Apply functional groups to specific atoms based on locants
 * 3. Add substituents at correct atom positions
 * 4. Handle unsaturation (double/triple bonds)
 */
export class IUPACGraphBuilder {
  private rules: OPSINRules;

  constructor(rules: OPSINRules) {
    this.rules = rules;
  }

  /**
   * Build a molecule from IUPAC tokens using graph construction
   */
  build(tokens: IUPACToken[]): Molecule {
    if (tokens.length === 0) {
      throw new Error('No tokens to build molecule');
    }

    const builder = new MoleculeGraphBuilder();
    
    // Organize tokens by type
    const parentTokens = tokens.filter(t => t.type === 'PARENT');
    const suffixTokens = tokens.filter(t => t.type === 'SUFFIX');
    const prefixTokens = tokens.filter(t => t.type === 'PREFIX');
    const locantTokens = tokens.filter(t => t.type === 'LOCANT');
    const substituentTokens = tokens.filter(t => t.type === 'SUBSTITUENT');
    const multiplierTokens = tokens.filter(t => t.type === 'MULTIPLIER');

    if (process.env.VERBOSE) {
      console.log('[graph-builder] Starting build');
      console.log('[graph-builder] Parent tokens:', parentTokens.map(t => t.value).join(', '));
      console.log('[graph-builder] Suffix tokens:', suffixTokens.map(t => t.value).join(', '));
      console.log('[graph-builder] Substituents:', substituentTokens.map(t => t.value).join(', '));
    }

    // Check for cyclo prefix
    const hasCycloPrefix = prefixTokens.some(p => p.metadata?.isCyclic === true);

    // Step 1: Build parent chain
    let mainChainAtoms: number[] = [];
    
    if (parentTokens.length > 0) {
      const parentToken = parentTokens[0]!;
      const parentValue = parentToken.value.toLowerCase();
      const atomCount = (parentToken.metadata?.atomCount as number) || 0;
      const parentSmiles = (parentToken.metadata?.smiles as string) || '';
      
      if (process.env.VERBOSE) {
        console.log('[graph-builder] Building parent chain:', parentToken.value, 'atoms:', atomCount);
      }

      // Check if this is benzene or aromatic ring
      if (parentValue === 'benzene' || parentValue === 'benz' || parentSmiles === 'c1ccccc1') {
        mainChainAtoms = builder.createBenzeneRing();
      } else if (hasCycloPrefix) {
        // Build cyclic chain
        mainChainAtoms = builder.createCyclicChain(atomCount);
      } else {
        // Build linear chain
        mainChainAtoms = builder.createLinearChain(atomCount);
      }
    } else {
      throw new Error('No parent chain found');
    }

    if (process.env.VERBOSE) {
      console.log('[graph-builder] Main chain atoms:', mainChainAtoms);
    }

    // Step 2: Apply unsaturation (ene, yne)
    this.applyUnsaturation(builder, mainChainAtoms, suffixTokens, locantTokens, hasCycloPrefix);

    // Step 3: Apply functional group suffixes (ol, one, etc.)
    this.applySuffixes(builder, mainChainAtoms, suffixTokens, locantTokens);

    // Step 4: Apply substituents
    this.applySubstituents(builder, mainChainAtoms, substituentTokens, locantTokens, multiplierTokens);

    return builder.build();
  }

  /**
   * Apply unsaturation (double/triple bonds) to main chain
   */
  private applyUnsaturation(
    builder: MoleculeGraphBuilder,
    mainChainAtoms: number[],
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    isCyclic: boolean
  ): void {
    const unsaturatedSuffixes = suffixTokens.filter(
      s => s.metadata?.suffixType === 'unsaturated'
    );

    for (const suffix of unsaturatedSuffixes) {
      const suffixValue = suffix.value.toLowerCase();

      // Get locants for this suffix
      const locants = this.getLocantsBeforeSuffix(suffix, locantTokens);
      const positions = locants.length > 0 ? locants : [1]; // Default to position 1

      if (process.env.VERBOSE) {
        console.log(`[graph-builder] Applying unsaturation: ${suffixValue} at positions`, positions);
      }

      if (suffixValue === 'ene' || suffixValue.includes('ene')) {
        // Add double bond(s)
        for (const pos of positions) {
          if (pos >= 1 && pos < mainChainAtoms.length) {
            const atom1 = mainChainAtoms[pos - 1]!;
            const atom2 = mainChainAtoms[pos]!;
            builder.addDoubleBond(atom1, atom2);
          }
        }
      } else if (suffixValue === 'yne' || suffixValue.includes('yne')) {
        // Add triple bond(s)
        for (const pos of positions) {
          if (pos >= 1 && pos < mainChainAtoms.length) {
            const atom1 = mainChainAtoms[pos - 1]!;
            const atom2 = mainChainAtoms[pos]!;
            builder.addTripleBond(atom1, atom2);
          }
        }
      }
    }
  }

  /**
   * Apply functional group suffixes (ol, one, amine, etc.)
   */
  private applySuffixes(
    builder: MoleculeGraphBuilder,
    mainChainAtoms: number[],
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[]
  ): void {
    for (const suffix of suffixTokens) {
      const suffixValue = suffix.value.toLowerCase();

      // Skip unsaturated and infix suffixes
      if (suffix.metadata?.suffixType === 'unsaturated' || suffixValue === 'an' || suffixValue === 'ane') {
        continue;
      }

      // Get locants and multiplier for this suffix
      const locants = this.getLocantsBeforeSuffix(suffix, locantTokens);
      const multiplier = this.getMultiplierBeforeSuffix(suffix, suffixTokens);
      const multiplierCount = multiplier ? (multiplier.metadata?.count as number) || 1 : 1;

      if (process.env.VERBOSE) {
        console.log(`[graph-builder] Applying suffix: ${suffixValue}, locants:`, locants, 'count:', multiplierCount);
      }

      switch (suffixValue) {
        case 'ol':
          // Add hydroxyl group(s)
          if (locants.length > 0) {
            for (const loc of locants) {
              const atomIdx = this.locantToAtomIndex(loc, mainChainAtoms);
              if (atomIdx !== null) {
                builder.addHydroxyl(atomIdx);
              }
            }
          } else {
            // Default to last position
            const atomIdx = mainChainAtoms[mainChainAtoms.length - 1];
            if (atomIdx !== undefined) {
              builder.addHydroxyl(atomIdx);
            }
          }
          break;

        case 'one':
          // Add carbonyl group(s)
          if (locants.length > 0) {
            for (const loc of locants) {
              const atomIdx = this.locantToAtomIndex(loc, mainChainAtoms);
              if (atomIdx !== null) {
                builder.addCarbonyl(atomIdx);
              }
            }
          } else {
            // Default to position 2 for ketones
            const atomIdx = mainChainAtoms[1];
            if (atomIdx !== undefined) {
              builder.addCarbonyl(atomIdx);
            }
          }
          break;

        case 'al':
          // Aldehyde - add =O to last carbon
          const lastIdx = mainChainAtoms[mainChainAtoms.length - 1];
          if (lastIdx !== undefined) {
            builder.addAldehyde(lastIdx);
          }
          break;

        case 'oic acid':
        case 'ic acid':
        case 'oic':
        case 'anoic':
          // Carboxylic acid - add COOH to last carbon
          const terminalIdx = mainChainAtoms[mainChainAtoms.length - 1];
          if (terminalIdx !== undefined) {
            builder.addCarboxyl(terminalIdx);
          }
          break;

        case 'amine':
        case 'amin':
          // Add amine group
          if (locants.length > 0) {
            for (const loc of locants) {
              const atomIdx = this.locantToAtomIndex(loc, mainChainAtoms);
              if (atomIdx !== null) {
                builder.addAmine(atomIdx);
              }
            }
          } else {
            const termIdx = mainChainAtoms[mainChainAtoms.length - 1];
            if (termIdx !== undefined) {
              builder.addAmine(termIdx);
            }
          }
          break;
      }
    }
  }

  /**
   * Apply substituents to main chain
   */
  private applySubstituents(
    builder: MoleculeGraphBuilder,
    mainChainAtoms: number[],
    substituentTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    multiplierTokens: IUPACToken[]
  ): void {
    for (const substituent of substituentTokens) {
      const substValue = substituent.value.toLowerCase();

      // Get multiplier and locants for this substituent
      const multiplier = this.getMultiplierBeforeSubstituent(substituent, multiplierTokens);
      const multiplierCount = multiplier ? (multiplier.metadata?.count as number) || 1 : 1;
      const locants = this.getLocantsBeforeSubstituent(substituent, locantTokens);

      if (process.env.VERBOSE) {
        console.log(`[graph-builder] Applying substituent: ${substValue}, locants:`, locants, 'count:', multiplierCount);
      }

      // Determine positions to add substituent
      const positions = locants.length > 0 ? locants : [1]; // Default to position 1

      for (let i = 0; i < positions.length; i++) {
        const loc = positions[i];
        if (loc === undefined) continue;

        const atomIdx = this.locantToAtomIndex(loc, mainChainAtoms);
        if (atomIdx === null) continue;

        // Add substituent based on type
        if (substValue === 'methyl') {
          builder.addMethyl(atomIdx);
        } else if (substValue === 'ethyl') {
          builder.addEthyl(atomIdx);
        } else if (substValue === 'propyl') {
          builder.addAlkylSubstituent(atomIdx, 3);
        } else if (substValue === 'butyl') {
          builder.addAlkylSubstituent(atomIdx, 4);
        } else if (substValue === 'pentyl') {
          builder.addAlkylSubstituent(atomIdx, 5);
        } else {
          // Generic alkyl - try to determine length
          // For now, default to methyl
          builder.addMethyl(atomIdx);
        }
      }
    }
  }

  /**
   * Convert IUPAC locant (1-indexed) to atom array index (0-indexed)
   */
  private locantToAtomIndex(locant: number, chainAtoms: number[]): number | null {
    if (locant < 1 || locant > chainAtoms.length) {
      return null;
    }
    return chainAtoms[locant - 1] ?? null;
  }

  /**
   * Find locants that appear before a suffix token
   */
  private getLocantsBeforeSuffix(suffix: IUPACToken, locantTokens: IUPACToken[]): number[] {
    let closestLocant: IUPACToken | null = null;
    let closestDistance = Infinity;

    for (const locant of locantTokens) {
      if (locant.position < suffix.position) {
        const distance = suffix.position - locant.position;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLocant = locant;
        }
      }
    }

    if (closestLocant) {
      return (closestLocant.metadata?.positions as number[]) || [];
    }

    return [];
  }

  /**
   * Find multiplier before a suffix token
   */
  private getMultiplierBeforeSuffix(suffix: IUPACToken, suffixTokens: IUPACToken[]): IUPACToken | null {
    // For now, return null - multipliers are typically separate tokens
    return null;
  }

  /**
   * Find locants before a substituent token
   */
  private getLocantsBeforeSubstituent(substituent: IUPACToken, locantTokens: IUPACToken[]): number[] {
    let closestLocant: IUPACToken | null = null;
    let closestDistance = Infinity;

    for (const locant of locantTokens) {
      if (locant.position < substituent.position) {
        const distance = substituent.position - locant.position;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLocant = locant;
        }
      }
    }

    if (closestLocant) {
      return (closestLocant.metadata?.positions as number[]) || [];
    }

    return [];
  }

  /**
   * Find multiplier before a substituent token
   */
  private getMultiplierBeforeSubstituent(substituent: IUPACToken, multiplierTokens: IUPACToken[]): IUPACToken | null {
    let closestMultiplier: IUPACToken | null = null;
    let closestDistance = Infinity;

    for (const multiplier of multiplierTokens) {
      if (multiplier.position < substituent.position) {
        const distance = substituent.position - multiplier.position;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestMultiplier = multiplier;
        }
      }
    }

    return closestMultiplier;
  }
}
