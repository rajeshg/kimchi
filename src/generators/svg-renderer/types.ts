export type AtomCoordinates = { x: number; y: number };

export interface SVGRendererOptions {
  width?: number;
  height?: number;
  bondLineWidth?: number;
  bondLength?: number;
  fontSize?: number;
  fontFamily?: string;
  padding?: number;
  showCarbonLabels?: boolean;
  showImplicitHydrogens?: boolean;
  kekulize?: boolean;
  atomColors?: Record<string, string>;
  backgroundColor?: string;
  bondColor?: string;
  showStereoBonds?: boolean;
  atomCoordinates?: Array<[number, number]> | AtomCoordinates[];
  webcolaIterations?: number;
  deterministicChainPlacement?: boolean;
  deterministicChainLength?: number;
  moleculeSpacing?: number;
}

export interface SVGRenderResult {
  svg: string;
  width: number;
  height: number;
  errors: string[];
}

export const DEFAULT_COLORS: Record<string, string> = {
  C: "#222",
  N: "#3050F8",
  O: "#FF0D0D",
  S: "#E6C200",
  F: "#50FF50",
  Cl: "#1FF01F",
  Br: "#A62929",
  I: "#940094",
  P: "#FF8000",
  H: "#AAAAAA",
  B: "#FFB5B5",
  Si: "#F0C8A0",
  default: "#222",
};
