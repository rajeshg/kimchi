export interface InchiOptions {
  /** Optional URL to the inchi.js WASM or path to inchi-node adapter */
  wasmUrl?: string;
  /** Optional path to node adapter package (e.g. require('inchi-node')) */
  nodeAdapterPkg?: string;
  /** When true, force reinitialization of the runtime (useful for tests) */
  force?: boolean;
}

export interface InchiAPI {
  init?: (opts?: InchiOptions) => Promise<void>;
  getInchiFromMolfile: (molfile: string) => Promise<string>;
  getInchiKeyFromInchi: (inchi: string) => Promise<string>;
}
