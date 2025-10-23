export interface InchiOptions {
  wasmUrl?: string;
  nodeAdapterPkg?: string;
}

// Browser/WASM loader stub
// If a user provides a wasmUrl, they can implement a loader that fetches
// and instantiates the InChI WebAssembly runtime. For now, this stub throws
// a helpful error if used directly so consumers know to provide a real wasm
// runtime in browser environments.

export async function initBrowserInchi(_opts: InchiOptions = {}) {
  throw new Error(
    'Browser InChI loader not implemented. Provide a WebAssembly runtime via `wasmUrl` and a browser adapter.'
  );
}
