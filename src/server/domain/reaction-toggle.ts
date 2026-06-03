/**
 * Pure decision helper for the single-reaction-per-entry toggle.
 *
 * No I/O — given the current emoji (or null) and the incoming emoji, decide
 * whether to add, replace, or remove the reaction. The handler performs the
 * resulting upsert/delete.
 */

export type ReactionDecision = { action: "add" } | { action: "replace" } | { action: "remove" };

export function decideReaction(current: string | null, incoming: string): ReactionDecision {
  if (current === null) return { action: "add" };
  if (current === incoming) return { action: "remove" };
  return { action: "replace" };
}
