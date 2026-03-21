export default function ScreenerLoading() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-32 bg-bg-tertiary rounded" />
        <div className="h-4 w-48 bg-bg-tertiary rounded" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-28 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
      <div className="flex gap-3">
        <div className="h-10 w-64 bg-bg-secondary rounded-lg border border-border" />
        <div className="h-10 w-24 bg-bg-secondary rounded-lg border border-border" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="h-12 bg-bg-secondary" />
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="h-11 border-t border-border/30" />
        ))}
      </div>
    </div>
  );
}
