export default function ChecklistLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-32 rounded-lg bg-gray-200" />

      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-lg bg-gray-100" />
        ))}
      </div>

      <div className="h-2 w-full rounded-full bg-gray-100" />

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4">
            <div className="h-5 w-5 shrink-0 rounded bg-gray-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-100" />
            </div>
            <div className="h-5 w-16 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
