import { getSectorSignals } from '@/lib/sectors';
import { SectorsClient } from './SectorsClient';

export const dynamic = 'force-dynamic';

export default async function SectorsPage() {
  const sectors = await getSectorSignals();

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Sectors</h1>
        <p className="text-text-secondary text-sm mt-1">
          {sectors.length} GICS sectors ranked by score, breadth, and money flow
        </p>
      </div>
      <SectorsClient initialData={sectors} />
    </div>
  );
}
