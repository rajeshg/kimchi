export interface MatchComparisonResult {
  equal: boolean;
  message?: string;
}

export function normalizeMatches(matches: number[][]): number[][] {
  return matches
    .map(match => [...match].sort((a, b) => a - b))
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i]! !== b[i]!) return a[i]! - b[i]!;
      }
      return a.length - b.length;
    });
}

export function compareMatches(
  opencodeMatches: number[][],
  rdkitMatches: number[][]
): MatchComparisonResult {
  const ckNorm = normalizeMatches(opencodeMatches);
  const rdNorm = normalizeMatches(rdkitMatches);

  if (ckNorm.length !== rdNorm.length) {
    return {
      equal: false,
      message: `Match count mismatch: opencode=${ckNorm.length} rdkit=${rdNorm.length}`,
    };
  }

  for (let i = 0; i < ckNorm.length; i++) {
    const ckMatch = ckNorm[i]!;
    const rdMatch = rdNorm[i]!;
    if (ckMatch.length !== rdMatch.length) {
      return {
        equal: false,
        message: `Match ${i} length mismatch: opencode=${ckMatch.length} rdkit=${rdMatch.length}`,
      };
    }
    for (let j = 0; j < ckMatch.length; j++) {
      if (ckMatch[j] !== rdMatch[j]) {
        return {
          equal: false,
          message: `Match ${i} atom ${j} mismatch: opencode=${ckMatch[j]} rdkit=${rdMatch[j]}`,
        };
      }
    }
  }

  return { equal: true };
}

export function formatMatchDiff(
  opencode: number[][],
  rdkit: number[][],
  pattern: string,
  smiles: string
): string {
  const lines: string[] = [];
  lines.push(`Pattern: ${pattern}`);
  lines.push(`Molecule: ${smiles}`);
  lines.push(`opencode matches (${opencode.length}): ${JSON.stringify(normalizeMatches(opencode))}`);
  lines.push(`RDKit matches (${rdkit.length}): ${JSON.stringify(normalizeMatches(rdkit))}`);
  return lines.join('\n');
}

export function assertMatchesEqual(
  opencodeMatches: number[][],
  rdkitMatches: number[][],
  pattern: string,
  smiles: string
): void {
  const result = compareMatches(opencodeMatches, rdkitMatches);
  if (!result.equal) {
    const diff = formatMatchDiff(opencodeMatches, rdkitMatches, pattern, smiles);
    throw new Error(`${result.message}\n${diff}`);
  }
}
