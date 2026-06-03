"use client";

import * as React from "react";

import { toast } from "@/components/ui/sonner";

/**
 * Builds the customer's portal login URL and copies it to the clipboard.
 * Origin is read on the client so it works across environments.
 */
export function buildPortalUrl(trainerSlug: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/portal/${trainerSlug}/login`;
}

export function CopyPortalLinkButton({
  trainerSlug,
  className,
}: {
  trainerSlug: string | null;
  className?: string;
}) {
  async function handleCopy() {
    if (!trainerSlug) {
      toast.error("Portal link unavailable.");
      return;
    }
    const url = buildPortalUrl(trainerSlug);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Portal link copied.");
    } catch {
      toast.error("Could not copy. Copy it manually: " + url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label="Copy portal link"
      title="Copy portal link"
    >
      Link
    </button>
  );
}
