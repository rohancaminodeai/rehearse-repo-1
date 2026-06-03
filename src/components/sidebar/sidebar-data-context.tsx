"use client";

import * as React from "react";

import type { GroupWithCustomers, SidebarData } from "./types";

type LoadState = "loading" | "ready" | "error";

interface SidebarDataValue {
  state: LoadState;
  trainerSlug: string | null;
  groups: GroupWithCustomers[];
  /** Re-fetch the tree from the server. Client-fetched data won't update via
   *  router.refresh() alone, so modals call this after a mutation. */
  refetch: () => Promise<void>;
}

const SidebarDataContext = React.createContext<SidebarDataValue | null>(null);

export function useSidebarData(): SidebarDataValue {
  const ctx = React.useContext(SidebarDataContext);
  if (!ctx) {
    throw new Error("useSidebarData must be used within <SidebarDataProvider>");
  }
  return ctx;
}

export function SidebarDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<LoadState>("loading");
  const [trainerSlug, setTrainerSlug] = React.useState<string | null>(null);
  const [groups, setGroups] = React.useState<GroupWithCustomers[]>([]);

  const refetch = React.useCallback(async () => {
    setState((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as SidebarData;
      setTrainerSlug(data.trainerSlug);
      setGroups(data.groups);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  const value = React.useMemo<SidebarDataValue>(
    () => ({ state, trainerSlug, groups, refetch }),
    [state, trainerSlug, groups, refetch],
  );

  return (
    <SidebarDataContext.Provider value={value}>{children}</SidebarDataContext.Provider>
  );
}
