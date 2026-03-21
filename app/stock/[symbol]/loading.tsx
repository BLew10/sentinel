export default function StockLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
      <div className="h-4 w-32 bg-bg-tertiary rounded" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-8 w-24 bg-bg-tertiary rounded" />
          <div className="h-4 w-48 bg-bg-tertiary rounded" />
          <div className="h-3 w-32 bg-bg-tertiary rounded" />
        </div>
        <div className="flex items-center gap-4">
          <div className="space-y-1 text-right">
            <div className="h-7 w-24 bg-bg-tertiary rounded" />
            <div className="h-4 w-20 bg-bg-tertiary rounded" />
          </div>
          <div className="w-14 h-14 bg-bg-tertiary rounded-full" />
        </div>
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-bg-tertiary rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[450px] bg-bg-secondary rounded-lg border border-border" />
        <div className="h-[320px] bg-bg-secondary rounded-lg border border-border" />
      </div>
      <div className="h-10 bg-bg-tertiary rounded w-full" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-bg-secondary rounded-lg border border-border" />
        ))}
      </div>
    </div>
  );
}
