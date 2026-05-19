/**
 * Stable, dependency-free string hash for AI-cache keys.
 * FNV-1a → base36. Not cryptographic — only used as a cache discriminator.
 */
export function contentHash(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
