import type { FDSECFiling, FilingFlag } from '../utils/types';

const DILUTION_TYPES = ['424B5', 'S-3', 'S-3/A', 'S-1', 'S-1/A'];
const MAJOR_SHAREHOLDER_TYPES = ['SCHEDULE 13D', 'SCHEDULE 13D/A', 'SC 13D', 'SC 13D/A', '13D', '13D/A'];
const INSIDER_FORM_TYPES = ['4', '4/A'];

function isWithinDays(dateStr: string, days: number): boolean {
  const filingDate = new Date(dateStr).getTime();
  const cutoff = Date.now() - days * 86_400_000;
  return filingDate >= cutoff;
}

/**
 * Detect actionable SEC filing patterns from recent filings.
 * Filters to last 30 days, matches against known filing types.
 */
export function detectFilingFlags(filings: FDSECFiling[]): FilingFlag[] {
  const flags: FilingFlag[] = [];

  const recent = filings.filter((f) => isWithinDays(f.filing_date, 30));

  for (const filing of recent) {
    const type = filing.filing_type.toUpperCase().trim();

    if (DILUTION_TYPES.includes(type)) {
      flags.push({ type: 'DILUTION_FILING', filing });
    }

    if (MAJOR_SHAREHOLDER_TYPES.some((t) => type.includes(t) || t.includes(type))) {
      flags.push({ type: '13D_AMENDMENT', filing });
    }

    if (INSIDER_FORM_TYPES.includes(type)) {
      flags.push({ type: 'INSIDER_FORM4', filing });
    }
  }

  return flags;
}
