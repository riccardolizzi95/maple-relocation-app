export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-7 w-36 rounded-lg bg-gray-200" />
        <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-gray-100" />
              <div className="h-3 w-16 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-16 rounded bg-gray-200" />
            {i === 1 && <div className="h-1.5 w-full rounded-full bg-gray-100" />}
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div>
        <div className="mb-4 h-3 w-16 rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-card p-5 space-y-3">
              <div className="h-10 w-10 rounded-xl bg-gray-100" />
              <div className="space-y-1">
                <div className="h-4 w-20 rounded bg-gray-200" />
                <div className="h-3 w-28 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
