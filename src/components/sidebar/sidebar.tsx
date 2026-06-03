"use client";

import * as React from "react";

import { AddGroupModal } from "@/components/groups/add-group-modal";
import { Input } from "@/components/ui/input";

import { GroupItem } from "./group-item";
import { SidebarDataProvider, useSidebarData } from "./sidebar-data-context";

function SidebarInner() {
  const { state, groups, refetch } = useSidebarData();
  const [query, setQuery] = React.useState("");
  const [addGroupOpen, setAddGroupOpen] = React.useState(false);

  // UI-only search: filter groups and their customers by name (no backend).
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return groups;
    return groups
      .map((g) => {
        const groupMatches = g.name.toLowerCase().includes(q);
        const matchingCustomers = g.customers.filter((c) =>
          c.name.toLowerCase().includes(q),
        );
        if (groupMatches) return g;
        if (matchingCustomers.length > 0) return { ...g, customers: matchingCustomers };
        return null;
      })
      .filter((g): g is (typeof groups)[number] => g !== null);
  }, [groups, query]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-lg font-semibold tracking-tight text-white">InBody</span>
        <button
          type="button"
          onClick={() => setAddGroupOpen(true)}
          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
        >
          + Group
        </button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        aria-label="Search groups and customers"
        className="border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500"
      />

      <nav className="min-h-0 flex-1 overflow-y-auto">
        {state === "loading" ? (
          <p className="px-2 py-4 text-sm text-slate-400">Loading…</p>
        ) : state === "error" ? (
          <div className="px-2 py-4">
            <p className="text-sm text-red-300">Couldn&rsquo;t load your groups.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-slate-300">No groups yet.</p>
            <button
              type="button"
              onClick={() => setAddGroupOpen(true)}
              className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Create your first group
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-4 text-sm text-slate-400">No matches for &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((g) => (
              <GroupItem key={g.id} group={g} />
            ))}
          </ul>
        )}
      </nav>

      <AddGroupModal open={addGroupOpen} onOpenChange={setAddGroupOpen} />
    </div>
  );
}

export function Sidebar() {
  return (
    <SidebarDataProvider>
      <SidebarInner />
    </SidebarDataProvider>
  );
}
