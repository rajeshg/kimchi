import type { Atom, Bond, Molecule } from "../../types";
import type { FunctionalGroupData } from "./opsin-service";
import { getSharedOPSINService } from "./opsin-service";

interface PatternFinderFunction {
  (
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[];
}

/**
 * Comprehensive P-44.1 Functional Group Detector using OPSIN Rules
 *
 * Implements full functional group coverage per IUPAC Blue Book P-44.1
 * using comprehensive SMARTS patterns from opsin-rules.json
 */
export class OPSINFunctionalGroupDetector {
  private matchPatternCache: WeakMap<Molecule, Map<string, number[]>> =
    new WeakMap();
  private functionalGroups: Map<string, FunctionalGroupData> = new Map();

  constructor() {
    this.initializeFunctionalGroupsFromService();
  }

  private initializeFunctionalGroupsFromService(): void {
    // Copy functional groups from service for local caching
    const opsinService = getSharedOPSINService();
    const allGroups = opsinService.getAllFunctionalGroups();
    const rawRules = opsinService.getRawRules();

    for (const [pattern, data] of allGroups.entries()) {
      // Look up priority by NAME from OPSIN rules, not pattern
      const priority =
        rawRules.functionalGroupPriorities?.[data.name] ?? data.priority ?? 999;

      this.functionalGroups.set(pattern, {
        ...data,
        priority, // Override with correct priority from rules
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

    // Helper to get priority from OPSIN rules with fallback
    const getPriority = (name: string, fallback: number): number => {
      const opsinService = getSharedOPSINService();
      const rawRules = opsinService.getRawRules();
      return rawRules.functionalGroupPriorities?.[name] ?? fallback;
    };

    // First, run a set of built-in high-priority detectors to ensure common groups
    // Priority follows IUPAC Blue Book P-44.1 (lower number = higher priority)
    // NOTE: Order matters for pattern matching! More specific patterns (e.g., SC#N) must come before more general patterns (e.g., C#N)
    const builtinChecks: Array<{
      pattern: string;
      name: string;
      priority: number;
      finder: PatternFinderFunction;
    }> = [
      {
        pattern: "C(=O)[OX2H1]",
        name: "carboxylic acid",
        priority: getPriority("carboxylic acid", 1),
        finder: this.findCarboxylicAcidPattern.bind(this),
      },
      {
        pattern: "C(=O)O",
        name: "ester",
        priority: getPriority("ester", 4),
        finder: this.findEsterPattern.bind(this),
      },
      {
        pattern: "C(=O)N",
        name: "amide",
        priority: getPriority("amide", 6),
        finder: this.findAmidePattern.bind(this),
      },
      {
        pattern: "SC#N",
        name: "thiocyanate",
        priority: 6.5,
        finder: this.findThiocyanatePattern.bind(this),
      },
      {
        pattern: "C#N",
        name: "nitrile",
        priority: getPriority("nitrile", 7),
        finder: this.findNitrilePattern.bind(this),
      },
      {
        pattern: "C=O",
        name: "aldehyde",
        priority: getPriority("aldehyde", 8),
        finder: this.findAldehydePattern.bind(this),
      },
      {
        pattern: "[CX3](=O)[CX4]",
        name: "ketone",
        priority: getPriority("ketone", 9),
        finder: this.findKetonePattern.bind(this),
      },
      {
        pattern: "C(=O)S",
        name: "thioester",
        priority: 9.5,
        finder: this.findThioesterPattern.bind(this),
      },
      {
        pattern: "[OX2H]",
        name: "alcohol",
        priority: getPriority("alcohol", 10),
        finder: this.findAlcoholPattern.bind(this),
      },
      {
        pattern: "[NX3][CX4]",
        name: "amine",
        priority: getPriority("amine", 13),
        finder: this.findAminePattern.bind(this),
      },
      {
        pattern: "C=N(ring)",
        name: "imine",
        priority: 11,
        finder: this.findImineInRingPattern.bind(this),
      },
      {
        pattern: "RSR",
        name: "thioether",
        priority: 11.5,
        finder: this.findThioetherPattern.bind(this),
      },
      {
        pattern: "S(=O)(=O)",
        name: "sulfonyl",
        priority: 15,
        finder: this.findSulfonylPattern.bind(this),
      },
      {
        pattern: "S(=O)",
        name: "sulfinyl",
        priority: 16,
        finder: this.findSulfinylPattern.bind(this),
      },
      {
        pattern: "P(=O)",
        name: "phosphoryl",
        priority: 17,
        finder: this.findPhosphorylPattern.bind(this),
      },
      {
        pattern: "P",
        name: "phosphanyl",
        priority: 18,
        finder: this.findPhosphanylPattern.bind(this),
      },
      {
        pattern: "B",
        name: "borane",
        priority: 19,
        finder: this.findBoranePattern.bind(this),
      },
      {
        pattern: "ROR",
        name: "ether",
        priority: getPriority("ether", 14),
        finder: this.findEtherPattern.bind(this),
      },
    ];

    for (const check of builtinChecks) {
      try {
        const atomsMatched = check.finder(atoms, bonds, molecule.rings);
        if (atomsMatched && atomsMatched.length > 0) {
          // Check if any of these atoms are already claimed by a higher-priority group
          const hasOverlap = atomsMatched.some((atomId) =>
            claimedAtoms.has(atomId),
          );
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
              "C(=O)[OX2H1]": "oic acid",
              "C=O": "al",
              "[CX3](=O)[CX4]": "one",
              "[OX2H]": "ol",
              "[NX3][CX4]": "amine",
              "C=N(ring)": "amine",
              "C(=O)O": "oate",
              "C(=O)S": "thioate",
              "C(=O)N": "amide",
              "C#N": "nitrile",
              "SC#N": "thiocyanate",
              "S(=O)(=O)": "sulfonyl",
              "S(=O)": "sulfinyl",
              "P(=O)": "phosphoryl",
              P: "phosphanyl",
              B: "borane",
            };
            const defaultPrefixes: Record<string, string> = {
              "[OX2H]": "hydroxy",
              "[NX3][CX4]": "amino",
              "C=N(ring)": "imino",
              "[CX3](=O)[CX4]": "oxo",
              "C(=O)[OX2H1]": "carboxy",
              "C(=O)S": "sulfanylformyl",
              "SC#N": "thiocyano",
              "S(=O)(=O)": "sulfonyl",
              "S(=O)": "sulfinyl",
              "P(=O)": "phosphoryl",
              P: "phosphanyl",
              B: "boryl",
            };
            this.functionalGroups.set(check.pattern, {
              name: check.name,
              suffix: defaultSuffixes[check.pattern] || "",
              prefix: defaultPrefixes[check.pattern] || undefined,
              priority: getPriority(check.name, check.priority),
            });
          }

          const fgEntry = this.functionalGroups.get(check.pattern);

          // Special case: For carboxylic acids, create one functional group per C(=O)OH triple
          // since each carboxylic acid should be counted separately for diacids, triacids, etc.
          if (check.pattern === "C(=O)[OX2H1]" && atomsMatched.length > 3) {
            // atomsMatched contains triples: [C1, O_carbonyl1, O_hydroxyl1, C2, O_carbonyl2, O_hydroxyl2, ...]
            for (let i = 0; i < atomsMatched.length; i += 3) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [
                  atomsMatched[i]!,
                  atomsMatched[i + 1]!,
                  atomsMatched[i + 2]!,
                ],
                pattern: check.pattern,
              });
              // Claim these atoms
              claimedAtoms.add(atomsMatched[i]!);
              claimedAtoms.add(atomsMatched[i + 1]!);
              claimedAtoms.add(atomsMatched[i + 2]!);
            }
          } else if (
            check.pattern === "[CX3](=O)[CX4]" &&
            atomsMatched.length > 2
          ) {
            // Special case: For ketones, create one functional group per C=O pair
            // since each ketone should be counted separately for dione, trione, etc.
            // atomsMatched contains pairs: [C1, O1, C2, O2, ...]
            for (let i = 0; i < atomsMatched.length; i += 2) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [atomsMatched[i]!, atomsMatched[i + 1]!],
                pattern: check.pattern,
              });
              // Claim these atoms
              claimedAtoms.add(atomsMatched[i]!);
              claimedAtoms.add(atomsMatched[i + 1]!);
            }
          } else if (check.pattern === "C(=O)O" && atomsMatched.length > 3) {
            // Special case: For esters, create one functional group per C=O-O triple
            // since each ester should be counted separately for diesters, etc.
            // atomsMatched contains triples: [C1, O_carbonyl1, O_ester1, C2, O_carbonyl2, O_ester2, ...]
            for (let i = 0; i < atomsMatched.length; i += 3) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [
                  atomsMatched[i]!,
                  atomsMatched[i + 1]!,
                  atomsMatched[i + 2]!,
                ],
                pattern: check.pattern,
              });
              // Claim these atoms
              claimedAtoms.add(atomsMatched[i]!);
              claimedAtoms.add(atomsMatched[i + 1]!);
              claimedAtoms.add(atomsMatched[i + 2]!);
            }
          } else if (check.pattern === "C(=O)S" && atomsMatched.length > 3) {
            // Special case: For thioesters, create one functional group per C=O-S triple
            // atomsMatched contains triples: [C1, O_carbonyl1, S1, C2, O_carbonyl2, S2, ...]
            for (let i = 0; i < atomsMatched.length; i += 3) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [
                  atomsMatched[i]!,
                  atomsMatched[i + 1]!,
                  atomsMatched[i + 2]!,
                ],
                pattern: check.pattern,
              });
              // Claim these atoms
              claimedAtoms.add(atomsMatched[i]!);
              claimedAtoms.add(atomsMatched[i + 1]!);
              claimedAtoms.add(atomsMatched[i + 2]!);
            }
          } else if (check.pattern === "C(=O)N" && atomsMatched.length > 3) {
            // Special case: For amides, create one functional group per C=O-N triple
            // atomsMatched contains triples: [C1, O_carbonyl1, N1, C2, O_carbonyl2, N2, ...]
            for (let i = 0; i < atomsMatched.length; i += 3) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [
                  atomsMatched[i]!,
                  atomsMatched[i + 1]!,
                  atomsMatched[i + 2]!,
                ],
                pattern: check.pattern,
              });
              // Claim these atoms
              claimedAtoms.add(atomsMatched[i]!);
              claimedAtoms.add(atomsMatched[i + 1]!);
              claimedAtoms.add(atomsMatched[i + 2]!);
            }
          } else if (check.pattern === "ROR" && atomsMatched.length > 1) {
            // Special case: For ethers, create one functional group per oxygen atom
            // since each ether oxygen should be independently convertible to alkoxy
            for (const oxygenId of atomsMatched) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [oxygenId],
                pattern: check.pattern,
              });
              // Claim this atom
              claimedAtoms.add(oxygenId);
            }
          } else if (check.pattern === "RSR" && atomsMatched.length > 1) {
            // Special case: For thioethers, create one functional group per sulfur atom
            // since each thioether sulfur should be independently convertible to sulfanyl
            for (const sulfurId of atomsMatched) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [sulfurId],
                pattern: check.pattern,
              });
              // Claim this atom
              claimedAtoms.add(sulfurId);
            }
          } else if (check.pattern === "[OX2H]" && atomsMatched.length > 1) {
            // Special case: For alcohols, create one functional group per oxygen atom
            // since each alcohol should be counted separately for diol, triol, etc.
            for (const oxygenId of atomsMatched) {
              detectedGroups.push({
                type: check.pattern,
                name: fgEntry?.name || check.name,
                suffix: fgEntry?.suffix || "",
                prefix: fgEntry?.prefix || undefined,
                priority: fgEntry?.priority || check.priority,
                atoms: [oxygenId],
                pattern: check.pattern,
              });
              // Claim this atom
              claimedAtoms.add(oxygenId);
            }
          } else {
            if (process.env.DEBUG_ALDEHYDE && check.name === "aldehyde") {
              console.log(`[DEBUG] Aldehyde detection:`);
              console.log(`  check.pattern: ${check.pattern}`);
              console.log(`  check.priority: ${check.priority}`);
              console.log(`  fgEntry:`, fgEntry);
              console.log(
                `  final priority: ${fgEntry?.priority || check.priority}`,
              );
            }
            detectedGroups.push({
              type: check.pattern,
              name: fgEntry?.name || check.name,
              suffix: fgEntry?.suffix || "",
              prefix: fgEntry?.prefix || undefined,
              priority: fgEntry?.priority || check.priority,
              atoms: atomsMatched,
              pattern: check.pattern,
            });
            // Claim all atoms in this functional group
            atomsMatched.forEach((atomId) => claimedAtoms.add(atomId));
          }
        }
      } catch (_e) {
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
          name: groupData.name || "unknown",
          suffix: groupData.suffix || "",
          priority: groupData.priority || 999,
          atoms: matches,
          pattern: pattern,
        });
      }
    }

    // Deduplicate functional groups by removing lower-priority groups that match the same atoms
    const deduplicated: typeof detectedGroups = [];
    const atomsUsed = new Set<number>();

    // Sort by priority first (lower number = higher priority)
    detectedGroups.sort((a, b) => a.priority - b.priority);

    for (const group of detectedGroups) {
      const _groupAtomSet = new Set(group.atoms);
      const hasOverlap = group.atoms.some((atomId) => atomsUsed.has(atomId));

      if (!hasOverlap) {
        // No overlap with higher-priority groups, keep this one
        deduplicated.push(group);
        group.atoms.forEach((atomId) => atomsUsed.add(atomId));
      }
    }

    // Replace detectedGroups with deduplicated list
    detectedGroups.length = 0;
    detectedGroups.push(...deduplicated);

    // Post-process adjustments: handle ambiguous C=O matches where OPSIN may
    // classify as ketone but the local molecule is terminal (aldehyde).
    for (const g of detectedGroups) {
      if (g.pattern === "C=O" || g.type === "C=O") {
        const atomId = g.atoms[0];
        if (typeof atomId !== "number") continue;
        const atom = atoms.find((a) => a.id === atomId);
        if (atom) {
          const singleBondsForAtom = bonds.filter(
            (b) =>
              (b.atom1 === atomId || b.atom2 === atomId) && b.type === "single",
          );
          const nonOxygenNeighbors = singleBondsForAtom
            .map((b) => this.getBondedAtom(b, atomId, atoms))
            .filter((a) => a && a.symbol !== "O" && a.symbol !== "H");

          if (nonOxygenNeighbors.length === 1) {
            // Likely an aldehyde (terminal carbonyl). Promote to aldehyde priority.
            g.priority = 8; // IUPAC P-44.1: aldehyde priority is 8
            g.name = "aldehyde";
            if (!this.functionalGroups.has("C=O")) {
              this.functionalGroups.set("C=O", {
                name: "aldehyde",
                suffix: "al",
                priority: 8,
              });
            } else {
              const existing = this.functionalGroups.get("C=O");
              if (existing) {
                existing.name = "aldehyde";
                existing.priority = 8;
                if (!existing.suffix) {
                  existing.suffix = "al";
                }
                this.functionalGroups.set("C=O", existing);
              }
            }
          }
        }
      }
    }

    // Debug output only when VERBOSE is set
    if (process.env.VERBOSE) {
      console.log("Detected functional groups:");
      for (const g of detectedGroups) {
        console.log(
          `  Pattern: ${g.pattern}, Name: ${g.name}, Priority: ${g.priority}, Atoms: ${g.atoms.join(",")}`,
        );
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
      case "C(=O)[OX2H1]": // Carboxylic acid
        result = this.findCarboxylicAcidPattern(atoms, bonds);
        break;
      case "[OX2H]": // Alcohol
        result = this.findAlcoholPattern(atoms, bonds);
        break;
      case "[CX3](=O)[CX4]": // Ketone
        result = this.findKetonePattern(atoms, bonds);
        break;
      case "[NX3][CX4]": // Amine
        result = this.findAminePattern(atoms, bonds, molecule.rings);
        break;
      case "C#N": // Nitrile
        result = this.findNitrilePattern(atoms, bonds);
        break;
      case "S(=O)=O": // Sulfonic acid
        result = this.findSulfonicAcidPattern(atoms, bonds);
        break;
      case "SC#N": // Thiocyanate
        result = this.findThiocyanatePattern(atoms, bonds);
        break;
      case "C=O": // Aldehyde
        result = this.findAldehydePattern(atoms, bonds);
        break;
      case "N1CCC1": // Pyrrolidine
        result = this.findPyrrolidinePattern(atoms, bonds);
        break;
      case "N1CCCC1": // Piperidine
        result = this.findPiperidinePattern(atoms, bonds);
        break;
      case "N1CCCCC1": // Piperazine
        result = this.findPiperazinePattern(atoms, bonds);
        break;
      case "Nc1ccccc1": // Aniline
        result = this.findAnilinePattern(atoms, bonds, molecule.rings);
        break;
      case "[O-]C#N": // Cyanate
        result = this.findCyanatePattern(atoms, bonds);
        break;
      case "OO": // Peroxide
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

  private findCarboxylicAcidPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for ALL carboxylic acid groups (C=O-OH), not just the first one
    const carboxylicAcids: number[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "C") continue;

      // Check for double bond to oxygen
      const doubleBondOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (!doubleBondOxygen) continue;

      // Check for single bond to oxygen with hydrogen
      const ohOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (ohOxygen) {
        const oxygen = this.getBondedAtom(ohOxygen, atom.id, atoms)!;
        // Check if this oxygen has a hydrogen
        const hydrogenBond = bonds.find(
          (bond) =>
            (bond.atom1 === oxygen.id || bond.atom2 === oxygen.id) &&
            this.getBondedAtom(bond, oxygen.id, atoms)?.symbol === "H",
        );

        // If hydrogens are implicit (common in parsed SMILES), accept oxygen
        // that is singly bonded only to the carbonyl carbon (degree 1) as OH
        const oxygenBonds = bonds.filter(
          (bond) => bond.atom1 === oxygen.id || bond.atom2 === oxygen.id,
        );
        const nonCarbonylNeighbors = oxygenBonds
          .map((b) => this.getBondedAtom(b, oxygen.id, atoms))
          .filter((a) => a && a.id !== atom.id);

        if (hydrogenBond || nonCarbonylNeighbors.length === 0) {
          // Get the carbonyl oxygen from the double bond
          const carbonylOxygen = this.getBondedAtom(
            doubleBondOxygen,
            atom.id,
            atoms,
          )!;
          // Add all three atoms: carbonyl carbon, carbonyl oxygen, hydroxyl oxygen
          carboxylicAcids.push(atom.id, carbonylOxygen.id, oxygen.id);
        }
      }
    }
    return carboxylicAcids;
  }

  private findAlcoholPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for ALL oxygen atoms with carbon and hydrogen bonds (alcohols)
    const alcohols: number[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "O") continue;

      const carbonBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "C",
      );

      const hydrogenBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "H",
      );

      // Check for bonds to other heteroatoms (N, S, P, etc.)
      // Alcohols should only be bonded to C and H, not to other heteroatoms
      const heteroatomBonds = bonds.filter((bond) => {
        if (bond.atom1 !== atom.id && bond.atom2 !== atom.id) return false;
        const other = this.getBondedAtom(bond, atom.id, atoms);
        if (!other) return false;
        // Heteroatoms are elements other than C, H, O
        return (
          other.symbol !== "C" && other.symbol !== "H" && other.symbol !== "O"
        );
      });

      // Don't detect as alcohol if bonded to heteroatoms (e.g., O-N in aminooxy)
      if (heteroatomBonds.length > 0) {
        continue;
      }

      // Accept explicit alcohols (carbon+bonded hydrogen) or implicit alcohols
      // where the oxygen is terminal (bonded to only one carbon and hydrogens
      // are implicit in parsed SMILES).
      if (
        (carbonBonds.length >= 1 && hydrogenBonds.length >= 1) ||
        carbonBonds.length === 1
      ) {
        alcohols.push(atom.id);
      }
    }
    return alcohols;
  }

  private findKetonePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for ALL carbonyl carbons with two carbon substituents
    const ketones: number[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "C") continue;

      const doubleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double",
      );

      if (doubleBonds.length !== 1) continue;

      const doubleBond = doubleBonds[0];
      if (!doubleBond) continue;
      const carbonylOxygen = this.getBondedAtom(doubleBond, atom.id, atoms);
      if (carbonylOxygen?.symbol !== "O") continue;

      // Check for two carbon substituents
      const carbonBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "C",
      );

      if (carbonBonds.length >= 2 && carbonylOxygen) {
        ketones.push(atom.id, carbonylOxygen.id);
      }
    }
    return ketones;
  }

  private findAminePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[] {
    // Look for nitrogen bonded to carbon
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "N") continue;

      // Skip nitrogen that is part of a ring structure (heterocycle like azirane, pyridine, etc.)
      if (rings && rings.some((ring) => ring.includes(atom.id))) {
        continue;
      }

      // Only consider nitrogen as amine if it's single-bonded to carbon/hydrogen
      const carbonSingleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "C",
      );

      const hydrogenBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "H",
      );

      // If the nitrogen is bonded to a carbonyl carbon (amide), treat as amide
      const hasAmideBond = carbonSingleBonds.some((b) => {
        const bonded = this.getBondedAtom(b, atom.id, atoms);
        if (!bonded) return false;
        const doubleToO = bonds.find(
          (bb) =>
            (bb.atom1 === bonded.id || bb.atom2 === bonded.id) &&
            bb.type === "double" &&
            this.getBondedAtom(bb, bonded.id, atoms)?.symbol === "O",
        );
        return !!doubleToO;
      });

      if (
        !hasAmideBond &&
        (carbonSingleBonds.length >= 1 || hydrogenBonds.length >= 1)
      ) {
        return [atom.id];
      }
    }
    return [];
  }

  private findImineInRingPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[] {
    // Look for C=N imine bonds within rings (e.g., azirine)
    // For azirine: the C=N bond should get the -amine suffix
    // IMPORTANT: Only detect imines in simple hydrocarbon rings (C and N only)
    // Do NOT detect C=N in heterocycles (rings containing S, O, etc.)
    if (process.env.VERBOSE) {
      console.log(
        `[findImineInRingPattern] Called with ${rings?.length || 0} rings`,
      );
    }
    if (!rings || rings.length === 0) return [];

    for (const ring of rings) {
      if (process.env.VERBOSE) {
        console.log(
          `[findImineInRingPattern] Checking ring: [${ring.join(", ")}]`,
        );
      }

      // Check if this ring is a heterocycle (contains heteroatoms other than the N in C=N)
      const ringAtoms = ring.map((atomId) => atoms[atomId]);
      const heteroatomsInRing = ringAtoms.filter(
        (atom) => atom && atom.symbol !== "C" && atom.symbol !== "H",
      );

      if (process.env.VERBOSE) {
        console.log(
          `[findImineInRingPattern] Ring heteroatoms: ${heteroatomsInRing.map((a) => a?.symbol).join(", ")}`,
        );
      }

      // If ring contains heteroatoms besides N, it's a heterocycle - skip imine detection
      // Exception: if the ring contains exactly 1 N (which is part of C=N), it could be azirine
      if (heteroatomsInRing.length > 1) {
        if (process.env.VERBOSE) {
          console.log(
            `[findImineInRingPattern] Skipping heterocycle ring (contains ${heteroatomsInRing.length} heteroatoms)`,
          );
        }
        continue;
      }

      // Check for C=N double bond within this ring
      for (const bond of bonds) {
        if (bond.type !== "double") continue;

        const atom1 = atoms[bond.atom1];
        const atom2 = atoms[bond.atom2];
        if (!atom1 || !atom2) continue;

        // Check if this is a C=N bond
        const isImineInRing =
          ((atom1.symbol === "C" && atom2.symbol === "N") ||
            (atom1.symbol === "N" && atom2.symbol === "C")) &&
          ring.includes(bond.atom1) &&
          ring.includes(bond.atom2);

        if (isImineInRing) {
          // Return the carbon atom of the C=N bond (the one that gets the -amine suffix)
          const carbonAtom = atom1.symbol === "C" ? atom1 : atom2;
          if (process.env.VERBOSE) {
            console.log(
              `[findImineInRingPattern] Found C=N bond in simple ring: ${bond.atom1}=${bond.atom2}, returning carbon atom ${carbonAtom.id}`,
            );
          }
          return [carbonAtom.id];
        }
      }
    }
    return [];
  }

  private findEtherPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for ALL oxygens bonded to two carbons (ROR)
    const etherOxygens: number[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "O") continue;

      // Exclude oxygens that are part of heterocyclic rings
      // These are already named as part of the ring (e.g., "oxolane", "oxane")
      if (atom.isInRing) {
        continue;
      }

      const carbonBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "C",
      );

      if (carbonBonds.length === 2) {
        // Exclude oxygens that are part of esters (i.e., bonded to a carbonyl carbon)
        const carbons = carbonBonds.map((b) =>
          this.getBondedAtom(b, atom.id, atoms),
        );
        const isPartOfCarbonyl = carbons.some((c) => {
          if (!c) return false;
          const doubleToO = bonds.find(
            (bb) =>
              (bb.atom1 === c.id || bb.atom2 === c.id) &&
              bb.type === "double" &&
              this.getBondedAtom(bb, c.id, atoms)?.symbol === "O",
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

  private findThioetherPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for ALL sulfurs bonded to two carbons (RSR)
    const thioetherSulfurs: number[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "S") continue;

      // Exclude sulfurs that are part of heterocyclic rings
      // These are already named as part of the ring (e.g., "thiolane", "thiane")
      if (atom.isInRing) {
        continue;
      }

      const carbonBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "C",
      );

      if (carbonBonds.length === 2) {
        // Exclude sulfurs that are part of thioesters (i.e., bonded to a carbonyl carbon)
        const carbons = carbonBonds.map((b) =>
          this.getBondedAtom(b, atom.id, atoms),
        );
        const isPartOfCarbonyl = carbons.some((c) => {
          if (!c) return false;
          const doubleToO = bonds.find(
            (bb) =>
              (bb.atom1 === c.id || bb.atom2 === c.id) &&
              bb.type === "double" &&
              this.getBondedAtom(bb, c.id, atoms)?.symbol === "O",
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

  private findThiocyanatePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for S-C≡N pattern (thiocyanate group)
    if (process.env.VERBOSE) {
      console.log("[findThiocyanatePattern] Searching for S-C≡N pattern");
    }
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "S") continue;

      // Find all carbons bonded to sulfur
      const carbonBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "C",
      );

      if (process.env.VERBOSE) {
        console.log(
          `[findThiocyanatePattern] Found ${carbonBonds.length} C-S bonds for S=${atom.id}`,
        );
      }

      // Check each carbon to see if it has a triple bond to nitrogen
      for (const carbonBond of carbonBonds) {
        const carbon = this.getBondedAtom(carbonBond, atom.id, atoms)!;
        if (process.env.VERBOSE) {
          console.log(
            `[findThiocyanatePattern] Checking C=${carbon.id} bonded to S=${atom.id}`,
          );
        }

        const tripleBond = bonds.find(
          (bond) =>
            (bond.atom1 === carbon.id || bond.atom2 === carbon.id) &&
            bond.type === "triple" &&
            this.getBondedAtom(bond, carbon.id, atoms)?.symbol === "N",
        );

        if (tripleBond) {
          const nitrogen = this.getBondedAtom(tripleBond, carbon.id, atoms)!;
          if (process.env.VERBOSE) {
            console.log(
              `[findThiocyanatePattern] Found S-C≡N: S=${atom.id}, C=${carbon.id}, N=${nitrogen.id}`,
            );
          }
          return [atom.id, carbon.id, nitrogen.id];
        }
      }
    }
    if (process.env.VERBOSE) {
      console.log("[findThiocyanatePattern] No thiocyanate pattern found");
    }
    return [];
  }

  private findNitrilePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for carbon-triple bond-nitrogen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "C") continue;

      const tripleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "triple",
      );

      if (tripleBonds.length >= 1) {
        for (const bond of tripleBonds) {
          const nitrogen = this.getBondedAtom(bond, atom.id, atoms);
          if (nitrogen?.symbol === "N") {
            return [atom.id, nitrogen.id];
          }
        }
      }
    }
    return [];
  }

  private findAmidePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[] {
    const allAmides: number[] = [];

    // Look for all carbonyl carbons (C=O) bonded to nitrogen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "C") continue;

      const doubleBondOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (!doubleBondOxygen) continue;

      const nitrogenBond = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "N",
      );

      if (nitrogenBond) {
        const oxygen = this.getBondedAtom(doubleBondOxygen, atom.id, atoms)!;
        const nitrogen = this.getBondedAtom(nitrogenBond, atom.id, atoms)!;

        // Check if carbonyl is incorporated into a heterocycle with "-one" suffix
        // If C and N are both in the same ring, this might be a lactam/cyclic amide
        // that's already named as part of the heterocycle (e.g., diaziridin-3-one)
        if (rings && rings.length > 0) {
          const carbonylInRing = atom.ringIds || [];
          const nitrogenInRing = nitrogen.ringIds || [];

          // Find common rings between C and N
          const commonRings = carbonylInRing.filter((ringId: number) =>
            nitrogenInRing.includes(ringId),
          );

          if (commonRings.length > 0) {
            // Check if any of these rings is a heterocycle with "-one" suffix
            let skipAmide = false;
            for (const ringId of commonRings) {
              const ring = rings[ringId];
              if (ring && this.isHeterocycleWithCarbonyl(ring, atoms)) {
                // Skip this amide - it's already incorporated in heterocycle name
                skipAmide = true;
                break;
              }
            }
            if (skipAmide) {
              continue; // Skip to next carbon atom
            }
          }
        }

        // Add this amide as a triple: [C, O, N]
        allAmides.push(atom.id, oxygen.id, nitrogen.id);
      }
    }
    return allAmides;
  }

  private isHeterocycleWithCarbonyl(
    ring: readonly number[],
    atoms: readonly Atom[],
  ): boolean {
    // Check if this is a heterocycle with a carbonyl (lactam rings)
    // Lactams: cyclic amides with C=O in the ring (e.g., pyrrolidin-2-one, piperidin-2-one, piperazin-2-one)
    const ringAtoms = ring
      .map((idx) => atoms[idx])
      .filter((a): a is Atom => a !== undefined);

    const ringSize = ringAtoms.length;
    const nitrogenCount = ringAtoms.filter((a) => a.symbol === "N").length;
    const carbonCount = ringAtoms.filter((a) => a.symbol === "C").length;

    // Check for lactam patterns:
    // 1. 3-membered rings: diaziridin-3-one (2N, 1C)
    if (ringSize === 3 && nitrogenCount === 2 && carbonCount === 1) {
      return true;
    }

    // 2. 5-membered rings: pyrrolidin-2-one (1N, 4C)
    if (ringSize === 5 && nitrogenCount === 1 && carbonCount === 4) {
      return true;
    }

    // 3. 6-membered rings with single N: piperidin-2-one (1N, 5C)
    if (ringSize === 6 && nitrogenCount === 1 && carbonCount === 5) {
      return true;
    }

    // 4. 6-membered rings with dual N: piperazin-2-one (2N, 4C)
    if (ringSize === 6 && nitrogenCount === 2 && carbonCount === 4) {
      return true;
    }

    return false;
  }

  private findSulfonicAcidPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for sulfur with double bonds to oxygen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "S") continue;

      const doubleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double",
      );

      const oxygenDoubleBonds = doubleBonds.filter(
        (bond) => this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (oxygenDoubleBonds.length >= 2) {
        return [atom.id];
      }
    }
    return [];
  }

  private findSulfonylPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for sulfur with exactly 2 double bonds to oxygen: -S(=O)(=O)-
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "S") continue;

      const doubleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double",
      );

      const oxygenDoubleBonds = doubleBonds.filter(
        (bond) => this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      // Must have exactly 2 double bonds to oxygen for sulfonyl
      if (oxygenDoubleBonds.length === 2) {
        // Must have at least 1 single bond to carbon or other atom (not sulfonic acid)
        const singleBonds = bonds.filter(
          (bond) =>
            (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
            bond.type === "single",
        );

        if (singleBonds.length >= 1) {
          return [atom.id];
        }
      }
    }
    return [];
  }

  private findSulfinylPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for sulfur with exactly 1 double bond to oxygen: -S(=O)-
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "S") continue;

      const doubleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double",
      );

      const oxygenDoubleBonds = doubleBonds.filter(
        (bond) => this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      // Must have exactly 1 double bond to oxygen for sulfinyl
      if (oxygenDoubleBonds.length === 1) {
        // Must have at least 2 single bonds to carbon or other atoms
        const singleBonds = bonds.filter(
          (bond) =>
            (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
            bond.type === "single",
        );

        if (singleBonds.length >= 2) {
          return [atom.id];
        }
      }
    }
    return [];
  }

  private findPhosphorylPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for phosphorus with exactly 1 double bond to oxygen: -P(=O)-
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "P") continue;

      const doubleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double",
      );

      const oxygenDoubleBonds = doubleBonds.filter(
        (bond) => this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      // Must have exactly 1 double bond to oxygen for phosphoryl
      if (oxygenDoubleBonds.length === 1) {
        const oxygenBond = oxygenDoubleBonds[0];
        if (!oxygenBond) return [];
        const oxygenAtom = this.getBondedAtom(oxygenBond, atom.id, atoms);
        if (!oxygenAtom) return [];
        // Claim both P and O atoms to prevent O from being detected as separate "oxide"
        return [atom.id, oxygenAtom.id];
      }
    }
    return [];
  }

  private findPhosphanylPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for phosphorus without double bonds to oxygen (not phosphoryl)
    // This is a trivalent or higher valent phosphorus substituent: -PR2, -PR3, etc.
    const phosphanylAtoms: number[] = [];

    // Don't detect phosphanyl if phosphorus should be a heteroatom parent
    // Criteria for heteroatom parent: single P atom with only C/H substituents (no other heteroatoms)
    const phosphorusAtoms = atoms.filter((a) => a?.symbol === "P");
    if (phosphorusAtoms.length === 1) {
      const pAtom = phosphorusAtoms[0];
      if (!pAtom) return [];
      const pBonds = bonds.filter(
        (b) => b.atom1 === pAtom.id || b.atom2 === pAtom.id,
      );
      const neighbors = pBonds
        .map((b) => this.getBondedAtom(b, pAtom.id, atoms))
        .filter((a): a is Atom => a !== undefined);

      // If all neighbors are C or H, this is likely a heteroatom parent (e.g., methylphosphine)
      const allCarbonOrHydrogen = neighbors.every(
        (a) => a.symbol === "C" || a.symbol === "H",
      );
      if (allCarbonOrHydrogen) {
        return []; // Don't detect as phosphanyl - let heteroatom parent rule handle it
      }
    }

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "P") continue;

      // Exclude if it's in a ring (heterocyclic phosphorus)
      if (atom.isInRing) {
        continue;
      }

      // Check if it has any double bonds to oxygen
      const hasPhosphoryl = bonds.some((bond) => {
        if (bond.atom1 !== atom.id && bond.atom2 !== atom.id) return false;
        if (bond.type !== "double") return false;
        const bondedAtom = this.getBondedAtom(bond, atom.id, atoms);
        return bondedAtom?.symbol === "O";
      });

      // Only match if it's NOT a phosphoryl group (no P=O)
      if (!hasPhosphoryl) {
        phosphanylAtoms.push(atom.id);
      }
    }

    return phosphanylAtoms;
  }

  private findBoranePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for boron atoms with only C/H neighbors (trialkylborane, dialkylborane, etc.)
    // Borane functional class nomenclature: R₃B → trialkylborane
    const boraneAtoms: number[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "B") continue;

      // Exclude if it's in a ring (heterocyclic boron)
      if (atom.isInRing) {
        continue;
      }

      // Get all neighbors of boron
      const bBonds = bonds.filter(
        (b) => b.atom1 === atom.id || b.atom2 === atom.id,
      );
      const neighbors = bBonds
        .map((b) => this.getBondedAtom(b, atom.id, atoms))
        .filter((a): a is Atom => a !== undefined);

      // Borane should have only C or H neighbors (no heteroatoms like O, N, etc.)
      const allCarbonOrHydrogen = neighbors.every(
        (a) => a.symbol === "C" || a.symbol === "H",
      );

      if (allCarbonOrHydrogen && neighbors.length > 0) {
        boraneAtoms.push(atom.id);
      }
    }

    return boraneAtoms;
  }

  private findAldehydePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for carbonyl carbon with hydrogen
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "C") continue;

      // Check for double bond to oxygen
      const doubleBondOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (!doubleBondOxygen) continue;

      // Check for hydrogen attached (explicit) or implicit hydrogen scenario
      const hydrogenBond = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "H",
      );

      // If hydrogens are implicit, treat carbonyl carbon bonded to exactly one
      // non-oxygen heavy atom (i.e., one carbon neighbor) as an aldehyde, but
      // exclude esters (where the single-bonded oxygen is bonded to carbon).
      const singleBonds = bonds.filter(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single",
      );
      const nonOxygenNeighbors = singleBonds
        .map((b) => this.getBondedAtom(b, atom.id, atoms))
        .filter((a) => a && a.symbol !== "O");

      const oxygen = this.getBondedAtom(doubleBondOxygen, atom.id, atoms)!;

      // Check if carbon is bonded to an oxygen that is further bonded to carbon
      const bondedOxygens = singleBonds
        .map((b) => this.getBondedAtom(b, atom.id, atoms))
        .filter((a) => a && a.symbol === "O");

      let oxygenLinkedToCarbon = false;
      for (const ox of bondedOxygens) {
        if (!ox) continue;
        const oxBonds = bonds.filter(
          (b) => b.atom1 === ox.id || b.atom2 === ox.id,
        );
        const oxCarbonNeighbors = oxBonds
          .map((b) => this.getBondedAtom(b, ox.id, atoms))
          .filter((a) => a && a.symbol === "C" && a.id !== atom.id);
        if (oxCarbonNeighbors.length > 0) {
          oxygenLinkedToCarbon = true;
          break;
        }
      }

      if (
        hydrogenBond ||
        (nonOxygenNeighbors.length === 1 && !oxygenLinkedToCarbon)
      ) {
        return [atom.id, oxygen.id];
      }
    }
    return [];
  }

  private findEsterPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for ALL carbonyl carbons (C=O) single-bonded to oxygen which is bonded to carbon
    const esters: number[] = [];

    if (process.env.VERBOSE) {
      console.log("[findEsterPattern] Starting search");
      console.log(`[findEsterPattern] Atoms count: ${atoms.length}`);
      console.log(`[findEsterPattern] Bonds count: ${bonds.length}`);
    }

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "C") continue;

      const doubleBondOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (!doubleBondOxygen) continue;

      if (process.env.VERBOSE) {
        console.log(`[findEsterPattern] Found C=O at atom ${atom.id}`);
      }

      const singleBondedOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (process.env.VERBOSE) {
        console.log(
          `[findEsterPattern] Single bonded O: ${singleBondedOxygen ? "found" : "not found"}`,
        );
      }

      if (singleBondedOxygen) {
        const oxygen = this.getBondedAtom(singleBondedOxygen, atom.id, atoms)!;
        const oxCarbonNeighbor = bonds.find(
          (b) =>
            (b.atom1 === oxygen.id || b.atom2 === oxygen.id) &&
            this.getBondedAtom(b, oxygen.id, atoms)?.symbol === "C" &&
            this.getBondedAtom(b, oxygen.id, atoms)?.id !== atom.id,
        );
        if (process.env.VERBOSE) {
          console.log(
            `[findEsterPattern] O-C neighbor: ${oxCarbonNeighbor ? "found" : "not found"}`,
          );
        }
        if (oxCarbonNeighbor) {
          const carbonylOxygen = this.getBondedAtom(
            doubleBondOxygen,
            atom.id,
            atoms,
          )!;
          if (process.env.VERBOSE) {
            console.log(
              `[findEsterPattern] ✓ ESTER FOUND: C=${atom.id}, O=${carbonylOxygen.id}, O=${oxygen.id}`,
            );
          }
          esters.push(atom.id, carbonylOxygen.id, oxygen.id);
        }
      }
    }
    return esters;
  }

  private findThioesterPattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for carbonyl carbons (C=O) single-bonded to sulfur: C(=O)-S-R
    // BUT NOT bonded to oxygen ester (C(=O)-S-R where there's also C(=O)-O would be an ester with sulfanyl substituent)
    const thioesters: number[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "C") continue;

      const doubleBondOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "double" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (!doubleBondOxygen) continue;

      const singleBondedSulfur = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "S",
      );

      if (!singleBondedSulfur) continue;

      // Check if there's also a single-bonded oxygen (ester linkage)
      // If so, this is NOT a thioester but an ester with sulfanyl substituent
      const singleBondedOxygen = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (singleBondedOxygen) {
        // This is C(=O)-S-R with C(=O)-O-R' -> ester with sulfanyl substituent
        continue;
      }

      // This is a true thioester: C(=O)-S-R (no oxygen ester linkage)
      const sulfur = this.getBondedAtom(singleBondedSulfur, atom.id, atoms)!;
      const carbonylOxygen = this.getBondedAtom(
        doubleBondOxygen,
        atom.id,
        atoms,
      )!;
      thioesters.push(atom.id, carbonylOxygen.id, sulfur.id);
    }
    return thioesters;
  }

  // Ring systems
  private findPyrrolidinePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[] {
    // N1CCC1 = azetidide = 4-membered saturated nitrogen ring
    // Must be exactly 4 atoms: 1 N + 3 C
    // Must be NON-aromatic (saturated)
    return this.findSpecificNitrogenRing(atoms, bonds, 4, false, rings);
  }

  private findPiperidinePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[] {
    // N1CCCC1 = piperidine = 5-membered saturated nitrogen ring
    // Must be exactly 5 atoms: 1 N + 4 C
    // Must be NON-aromatic (saturated)
    return this.findSpecificNitrogenRing(atoms, bonds, 5, false, rings);
  }

  private findPiperazinePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[] {
    // N1CCCCC1 = piperazine = 6-membered saturated nitrogen ring
    // Must be exactly 6 atoms: 1 N + 5 C
    // Must be NON-aromatic (saturated)
    return this.findSpecificNitrogenRing(atoms, bonds, 6, false, rings);
  }

  private findAnilinePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    rings?: readonly (readonly number[])[],
  ): number[] {
    // Look for nitrogen attached to aromatic ring, but NOT part of ANY ring itself
    // Aniline must be an exocyclic nitrogen attached to benzene
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "N") continue;

      // Skip nitrogen atoms that are part of ANY ring (aromatic or not)
      // This excludes heterocycles like pyridine, thiazoline, imidazole, etc.
      if (rings && rings.some((ring) => ring.includes(atom.id))) {
        continue;
      }

      // Also check using isInRing flag for safety
      if (atom.isInRing) {
        continue;
      }

      const aromaticCarbons = bonds.filter((bond) => {
        const bondedAtom = this.getBondedAtom(bond, atom.id, atoms);
        return bondedAtom?.symbol === "C" && bondedAtom.aromatic;
      });

      if (aromaticCarbons.length >= 1) {
        return [atom.id];
      }
    }
    return [];
  }

  private findCyanatePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for O-C≡N pattern
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "O") continue;

      const carbonBond = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "C",
      );

      if (carbonBond) {
        const carbon = this.getBondedAtom(carbonBond, atom.id, atoms)!;
        const tripleBond = bonds.find(
          (bond) =>
            (bond.atom1 === carbon.id || bond.atom2 === carbon.id) &&
            bond.type === "triple" &&
            this.getBondedAtom(bond, carbon.id, atoms)?.symbol === "N",
        );

        if (tripleBond) {
          const nitrogen = this.getBondedAtom(tripleBond, carbon.id, atoms)!;
          return [atom.id, carbon.id, nitrogen.id];
        }
      }
    }
    return [];
  }

  private findPeroxidePattern(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
  ): number[] {
    // Look for O-O single bond
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "O") continue;

      const ooBond = bonds.find(
        (bond) =>
          (bond.atom1 === atom.id || bond.atom2 === atom.id) &&
          bond.type === "single" &&
          this.getBondedAtom(bond, atom.id, atoms)?.symbol === "O",
      );

      if (ooBond) {
        const otherOxygen = this.getBondedAtom(ooBond, atom.id, atoms)!;
        return [atom.id, otherOxygen.id];
      }
    }
    return [];
  }

  private findSpecificNitrogenRing(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    ringSize: number,
    aromatic: boolean,
    rings?: readonly (readonly number[])[],
  ): number[] {
    // Detect nitrogen rings with specific size and aromaticity
    // This avoids false positives like detecting thiazole (5-membered aromatic) as azetidide (4-membered saturated)
    // or detecting azirine (3-membered) as azetidide (4-membered)
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (!atom || atom.symbol !== "N") continue;

      // Check if nitrogen is in a ring
      if (!atom.ringIds || atom.ringIds.length === 0) continue;

      // Check aromaticity
      if (aromatic && !atom.aromatic) continue;
      if (!aromatic && atom.aromatic) continue;

      // Check if any of the rings containing this nitrogen has the correct size
      if (rings && atom.ringIds) {
        for (const ringId of atom.ringIds) {
          const ring = rings[ringId];
          if (ring && ring.length === ringSize) {
            return [atom.id];
          }
        }
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
      case "Br":
        matches.push(
          ...atoms
            .filter((atom) => atom.symbol === "Br")
            .map((atom) => atom.id),
        );
        break;
      case "Cl":
        matches.push(
          ...atoms
            .filter((atom) => atom.symbol === "Cl")
            .map((atom) => atom.id),
        );
        break;
      case "F":
        matches.push(
          ...atoms.filter((atom) => atom.symbol === "F").map((atom) => atom.id),
        );
        break;
      case "I":
        matches.push(
          ...atoms.filter((atom) => atom.symbol === "I").map((atom) => atom.id),
        );
        break;
      case "O":
        // Filter out oxygen atoms that are part of rings (heterocycles like oxirane, furan)
        // Ring heteroatoms are already named as part of the ring structure
        matches.push(
          ...atoms
            .filter((atom) => {
              if (atom.symbol !== "O") return false;
              // Exclude oxygen atoms that are part of ANY ring (aliphatic or aromatic)
              if (atom.isInRing) {
                return false;
              }
              return true;
            })
            .map((atom) => atom.id),
        );
        break;
      case "S":
        // Filter out sulfur atoms that are part of rings (heterocycles like thiirane, thiophene)
        // Ring heteroatoms are already named as part of the ring structure
        matches.push(
          ...atoms
            .filter((atom) => {
              if (atom.symbol !== "S") return false;
              // Exclude sulfur atoms that are part of ANY ring (aliphatic or aromatic)
              if (atom.isInRing) {
                return false;
              }
              return true;
            })
            .map((atom) => atom.id),
        );
        break;
    }

    return matches;
  }

  private getBondedAtom(
    bond: Bond,
    atomId: number,
    atoms: readonly Atom[],
  ): Atom | undefined {
    const otherAtomId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
    return atoms.find((atom) => atom.id === otherAtomId);
  }

  /**
   * Get functional group priority following P-44.1
   */
  getFunctionalGroupPriority(type: string): number {
    // Look up in OPSIN rules
    const group = this.functionalGroups.get(type);
    if (group?.priority !== undefined) {
      return group.priority;
    }

    // No fallback - return high priority if not found
    return 999;
  }

  /**
   * Get functional group name for display
   */
  getFunctionalGroupName(type: string): string {
    const group = this.functionalGroups.get(type);
    return group?.name || type;
  }

  /**
   * Get suffix for name construction
   */
  getFunctionalGroupSuffix(type: string): string {
    const group = this.functionalGroups.get(type);
    return group?.suffix || "";
  }
}

// Temporary singleton for backward compatibility - will be removed

let _sharedDetector: OPSINFunctionalGroupDetector | null = null;

export function getSharedDetector(): OPSINFunctionalGroupDetector {
  if (!_sharedDetector) {
    _sharedDetector = new OPSINFunctionalGroupDetector();
  }
  return _sharedDetector;
}
