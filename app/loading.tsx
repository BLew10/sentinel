export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-32 bg-bg-tertiary rounded" />
        <div className="h-4 w-56 bg-bg-tertiary rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-bg-secondary rounded-lg border border-border" />
        ))}
      </div>
      <div className="h-8 w-48 bg-bg-tertiary rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-36 bg-bg-secondary rounded-lg border border-border" />
        ))}
      </div>
    </div>
  );
}
