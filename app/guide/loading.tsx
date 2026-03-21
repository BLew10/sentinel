export default function GuideLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-pulse">
      <div>
        <div className="h-7 w-48 bg-bg-tertiary rounded" />
        <div className="h-4 w-96 bg-bg-tertiary rounded mt-2" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <div className="h-6 w-64 bg-bg-tertiary rounded" />
          <div className="h-4 w-full bg-bg-secondary rounded" />
          <div className="h-4 w-5/6 bg-bg-secondary rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-24 bg-bg-secondary rounded-lg border border-border" />
            <div className="h-24 bg-bg-secondary rounded-lg border border-border" />
          </div>
        </div>
      ))}
    </div>
  );
}
