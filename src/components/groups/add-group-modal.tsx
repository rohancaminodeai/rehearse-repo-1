"use client";

import * as React from "react";

import { postJson } from "@/components/auth/post-json";
import { useSidebarData } from "@/components/sidebar/sidebar-data-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { createGroupSchema } from "@/server/api/_schemas/groups";
import type { GroupDTO } from "@/shared/types";

export function AddGroupModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { refetch } = useSidebarData();
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function reset() {
    setName("");
    setNote("");
    setError(null);
    setPending(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedNote = note.trim();
    const parsed = createGroupSchema.safeParse({
      name,
      note: trimmedNote === "" ? undefined : trimmedNote,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }

    setPending(true);
    try {
      const result = await postJson<GroupDTO>("/api/groups", parsed.data);
      if (result.ok) {
        toast.success("Group created.");
        await refetch();
        handleOpenChange(false);
        return;
      }
      setError(result.error?.message ?? "Could not create the group.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Group customers by month, e.g. &ldquo;June diet pot&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="June diet pot"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-note">Note (optional)</Label>
            <Textarea
              id="group-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              placeholder="Anything worth remembering about this group."
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
