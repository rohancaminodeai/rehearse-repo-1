"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { DeleteCustomerDialog } from "@/components/customers/delete-customer-dialog";
import { EditCustomerModal } from "@/components/customers/edit-customer-modal";
import { CopyPortalLinkButton } from "@/components/customers/portal-link";
import type { CustomerDTO } from "@/shared/types";

import { useSidebarData } from "./sidebar-data-context";

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?";
}

export function CustomerItem({ customer }: { customer: CustomerDTO }) {
  const router = useRouter();
  const { trainerSlug } = useSidebarData();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <li className="group/customer flex items-center gap-2 rounded-md pl-2 pr-1 hover:bg-slate-800">
      <button
        type="button"
        onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white"
        >
          {initial(customer.name)}
        </span>
        <span className="truncate text-sm text-slate-200">{customer.name}</span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/customer:opacity-100">
        <CopyPortalLinkButton
          trainerSlug={trainerSlug}
          className="rounded px-1.5 py-0.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
        />
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label={`Edit ${customer.name}`}
          className="rounded px-1.5 py-0.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          aria-label={`Delete ${customer.name}`}
          className="rounded px-1.5 py-0.5 text-xs text-slate-300 hover:bg-red-600 hover:text-white"
        >
          Del
        </button>
      </div>

      <EditCustomerModal customer={customer} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteCustomerDialog
        customer={customer}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </li>
  );
}
