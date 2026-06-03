"use client";

import * as React from "react";

import { ReactionPicker } from "@/components/reaction-picker/reaction-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InbodyEntryDTO } from "@/shared/types";

interface CustomerPortalProps {
  entries: InbodyEntryDTO[];
  customerName: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** HEIC/HEIF rarely render in <img>; show a neutral placeholder instead. */
function isRenderable(contentType: string): boolean {
  return !/heic|heif/i.test(contentType);
}

/**
 * Read-only customer view of their own InBody results (C2–C4, FR-15). No upload,
 * edit, or delete. Images are loaded only through the auth-checked proxy route
 * (rule 4); the trainer's comment renders as plain text (rule 16).
 */
export function CustomerPortal({ entries, customerName }: CustomerPortalProps) {
  const [previewEntry, setPreviewEntry] = React.useState<InbodyEntryDTO | null>(
    null,
  );

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Your InBody results
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {customerName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          View your scans, your trainer&rsquo;s notes, and react with an emoji.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            No results yet.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Your trainer hasn&rsquo;t uploaded any InBody scans for you yet.
            Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onPreview={() => setPreviewEntry(entry)}
            />
          ))}
        </div>
      )}

      <PreviewDialog
        entry={previewEntry}
        onOpenChange={(open) => {
          if (!open) setPreviewEntry(null);
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Entry card */

function EntryCard({
  entry,
  onPreview,
}: {
  entry: InbodyEntryDTO;
  onPreview: () => void;
}) {
  const renderable = isRenderable(entry.contentType);

  return (
    <Card className="flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={onPreview}
        aria-label={`Preview ${entry.originalFilename}`}
        className="block aspect-[4/3] w-full bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {renderable ? (
          // Auth-checked proxy route only — never a public object URL (§4).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/inbody/${entry.id}/file`}
            alt={entry.originalFilename}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-500">
            Preview not available — download to view
          </span>
        )}
      </button>

      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs text-slate-500">{formatDate(entry.createdAt)}</p>
        {/* Plain text — React auto-escapes; never dangerouslySetInnerHTML (§16). */}
        {entry.comment && entry.comment.trim() !== "" ? (
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-800">
            {entry.comment}
          </p>
        ) : (
          <p className="text-sm italic text-slate-400">No note from your trainer</p>
        )}

        <div className="mt-auto space-y-3 pt-2">
          <ReactionPicker
            entryId={entry.id}
            currentEmoji={entry.reaction?.emoji ?? null}
          />
          <Button variant="outline" size="sm" onClick={onPreview}>
            View &amp; download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- Preview modal */

function PreviewDialog({
  entry,
  onOpenChange,
}: {
  entry: InbodyEntryDTO | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {entry ? (
          <>
            <DialogHeader>
              <DialogTitle>{entry.originalFilename}</DialogTitle>
              <DialogDescription>{formatDate(entry.createdAt)}</DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-auto rounded-md bg-slate-100">
              {isRenderable(entry.contentType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/inbody/${entry.id}/file`}
                  alt={entry.originalFilename}
                  className="mx-auto block max-h-[60vh] w-auto"
                />
              ) : (
                <p className="px-4 py-12 text-center text-sm text-slate-500">
                  This format can&rsquo;t be shown in the browser. Use Download to
                  view it.
                </p>
              )}
            </div>

            {entry.comment && entry.comment.trim() !== "" ? (
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                {entry.comment}
              </p>
            ) : (
              <p className="text-sm italic text-slate-400">
                No note from your trainer
              </p>
            )}

            <ReactionPicker
              entryId={entry.id}
              currentEmoji={entry.reaction?.emoji ?? null}
            />

            <DialogFooter>
              <DownloadLink href={`/api/inbody/${entry.id}/file?download=1`} />
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Native download via a plain anchor (the Button primitive renders a <button>,
 * which can't carry the download navigation). Styled to match the primary Button. */
function DownloadLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      Download
    </a>
  );
}
