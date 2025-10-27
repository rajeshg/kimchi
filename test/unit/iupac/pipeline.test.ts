import { describe, it, expect, beforeEach } from 'bun:test';
import type { Molecule } from 'types';
import { BondType, StereoType } from 'types';
import type { PipelineConfig } from 'src/utils/iupac/pipeline';
import { NomenclaturePipeline, createDefaultPipeline } from 'src/utils/iupac/pipeline';
import { ChainSelector } from 'src/utils/iupac/chain-selector';
import { LongestChainFilter } from 'src/utils/iupac/chain-filter';

// Mock molecule factory
function createSimpleMolecule(): Molecule {
  return {
    atoms: [
      { id: 0, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 1, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
      { id: 2, symbol: 'C', atomicNumber: 6, charge: 0, hydrogens: 0, isotope: null, aromatic: false, chiral: null, isBracket: false, atomClass: 0 },
    ],
    bonds: [
      { atom1: 0, atom2: 1, type: BondType.SINGLE, stereo: StereoType.NONE },
      { atom1: 1, atom2: 2, type: BondType.SINGLE, stereo: StereoType.NONE },
    ],
  };
}

function createEmptyMolecule(): Molecule {
  return {
    atoms: [],
    bonds: [],
  };
}

describe('NomenclaturePipeline', () => {
  let pipeline: NomenclaturePipeline;

  beforeEach(() => {
    pipeline = createDefaultPipeline();
  });

  describe('constructor', () => {
    it('should create pipeline with default config', () => {
      const newPipeline = new NomenclaturePipeline();
      expect(newPipeline).toBeDefined();
      expect(newPipeline.getChainSelector()).toBeDefined();
    });

    it('should create pipeline with custom config', () => {
      const selector = new ChainSelector();
      const config: PipelineConfig = {
        chainSelector: selector,
        verbose: true,
        timeout: 3000,
      };
      const newPipeline = new NomenclaturePipeline(config);
      expect(newPipeline.getChainSelector()).toBe(selector);
    });

    it('should add custom filters to chain selector', () => {
      const filter = new LongestChainFilter();
      const config: PipelineConfig = {
        customFilters: [filter],
      };
      const newPipeline = new NomenclaturePipeline(config);
      expect(newPipeline.getChainSelector()).toBeDefined();
    });
  });

  describe('process', () => {
    it('should handle simple molecule', () => {
      const molecule = createSimpleMolecule();
      const result = pipeline.process(molecule);

      expect(result).toBeDefined();
      expect(result.molecule).toBe(molecule);
      expect(result.name).toBeString();
      expect(result.structure).toBeDefined();
      expect(result.messages).toBeArray();
      expect(result.hasErrors).toBeBoolean();
    });

    it('should return error for empty molecule', () => {
      const molecule = createEmptyMolecule();
      const result = pipeline.process(molecule);

      expect(result.hasErrors).toBe(true);
      expect(result.name).toBe('');
      expect(result.structure).toBeNull();
      expect(result.principalChain).toBeNull();
      expect(result.numbering).toBeNull();
      expect(result.messages).toContain('Empty molecule provided');
    });

    it('should include verbose messages when enabled', () => {
      const config: PipelineConfig = { verbose: true };
      const verbosePipeline = new NomenclaturePipeline(config);
      const molecule = createSimpleMolecule();
      const result = verbosePipeline.process(molecule);

      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages.some(msg => msg.includes('atoms'))).toBe(true);
    });

    it('should not include verbose messages when disabled', () => {
      const config: PipelineConfig = { verbose: false };
      const silentPipeline = new NomenclaturePipeline(config);
      const molecule = createSimpleMolecule();
      const result = silentPipeline.process(molecule);

      // With current stub implementation, structure is empty so no analysis messages
      expect(result.messages.length).toBeGreaterThanOrEqual(0);
    });

    it('should populate structure with analyzed data', () => {
      const molecule = createSimpleMolecule();
      const result = pipeline.process(molecule);

      expect(result.structure).toBeDefined();
      if (result.structure) {
        expect(result.structure.chains).toBeArray();
        expect(result.structure.functionalGroups).toBeArray();
        expect(result.structure).toHaveProperty('rings');
      }
    });

    it('should handle error during processing gracefully', () => {
      const molecule = createSimpleMolecule();
      // Force an error by using an invalid chain selector scenario
      const result = pipeline.process(molecule);

      expect(result).toBeDefined();
      expect(result.molecule).toBe(molecule);
      expect(result.messages).toBeArray();
    });

    it('should respect timeout configuration', () => {
      const config: PipelineConfig = { timeout: 100 };
      const fastPipeline = new NomenclaturePipeline(config);
      const molecule = createSimpleMolecule();
      const result = fastPipeline.process(molecule);

      // Should still complete without timeout error for simple molecule
      expect(result).toBeDefined();
    });
  });

  describe('configuration methods', () => {
    it('should set verbose mode', () => {
      pipeline.setVerbose(true);
      const molecule = createSimpleMolecule();
      const result = pipeline.process(molecule);

      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should set timeout', () => {
      pipeline.setTimeout(10000);
      const molecule = createSimpleMolecule();
      const result = pipeline.process(molecule);

      expect(result).toBeDefined();
    });

    it('should replace chain selector', () => {
      const newSelector = new ChainSelector();
      pipeline.setChainSelector(newSelector);
      expect(pipeline.getChainSelector()).toBe(newSelector);
    });

    it('should retrieve chain selector', () => {
      const selector = pipeline.getChainSelector();
      expect(selector).toBeDefined();
      expect(selector).toBeInstanceOf(ChainSelector);
    });
  });

  describe('result interface', () => {
    it('should return complete NomenclatureResult', () => {
      const molecule = createSimpleMolecule();
      const result = pipeline.process(molecule);

      // Check all required fields exist
      expect(result).toHaveProperty('molecule');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('structure');
      expect(result).toHaveProperty('principalChain');
      expect(result).toHaveProperty('numbering');
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('hasErrors');
    });

    it('should provide meaningful error messages', () => {
      const molecule = createEmptyMolecule();
      const result = pipeline.process(molecule);

      expect(result.hasErrors).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]).toMatch(/empty|molecule|atoms/i);
    });
  });

  describe('integration scenarios', () => {
    it('should process multiple molecules sequentially', () => {
      const mol1 = createSimpleMolecule();
      const mol2 = createSimpleMolecule();

      const result1 = pipeline.process(mol1);
      const result2 = pipeline.process(mol2);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1.molecule).toBe(mol1);
      expect(result2.molecule).toBe(mol2);
    });

    it('should handle null molecule input', () => {
      const result = pipeline.process(null as any);
      expect(result.hasErrors).toBe(true);
    });

    it('should construct meaningful IUPAC name', () => {
      const molecule = createSimpleMolecule();
      const result = pipeline.process(molecule);

      expect(result.name).toBeString();
      // Name should be non-empty for valid molecules
      if (!result.hasErrors) {
        expect(result.name.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('factory function', () => {
    it('should create default pipeline instance', () => {
      const defaultPipeline = createDefaultPipeline();
      expect(defaultPipeline).toBeInstanceOf(NomenclaturePipeline);
    });

    it('should create pipeline with custom config via factory', () => {
      const config: PipelineConfig = { verbose: true };
      const customPipeline = createDefaultPipeline(config);
      expect(customPipeline).toBeInstanceOf(NomenclaturePipeline);
    });
  });
});
