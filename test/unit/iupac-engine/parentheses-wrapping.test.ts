import { describe, it, expect } from 'bun:test';

/**
 * Tests for parentheses wrapping logic in name-assembly-layer.ts
 * 
 * The fix addresses the issue where simple yl groups like "propan-2-yl" and "butan-2-yl"
 * were being wrapped in parentheses, but should only wrap complex substituents like
 * "2-methylbutan-2-yl" that have additional substituents.
 * 
 * Regex pattern: /\d+-\w+an-\d+-yl/
 * This matches: "2-methylbutan-2-yl" (has digit + word chars before "an-\d+-yl")
 * But not: "propan-2-yl", "butan-2-yl" (no prefix before "an-\d+-yl")
 */

// Simulate the wrapping logic from name-assembly-layer.ts
function shouldWrapSubstituent(subName: string): boolean {
  const hasInternalLocants = /\d+,\d+/.test(subName) ||              // Pattern: 2,2-dimethyl
                             /\d+-\w+an-\d+-yl/.test(subName) ||     // Pattern: 2-methylbutan-2-yl
                             (subName.includes('oxy') && /\d+-\w+/.test(subName)); // Complex ether
  return hasInternalLocants;
}

function wrapSubstituent(subName: string): string {
  const alreadyWrapped = subName.startsWith('(') && subName.endsWith(')');
  if (alreadyWrapped) return subName;
  
  const hasInternalLocants = shouldWrapSubstituent(subName);
  if (!hasInternalLocants) return subName;
  
  const hasNestedParens = subName.includes('(') && subName.includes(')');
  const needsSquareBrackets = hasNestedParens;
  
  return needsSquareBrackets ? `[${subName}]` : `(${subName})`;
}

describe('Parentheses Wrapping Rules', () => {
  describe('Simple yl groups (should NOT wrap)', () => {
    it('should not wrap propan-2-yl', () => {
      expect(shouldWrapSubstituent('propan-2-yl')).toBe(false);
      expect(wrapSubstituent('propan-2-yl')).toBe('propan-2-yl');
    });

    it('should not wrap butan-2-yl', () => {
      expect(shouldWrapSubstituent('butan-2-yl')).toBe(false);
      expect(wrapSubstituent('butan-2-yl')).toBe('butan-2-yl');
    });

    it('should not wrap pentan-3-yl', () => {
      expect(shouldWrapSubstituent('pentan-3-yl')).toBe(false);
      expect(wrapSubstituent('pentan-3-yl')).toBe('pentan-3-yl');
    });

    it('should not wrap simple substituents without locants', () => {
      expect(wrapSubstituent('methyl')).toBe('methyl');
      expect(wrapSubstituent('ethyl')).toBe('ethyl');
      expect(wrapSubstituent('phenyl')).toBe('phenyl');
    });
  });

  describe('Complex yl groups (SHOULD wrap)', () => {
    it('should wrap 2-methylbutan-2-yl', () => {
      expect(shouldWrapSubstituent('2-methylbutan-2-yl')).toBe(true);
      expect(wrapSubstituent('2-methylbutan-2-yl')).toBe('(2-methylbutan-2-yl)');
    });

    it('should wrap 3-methylpentan-2-yl', () => {
      expect(shouldWrapSubstituent('3-methylpentan-2-yl')).toBe(true);
      expect(wrapSubstituent('3-methylpentan-2-yl')).toBe('(3-methylpentan-2-yl)');
    });

    it('should wrap 2-ethylbutan-2-yl', () => {
      expect(shouldWrapSubstituent('2-ethylbutan-2-yl')).toBe(true);
      expect(wrapSubstituent('2-ethylbutan-2-yl')).toBe('(2-ethylbutan-2-yl)');
    });
  });

  describe('Comma-separated locants (SHOULD wrap)', () => {
    it('should wrap 2,2-dimethylpropyl', () => {
      expect(shouldWrapSubstituent('2,2-dimethylpropyl')).toBe(true);
      expect(wrapSubstituent('2,2-dimethylpropyl')).toBe('(2,2-dimethylpropyl)');
    });

    it('should wrap 2,3-dimethylbutyl', () => {
      expect(shouldWrapSubstituent('2,3-dimethylbutyl')).toBe(true);
      expect(wrapSubstituent('2,3-dimethylbutyl')).toBe('(2,3-dimethylbutyl)');
    });
  });

  describe('Edge cases', () => {
    it('should not wrap 2-methylpropyl (no internal locant pattern)', () => {
      expect(shouldWrapSubstituent('2-methylpropyl')).toBe(false);
      expect(wrapSubstituent('2-methylpropyl')).toBe('2-methylpropyl');
    });

    it('should handle already wrapped substituents', () => {
      expect(wrapSubstituent('(2-methylbutan-2-yl)')).toBe('(2-methylbutan-2-yl)');
    });

    it('should use square brackets for nested parentheses', () => {
      const input = '2-methylbutan-2-yl(oxymethyl)';
      expect(shouldWrapSubstituent(input)).toBe(true);
      expect(wrapSubstituent(input)).toBe('[2-methylbutan-2-yl(oxymethyl)]');
    });

    it('should not wrap simple ether without internal digits', () => {
      expect(shouldWrapSubstituent('methyloxymethoxy')).toBe(false);
      expect(wrapSubstituent('methyloxymethoxy')).toBe('methyloxymethoxy');
    });

    it('should wrap complex ether with internal digits', () => {
      expect(shouldWrapSubstituent('2-methylbutyloxymethoxy')).toBe(true);
      expect(wrapSubstituent('2-methylbutyloxymethoxy')).toBe('(2-methylbutyloxymethoxy)');
    });
  });

  describe('Regex pattern validation', () => {
    const complexYlPattern = /\d+-\w+an-\d+-yl/;

    it('should match complex yl groups', () => {
      expect(complexYlPattern.test('2-methylbutan-2-yl')).toBe(true);
      expect(complexYlPattern.test('3-ethylpentan-2-yl')).toBe(true);
      expect(complexYlPattern.test('2-propylhexan-3-yl')).toBe(true);
    });

    it('should not match simple yl groups', () => {
      expect(complexYlPattern.test('propan-2-yl')).toBe(false);
      expect(complexYlPattern.test('butan-2-yl')).toBe(false);
      expect(complexYlPattern.test('pentan-3-yl')).toBe(false);
    });

    it('should not match groups without -an-\\d+-yl pattern', () => {
      expect(complexYlPattern.test('2-methylpropyl')).toBe(false);
      expect(complexYlPattern.test('2-ethylbutyl')).toBe(false);
      expect(complexYlPattern.test('methyl')).toBe(false);
    });
  });
});
