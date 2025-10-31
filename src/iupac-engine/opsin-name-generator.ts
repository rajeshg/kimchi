import type { Molecule } from '../../types';
import fs from 'fs';
import { OPSINFunctionalGroupDetector } from './opsin-functional-group-detector';

/**
 * OPSIN-based Name Generator for IUPAC Engine
 * 
 * Uses the comprehensive naming rules from opsin-rules.json
 * to generate accurate IUPAC names.
 */
export class OPSINNameGenerator {
  private rules: any;
  private fgDetector: OPSINFunctionalGroupDetector;
  
  constructor() {
    this.fgDetector = new OPSINFunctionalGroupDetector();
    this.loadOPSINRules();
  }
  
  private loadOPSINRules(): void {
    try {
      const rulesPath = `${import.meta.dir}/../../opsin-rules.json`;
      const rulesData = fs.readFileSync(rulesPath, 'utf8');
      this.rules = JSON.parse(rulesData);
    } catch (error) {
      console.warn('Could not load OPSIN rules, using fallback naming');
      this.rules = this.getFallbackRules();
    }
  }
  
  private getFallbackRules(): any {
    return {
      alkanes: {
        "C": "meth",
        "CC": "eth", 
        "CCC": "prop",
        "CCCC": "but",
        "CCCCC": "pent",
        "CCCCCC": "hex",
        "CCCCCCC": "hept",
        "CCCCCCCC": "oct",
        "CCCCCCCCC": "non",
        "CCCCCCCCCC": "dec"
      }
    };
  }
  
  /**
   * Generate IUPAC name for a molecule
   */
  generateName(molecule: Molecule): string {
    // Detect functional groups using comprehensive OPSIN detector
    const functionalGroups = this.fgDetector.detectFunctionalGroups(molecule);
    
    if (functionalGroups.length > 0) {
      // Primary functional group determines the name
      const primaryGroup = this.selectPrimaryFunctionalGroup(functionalGroups);
      return this.buildFunctionalGroupName(molecule, primaryGroup);
    }
    
    // No functional groups - build alkane name
    return this.buildAlkaneName(molecule);
  }
  
  /**
   * Get detected functional groups for external use
   */
  getFunctionalGroups(molecule: Molecule): Array<{type: string, name: string, suffix: string, priority: number, atoms: number[], pattern: string}> {
    return this.fgDetector.detectFunctionalGroups(molecule);
  }
  
  /**
   * Select the primary functional group based on OPSIN priority
   */
  private selectPrimaryFunctionalGroup(groups: Array<{type: string, name: string, suffix: string, priority: number}>): {type: string, name: string, suffix: string, priority: number} {
    return groups.reduce((primary, current) => 
      current.priority < primary.priority ? current : primary
    );
  }
  
  /**
   * Build name based on functional group
   */
  private buildFunctionalGroupName(molecule: Molecule, group: {type: string, name: string, suffix: string, priority: number}): string {
    const carbonCount = molecule.atoms.filter(a => a.symbol === 'C').length;
    
    switch (group.type) {
      case 'C(=O)[OX2H1]': // Carboxylic acid
        return this.buildCarboxylicAcidName(carbonCount);
        
      case '[OX2H]': // Alcohol
        return this.buildAlcoholName(carbonCount);
        
      case '[CX3](=O)[CX4]': // Ketone
        return this.buildKetoneName(carbonCount);
        
      case '[NX3][CX4]': // Amine
        return this.buildAmineName(carbonCount);
        
      case 'C#N': // Nitrile
        return this.buildNitrileName(carbonCount);
        
      default:
        return this.buildAlkaneName(molecule) + (group.suffix || '');
    }
  }
  
  private buildCarboxylicAcidName(carbonCount: number): string {
    if (carbonCount === 1) return 'methanoic acid';
    if (carbonCount === 2) return 'ethanoic acid';
    if (carbonCount === 3) return 'propanoic acid';
    if (carbonCount === 4) return 'butanoic acid';
    if (carbonCount === 5) return 'pentanoic acid';
    
    const stem = this.buildAlkaneStem(carbonCount);
    return `${stem}oic acid`;
  }
  
  private buildAlcoholName(carbonCount: number): string {
    if (carbonCount === 1) return 'methanol';
    if (carbonCount === 2) return 'ethanol';
    if (carbonCount === 3) return 'propanol';
    if (carbonCount === 4) return 'butanol';
    if (carbonCount === 5) return 'pentanol';
    
    const stem = this.buildAlkaneStem(carbonCount);
    return `${stem}ol`;
  }
  
  private buildKetoneName(carbonCount: number): string {
    if (carbonCount === 3) return 'propanone';
    if (carbonCount === 4) return 'butanone';
    if (carbonCount === 5) return 'pentanone';
    
    const stem = this.buildAlkaneStem(carbonCount);
    return `${stem}one`;
  }
  
  private buildAmineName(carbonCount: number): string {
    if (carbonCount === 1) return 'methanamine';
    if (carbonCount === 2) return 'ethanamine';
    if (carbonCount === 3) return 'propanamine';
    if (carbonCount === 4) return 'butanamine';
    if (carbonCount === 5) return 'pentanamine';
    
    const stem = this.buildAlkaneStem(carbonCount);
    return `${stem}amine`;
  }
  
  private buildNitrileName(carbonCount: number): string {
    if (carbonCount === 1) return 'methanenitrile';
    if (carbonCount === 2) return 'ethanenitrile';
    if (carbonCount === 3) return 'propanenitrile';
    if (carbonCount === 4) return 'butanenitrile';
    if (carbonCount === 5) return 'pentanenitrile';
    
    const stem = this.buildAlkaneStem(carbonCount);
    return `${stem}enitrile`;
  }
  
  private buildAlkaneName(molecule: Molecule): string {
    const carbonCount = molecule.atoms.filter(a => a.symbol === 'C').length;
    
    if (carbonCount === 1) return 'methane';
    if (carbonCount === 2) return 'ethane';
    if (carbonCount === 3) return 'propane';
    if (carbonCount === 4) return 'butane';
    if (carbonCount === 5) return 'pentane';
    if (carbonCount === 6) return 'hexane';
    if (carbonCount === 7) return 'heptane';
    if (carbonCount === 8) return 'octane';
    
    const stem = this.buildAlkaneStem(carbonCount);
    return `${stem}ane`;
  }
  
  private buildAlkaneStem(carbonCount: number): string {
    if (!this.rules.alkanes) {
      // Fallback stem building
      if (carbonCount <= 10) {
        const names = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
        return names[carbonCount] || `C${carbonCount}`;
      }
      return `C${carbonCount}`;
    }
    
    // Build carbon chain string for lookup
    const carbonChain = 'C'.repeat(carbonCount);
    
    if (this.rules.alkanes[carbonChain]) {
      return this.rules.alkanes[carbonChain];
    }
    
    // Fallback for larger chains
    if (carbonCount <= 20) {
      const multipliers = this.rules.multipliers?.basic || {};
      const units = Math.floor(carbonCount / 10);
      const remainder = carbonCount % 10;
      
      let stem = '';
      if (units > 0) {
        stem += multipliers[units.toString()] || `${units}`;
      }
      if (remainder > 0) {
        stem += multipliers[remainder.toString()] || `${remainder}`;
      }
      
      return stem || `C${carbonCount}`;
    }
    
    return `C${carbonCount}`;
  }
}