"use client";

import * as React from "react";
import { use } from "react";

import { InbodyModule } from "@/components/inbody-module";
import type { SidebarData } from "@/components/sidebar/types";

/**
 * Customer detail canvas: a header with the customer's name (best-effort,
 * resolved from GET /api/groups since there's no single-customer endpoint) and
 * the InBody module that does the real work (upload / grid / preview / edit /
 * delete).
 *
 * Next 15 passes route params as a Promise — unwrapped here with `use()`.
 */
export default function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = use(params);
  const [customerName, setCustomerName] = React.useState<string | null>(null);

  // Best-effort header label. The module itself owns its own loading/error
  // states, so a failure here just leaves a neutral fallback title.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/groups");
        if (!res.ok) return;
        const data = (await res.json()) as SidebarData;
        const found = data.groups
          .flatMap((g) => g.customers)
          .find((c) => c.id === customerId);
        if (!cancelled && found) setCustomerName(found.name);
      } catch {
        // Ignore — keep the fallback title.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          InBody results
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {customerName ?? "Customer"}
        </h1>
      </header>

      <InbodyModule customerId={customerId} />
    </div>
  );
}
