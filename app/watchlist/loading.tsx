export default function WatchlistLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-32 bg-bg-tertiary rounded" />
        <div className="h-4 w-48 bg-bg-tertiary rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-48 bg-bg-secondary rounded-lg border border-border" />
        <div className="h-10 w-16 bg-bg-tertiary rounded-lg" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="h-12 bg-bg-secondary" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 border-t border-border/30" />
        ))}
      </div>
    </div>
  );
}
