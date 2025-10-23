import { describe, it, expect } from 'bun:test';
import { api } from '../src/index';
import { createTempCjsAdapter } from './utils/temp-adapter';
import { promises as fs } from 'fs';
import path from 'path';

describe('inchi adapter reload behavior', () => {
  it('reloads a rewritten CJS adapter when init is called with force', async () => {
    const molPath = new URL('./fixtures/ethanol.mol', import.meta.url).pathname;
    const mol = await fs.readFile(molPath, 'utf8');

    // Create first temp adapter
    const content1 = "module.exports = { InchiFromMolfile: (mol) => 'MOCK-RELOAD-1:' + String(mol).slice(0,10) }\n";
    const { filePath: tempMockPath1, cleanup: cleanup1 } = await createTempCjsAdapter(content1, 'inchi-reload-');

    // Initialize with force to ensure a fresh load
    if (api.init) {
      await api.init({ nodeAdapterPkg: tempMockPath1, force: true });
    } else {
      throw new Error('api.init is not defined on adapter API');
    }
    const res1 = await api.getInchiFromMolfile(mol);
    expect(typeof res1 === 'string' && res1.startsWith('MOCK-RELOAD-1')).toBe(true);

    // Create second temp adapter with different behavior
    const content2 = "module.exports = { InchiFromMolfile: (mol) => 'MOCK-RELOAD-2:' + String(mol).slice(0,10) }\n";
    const { filePath: tempMockPath2, cleanup: cleanup2 } = await createTempCjsAdapter(content2, 'inchi-reload-');

    // Re-init with force and point to the second file
    if (api.init) {
      await api.init({ nodeAdapterPkg: tempMockPath2, force: true });
    } else {
      throw new Error('api.init is not defined on adapter API');
    }
    const res2 = await api.getInchiFromMolfile(mol);
    expect(typeof res2 === 'string' && res2.startsWith('MOCK-RELOAD-2')).toBe(true);

    // Cleanup temp dirs
    await cleanup1();
    await cleanup2();
  });
});
