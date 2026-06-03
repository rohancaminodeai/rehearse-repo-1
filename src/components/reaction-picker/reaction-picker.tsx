"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { REACTION_EMOJIS } from "@/server/api/_schemas/reaction";
import type { ApiError, ReactionDTO } from "@/shared/types";

interface ReactionPickerProps {
  entryId: string;
  currentEmoji: string | null;
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.code === "string" && typeof obj.message === "string";
}

/**
 * Emoji reaction toggle for a single entry (FR-14, customer side).
 *
 * Renders the frozen `REACTION_EMOJIS` allowlist as toggle buttons. Clicking the
 * active emoji toggles it off; a different emoji replaces it. The server upserts
 * and returns the new `ReactionDTO | null`; we sync local state from that and
 * refresh so the trainer-side badge stays consistent. No state library (rule 2).
 */
export function ReactionPicker({ entryId, currentEmoji }: ReactionPickerProps) {
  const router = useRouter();
  const [emoji, setEmoji] = React.useState<string | null>(currentEmoji);
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Keep local state in sync if the server data changes underneath us.
  React.useEffect(() => {
    setEmoji(currentEmoji);
  }, [currentEmoji]);

  async function react(next: string) {
    if (pending) return;
    setError(null);
    setPending(next);
    try {
      // PUT upserts; the server toggles off when the same emoji is sent again
      // and returns the resulting ReactionDTO, or null when toggled off.
      const res = await fetch(`/api/inbody/${entryId}/reaction`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: next }),
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      if (res.ok) {
        const reaction = parsed as ReactionDTO | null;
        setEmoji(reaction?.emoji ?? null);
        router.refresh();
        return;
      }
      setError(isApiError(parsed) ? parsed.message : "Could not save your reaction.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div role="group" aria-label="React to this result" className="flex flex-wrap gap-1.5">
        {REACTION_EMOJIS.map((value) => {
          const active = emoji === value;
          return (
            <button
              key={value}
              type="button"
              aria-label={`React with ${value}`}
              aria-pressed={active}
              disabled={pending !== null}
              onClick={() => void react(value)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border text-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50",
                active
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50",
                pending === value && "animate-pulse",
              )}
            >
              <span aria-hidden>{value}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
