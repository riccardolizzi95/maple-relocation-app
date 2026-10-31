export default function ProtectedLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-40 rounded-lg bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
            <div className="h-3 w-16 rounded bg-gray-100" />
            <div className="h-6 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 h-24" />
        ))}
      </div>
    </div>
  );
}
