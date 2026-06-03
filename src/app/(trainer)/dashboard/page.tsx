/**
 * Default dashboard center. Phase 4 fills this with the InBody module for a
 * selected customer; until a customer is chosen we show a neutral empty state
 * (CLAUDE.md §16).
 */
export default function DashboardPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">Select a customer</h1>
        <p className="mt-2 text-sm text-slate-500">
          Pick a customer from the sidebar to see their InBody results. No groups yet? Use
          &ldquo;+ Group&rdquo; in the sidebar to create your first one.
        </p>
      </div>
    </div>
  );
}
