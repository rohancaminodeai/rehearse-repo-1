"use client";

import * as React from "react";

import { sendJson } from "@/components/sidebar/send-json";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { ApiError, InbodyEntryDTO } from "@/shared/types";

type LoadState = "loading" | "ready" | "error";

// Client-side guard rails only — the server is the real gate (CLAUDE.md §4/§7).
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];
const ACCEPT_ATTR = "image/jpeg,image/png,image/heic,image/heif";
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB hint

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.code === "string" && typeof obj.message === "string";
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

export function InbodyModule({ customerId }: { customerId: string }) {
  const [state, setState] = React.useState<LoadState>("loading");
  const [entries, setEntries] = React.useState<InbodyEntryDTO[]>([]);

  const [previewEntry, setPreviewEntry] = React.useState<InbodyEntryDTO | null>(null);
  const [editEntry, setEditEntry] = React.useState<InbodyEntryDTO | null>(null);
  const [deleteEntry, setDeleteEntry] = React.useState<InbodyEntryDTO | null>(null);

  const refetch = React.useCallback(async () => {
    setState((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const res = await fetch(
        `/api/inbody?customerId=${encodeURIComponent(customerId)}`,
      );
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as InbodyEntryDTO[];
      setEntries(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [customerId]);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-6">
      <UploadPanel customerId={customerId} onUploaded={refetch} />

      {state === "loading" ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading results…</p>
      ) : state === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center">
          <p className="text-sm text-red-700">Couldn&rsquo;t load InBody results.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No InBody results yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Upload this customer&rsquo;s first scan using the box above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onPreview={() => setPreviewEntry(entry)}
              onEdit={() => setEditEntry(entry)}
              onDelete={() => setDeleteEntry(entry)}
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
      <EditCommentDialog
        entry={editEntry}
        onOpenChange={(open) => {
          if (!open) setEditEntry(null);
        }}
        onSaved={refetch}
      />
      <DeleteEntryDialog
        entry={deleteEntry}
        onOpenChange={(open) => {
          if (!open) setDeleteEntry(null);
        }}
        onDeleted={refetch}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Upload */

function UploadPanel({
  customerId,
  onUploaded,
}: {
  customerId: string;
  onUploaded: () => Promise<void>;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [comment, setComment] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function validate(candidate: File): string | null {
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      // Some browsers leave .heic type empty; allow by extension as a fallback.
      if (!/\.(jpe?g|png|heic|heif)$/i.test(candidate.name)) {
        return "Unsupported file type. Use JPEG, PNG or HEIC.";
      }
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      return "This file looks large (over 15MB). It may be rejected on upload.";
    }
    return null;
  }

  function chooseFile(candidate: File | null) {
    setError(null);
    if (!candidate) {
      setFile(null);
      return;
    }
    const problem = validate(candidate);
    // A size hint is non-blocking; a type problem clears the selection.
    if (problem && problem.startsWith("Unsupported")) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(candidate);
    if (problem) setError(problem);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0] ?? null;
    chooseFile(dropped);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose an image to upload.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("customerId", customerId);
    if (comment.trim() !== "") form.append("comment", comment);

    setPending(true);
    try {
      // No Content-Type header — the browser sets the multipart boundary.
      const res = await fetch("/api/inbody", { method: "POST", body: form });
      if (res.ok) {
        toast.success("Result uploaded.");
        setFile(null);
        setComment("");
        if (inputRef.current) inputRef.current.value = "";
        await onUploaded();
        return;
      }
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      setError(isApiError(parsed) ? parsed.message : "Upload failed. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload an InBody image"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
              dragging
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-300 bg-slate-50 hover:border-emerald-400",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-sm font-medium text-slate-800">{file.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">
                  Drag &amp; drop an InBody image, or click to choose
                </p>
                <p className="mt-1 text-xs text-slate-500">JPEG, PNG or HEIC</p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="upload-comment">Comment (optional)</Label>
            <Textarea
              id="upload-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={pending}
              placeholder="Leave a note for this result…"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !file}>
              {pending ? "Uploading…" : "Upload result"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- Entry card */

function EntryCard({
  entry,
  onPreview,
  onEdit,
  onDelete,
}: {
  entry: InbodyEntryDTO;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
          <p className="text-sm italic text-slate-400">No comment</p>
        )}

        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          <Button variant="outline" size="sm" onClick={onPreview}>
            Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={onDelete}
          >
            Delete
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
                  This format can&rsquo;t be shown in the browser. Use Download to view it.
                </p>
              )}
            </div>

            {entry.comment && entry.comment.trim() !== "" ? (
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                {entry.comment}
              </p>
            ) : (
              <p className="text-sm italic text-slate-400">No comment</p>
            )}

            <DialogFooter>
              <DownloadLink href={`/api/inbody/${entry.id}/file?download=1`} />
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Small download link styled as a button (the Button primitive renders a
 * <button>, so we use a plain anchor for the native download). */
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

/* --------------------------------------------------------------- Edit comment */

function EditCommentDialog({
  entry,
  onOpenChange,
  onSaved,
}: {
  entry: InbodyEntryDTO | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [comment, setComment] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (entry) {
      setComment(entry.comment ?? "");
      setError(null);
      setPending(false);
    }
  }, [entry]);

  async function handleSave() {
    if (!entry) return;
    setError(null);
    setPending(true);
    try {
      const result = await sendJson<InbodyEntryDTO>(
        `/api/inbody/${entry.id}`,
        "PATCH",
        { comment },
      );
      if (result.ok) {
        toast.success("Comment updated.");
        await onSaved();
        onOpenChange(false);
        return;
      }
      setError(result.error?.message ?? "Could not update the comment.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit comment</DialogTitle>
          <DialogDescription>
            This note is shown to the customer in their portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="edit-comment">Comment</Label>
          <Textarea
            id="edit-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={pending}
            placeholder="Leave a note for this result…"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------- Delete */

function DeleteEntryDialog({
  entry,
  onOpenChange,
  onDeleted,
}: {
  entry: InbodyEntryDTO | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => Promise<void>;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (entry) {
      setError(null);
      setPending(false);
    }
  }, [entry]);

  async function handleDelete() {
    if (!entry) return;
    setError(null);
    setPending(true);
    try {
      const result = await sendJson<{ ok: true }>(
        `/api/inbody/${entry.id}`,
        "DELETE",
      );
      if (result.ok) {
        toast.success("Result deleted.");
        await onDeleted();
        onOpenChange(false);
        return;
      }
      setError(result.error?.message ?? "Could not delete the result.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete result</DialogTitle>
          <DialogDescription>
            This permanently deletes this InBody result and its image. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
