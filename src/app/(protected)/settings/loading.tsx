export default function SettingsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-7 w-40 rounded-lg bg-gray-200" />

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-4">
          <div className="h-5 w-24 rounded bg-gray-200" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-gray-100" />
              <div className="h-9 w-full rounded-lg bg-gray-100" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-gray-100" />
              <div className="h-9 w-full rounded-lg bg-gray-100" />
            </div>
          </div>
          <div className="h-9 w-28 rounded-lg bg-maple-100" />
        </div>
      ))}

      <div className="space-y-4">
        <div className="h-5 w-44 rounded bg-gray-200" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="h-3.5 w-32 rounded bg-gray-200" />
                <div className="h-2.5 w-44 rounded bg-gray-100" />
              </div>
              <div className="h-4 w-4 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
