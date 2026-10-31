export default function BudgetLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-24 rounded-lg bg-gray-200" />

      <div className="flex gap-2">
        <div className="h-8 w-20 rounded-lg bg-gray-100" />
        <div className="h-8 w-20 rounded-lg bg-gray-100" />
        <div className="h-8 w-20 rounded-lg bg-gray-100" />
      </div>

      {/* Budget bar */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-4 w-28 rounded bg-gray-200" />
          <div className="h-4 w-20 rounded bg-gray-100" />
        </div>
        <div className="h-3 w-full rounded-full bg-gray-100" />
      </div>

      {/* Month picker + filters */}
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-32 rounded-lg bg-gray-100" />
        <div className="h-8 w-24 rounded-lg bg-gray-100" />
        <div className="flex-1" />
        <div className="h-8 w-24 rounded-lg bg-maple-100" />
      </div>

      {/* Expense list */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-100" />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 w-32 rounded bg-gray-200" />
              <div className="h-3 w-20 rounded bg-gray-100" />
            </div>
            <div className="h-4 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
