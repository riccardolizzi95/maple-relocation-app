export default function JobsLoading() {
  return (
    <div className="space-y-4 animate-pulse sm:space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-24 rounded-lg bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </div>

      {/* chip persone e stati */}
      <div className="flex gap-1.5">
        {[16, 24, 20].map((w, i) => (
          <div key={i} className="h-8 rounded-full bg-gray-100" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="flex gap-1.5 overflow-hidden">
        {[28, 30, 22, 24, 20, 24].map((w, i) => (
          <div key={i} className="h-8 shrink-0 rounded-full bg-gray-100" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="h-10 rounded-lg bg-gray-100" />

      {/* schede */}
      <div className="grid gap-2 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-gray-100 bg-white px-3.5 py-3">
            <div className="flex justify-between">
              <div className="h-4 w-40 rounded bg-gray-200" />
              <div className="h-6 w-20 rounded-full bg-gray-100" />
            </div>
            <div className="h-3.5 w-52 rounded bg-gray-100" />
            <div className="h-3 w-36 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
