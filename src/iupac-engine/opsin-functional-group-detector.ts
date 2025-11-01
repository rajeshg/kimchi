import type { Molecule } from '../../types';
import fs from 'fs';

/**
 * Comprehensive P-44.1 Functional Group Detector using OPSIN Rules
 * 
 * Implements full functional group coverage per IUPAC Blue Book P-44.1
 * using comprehensive SMARTS patterns from opsin-rules.json
 */
export class OPSINFunctionalGroupDetector {
  private matchPatternCache: WeakMap<Molecule, Map<string, number[]>> = new WeakMap();
  private rules: any = {};
  private functionalGroups: Map<string, any> = new Map();
  private suffixes: Map<string, string> = new Map();
  
  constructor() {
    this.loadOPSINRules();
  }
  
  private loadOPSINRules(): void {
    try {
      const rulesPath = `${import.meta.dir}/../../opsin-rules.json`;
      const rulesData = fs.readFileSync(rulesPath, 'utf8');
      this.rules = JSON.parse(rulesData);
      
      // Build functional groups map for efficient lookup
      this.functionalGroups = new Map();
      if (this.rules.functionalGroups) {
        // Map OPSIN functional group entries into a normalized structure
        const priorityMap: Record<string, number> = {
          'carboxylic acid': 1,
          'aldehyde': 2,
          'ketone': 3,
          'alcohol': 4,
          'amine': 5,
          'ether': 6,
          'amide': 7,
          'ester': 8,
          'nitrile': 9,
          'cyanohydrin': 9  // OPSIN alias for nitrile (C#N)
        };

        for (const [pattern, data] of Object.entries(this.rules.functionalGroups)) {
          const entry: any = data || {};
          
          // Skip halogens - they are substituents, not functional groups
          // Halogens are: F, Cl, Br, I
          if (pattern === 'F' || pattern === 'Cl' || pattern === 'Br' || pattern === 'I') {
            continue;
          }
          
          // Skip 'S' pattern - we handle thioethers (RSR) in builtin checks
          if (pattern === 'S') {
            continue;
          }
          
          const name = Array.isArray(entry.aliases) && entry.aliases.length > 0 ? entry.aliases[0] : (entry.name || pattern);
          const priority = priorityMap[name.toLowerCase()] || (entry.priority as number) || 999;
          const suffix = entry.suffix || '';
          this.functionalGroups.set(pattern, { name, priority, suffix });
        }
      }
      
      // Override OPSIN names for certain patterns to use standard IUPAC names
      // OPSIN uses "cyanohydrin" for C#N, but we want "nitrile" for standard naming
      if (this.functionalGroups.has('C#N')) {
        const entry = this.functionalGroups.get('C#N');
        this.functionalGroups.set('C#N', { ...entry, name: 'nitrile', suffix: 'nitrile' });
      }
      
      // Build suffixes map
      this.suffixes = new Map();
      if (this.rules.suffixes) {
        for (const [name, pattern] of Object.entries(this.rules.suffixes)) {
          this.suffixes.set(name, pattern as string);
        }
      }
      
    } catch (error) {
      // Try a repository-root fallback (some runners set cwd differently)
      try {
        const cwdPath = `${process.cwd()}/opsin-rules.json`;
        const rulesData = fs.readFileSync(cwdPath, 'utf8');
        this.rules = JSON.parse(rulesData);
        // build maps as above
        this.functionalGroups = new Map();
        if (this.rules.functionalGroups) {
          for (const [pattern, data] of Object.entries(this.rules.functionalGroups)) {
            this.functionalGroups.set(pattern, data);
          }
        }
        this.suffixes = new Map();
        if (this.rules.suffixes) {
          for (const [name, pattern] of Object.entries(this.rules.suffixes)) {
            this.suffixes.set(name, pattern as string);
          }
        }
      } catch (err2) {
        console.warn('Could not load OPSIN rules, using fallback');
        this.initializeFallbackRules();
      }
    }
  }
  
