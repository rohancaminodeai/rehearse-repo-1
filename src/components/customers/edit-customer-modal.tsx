"use client";

import * as React from "react";

import { sendJson } from "@/components/sidebar/send-json";
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
import { patchCustomerSchema } from "@/server/api/_schemas/customers";
import type { CustomerDTO, PatchCustomerInput } from "@/shared/types";

export function EditCustomerModal({
  customer,
  open,
  onOpenChange,
}: {
  customer: CustomerDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { groups, refetch } = useSidebarData();
  const [name, setName] = React.useState(customer.name);
  const [password, setPassword] = React.useState("");
  const [groupId, setGroupId] = React.useState(customer.groupId);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Reset to the current customer whenever the modal (re)opens.
  React.useEffect(() => {
    if (open) {
      setName(customer.name);
      setPassword("");
      setGroupId(customer.groupId);
      setError(null);
      setPending(false);
    }
  }, [open, customer.name, customer.groupId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Only send fields that actually changed (blank password = unchanged).
    const patch: PatchCustomerInput = {};
    if (name !== customer.name) patch.name = name;
    if (groupId !== customer.groupId) patch.groupId = groupId;
    if (password.trim() !== "") patch.password = password;

    if (Object.keys(patch).length === 0) {
      setError("Nothing to update.");
      return;
    }

    const parsed = patchCustomerSchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }

    setPending(true);
    try {
      const result = await sendJson<CustomerDTO>(
        `/api/customers/${customer.id}`,
        "PATCH",
        parsed.data,
      );
      if (result.ok) {
        toast.success("Customer updated.");
        await refetch();
        onOpenChange(false);
        return;
      }
      setError(result.error?.message ?? "Could not update the customer.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>
            Rename, move group, or set a new password. Leave the password blank to keep it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="edit-customer-name">Name</Label>
            <Input
              id="edit-customer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-customer-group">Group</Label>
            <select
              id="edit-customer-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={pending}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-customer-password">New password (optional)</Label>
            <Input
              id="edit-customer-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              autoComplete="new-password"
              placeholder="Leave blank to keep current"
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
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
