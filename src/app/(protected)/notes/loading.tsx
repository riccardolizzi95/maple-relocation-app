export default function NotesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-24 rounded-lg bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl border border-gray-100 bg-white p-4 space-y-2">
            <div className="h-4 w-3/4 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="h-3 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
