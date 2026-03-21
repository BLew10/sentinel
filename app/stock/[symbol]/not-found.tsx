import Link from 'next/link';

export default function StockNotFound() {
  return (
    <div className="max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-display font-bold text-text-tertiary">404</h1>
      <p className="text-text-secondary">Stock not found in our universe.</p>
      <Link
        href="/screener"
        className="mt-4 px-4 py-2 text-sm bg-green text-bg-primary rounded-lg hover:bg-green/90 transition-colors"
      >
        Browse Screener
      </Link>
    </div>
  );
}
