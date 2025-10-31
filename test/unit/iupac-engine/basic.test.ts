/**
 * Basic tests for the IUPAC rule engine
 */

import { describe, test, expect } from 'bun:test';
import { IUPACNamer } from '../../../src/iupac-engine/../../src/iupac-engine/index';

describe('IUPAC Rule Engine', () => {
  test('should create and initialize the engine', () => {
    const namer = new IUPACNamer();
    
    expect(namer).toBeDefined();
    expect(namer.getSupportedRules()).toBeDefined();
    expect(namer.getLayers()).toBeDefined();
  });
});