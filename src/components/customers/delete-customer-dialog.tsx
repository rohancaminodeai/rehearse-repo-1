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
import { toast } from "@/components/ui/sonner";
import type { CustomerDTO } from "@/shared/types";

export function DeleteCustomerDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: CustomerDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { refetch } = useSidebarData();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setError(null);
      setPending(false);
    }
  }, [open]);

  async function handleDelete() {
    setError(null);
    setPending(true);
    try {
      const result = await sendJson<{ ok: true }>(
        `/api/customers/${customer.id}`,
        "DELETE",
      );
      if (result.ok) {
        toast.success("Customer deleted.");
        await refetch();
        onOpenChange(false);
        return;
      }
      setError(result.error?.message ?? "Could not delete the customer.");
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
          <DialogTitle>Delete customer</DialogTitle>
          <DialogDescription>
            This permanently deletes {customer.name} and all their InBody results. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>

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
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
