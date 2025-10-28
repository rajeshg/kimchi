export interface TautomerRule {
  id: string;
  name?: string;
  priority?: number;
  phase?: number;
  group?: string;
  smarts_match?: string;
  smarts_replace?: string;
  smarts?: string;
  description?: string;
  notes?: string;
  examples?: Record<string, string>;
}

export interface TautomerRulesFile {
  meta?: {
    source?: string;
    description?: string;
    version?: string;
  };
  rules: TautomerRule[];
}

import rulesJson from './tautomer-rules.json';

const loaded = (rulesJson as unknown) as TautomerRulesFile;

// Normalize and ensure phase defaults to 1
export const tautomerRules: TautomerRule[] = (loaded.rules || []).map(r => ({ ...r, phase: r.phase ?? 1 }));

export default tautomerRules;
