import { describe, it, expect } from 'bun:test';
import { api } from '../src/index';

// Resolve the mock runtime path relative to this test file (absolute path)
const mockPkgPath = new URL('../build/mock-runtime.cjs', import.meta.url).pathname;

describe('inchi wrapper adapter loading and normalization', () => {
  it('initializes with mock adapter and returns string InChI', async () => {
    // Initialize with nodeAdapterPkg pointing to the mock CJS module
    // Use force: true to ensure clean state in full test suite
    if (api.init) {
      await api.init({ nodeAdapterPkg: mockPkgPath, force: true });
    } else {
      throw new Error('api.init is not defined on adapter API');
    }
    const mol = await Bun.file(new URL('./fixtures/ethanol.mol', import.meta.url)).text();
    const res = await api.getInchiFromMolfile(mol);
    expect(res.startsWith('MOCK-INCHI-STRING:')).toBe(true);
  });

  it('handles default.getInchiFromMolfile which returns object shape', async () => {
    // The mock runtime's default.getInchiFromMolfile returns an object shape
    if (api.init) {
      await api.init({ nodeAdapterPkg: mockPkgPath, force: true });
    } else {
      throw new Error('api.init is not defined on adapter API');
    }
    const mol = await Bun.file(new URL('./fixtures/benzene.mol', import.meta.url)).text();
    const res = await api.getInchiFromMolfile(mol);
    // The wrapper should normalize object responses to the inchi string
    expect(res.includes('MOCK-INCHI-')).toBe(true);
  });

  it('generates InChIKey using InchiKeyFromInchi or helper', async () => {
    if (api.init) {
      await api.init({ nodeAdapterPkg: mockPkgPath, force: true });
    } else {
      throw new Error('api.init is not defined on adapter API');
    }
    const key = await api.getInchiKeyFromInchi('dummy-inchi-string');
    expect(key.startsWith('MOCK-INCHIKEY:') || key.startsWith('MOCK-KEY-HELPER:')).toBe(true);
  });

  it('throws helpful error when adapter missing functions', async () => {
    // Create a temporary broken mock file in fixtures
    const brokenMockUrl = new URL('./fixtures/broken-mock.cjs', import.meta.url);
    const brokenMockPath = brokenMockUrl.pathname;
    await Bun.write(brokenMockPath, "module.exports = { someOther: () => {} }\n");

    // Force re-initialization so the next init will attempt to reload the broken mock
    if (api.init) {
      await api.init({ nodeAdapterPkg: brokenMockPath, force: true });
    } else {
      throw new Error('api.init is not defined on adapter API');
    }

    let threw = false;
    try {
      if (api.init) {
        await api.init({ nodeAdapterPkg: brokenMockPath });
      } else {
        throw new Error('api.init is not defined on adapter API');
      }
      await api.getInchiFromMolfile('C');
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/does not expose InchiFromMolfile/);
    }
    expect(threw).toBe(true);
  });
});
