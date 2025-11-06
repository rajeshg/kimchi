import type { Molecule } from "types";
import { generateMolfile } from "./mol-generator";

interface InChIGeneratorOptions {
  options?: string; // InChI generation options (e.g., "/FixedH /SUU")
}

let inchiWasm: {
  molfileToInChI: (molfile: string, options?: string) => string;
  inchiToInChIKey: (inchi: string) => string;
} | null = null;

let initPromise: Promise<void> | null = null;

const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis;

async function initializeInChIWasm(): Promise<void> {
  if (inchiWasm) return;
  if (initPromise) return initPromise;

  initPromise = doInitializeInChIWasm();
  return initPromise;
}

async function doInitializeInChIWasm(): Promise<void> {
  const inputMaxBytes = 0x8000;
  const optionsMaxBytes = 0x1000;
  const outputMaxBytes = 0x4000;
  const memory = new WebAssembly.Memory({ initial: 10 });

  let instance: WebAssembly.Instance;

  if (isBrowser) {
    // Browser: Use fetch with absolute path from document root
    const wasmPath = "/dist/third-party/inchi-wasm/inchi_wasm.wasm";
    const response = await fetch(wasmPath);
    const bytes = await response.arrayBuffer();
    const wasiModule =
      (await import("../third-party/inchi-wasm/wasi.esm.js")) as unknown;
    // @ts-ignore
    const wasi = new wasiModule.default();
    // @ts-ignore
    ({ instance } = await WebAssembly.instantiate(bytes, {
      env: { memory },
      wasi_snapshot_preview1: wasi.wasiImport,
    }));
  } else {
    // Node/Bun: Use fs and WASI
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const wasiModule =
      (await import("../third-party/inchi-wasm/wasi.esm.js")) as unknown;
    // @ts-ignore
    const WASI = wasiModule.default;

    const wasmPath = join(
      process.cwd(),
      "src/third-party/inchi-wasm/inchi_wasm.wasm",
    );
    const wasmBuffer = readFileSync(wasmPath);
    // @ts-ignore
    const wasi = new WASI();
    // @ts-ignore
    ({ instance } = await WebAssembly.instantiate(wasmBuffer, {
      env: { memory },
      wasi_snapshot_preview1: wasi.wasiImport,
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pInput = (instance.exports as any).malloc(inputMaxBytes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pOptions = (instance.exports as any).malloc(optionsMaxBytes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pOutput = (instance.exports as any).malloc(outputMaxBytes);

  const molfileToInChI = (molfile: string, options: string = ""): string => {
    if (molfile.length + 1 > inputMaxBytes) {
      throw new Error(`MOL file too large: ${molfile.length} bytes`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const inputView = new Uint8Array(memory.buffer);
    inputView.set(encoder.encode(molfile + "\0"), pInput);
    inputView.set(encoder.encode(options + "\0"), pOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (instance.exports as any).molfile_to_inchi(
      pInput,
      pOptions,
      pOutput,
    );
    const outputView = new Uint8Array(
      memory.buffer.slice(pOutput, pOutput + outputMaxBytes),
    );
    const o = outputView.subarray(0, outputView.indexOf(0));
    const output = decoder.decode(o);

    if (result === -1) {
      throw new Error(output);
    }

    return output;
  };

  const inchiToInChIKey = (inchi: string): string => {
    const inputView = new Uint8Array(memory.buffer);
    inputView.set(new TextEncoder().encode(inchi + "\0"), pInput);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (instance.exports as any).inchi_to_inchikey(pInput, pOutput);
    const outputView = new Uint8Array(
      memory.buffer.slice(pOutput, pOutput + outputMaxBytes),
    );

    if (result !== 0) {
      throw new Error("Failed to generate InChIKey");
    }

    return new TextDecoder().decode(
      outputView.subarray(0, outputView.indexOf(0)),
    );
  };

  inchiWasm = { molfileToInChI, inchiToInChIKey };
}

export async function generateInChI(
  molecule: Molecule,
  options?: InChIGeneratorOptions,
): Promise<string> {
  await initializeInChIWasm();
  if (!inchiWasm) throw new Error("InChI WASM not initialized");

  const molfile = generateMolfile(molecule);
  return inchiWasm.molfileToInChI(molfile, options?.options);
}

export async function generateInChIKey(inchi: string): Promise<string> {
  await initializeInChIWasm();
  if (!inchiWasm) throw new Error("InChI WASM not initialized");

  return inchiWasm.inchiToInChIKey(inchi);
}