  private initializeFallbackRules(): void {
    // Minimal fallback if OPSIN rules unavailable
    this.rules = {};

    // Populate a minimal set of functional group patterns with priorities so tests
    // that rely on common functional groups succeed even without full OPSIN data.
    this.functionalGroups = new Map();
    const fgList = [
      { pattern: 'C(=O)[OX2H1]', name: 'carboxylic acid', suffix: 'oic acid', priority: 1 },
      { pattern: 'C=O', name: 'aldehyde', suffix: 'al', priority: 2 },
      { pattern: '[CX3](=O)[CX4]', name: 'ketone', suffix: 'one', priority: 3 },
      { pattern: '[OX2H]', name: 'alcohol', suffix: 'ol', priority: 4 },
      { pattern: '[NX3][CX4]', name: 'amine', suffix: 'amine', priority: 5 },
      { pattern: 'ROR', name: 'ether', suffix: 'ether', priority: 6 },
      { pattern: 'C(=O)N', name: 'amide', suffix: 'amide', priority: 7 },
      { pattern: 'C(=O)O', name: 'ester', suffix: 'oate', priority: 8 },
      { pattern: 'C#N', name: 'nitrile', suffix: 'nitrile', priority: 9 }
    ];

    for (const fg of fgList) {
      this.functionalGroups.set(fg.pattern, {
        name: fg.name,
        suffix: fg.suffix,
        priority: fg.priority
      });
    }
  }
  
