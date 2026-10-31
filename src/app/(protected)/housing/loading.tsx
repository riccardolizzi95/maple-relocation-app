export default function HousingLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-28 rounded-lg bg-gray-200" />

      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-28 rounded-lg bg-gray-100" />
        <div className="h-8 w-28 rounded-lg bg-gray-100" />
        <div className="h-8 w-24 rounded-lg bg-gray-100" />
        <div className="flex-1" />
        <div className="h-8 w-24 rounded-lg bg-maple-100" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-40 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-100" />
            </div>
            <div className="flex gap-2">
              <div className="h-5 w-20 rounded-full bg-gray-100" />
              <div className="h-5 w-16 rounded-full bg-gray-100" />
            </div>
            <div className="h-3 w-full rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
