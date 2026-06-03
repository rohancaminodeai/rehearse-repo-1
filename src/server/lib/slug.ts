/**
 * URL-slug + name normalization helpers.
 */

/** A short non-crypto random token (acceptable for slug fallbacks/suffixes). */
function randomToken(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Convert a name to a URL slug: lowercase, trimmed, spaces→`-`, only `[a-z0-9-]`,
 * collapsed/trimmed dashes. Returns `""` when nothing usable remains (e.g.
 * non-ASCII input) — the caller adds a random fallback via {@link uniqueSlug}.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Produce a slug from `base` that does not collide, per the `exists` predicate.
 * Falls back to a random token when slugify yields an empty string, and appends
 * a random suffix while collisions occur.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || randomToken();

  let candidate = root;
  while (await exists(candidate)) {
    candidate = `${root}-${randomToken()}`;
  }
  return candidate;
}

/** Normalize a name for uniqueness/matching: trimmed + lowercased. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
