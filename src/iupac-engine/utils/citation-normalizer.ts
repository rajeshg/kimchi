import { readFileSync } from "fs";
import * as path from "path";

type OpsinRules = any;

let cachedRules: OpsinRules | null = null;
let aliasMap: Map<string, string> | null = null;

function loadRules(): OpsinRules {
  if (cachedRules) return cachedRules;
  const rulesPath = path.resolve(__dirname, "../../../opsin-rules.json");
  let json: OpsinRules = {} as OpsinRules;
  try {
    json = JSON.parse(readFileSync(rulesPath, "utf8"));
  } catch (e) {
    // If OPSIN rules file is not present (e.g., in certain test environments),
    // fall back to empty rules — alias map will still include builtin tokens.
    json = {} as OpsinRules;
  }
  cachedRules = json;
  return json;
}

function buildAliasMap(): Map<string, string> {
  if (aliasMap) return aliasMap;
  const rules = loadRules();
  const map = new Map<string, string>();

  // Map canonical substituent keys and their aliases to a canonical citation token
  if (rules && rules.substituents) {
    for (const [canonical, data] of Object.entries(rules.substituents)) {
      const canonicalToken = normalizeToken(canonical);
      map.set(canonicalToken, canonicalToken);
      const aliases: string[] = (data as any).aliases || [];
      for (const a of aliases) {
        const t = normalizeToken(a);
        if (t) map.set(t, canonicalToken);
      }
    }
  }

  // Also include a small built-in map for very common prefixes if opsin data missing
  const builtin = [
    "methyl",
    "ethyl",
    "propyl",
    "butyl",
    "hydroxy",
    "oxo",
    "amino",
    "chloro",
    "bromo",
    "fluoro",
    "nitro",
  ];
  for (const b of builtin) {
    const t = normalizeToken(b);
    if (!map.has(t)) map.set(t, t);
  }

  aliasMap = map;
  return map;
}

function normalizeToken(input: string | undefined): string {
  if (!input) return "";
  let s = input.toLowerCase();
  // Remove digits, commas and parentheses but keep hyphens for qualifier detection
  s = s.replace(/[0-9,()]/g, "");
  // Trim surrounding whitespace
  s = s.replace(/^\s+|\s+$/g, "");
  // Remove leading hyphens left after digit/comma removal
  s = s.replace(/^[-\s]+/, "");
  // Remove known citation qualifiers only when followed by hyphen/space
  s = s.replace(/^(sec|tert|iso|neo|exo|endo|n|t)[-\s]+/i, "");
  // Remove multiplicative prefixes at start (allow optional hyphen)
  s = s.replace(/^(di|tri|tetra|penta|hexa|hepta|octa|nona|deca)[-\s]*/i, "");
  // Finally strip any remaining non-letter characters (including hyphens)
  s = s.replace(/[^a-z]/g, "");
  return s;
}

/**
 * Normalize a citation token using OPSIN data when available.
 * This removes locants, multiplicative prefixes, and maps aliases to canonical tokens.
 */
export function normalizeCitationName(raw: string | undefined): string {
  const token = normalizeToken(raw);
  if (!token) return "";
  const map = buildAliasMap();
  return map.get(token) || token;
}

/**
 * Given an array of raw citation names (possibly with multiplicative prefixes/locants),
 * return the canonical tokens in order.
 */
export function canonicalizeCitationList(
  raws: (string | undefined)[],
): string[] {
  return raws.map((r) => normalizeCitationName(r)).filter(Boolean);
}

/**
 * Locale-aware compare of two token arrays (element-wise). Shorter array wins on tie.
 */
export function compareCitationArrays(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ai = a[i] || "";
    const bi = b[i] || "";
    const cmp = ai.localeCompare(bi);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

// For debugging/testing
export function _getAliasMap(): Map<string, string> {
  return buildAliasMap();
}