  /**
   * Detect all functional groups in a molecule following P-44.1 priority
   */
  detectFunctionalGroups(molecule: Molecule): Array<{
    type: string;
    name: string;
    suffix: string;
    prefix?: string;
    priority: number;
    atoms: number[];
    pattern: string;
  }> {
    const detectedGroups: Array<{
      type: string;
      name: string;
      suffix: string;
      prefix?: string;
      priority: number;
      atoms: number[];
      pattern: string;
    }> = [];
    
    const atoms = molecule.atoms;
    const bonds = molecule.bonds;
    const checkedPatterns = new Set<string>();
    const claimedAtoms = new Set<number>();
    
    // First, run a set of built-in high-priority detectors to ensure common groups
    // (carboxylic acid, aldehyde, ketone, alcohol, amine, ester, amide, nitrile)
    const builtinChecks: Array<{ pattern: string; name: string; priority: number; finder: (a:any,b:any,r?:any)=>number[] }> = [
      { pattern: 'C(=O)[OX2H1]', name: 'carboxylic acid', priority: 1, finder: this.findCarboxylicAcidPattern.bind(this) },
      { pattern: 'C=O', name: 'aldehyde', priority: 2, finder: this.findAldehydePattern.bind(this) },
      { pattern: '[CX3](=O)[CX4]', name: 'ketone', priority: 3, finder: this.findKetonePattern.bind(this) },
      { pattern: '[OX2H]', name: 'alcohol', priority: 4, finder: this.findAlcoholPattern.bind(this) },
  { pattern: '[NX3][CX4]', name: 'amine', priority: 5, finder: this.findAminePattern.bind(this) },
  { pattern: 'ROR', name: 'ether', priority: 6, finder: this.findEtherPattern.bind(this) },
  { pattern: 'C(=O)N', name: 'amide', priority: 7, finder: this.findAmidePattern.bind(this) },
  { pattern: 'C(=O)O', name: 'ester', priority: 8, finder: this.findEsterPattern.bind(this) },
  { pattern: 'SC#N', name: 'thiocyanate', priority: 9, finder: this.findThiocyanatePattern.bind(this) },
  { pattern: 'C#N', name: 'nitrile', priority: 10, finder: this.findNitrilePattern.bind(this) },
  { pattern: 'RSR', name: 'thioether', priority: 11, finder: this.findThioetherPattern.bind(this) }
    ];

    for (const check of builtinChecks) {
      try {
        const atomsMatched = check.finder(atoms, bonds, molecule.rings);
        if (atomsMatched && atomsMatched.length > 0) {
          // Check if any of these atoms are already claimed by a higher-priority group
          const hasOverlap = atomsMatched.some(atomId => claimedAtoms.has(atomId));
          if (hasOverlap) {
            // Skip this pattern - atoms already claimed
            continue;
          }
          
          checkedPatterns.add(check.pattern);
          
          // Ensure the functionalGroups map contains this pattern so downstream
          // name generation can look up suffix/priority by type.
          if (!this.functionalGroups.has(check.pattern)) {
            // Provide reasonable suffix defaults for common groups
            const defaultSuffixes: Record<string, string> = {
              'C(=O)[OX2H1]': 'oic acid',
              'C=O': 'al',
              '[CX3](=O)[CX4]': 'one',
              '[OX2H]': 'ol',
              '[NX3][CX4]': 'amine',
              'C(=O)O': 'oate',
              'C(=O)N': 'amide',
              'C#N': 'nitrile',
              'SC#N': 'thiocyanate'
            };
            const defaultPrefixes: Record<string, string> = {
              '[OX2H]': 'hydroxy',
              '[NX3][CX4]': 'amino',
              '[CX3](=O)[CX4]': 'oxo',
              'C(=O)[OX2H1]': 'carboxy',
              'SC#N': 'thiocyano'
            };
            this.functionalGroups.set(check.pattern, {
              name: check.name,
              suffix: defaultSuffixes[check.pattern] || '',
              prefix: defaultPrefixes[check.pattern] || undefined,
              priority: check.priority
            });
          }

          const fgEntry = this.functionalGroups.get(check.pattern) as any;

          // Special case: For ketones, create one functional group per C=O pair
          // since each ketone should be counted separately for dione, trione, etc.
          if (check.pattern === '[CX3](=O)[CX4]' && atomsMatched.length > 2) {
            // atomsMatched contains pairs: [C1, O1, C2, O2, ...]
            for (let i = 0; i < atomsMatched.length; i += 2) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || '',
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [atomsMatched[i]!, atomsMatched[i + 1]!],
                pattern: check.pattern
              });
              // Claim these atoms
              claimedAtoms.add(atomsMatched[i]!);
              claimedAtoms.add(atomsMatched[i + 1]!);
            }
          } else if (check.pattern === 'C(=O)O' && atomsMatched.length > 2) {
            // Special case: For esters, create one functional group per C-O pair
            // since each ester should be counted separately for diesters, etc.
            // atomsMatched contains pairs: [C1, O1, C2, O2, ...]
            for (let i = 0; i < atomsMatched.length; i += 2) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || '',
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [atomsMatched[i]!, atomsMatched[i + 1]!],
                pattern: check.pattern
              });
              // Claim these atoms
              claimedAtoms.add(atomsMatched[i]!);
              claimedAtoms.add(atomsMatched[i + 1]!);
            }
          } else if (check.pattern === 'ROR' && atomsMatched.length > 1) {
            // Special case: For ethers, create one functional group per oxygen atom
            // since each ether oxygen should be independently convertible to alkoxy
            for (const oxygenId of atomsMatched) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || '',
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [oxygenId],
                pattern: check.pattern
              });
              // Claim this atom
              claimedAtoms.add(oxygenId);
            }
          } else if (check.pattern === 'RSR' && atomsMatched.length > 1) {
            // Special case: For thioethers, create one functional group per sulfur atom
            // since each thioether sulfur should be independently convertible to sulfanyl
            for (const sulfurId of atomsMatched) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || '',
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [sulfurId],
                pattern: check.pattern
              });
              // Claim this atom
              claimedAtoms.add(sulfurId);
            }
          } else {
            detectedGroups.push({
              type: check.pattern,
              name: fgEntry?.name || check.name,
              suffix: fgEntry?.suffix || '',
              prefix: fgEntry?.prefix || undefined,
              priority: fgEntry?.priority || check.priority,
              atoms: atomsMatched,
              pattern: check.pattern
            });
            // Claim all atoms in this functional group
            atomsMatched.forEach(atomId => claimedAtoms.add(atomId));
          }
        }
      } catch (e) {
        // ignore finder errors for robustness
      }
    }

    // Check each functional group pattern from OPSIN rules (skip already checked patterns)
    for (const [pattern, groupData] of this.functionalGroups.entries()) {
      if (checkedPatterns.has(pattern)) {
        continue;
      }
      
      const matches = this.matchPattern(molecule, pattern);
      if (matches.length > 0) {
        detectedGroups.push({
          type: pattern,
          name: (groupData as any).name || 'unknown',
          suffix: (groupData as any).suffix || '',
          priority: (groupData as any).priority || 999,
          atoms: matches,
          pattern: pattern
        });
      }
    }
    
    // Deduplicate functional groups by removing lower-priority groups that match the same atoms
    const deduplicated: typeof detectedGroups = [];
    const atomsUsed = new Set<number>();
    
    // Sort by priority first (lower number = higher priority)
    detectedGroups.sort((a, b) => a.priority - b.priority);
    
    for (const group of detectedGroups) {
      const groupAtomSet = new Set(group.atoms);
      const hasOverlap = group.atoms.some(atomId => atomsUsed.has(atomId));
      
      if (!hasOverlap) {
        // No overlap with higher-priority groups, keep this one
        deduplicated.push(group);
        group.atoms.forEach(atomId => atomsUsed.add(atomId));
      }
    }
    
    // Replace detectedGroups with deduplicated list
    detectedGroups.length = 0;
    detectedGroups.push(...deduplicated);
    
    // Post-process adjustments: handle ambiguous C=O matches where OPSIN may
    // classify as ketone but the local molecule is terminal (aldehyde).
    for (const g of detectedGroups) {
      if (g.pattern === 'C=O' || g.type === 'C=O') {
        const atomId = g.atoms[0];
        if (typeof atomId !== 'number') continue;
        const atom = atoms.find(a => a.id === atomId);
        if (atom) {
          const singleBondsForAtom = bonds.filter(b => (b.atom1 === atomId || b.atom2 === atomId) && b.type === 'single');
          const nonOxygenNeighbors = singleBondsForAtom
            .map(b => this.getBondedAtom(b, atomId, atoms))
            .filter(a => a && a.symbol !== 'O' && a.symbol !== 'H');

          if (nonOxygenNeighbors.length === 1) {
            // Likely an aldehyde (terminal carbonyl). Promote to aldehyde priority.
            g.priority = 2;
            g.name = 'aldehyde';
            if (!this.functionalGroups.has('C=O')) {
              this.functionalGroups.set('C=O', { name: 'aldehyde', suffix: 'al', priority: 2 });
            } else {
              const existing = this.functionalGroups.get('C=O') as any;
              existing.name = 'aldehyde';
              existing.priority = 2;
              existing.suffix = existing.suffix || 'al';
              this.functionalGroups.set('C=O', existing);
            }
          }
        }
      }
    }

    // Debug output only when VERBOSE is set
    if (process.env.VERBOSE) {
      console.log('Detected functional groups:');
      for (const g of detectedGroups) {
        console.log(`  Pattern: ${g.pattern}, Name: ${g.name}, Priority: ${g.priority}, Atoms: ${g.atoms.join(',')}`);
      }
    }

    detectedGroups.sort((a, b) => a.priority - b.priority);
    
    return detectedGroups;
  }
  
  /**
   * Match SMARTS pattern against molecule structure
   */
  private matchPattern(molecule: Molecule, pattern: string): number[] {
    // Caching layer
    let patternMap = this.matchPatternCache.get(molecule);
    if (!patternMap) {
      patternMap = new Map();
      this.matchPatternCache.set(molecule, patternMap);
    }
    if (patternMap.has(pattern)) {
      return patternMap.get(pattern)!;
    }

    const atoms = molecule.atoms;
    const bonds = molecule.bonds;
    let result: number[] = [];
    // Handle specific high-priority functional groups with exact matching
    switch (pattern) {
      case 'C(=O)[OX2H1]': // Carboxylic acid
        result = this.findCarboxylicAcidPattern(atoms, bonds);
        break;
      case '[OX2H]': // Alcohol
        result = this.findAlcoholPattern(atoms, bonds);
        break;
      case '[CX3](=O)[CX4]': // Ketone  
        result = this.findKetonePattern(atoms, bonds);
        break;
      case '[NX3][CX4]': // Amine
        result = this.findAminePattern(atoms, bonds, molecule.rings);
        break;
      case 'C#N': // Nitrile
        result = this.findNitrilePattern(atoms, bonds);
        break;
      case 'S(=O)=O': // Sulfonic acid
        result = this.findSulfonicAcidPattern(atoms, bonds);
        break;
      case 'SC#N': // Thiocyanate
        result = this.findThiocyanatePattern(atoms, bonds);
        break;
      case 'C=O': // Aldehyde
        result = this.findAldehydePattern(atoms, bonds);
        break;
      case 'N1CCC1': // Pyrrolidine
        result = this.findPyrrolidinePattern(atoms, bonds);
        break;
      case 'N1CCCC1': // Piperidine
        result = this.findPiperidinePattern(atoms, bonds);
        break;
      case 'N1CCCCC1': // Piperazine
        result = this.findPiperazinePattern(atoms, bonds);
        break;
      case 'Nc1ccccc1': // Aniline
        result = this.findAnilinePattern(atoms, bonds, molecule.rings);
        break;
      case '[O-]C#N': // Cyanate
        result = this.findCyanatePattern(atoms, bonds);
        break;
      case 'OO': // Peroxide
        result = this.findPeroxidePattern(atoms, bonds);
        break;
      default:
        // Fallback to simple pattern matching
        result = this.simplePatternMatch(molecule, pattern);
        break;
    }
    patternMap.set(pattern, result);
    return result;
  }
  
  // Specific pattern matching methods for high-priority functional groups
  
  private findCarboxylicAcidPattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for carbonyl carbon (C=O) followed by OH
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'C') continue;
      
      // Check for double bond to oxygen
      const doubleBondOxygen = bonds.find(bond => 
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && 
        bond.type === 'double' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );
      
      if (!doubleBondOxygen) continue;
      
      // Check for single bond to oxygen with hydrogen
      const ohOxygen = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );
      
      if (ohOxygen) {
        const oxygen = this.getBondedAtom(ohOxygen, atom.id, atoms)!;
        // Check if this oxygen has a hydrogen
        const hydrogenBond = bonds.find(bond =>
          (bond.atom1 === oxygen.id || bond.atom2 === oxygen.id) &&
          this.getBondedAtom(bond, oxygen.id, atoms)?.symbol === 'H'
        );

        // If hydrogens are implicit (common in parsed SMILES), accept oxygen
        // that is singly bonded only to the carbonyl carbon (degree 1) as OH
        const oxygenBonds = bonds.filter(bond => (bond.atom1 === oxygen.id || bond.atom2 === oxygen.id));
        const nonCarbonylNeighbors = oxygenBonds
          .map(b => this.getBondedAtom(b, oxygen.id, atoms))
          .filter(a => a && a.id !== atom.id);

        if (hydrogenBond || nonCarbonylNeighbors.length === 0) {
          return [atom.id, oxygen.id];
        }
      }
    }
    return [];
  }
  
  private findAlcoholPattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for oxygen with carbon and hydrogen bonds
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'O') continue;
      
      const carbonBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );
      
      const hydrogenBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'H'
      );
      
      // Accept explicit alcohols (carbon+bonded hydrogen) or implicit alcohols
      // where the oxygen is terminal (bonded to only one carbon and hydrogens
      // are implicit in parsed SMILES).
      if ((carbonBonds.length >= 1 && hydrogenBonds.length >= 1) || carbonBonds.length === 1) {
        return [atom.id];
      }
    }
    return [];
  }
  
  private findKetonePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for ALL carbonyl carbons with two carbon substituents
    const ketones: number[] = [];
    
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'C') continue;
      
      const doubleBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'double'
      );
      
      if (doubleBonds.length !== 1) continue;
      
      const doubleBond = doubleBonds[0];
      const carbonylOxygen = this.getBondedAtom(doubleBond, atom.id, atoms);
      if (carbonylOxygen?.symbol !== 'O') continue;
      
      // Check for two carbon substituents
      const carbonBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );
      
      if (carbonBonds.length >= 2 && carbonylOxygen) {
        ketones.push(atom.id, carbonylOxygen.id);
      }
    }
    return ketones;
  }
  
  private findAminePattern(atoms: readonly any[], bonds: readonly any[], rings?: readonly any[]): number[] {
    // Look for nitrogen bonded to carbon
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'N') continue;
      
      // Skip nitrogen that is part of a ring structure (heterocycle like azirane, pyridine, etc.)
      if (rings && rings.some(ring => ring.atoms.includes(atom.id))) {
        continue;
      }
      
      // Only consider nitrogen as amine if it's single-bonded to carbon/hydrogen
      const carbonSingleBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );

      const hydrogenBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'H'
      );

      // If the nitrogen is bonded to a carbonyl carbon (amide), treat as amide
      const hasAmideBond = carbonSingleBonds.some(b => {
        const bonded = this.getBondedAtom(b, atom.id, atoms);
        if (!bonded) return false;
        const doubleToO = bonds.find(bb =>
          (bb.atom1 === bonded.id || bb.atom2 === bonded.id) && bb.type === 'double' &&
          this.getBondedAtom(bb, bonded.id, atoms)?.symbol === 'O'
        );
        return !!doubleToO;
      });

      if (!hasAmideBond && (carbonSingleBonds.length >= 1 || hydrogenBonds.length >= 1)) {
        return [atom.id];
      }
    }
    return [];
  }

  private findEtherPattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for ALL oxygens bonded to two carbons (ROR)
    const etherOxygens: number[] = [];
    
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'O') continue;

      const carbonBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );

      if (carbonBonds.length === 2) {
        // Exclude oxygens that are part of esters (i.e., bonded to a carbonyl carbon)
        const carbons = carbonBonds.map(b => this.getBondedAtom(b, atom.id, atoms));
        const isPartOfCarbonyl = carbons.some(c => {
          if (!c) return false;
          const doubleToO = bonds.find(bb =>
            (bb.atom1 === c.id || bb.atom2 === c.id) && bb.type === 'double' &&
            this.getBondedAtom(bb, c.id, atoms)?.symbol === 'O'
          );
          return !!doubleToO;
        });

        if (!isPartOfCarbonyl) {
          etherOxygens.push(atom.id);
        }
      }
    }
    return etherOxygens;
  }

  private findThioetherPattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for ALL sulfurs bonded to two carbons (RSR)
    const thioetherSulfurs: number[] = [];
    
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'S') continue;

      const carbonBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );

      if (carbonBonds.length === 2) {
        // Exclude sulfurs that are part of thioesters (i.e., bonded to a carbonyl carbon)
        const carbons = carbonBonds.map(b => this.getBondedAtom(b, atom.id, atoms));
        const isPartOfCarbonyl = carbons.some(c => {
          if (!c) return false;
          const doubleToO = bonds.find(bb =>
            (bb.atom1 === c.id || bb.atom2 === c.id) && bb.type === 'double' &&
            this.getBondedAtom(bb, c.id, atoms)?.symbol === 'O'
          );
          return !!doubleToO;
        });

        if (!isPartOfCarbonyl) {
          thioetherSulfurs.push(atom.id);
        }
      }
    }
    return thioetherSulfurs;
  }

  private findThiocyanatePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for S-C≡N pattern (thiocyanate group)
    if (process.env.VERBOSE) {
      console.log('[findThiocyanatePattern] Searching for S-C≡N pattern');
    }
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'S') continue;

      // Find all carbons bonded to sulfur
      const carbonBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );

      if (process.env.VERBOSE) {
        console.log(`[findThiocyanatePattern] Found ${carbonBonds.length} C-S bonds for S=${atom.id}`);
      }

      // Check each carbon to see if it has a triple bond to nitrogen
      for (const carbonBond of carbonBonds) {
        const carbon = this.getBondedAtom(carbonBond, atom.id, atoms)!;
        if (process.env.VERBOSE) {
          console.log(`[findThiocyanatePattern] Checking C=${carbon.id} bonded to S=${atom.id}`);
        }

        const tripleBond = bonds.find(bond =>
          (bond.atom1 === carbon.id || bond.atom2 === carbon.id) &&
          bond.type === 'triple' &&
          this.getBondedAtom(bond, carbon.id, atoms)?.symbol === 'N'
        );

        if (tripleBond) {
          const nitrogen = this.getBondedAtom(tripleBond, carbon.id, atoms)!;
          if (process.env.VERBOSE) {
            console.log(`[findThiocyanatePattern] Found S-C≡N: S=${atom.id}, C=${carbon.id}, N=${nitrogen.id}`);
          }
          return [atom.id, carbon.id, nitrogen.id];
        }
      }
    }
    if (process.env.VERBOSE) {
      console.log('[findThiocyanatePattern] No thiocyanate pattern found');
    }
    return [];
  }
  
  private findNitrilePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for carbon-triple bond-nitrogen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'C') continue;
      
      const tripleBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'triple'
      );
      
      if (tripleBonds.length >= 1) {
        for (const bond of tripleBonds) {
          const nitrogen = this.getBondedAtom(bond, atom.id, atoms);
          if (nitrogen?.symbol === 'N') {
            return [atom.id, nitrogen.id];
          }
        }
      }
    }
    return [];
  }

  private findAmidePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for carbonyl carbon (C=O) bonded to nitrogen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'C') continue;

      const doubleBondOxygen = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'double' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );

      if (!doubleBondOxygen) continue;

      const nitrogenBond = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'N'
      );

      if (nitrogenBond) {
        const oxygen = this.getBondedAtom(doubleBondOxygen, atom.id, atoms)!;
        const nitrogen = this.getBondedAtom(nitrogenBond, atom.id, atoms)!;
        return [atom.id, oxygen.id, nitrogen.id];
      }
    }
    return [];
  }
  
  private findSulfonicAcidPattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for sulfur with double bonds to oxygen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'S') continue;
      
      const doubleBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'double'
      );
      
      const oxygenDoubleBonds = doubleBonds.filter(bond =>
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );
      
      if (oxygenDoubleBonds.length >= 2) {
        return [atom.id];
      }
    }
    return [];
  }
  
  private findAldehydePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for carbonyl carbon with hydrogen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'C') continue;
      
      // Check for double bond to oxygen
      const doubleBondOxygen = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'double' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );
      
      if (!doubleBondOxygen) continue;
      
      // Check for hydrogen attached (explicit) or implicit hydrogen scenario
      const hydrogenBond = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'H'
      );

      // If hydrogens are implicit, treat carbonyl carbon bonded to exactly one
      // non-oxygen heavy atom (i.e., one carbon neighbor) as an aldehyde, but
      // exclude esters (where the single-bonded oxygen is bonded to carbon).
      const singleBonds = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) && bond.type === 'single'
      );
      const nonOxygenNeighbors = singleBonds
        .map(b => this.getBondedAtom(b, atom.id, atoms))
        .filter(a => a && a.symbol !== 'O');

      const oxygen = this.getBondedAtom(doubleBondOxygen, atom.id, atoms)!;

      // Check if carbon is bonded to an oxygen that is further bonded to carbon
      const bondedOxygens = singleBonds
        .map(b => this.getBondedAtom(b, atom.id, atoms))
        .filter(a => a && a.symbol === 'O');

      let oxygenLinkedToCarbon = false;
      for (const ox of bondedOxygens) {
        const oxBonds = bonds.filter(b => (b.atom1 === ox.id || b.atom2 === ox.id));
        const oxCarbonNeighbors = oxBonds
          .map(b => this.getBondedAtom(b, ox.id, atoms))
          .filter(a => a && a.symbol === 'C' && a.id !== atom.id);
        if (oxCarbonNeighbors.length > 0) {
          oxygenLinkedToCarbon = true;
          break;
        }
      }

      if (hydrogenBond || (nonOxygenNeighbors.length === 1 && !oxygenLinkedToCarbon)) {
        return [atom.id, oxygen.id];
      }
    }
    return [];
  }

  private findEsterPattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for ALL carbonyl carbons (C=O) single-bonded to oxygen which is bonded to carbon
    const esters: number[] = [];
    
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'C') continue;

      const doubleBondOxygen = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'double' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );

      if (!doubleBondOxygen) continue;

      const singleBondedOxygen = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );

      if (singleBondedOxygen) {
        const oxygen = this.getBondedAtom(singleBondedOxygen, atom.id, atoms)!;
        const oxCarbonNeighbor = bonds.find(b =>
          (b.atom1 === oxygen.id || b.atom2 === oxygen.id) &&
          this.getBondedAtom(b, oxygen.id, atoms)?.symbol === 'C' &&
          this.getBondedAtom(b, oxygen.id, atoms)?.id !== atom.id
        );
        if (oxCarbonNeighbor) {
          esters.push(atom.id, oxygen.id);
        }
      }
    }
    return esters;
  }
  
  // Ring systems
  private findPyrrolidinePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    return this.findNitrogenRing(atoms, bonds, 4);
  }
  
  private findPiperidinePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    return this.findNitrogenRing(atoms, bonds, 5);
  }
  
  private findPiperazinePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Simplified - look for nitrogen atoms in 6-membered rings
    return this.findNitrogenRing(atoms, bonds, 6);
  }
  
  private findAnilinePattern(atoms: readonly any[], bonds: readonly any[], rings?: readonly (readonly number[])[]): number[] {
    // Look for nitrogen attached to aromatic ring, but NOT part of an aromatic ring itself
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'N') continue;
      
      // Skip nitrogen atoms that are part of aromatic rings (heterocycles like pyridine)
      if (atom.aromatic && rings) {
        const inRing = rings.some(ring => ring.includes(atom.id));
        if (inRing) {
          continue;
        }
      }
      
      const aromaticCarbons = bonds.filter(bond => {
        const bondedAtom = this.getBondedAtom(bond, atom.id, atoms);
        return bondedAtom?.symbol === 'C' && bondedAtom.aromatic;
      });
      
      if (aromaticCarbons.length >= 1) {
        return [atom.id];
      }
    }
    return [];
  }
  
  private findCyanatePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for O-C≡N pattern
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'O') continue;
      
      const carbonBond = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );
      
      if (carbonBond) {
        const carbon = this.getBondedAtom(carbonBond, atom.id, atoms)!;
        const tripleBond = bonds.find(bond =>
          (bond.atom1 === carbon.id || bond.atom2 === carbon.id) &&
          bond.type === 'triple' &&
          this.getBondedAtom(bond, carbon.id, atoms)?.symbol === 'N'
        );
        
        if (tripleBond) {
          const nitrogen = this.getBondedAtom(tripleBond, carbon.id, atoms)!;
          return [atom.id, carbon.id, nitrogen.id];
        }
      }
    }
    return [];
  }
  
  private findPeroxidePattern(atoms: readonly any[], bonds: readonly any[]): number[] {
    // Look for O-O single bond
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'O') continue;
      
      const ooBond = bonds.find(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        bond.type === 'single' &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'O'
      );
      
      if (ooBond) {
        const otherOxygen = this.getBondedAtom(ooBond, atom.id, atoms)!;
        return [atom.id, otherOxygen.id];
      }
    }
    return [];
  }
  
  private findNitrogenRing(atoms: readonly any[], bonds: readonly any[], _ringSize: number): number[] {
    // Simplified ring detection - look for nitrogen with appropriate ring connections
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom.symbol !== 'N') continue;
      
      const carbonNeighbors = bonds.filter(bond =>
        (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
        this.getBondedAtom(bond, atom.id, atoms)?.symbol === 'C'
      );
      
      if (carbonNeighbors.length >= 2) {
        return [atom.id];
      }
    }
    return [];
  }
  
  private simplePatternMatch(molecule: Molecule, pattern: string): number[] {
    // Fallback for other patterns
    const atoms = molecule.atoms;
    const matches: number[] = [];
    
    // Simple string-based matching for basic patterns
    switch (pattern) {
      case 'Br':
        matches.push(...atoms.filter(atom => atom.symbol === 'Br').map(atom => atom.id));
        break;
      case 'Cl':
        matches.push(...atoms.filter(atom => atom.symbol === 'Cl').map(atom => atom.id));
        break;
      case 'F':
        matches.push(...atoms.filter(atom => atom.symbol === 'F').map(atom => atom.id));
        break;
      case 'I':
        matches.push(...atoms.filter(atom => atom.symbol === 'I').map(atom => atom.id));
        break;
      case 'O':
        // Filter out oxygen atoms that are part of aromatic rings (heterocycles like furan)
        matches.push(...atoms.filter(atom => {
          if (atom.symbol !== 'O') return false;
          if (atom.aromatic && molecule.rings) {
            return !molecule.rings.some(ring => ring.includes(atom.id));
          }
          return true;
        }).map(atom => atom.id));
        break;
      case 'S':
        // Filter out sulfur atoms that are part of aromatic rings (heterocycles like thiophene)
        matches.push(...atoms.filter(atom => {
          if (atom.symbol !== 'S') return false;
          if (atom.aromatic && molecule.rings) {
            return !molecule.rings.some(ring => ring.includes(atom.id));
          }
          return true;
        }).map(atom => atom.id));
        break;
    }
    
    return matches;
  }
  
  private getBondedAtom(bond: any, atomId: number, atoms: readonly any[]): any {
    const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
    return atoms.find(atom => atom.id === otherAtomId);
  }
  
  /**
   * Get functional group priority following P-44.1
   */
  getFunctionalGroupPriority(type: string): number {
    // Look up in OPSIN rules
    const group = this.functionalGroups.get(type);
    if (group && (group as any).priority !== undefined) {
      return (group as any).priority;
    }
    
    // Fallback priorities for common groups
    const fallbackPriorities: { [key: string]: number } = {
      'carboxylic_acid': 1,
      'aldehyde': 2,
      'ketone': 3,
      'alcohol': 4,
      'amine': 5,
      'ether': 6,
      'amide': 7,
      'ester': 8,
      'halide': 9,
      'nitrile': 10
    };
    
    return fallbackPriorities[type] || 999;
  }
  
  /**
   * Get functional group name for display
   */
  getFunctionalGroupName(type: string): string {
    const group = this.functionalGroups.get(type);
    return (group as any)?.name || type;
  }
  
  /**
   * Get suffix for name construction
   */
  getFunctionalGroupSuffix(type: string): string {
    const group = this.functionalGroups.get(type);
    return (group as any)?.suffix || '';
  }
}