import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar/sidebar";
import { Toaster } from "@/components/ui/sonner";

/**
 * Trainer dashboard shell: navy left sidebar + light center canvas.
 * Toaster is mounted once here for the whole dashboard.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-72 shrink-0 border-r border-slate-800 bg-slate-900">
        <Sidebar />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      <Toaster />
    </div>
  );
}
