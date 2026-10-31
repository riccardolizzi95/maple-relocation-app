export default function GuideLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-32 rounded-lg bg-gray-200" />
      <div className="h-28 rounded-xl border border-gray-100 bg-white" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3">
            <div className="h-6 w-6 shrink-0 rounded-lg bg-gray-100" />
            <div className="h-4 flex-1 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
