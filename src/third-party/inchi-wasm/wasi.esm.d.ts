interface WasiInstance {
  wasiImport: Record<string, unknown>;
}

export class WASI {
  constructor();
  wasiImport: Record<string, unknown>;
}

export default WASI;
