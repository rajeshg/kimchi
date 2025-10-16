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
  chemkitMatches: number[][],
  rdkitMatches: number[][]
): MatchComparisonResult {
  const ckNorm = normalizeMatches(chemkitMatches);
  const rdNorm = normalizeMatches(rdkitMatches);

  if (ckNorm.length !== rdNorm.length) {
    return {
      equal: false,
      message: `Match count mismatch: chemkit=${ckNorm.length} rdkit=${rdNorm.length}`,
    };
  }

  for (let i = 0; i < ckNorm.length; i++) {
    const ckMatch = ckNorm[i]!;
    const rdMatch = rdNorm[i]!;
    if (ckMatch.length !== rdMatch.length) {
      return {
        equal: false,
        message: `Match ${i} length mismatch: chemkit=${ckMatch.length} rdkit=${rdMatch.length}`,
      };
    }
    for (let j = 0; j < ckMatch.length; j++) {
      if (ckMatch[j] !== rdMatch[j]) {
        return {
          equal: false,
          message: `Match ${i} atom ${j} mismatch: chemkit=${ckMatch[j]} rdkit=${rdMatch[j]}`,
        };
      }
    }
  }

  return { equal: true };
}

export function formatMatchDiff(
  chemkit: number[][],
  rdkit: number[][],
  pattern: string,
  smiles: string
): string {
  const lines: string[] = [];
  lines.push(`Pattern: ${pattern}`);
  lines.push(`Molecule: ${smiles}`);
  lines.push(`Chemkit matches (${chemkit.length}): ${JSON.stringify(normalizeMatches(chemkit))}`);
  lines.push(`RDKit matches (${rdkit.length}): ${JSON.stringify(normalizeMatches(rdkit))}`);
  return lines.join('\n');
}

export function assertMatchesEqual(
  chemkitMatches: number[][],
  rdkitMatches: number[][],
  pattern: string,
  smiles: string
): void {
  const result = compareMatches(chemkitMatches, rdkitMatches);
  if (!result.equal) {
    const diff = formatMatchDiff(chemkitMatches, rdkitMatches, pattern, smiles);
    throw new Error(`${result.message}\n${diff}`);
  }
}
