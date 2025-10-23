import type { InchiAPI, InchiOptions } from './types';

let inchiModule: any | null = null;
let initialized = false;

async function loadNodeAdapter(pkgName = 'inchi-node', opts?: InchiOptions) {
  // Try dynamic import first (ESM)
  try {
    // Some builds expose a default export or named API; return as-is
    const mod = await import(pkgName);
    return mod;
  } catch (err) {
    // Fallback to require via createRequire for compatibility
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createRequire } = await import('module');
      const req = createRequire(import.meta.url);
      // If forcing a reload, try to remove the module from Node's require cache (CJS only)
      try {
        // Resolve the package path using the created require
        // @ts-ignore - Module types are not needed here
        const resolvedPath = req.resolve(pkgName);
        if (opts?.force) {
          try {
            // Try to access the global CJS require cache first (works in Node CJS contexts)
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const globalRequire = eval('require');
            if (globalRequire && globalRequire.cache && globalRequire.cache[resolvedPath]) {
              delete globalRequire.cache[resolvedPath];
            }
          } catch (e) {
            // Fallback to Module._cache if global require isn't available
            try {
              const modModule = await import('module');
              const ModuleCtor = (modModule as any).Module;
              if (ModuleCtor && ModuleCtor._cache && ModuleCtor._cache[resolvedPath]) {
                delete ModuleCtor._cache[resolvedPath];
              }
            } catch (e2) {
              // ignore — best-effort
            }
          }
        }
      } catch (clearErr) {
        // If cache clearing fails, continue — it's a best-effort step for tests
      }
      // This may throw if package is not installed
      // @ts-ignore
      const mod = req(pkgName);
      return mod;
    } catch (err2) {
      throw new Error(`Failed to load Node adapter package '${pkgName}'. Please install it (e.g. 'npm i -S ${pkgName}') and ensure your bundler allows dynamic requires. Original errors: ${err} , ${err2}`);
    }
  }
}

async function init(opts?: InchiOptions): Promise<void> {
  // If already initialized and not forcing, skip
  if (initialized && !opts?.force) return;
  // If forcing re-initialization, clear previous module state so we reload
  if (opts?.force) {
    inchiModule = null;
    initialized = false;
  }
  const nodePkg = opts?.nodeAdapterPkg ?? 'inchi-node';
  try {
    inchiModule = await loadNodeAdapter(nodePkg, opts);
    // inchi-node often exports functions like InchiFromMolfile and InchiToInchiKey
    initialized = true;
  } catch (err) {
    // If node adapter fails, try to give helpful guidance for browser WASM usage
    const msg = `Could not load inchi runtime. Install the recommended runtime (e.g. 'npm i -S inchi-node' for Node) or provide 'wasmUrl' for browser WASM loading. Error: ${String(err)}`;
    throw new Error(msg);
  }
}

async function getInchiFromMolfile(molfile: string): Promise<string> {
  if (!initialized) {
    await init();
  }
  if (!inchiModule) throw new Error('InChI runtime not initialized');
  // Common exports: InChIFromMolfile (sync) or inchi.InchiFromMolfile
  const fn = inchiModule.InchiFromMolfile ?? inchiModule.getInchiFromMolfile ?? inchiModule.default?.InchiFromMolfile ?? inchiModule.default?.getInchiFromMolfile;
  if (!fn) {
    throw new Error('Loaded inchi module does not expose InchiFromMolfile. Check the adapter package API.');
  }
  // Some adapters return string synchronously, some return {inchi: '...', aux: '...'}
  const res = await Promise.resolve(fn(molfile));
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object') return res.inchi ?? res.InChI ?? res.value ?? JSON.stringify(res);
  return String(res);
}

async function getInchiKeyFromInchi(inchi: string): Promise<string> {
  if (!initialized) await init();
  if (!inchiModule) throw new Error('InChI runtime not initialized');
  const fn = inchiModule.InchiKeyFromInchi ?? inchiModule.getInchiKeyFromInchi ?? inchiModule.default?.InchiKeyFromInchi ?? inchiModule.default?.getInchiKeyFromInchi;
  if (!fn) {
    // Some adapters only expose a function that computes both InChI and InChIKey from molfile.
    // Try to derive Key via helper if present
    const helper = inchiModule.computeInchiKey ?? inchiModule.getInchiKey ?? inchiModule.default?.computeInchiKey;
    if (!helper) throw new Error('Loaded inchi module does not expose InChIKey generation API.');
    const out = await Promise.resolve(helper(inchi));
    return String(out);
  }
  const res = await Promise.resolve(fn(inchi));
  return String(res);
}

export const api: InchiAPI = {
  init,
  getInchiFromMolfile,
  getInchiKeyFromInchi,
};

export default api;


