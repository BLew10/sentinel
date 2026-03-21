export default function SignalsLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-bg-tertiary rounded" />
        <div className="h-4 w-64 bg-bg-tertiary rounded" />
      </div>
      <div className="h-9 w-64 bg-bg-secondary rounded-lg" />
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="h-12 bg-bg-secondary" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 border-t border-border/30" />
        ))}
      </div>
    </div>
  );
}
