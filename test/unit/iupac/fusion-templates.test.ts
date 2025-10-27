import { describe, test, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { findMatchingFusionTemplate, parseFusionTemplate, FUSION_TEMPLATES } from '../../../src/utils/iupac/iupac-rings/fusion-templates';

describe('Fusion Templates', () => {
  test('should find naphthalene template', () => {
    const result = parseSMILES('c1cccc2ccccc12');
    const molecule = result.molecules[0];
    expect(molecule).toBeDefined();
    // For naphthalene, rings are [0,1,2,3,4,9] and [4,5,6,7,8,9]
    const fusedSystem = { rings: [[0,1,2,3,4,9], [4,5,6,7,8,9]] };

    const template = findMatchingFusionTemplate(fusedSystem, molecule!);
    expect(template?.name).toBe('naphthaleno');
  });

  test('should parse fusion template', () => {
    const template = FUSION_TEMPLATES.find(t => t.name === 'naphthaleno');
    expect(template).toBeDefined();

    const parsed = parseFusionTemplate(template!);
    expect(parsed).toBeDefined();
    expect(parsed!.locantMap.size).toBeGreaterThan(0);
  });
});