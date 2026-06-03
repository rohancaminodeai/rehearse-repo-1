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
import { createCustomerSchema } from "@/server/api/_schemas/customers";
import type { CustomerDTO } from "@/shared/types";

export function AddCustomerModal({
  open,
  onOpenChange,
  /** Pre-selected group when launched from a group's "+ customer" action. */
  defaultGroupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGroupId?: string;
}) {
  const { groups, refetch } = useSidebarData();
  const [groupId, setGroupId] = React.useState(defaultGroupId ?? "");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Sync the pre-selected group whenever the modal is (re)opened.
  React.useEffect(() => {
    if (open) {
      setGroupId(defaultGroupId ?? "");
      setName("");
      setPassword("");
      setError(null);
      setPending(false);
    }
  }, [open, defaultGroupId]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = createCustomerSchema.safeParse({ groupId, name, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }

    setPending(true);
    try {
      const result = await postJson<CustomerDTO>("/api/customers", parsed.data);
      if (result.ok) {
        toast.success("Customer added.");
        await refetch();
        handleOpenChange(false);
        return;
      }
      setError(result.error?.message ?? "Could not add the customer.");
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
          <DialogTitle>Add customer</DialogTitle>
          <DialogDescription>
            The customer signs in to their portal with this name and password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="customer-group">Group</Label>
            <select
              id="customer-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={pending}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-name">Name</Label>
            <Input
              id="customer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="Customer name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-password">Password</Label>
            <Input
              id="customer-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              autoComplete="new-password"
              placeholder="At least 4 characters"
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
              {pending ? "Adding…" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
