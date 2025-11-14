import type { Molecule } from 'types';
import { BondType as BondTypeEnum } from 'types';
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

    // Detect ether linkages (-oxy- connector)
    const oxyConnectorIdx = suffixTokens.findIndex(s => 
      s.value === 'oxy' && s.metadata?.suffixType === 'connector'
    );

    if (oxyConnectorIdx >= 0 && parentTokens.length >= 2) {
      // Handle ether linkage separately
      return this.buildEtherLinkage(builder, tokens, parentTokens, suffixTokens, locantTokens, substituentTokens, multiplierTokens, oxyConnectorIdx);
    }

    // Detect esters (alkyl ...oate pattern)
    const hasEsterSuffix = suffixTokens.some(s => s.value === 'oate' || s.value === 'anoate');
    if (hasEsterSuffix && substituentTokens.length > 0 && parentTokens.length > 0) {
      // Check if first substituent comes before parent (indicates ester alkyl group)
      const firstSubst = substituentTokens[0]!;
      const firstParent = parentTokens[0]!;
      
      if (firstSubst.position < firstParent.position) {
        return this.buildEster(builder, substituentTokens, parentTokens, suffixTokens, locantTokens);
      }
    }

    // Detect N-substituted amides (N- or N,N- prefix)
    const hasAmideSuffix = suffixTokens.some(s => s.value === 'amide' || s.value === 'amid');
    const nPrefixToken = prefixTokens.find(p => p.value === 'n' || p.value === 'n,n');
    if (hasAmideSuffix && nPrefixToken) {
      return this.buildNSubstitutedAmide(builder, parentTokens, suffixTokens, locantTokens, substituentTokens, multiplierTokens, prefixTokens);
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

      // Check for specific ring systems
      if (parentValue === 'benzene' || parentValue === 'benz' || parentSmiles === 'c1ccccc1') {
        mainChainAtoms = builder.createBenzeneRing();
      } else if (parentValue === 'pyridine' || parentSmiles === 'c1ccncc1') {
        mainChainAtoms = builder.createPyridineRing();
      } else if (parentValue === 'furan' || parentSmiles === 'o1cccc1') {
        mainChainAtoms = builder.createFuranRing();
      } else if (parentValue === 'thiophene' || parentSmiles === 's1cccc1') {
        mainChainAtoms = builder.createThiopheneRing();
      } else if (parentValue === 'pyrrole' || parentSmiles === 'n1cccc1') {
        mainChainAtoms = builder.createPyrroleRing();
      } else if (parentValue === 'naphthalene' || parentSmiles === 'c1ccc2ccccc2c1') {
        mainChainAtoms = builder.createNaphthaleneRing();
      } else if (parentValue === 'quinoline' || parentSmiles === 'c1ccc2ncccc2c1') {
        mainChainAtoms = builder.createQuinolineRing();
      } else if (parentValue === 'piperidine' || parentSmiles === 'C1CCNCC1') {
        mainChainAtoms = builder.createPiperidineRing();
      } else if (parentValue === 'pyrrolidine' || parentSmiles === 'C1CCNC1') {
        mainChainAtoms = builder.createPyrrolidineRing();
      } else if (parentValue === 'piperazine' || parentSmiles === 'C1CNCCN1') {
        mainChainAtoms = builder.createPiperazineRing();
      } else if (parentValue === 'morpholine' || parentSmiles === 'C1CNCCO1') {
        mainChainAtoms = builder.createMorpholineRing();
      } else if (parentValue === 'oxirane' || parentSmiles === 'C1CO1') {
        mainChainAtoms = builder.createOxiraneRing();
      } else if (parentValue === 'oxolan' || parentValue === 'oxolane' || parentSmiles === 'C1CCOC1') {
        mainChainAtoms = builder.createOxolanRing();
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

    // Detect if this is a carboxylic acid or thiocyanate (numbering goes from functional group end)
    const isAcid = suffixTokens.some(s => 
      s.value === 'oic acid' || s.value === 'ic acid' || s.value === 'oic' || s.value === 'anoic'
    );
    const isThiocyanate = suffixTokens.some(s => s.value === 'thiocyanate');
    const reverseNumbering = isAcid || isThiocyanate;

    // Step 3: Apply functional group suffixes (ol, one, etc.)
    this.applySuffixes(builder, mainChainAtoms, suffixTokens, locantTokens);

    // Step 4: Apply substituents (with reversed numbering for acids/thiocyanates)
    this.applySubstituents(builder, mainChainAtoms, substituentTokens, locantTokens, multiplierTokens, reverseNumbering);

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

        case 'oate':
        case 'anoate':
          // Ester - needs to be handled in a special way
          // The alkyl group comes from substituents
          // For now, just add carboxyl to the end
          const esterTermIdx = mainChainAtoms[mainChainAtoms.length - 1];
          if (esterTermIdx !== undefined) {
            builder.addCarboxyl(esterTermIdx);
          }
          break;

        case 'nitrile':
          // Nitrile - add C#N to terminal carbon
          const nitrileIdx = mainChainAtoms[mainChainAtoms.length - 1];
          if (nitrileIdx !== undefined) {
            builder.addNitrile(nitrileIdx);
          }
          break;

        case 'thiocyanate':
          // Thiocyanate - add -SC#N to terminal carbon
          const thiocyanateIdx = mainChainAtoms[mainChainAtoms.length - 1];
          if (thiocyanateIdx !== undefined) {
            builder.addThiocyanate(thiocyanateIdx);
          }
          break;

        case 'amide':
        case 'amid':
          // Amide - C(=O)NH2
          // Will be handled specially for N-substituted amides
          const amideIdx = mainChainAtoms[mainChainAtoms.length - 1];
          if (amideIdx !== undefined) {
            builder.addAmide(amideIdx);
          }
          break;

        case 'dione':
          // Multiple carbonyl groups - check for locants
          if (locants.length > 0) {
            for (const loc of locants) {
              const atomIdx = this.locantToAtomIndex(loc, mainChainAtoms);
              if (atomIdx !== null) {
                builder.addCarbonyl(atomIdx);
              }
            }
          }
          break;

        case 'trione':
          // Three carbonyl groups - check for locants
          if (locants.length > 0) {
            for (const loc of locants) {
              const atomIdx = this.locantToAtomIndex(loc, mainChainAtoms);
              if (atomIdx !== null) {
                builder.addCarbonyl(atomIdx);
              }
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
    multiplierTokens: IUPACToken[],
    reverseNumbering: boolean = false
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
      // Locants can have duplicates (e.g., [2, 2, 3] means 2 at position 2, 1 at position 3)
      const positions = locants.length > 0 ? locants : [1]; // Default to position 1

      for (let i = 0; i < positions.length; i++) {
        const loc = positions[i];
        if (loc === undefined) continue;

        const atomIdx = this.locantToAtomIndex(loc, mainChainAtoms, reverseNumbering);
        if (atomIdx === null) continue;

        // Skip if trying to add substituent to non-carbon atom (e.g., oxygen in oxirane)
        const atom = builder.getAtom(atomIdx);
        if (atom && atom.symbol !== 'C') {
          if (process.env.VERBOSE) {
            console.log(`[substituent] Skipping non-carbon atom at position ${loc} (${atom.symbol})`);
          }
          continue;
        }

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
        } else if (substValue === 'hexyl') {
          builder.addAlkylSubstituent(atomIdx, 6);
        } else if (substValue === 'heptyl') {
          builder.addAlkylSubstituent(atomIdx, 7);
        } else if (substValue === 'octyl') {
          builder.addAlkylSubstituent(atomIdx, 8);
        } else if (substValue === 'isopropyl' || substValue === 'propan-2-yl') {
          builder.addIsopropyl(atomIdx);
        } else if (substValue === 'isobutyl') {
          builder.addIsobutyl(atomIdx);
        } else if (substValue === 'sec-butyl' || substValue === 'secbutyl' || substValue === 'butan-2-yl') {
          builder.addSecButyl(atomIdx);
        } else if (substValue === 'tert-butyl' || substValue === 'tertbutyl' || substValue === 'butan-2,2-dimethyl') {
          builder.addTertButyl(atomIdx);
        } else if (substValue === 'methoxy') {
          builder.addMethoxy(atomIdx);
        } else if (substValue === 'ethoxy') {
          builder.addEthoxy(atomIdx);
        } else if (substValue === 'propoxy') {
          builder.addPropoxy(atomIdx);
        } else if (substValue === 'butoxy') {
          builder.addButoxy(atomIdx);
        } else if (substValue === 'pentoxy') {
          const oxygenIdx = builder.addAtom('O');
          builder.addBond(atomIdx, oxygenIdx);
          builder.addAlkylSubstituent(oxygenIdx, 5);
        } else if (substValue === 'hexoxy') {
          const oxygenIdx = builder.addAtom('O');
          builder.addBond(atomIdx, oxygenIdx);
          builder.addAlkylSubstituent(oxygenIdx, 6);
        } else if (substValue === 'hydroxy' || substValue === 'hydroxyl') {
          builder.addHydroxyl(atomIdx);
        } else if (substValue === 'oxo') {
          // Oxo = carbonyl =O on this carbon
          builder.addCarbonyl(atomIdx);
        } else if (substValue === 'amino') {
          builder.addAmino(atomIdx);
        } else if (substValue === 'acetyl') {
          builder.addAcetyl(atomIdx);
        } else if (substValue === 'propanoyl') {
          builder.addPropanoyl(atomIdx);
        } else if (substValue === 'butanoyl') {
          builder.addButanoyl(atomIdx);
        } else if (substValue === 'phenyl') {
          // Add benzene ring as substituent
          const benzeneAtoms = builder.createBenzeneRing();
          if (benzeneAtoms[0] !== undefined) {
            builder.addBond(atomIdx, benzeneAtoms[0]);
          }
        } else if (substValue === 'benzyl') {
          builder.addBenzyl(atomIdx);
        } else if (substValue === 'phenethyl') {
          builder.addPhenethyl(atomIdx);
        } else if (substValue === 'cyclopropyl') {
          builder.addCyclopropyl(atomIdx);
        } else if (substValue === 'cyclobutyl') {
          builder.addCyclobutyl(atomIdx);
        } else if (substValue === 'cyclopentyl') {
          builder.addCyclopentyl(atomIdx);
        } else if (substValue === 'cyclohexyl') {
          builder.addCyclohexyl(atomIdx);
        } else if (substValue === 'chloro' || substValue === 'chlor') {
          const clIdx = builder.addAtom('Cl');
          builder.addBond(atomIdx, clIdx);
        } else if (substValue === 'bromo' || substValue === 'brom') {
          const brIdx = builder.addAtom('Br');
          builder.addBond(atomIdx, brIdx);
        } else if (substValue === 'fluoro' || substValue === 'fluor') {
          const fIdx = builder.addAtom('F');
          builder.addBond(atomIdx, fIdx);
        } else if (substValue === 'trifluoromethyl') {
          builder.addTrifluoromethyl(atomIdx);
        } else if (substValue === 'iodo' || substValue === 'iod') {
          const iIdx = builder.addAtom('I');
          builder.addBond(atomIdx, iIdx);
        } else if (substValue === 'nitro') {
          // Nitro group: -NO2
          const nIdx = builder.addAtom('N');
          const o1 = builder.addAtom('O');
          const o2 = builder.addAtom('O');
          builder.addBond(atomIdx, nIdx);
          builder.addBond(nIdx, o1, BondTypeEnum.DOUBLE);
          builder.addBond(nIdx, o2, BondTypeEnum.DOUBLE);
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
   * @param reverseNumbering If true, number from end (for carboxylic acids)
   */
  private locantToAtomIndex(locant: number, chainAtoms: number[], reverseNumbering: boolean = false): number | null {
    if (locant < 1 || locant > chainAtoms.length) {
      return null;
    }
    if (reverseNumbering) {
      // For acids: position 1 is the last carbon (carboxyl)
      return chainAtoms[chainAtoms.length - locant] ?? null;
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

  /**
   * Build N-substituted amide (e.g., "N,N-dimethylethanamide")
   * Pattern: N-substituents + parent + amide suffix
   */
  private buildNSubstitutedAmide(
    builder: MoleculeGraphBuilder,
    parentTokens: IUPACToken[],
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    substituentTokens: IUPACToken[],
    multiplierTokens: IUPACToken[],
    prefixTokens: IUPACToken[]
  ): Molecule {
    const nPrefixToken = prefixTokens.find(p => p.value === 'n' || p.value === 'n,n');
    if (!nPrefixToken) {
      throw new Error('N-prefix not found for amide');
    }

    // Build parent chain
    const parentToken = parentTokens[0]!;
    const atomCount = (parentToken.metadata?.atomCount as number) || 0;
    const mainChainAtoms = builder.createLinearChain(atomCount);

    // Add amide group to terminal carbon
    const terminalIdx = mainChainAtoms[mainChainAtoms.length - 1];
    if (terminalIdx === undefined) {
      throw new Error('No terminal carbon for amide');
    }

    const nitrogenIdx = builder.addAmide(terminalIdx);

    if (process.env.VERBOSE) {
      console.log('[n-amide] N-prefix:', nPrefixToken.value);
      console.log('[n-amide] Nitrogen index:', nitrogenIdx);
    }

    // Separate N-substituents (after N-prefix) from carbon substituents (before N-prefix)
    const nSubstituents = substituentTokens.filter(s => s.position > nPrefixToken.position);
    const carbonSubstituents = substituentTokens.filter(s => s.position < nPrefixToken.position);
    
    if (process.env.VERBOSE) {
      console.log('[n-amide] N-substituents:', nSubstituents.map(s => s.value));
      console.log('[n-amide] Carbon substituents:', carbonSubstituents.map(s => s.value));
    }

    // Add N-substituents to the nitrogen
    for (const nSubst of nSubstituents) {
      const substValue = nSubst.value.toLowerCase();
      
      // Check for multiplier before this substituent
      const multiplierBefore = multiplierTokens.find(m => 
        m.position > nPrefixToken.position && 
        m.position < nSubst.position
      );
      const count = multiplierBefore ? (multiplierBefore.metadata?.count as number) || 1 : 1;

      if (process.env.VERBOSE) {
        console.log(`[n-amide] Adding ${count}x ${substValue} to nitrogen`);
      }
      
      // Add substituent 'count' times
      for (let i = 0; i < count; i++) {
        if (substValue === 'methyl') {
          builder.addMethyl(nitrogenIdx);
        } else if (substValue === 'ethyl') {
          builder.addEthyl(nitrogenIdx);
        } else if (substValue === 'propyl') {
          builder.addAlkylSubstituent(nitrogenIdx, 3);
        } else if (substValue === 'isopropyl' || substValue === 'propan-2-yl') {
          builder.addIsopropyl(nitrogenIdx);
        } else if (substValue === 'tert-butyl' || substValue === 'tertbutyl') {
          builder.addTertButyl(nitrogenIdx);
        } else if (substValue === 'phenyl') {
          // Add benzene ring
          const benzeneAtoms = builder.createBenzeneRing();
          if (benzeneAtoms[0] !== undefined) {
            builder.addBond(nitrogenIdx, benzeneAtoms[0]);
          }
        }
      }
    }

    // Add carbon substituents to the main chain
    if (carbonSubstituents.length > 0) {
      const carbonLocants = locantTokens.filter(l => l.position < nPrefixToken.position);
      const carbonMultipliers = multiplierTokens.filter(m => m.position < nPrefixToken.position);
      this.applySubstituents(builder, mainChainAtoms, carbonSubstituents, carbonLocants, carbonMultipliers, false);
    }

    return builder.build();
  }

  /**
   * Build ester molecule (alkyl acyl-oate pattern)
   * Example: "methyl butanoate" → CH3-O-CO-C3H7
   */
  private buildEster(
    builder: MoleculeGraphBuilder,
    substituentTokens: IUPACToken[],
    parentTokens: IUPACToken[],
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[]
  ): Molecule {
    // First substituent is the alcohol alkyl group (e.g., "methyl" in "methyl butanoate")
    const alkylSubst = substituentTokens[0]!;
    const alkylValue = alkylSubst.value.toLowerCase();

    if (process.env.VERBOSE) {
      console.log('[ester] Alkyl group:', alkylValue);
      console.log('[ester] Parent:', parentTokens[0]?.value);
    }

    // Determine alkyl chain length
    let alkylLength = 0;
    if (alkylValue === 'methyl') alkylLength = 1;
    else if (alkylValue === 'ethyl') alkylLength = 2;
    else if (alkylValue === 'propyl') alkylLength = 3;
    else if (alkylValue === 'butyl') alkylLength = 4;
    else if (alkylValue === 'pentyl') alkylLength = 5;

    // Build the acyl chain (the acid part)
    const parentToken = parentTokens[0]!;
    const acylAtomCount = (parentToken.metadata?.atomCount as number) || 0;
    const acylChainAtoms = builder.createLinearChain(acylAtomCount);

    // Add ester group to terminal carbon: C(=O)O-alkyl
    const terminalIdx = acylChainAtoms[acylChainAtoms.length - 1];
    if (terminalIdx !== undefined) {
      builder.addEster(terminalIdx, alkylLength);
    }

    return builder.build();
  }

  /**
   * Build molecule with ether linkage (-oxy- connector between two parent chains)
   * Example: "3-(2,2-dimethylpropoxy)butan-2-ol"
   */
  private buildEtherLinkage(
    builder: MoleculeGraphBuilder,
    tokens: IUPACToken[],
    parentTokens: IUPACToken[],
    suffixTokens: IUPACToken[],
    locantTokens: IUPACToken[],
    substituentTokens: IUPACToken[],
    multiplierTokens: IUPACToken[],
    oxyConnectorIdx: number
  ): Molecule {
    const oxyToken = suffixTokens[oxyConnectorIdx]!;

    // Find parent chains before and after "oxy"
    const alkylParent = parentTokens.find(p => p.position < oxyToken.position);
    const mainParent = parentTokens.find(p => p.position > oxyToken.position);

    if (!alkylParent || !mainParent) {
      throw new Error('Ether linkage requires two parent chains');
    }

    if (process.env.VERBOSE) {
      console.log('[ether] Alkyl parent:', alkylParent.value);
      console.log('[ether] Main parent:', mainParent.value);
    }

    // Find locant for attachment position (before alkyl parent)
    const attachLocant = locantTokens.find(l => l.position < alkylParent.position);
    const attachPosition = attachLocant ? (attachLocant.metadata?.positions as number[])?.[0] ?? 1 : 1;

    // Build alkyl chain with its substituents
    const alkylAtomCount = (alkylParent.metadata?.atomCount as number) || 0;
    const alkylChainAtoms = builder.createLinearChain(alkylAtomCount);

    // Apply substituents to alkyl chain
    const alkylSubstituents = substituentTokens.filter(s => s.position < oxyToken.position);
    const alkylLocants = locantTokens.filter(l => 
      l.position > (attachLocant?.position ?? -1) && 
      l.position < oxyToken.position
    );
    const alkylMultipliers = multiplierTokens.filter(m =>
      m.position > (attachLocant?.position ?? -1) && 
      m.position < oxyToken.position
    );

    if (alkylSubstituents.length > 0) {
      this.applySubstituents(builder, alkylChainAtoms, alkylSubstituents, alkylLocants, alkylMultipliers);
    }

    // Build main chain
    const mainAtomCount = (mainParent.metadata?.atomCount as number) || 0;
    const mainChainAtoms = builder.createLinearChain(mainAtomCount);

    // Apply functional groups to main chain
    const mainSuffixes = suffixTokens.filter(s => s.position > oxyToken.position);
    const mainLocants = locantTokens.filter(l => l.position > oxyToken.position);

    // Apply unsaturation
    this.applyUnsaturation(builder, mainChainAtoms, mainSuffixes, mainLocants, false);

    // Apply other functional groups
    this.applySuffixes(builder, mainChainAtoms, mainSuffixes, mainLocants);

    // Connect alkyl chain to main chain via oxygen (ether linkage)
    const mainAttachAtomIdx = this.locantToAtomIndex(attachPosition, mainChainAtoms);
    if (mainAttachAtomIdx !== null) {
      builder.addAlkoxyGroup(mainAttachAtomIdx, alkylChainAtoms);
    }

    if (process.env.VERBOSE) {
      console.log('[ether] Attached alkoxy at position', attachPosition);
    }

    return builder.build();
  }
}
