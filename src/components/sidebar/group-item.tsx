"use client";

import * as React from "react";

import { AddCustomerModal } from "@/components/customers/add-customer-modal";

import { CustomerItem } from "./customer-item";
import type { GroupWithCustomers } from "./types";

export function GroupItem({ group }: { group: GroupWithCustomers }) {
  const [open, setOpen] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-800"
        >
          <span
            aria-hidden
            className={`text-xs text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="truncate text-sm font-medium text-slate-100">{group.name}</span>
          <span className="ml-auto shrink-0 rounded-full bg-slate-800 px-2 text-xs text-slate-400">
            {group.customers.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label={`Add customer to ${group.name}`}
          title="Add customer"
          className="shrink-0 rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          +
        </button>
      </div>

      {open ? (
        group.customers.length > 0 ? (
          <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-800 pl-2">
            {group.customers.map((c) => (
              <CustomerItem key={c.id} customer={c} />
            ))}
          </ul>
        ) : (
          <p className="ml-5 py-1 text-xs text-slate-500">No customers yet.</p>
        )
      ) : null}

      <AddCustomerModal
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultGroupId={group.id}
      />
    </li>
  );
}
