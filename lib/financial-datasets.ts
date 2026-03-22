import { FINANCIAL_DATASETS_BASE_URL, RATE_LIMIT_DELAY_MS } from './utils/constants';
import { withRetry } from './utils/retry';
import type {
  FDStockPrice,
  FDCryptoPriceBar,
  FDCompanyFacts,
  FDInsiderTrade,
  FDInstitutionalOwnership,
  FDIncomeStatement,
  FDBalanceSheet,
  FDCashFlowStatement,
  FDFinancialMetricsSnapshot,
  FDSECFiling,
  FDNewsArticle,
  ErrorCategory,
} from './utils/types';

const BASE = FINANCIAL_DATASETS_BASE_URL;

function getApiKey(): string {
  const key = process.env.FINANCIAL_DATASETS_API_KEY;
  if (!key) throw new Error('Missing FINANCIAL_DATASETS_API_KEY');
  return key;
}

function headers(): Record<string, string> {
  return { 'X-API-KEY': getApiKey() };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Error Classification ────────────────────────────────────

export function classifyApiError(status: number): ErrorCategory {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

function isRetryableCategory(category: ErrorCategory): boolean {
  return category === 'rate_limit' || category === 'server_error';
}

export class FDApiError extends Error {
  public category: ErrorCategory;

  constructor(
    public status: number,
    message: string,
    public url: string,
  ) {
    super(message);
    this.name = 'FDApiError';
    this.category = status === 0 ? 'circuit_open' : classifyApiError(status);
  }
}

// ── Circuit Breaker ─────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 5;
let consecutiveFailures = 0;

export function getCircuitBreakerState(): { open: boolean; failures: number; threshold: number } {
  return { open: consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD, failures: consecutiveFailures, threshold: CIRCUIT_BREAKER_THRESHOLD };
}

export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
}

// ── Rate-Limited Fetch with Retry + Circuit Breaker ─────────

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    throw new FDApiError(0, `Circuit breaker open after ${consecutiveFailures} consecutive failures`, url);
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await sleep(RATE_LIMIT_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();

  try {
    const res = await withRetry(
      async () => {
        const response = await fetch(url, { headers: headers() });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new FDApiError(response.status, `Financial Datasets API error ${response.status}: ${body}`, url);
        }
        return response;
      },
      {
        maxRetries: 2,
        baseDelayMs: 1000,
        shouldRetry: (err) => err instanceof FDApiError && isRetryableCategory(err.category),
      },
    );

    consecutiveFailures = 0;
    return res;
  } catch (err) {
    consecutiveFailures++;
    throw err;
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined,
  );
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

// ── Crypto Prices ──────────────────────────────────────────

export async function getCryptoPrices(
  ticker: string,
  startDate: string,
  endDate: string,
  opts?: {
    interval?: 'day' | 'week' | 'month' | 'year';
    intervalMultiplier?: number;
  },
): Promise<FDCryptoPriceBar[]> {
  const PAGE_LIMIT = 5000;
  const allPrices: FDCryptoPriceBar[] = [];
  let currentStart = startDate;

  while (currentStart < endDate) {
    const q = qs({
      ticker,
      interval: opts?.interval ?? 'day',
      interval_multiplier: opts?.intervalMultiplier ?? 1,
      start_date: currentStart,
      end_date: endDate,
      limit: PAGE_LIMIT,
    });
    const res = await rateLimitedFetch(`${BASE}/crypto/prices?${q}`);
    const json = await res.json();
    const page: FDCryptoPriceBar[] = json.prices ?? [];
    if (page.length === 0) break;

    allPrices.push(...page);

    if (page.length < PAGE_LIMIT) break;

    // Advance start past the last returned date
    const lastTime = page[page.length - 1].time;
    const lastDate = new Date(lastTime);
    lastDate.setDate(lastDate.getDate() + 1);
    currentStart = lastDate.toISOString().split('T')[0];
  }

  return allPrices;
}

export async function getCryptoTickers(): Promise<string[]> {
  const res = await rateLimitedFetch(`${BASE}/crypto/prices/tickers/`);
  const json = await res.json();
  return json.tickers ?? [];
}

// ── Prices ─────────────────────────────────────────────────

export async function getStockPrices(
  ticker: string,
  startDate: string,
  endDate: string,
  interval: 'day' | 'week' | 'month' | 'year' = 'day',
): Promise<FDStockPrice[]> {
  const q = qs({ ticker, interval, start_date: startDate, end_date: endDate });
  const res = await rateLimitedFetch(`${BASE}/prices?${q}`);
  const json = await res.json();
  return json.prices ?? [];
}

export async function getAvailableTickers(): Promise<string[]> {
  const res = await rateLimitedFetch(`${BASE}/prices/tickers/`);
  const json = await res.json();
  return json.tickers ?? [];
}

// ── Company Facts ──────────────────────────────────────────

export async function getCompanyFacts(ticker: string): Promise<FDCompanyFacts | null> {
  const q = qs({ ticker });
  const res = await rateLimitedFetch(`${BASE}/company/facts?${q}`);
  const json = await res.json();
  return json.company_facts ?? null;
}

// ── Financial Statements ───────────────────────────────────

export async function getIncomeStatements(
  ticker: string,
  opts?: { period?: 'annual' | 'quarterly' | 'ttm'; limit?: number },
): Promise<FDIncomeStatement[]> {
  const q = qs({
    ticker,
    period: opts?.period ?? 'quarterly',
    limit: opts?.limit ?? 8,
  });
  const res = await rateLimitedFetch(`${BASE}/financials/income-statements?${q}`);
  const json = await res.json();
  return json.income_statements ?? [];
}

export async function getBalanceSheets(
  ticker: string,
  opts?: { period?: 'annual' | 'quarterly' | 'ttm'; limit?: number },
): Promise<FDBalanceSheet[]> {
  const q = qs({
    ticker,
    period: opts?.period ?? 'quarterly',
    limit: opts?.limit ?? 8,
  });
  const res = await rateLimitedFetch(`${BASE}/financials/balance-sheets?${q}`);
  const json = await res.json();
  return json.balance_sheets ?? [];
}

export async function getCashFlowStatements(
  ticker: string,
  opts?: { period?: 'annual' | 'quarterly' | 'ttm'; limit?: number },
): Promise<FDCashFlowStatement[]> {
  const q = qs({
    ticker,
    period: opts?.period ?? 'quarterly',
    limit: opts?.limit ?? 8,
  });
  const res = await rateLimitedFetch(`${BASE}/financials/cash-flow-statements?${q}`);
  const json = await res.json();
  return json.cash_flow_statements ?? [];
}

// ── Financial Metrics ──────────────────────────────────────

export async function getFinancialMetricsSnapshot(
  ticker: string,
): Promise<FDFinancialMetricsSnapshot | null> {
  const q = qs({ ticker });
  const res = await rateLimitedFetch(`${BASE}/financial-metrics/snapshot?${q}`);
  const json = await res.json();
  return json.snapshot ?? null;
}

// ── Insider Trades ─────────────────────────────────────────

export async function getInsiderTrades(
  ticker: string,
  opts?: {
    limit?: number;
    filingDateGte?: string;
    filingDateLte?: string;
  },
): Promise<FDInsiderTrade[]> {
  const q = qs({
    ticker,
    limit: opts?.limit ?? 100,
    filing_date_gte: opts?.filingDateGte,
    filing_date_lte: opts?.filingDateLte,
  });
  const res = await rateLimitedFetch(`${BASE}/insider-trades?${q}`);
  const json = await res.json();
  return json.insider_trades ?? [];
}

// ── Institutional Ownership ────────────────────────────────

export async function getInstitutionalOwnership(
  ticker: string,
  opts?: {
    limit?: number;
    reportPeriodGte?: string;
    reportPeriodLte?: string;
  },
): Promise<FDInstitutionalOwnership[]> {
  const q = qs({
    ticker,
    limit: opts?.limit ?? 100,
    report_period_gte: opts?.reportPeriodGte,
    report_period_lte: opts?.reportPeriodLte,
  });
  const res = await rateLimitedFetch(`${BASE}/institutional-ownership?${q}`);
  const json = await res.json();
  return json['institutional-ownership'] ?? json.institutional_ownership ?? [];
}

// ── SEC Filings ────────────────────────────────────────────

export async function getSECFilings(
  ticker: string,
  opts?: { limit?: number },
): Promise<FDSECFiling[]> {
  const q = qs({ ticker, limit: opts?.limit ?? 20 });
  const res = await rateLimitedFetch(`${BASE}/filings?${q}`);
  const json = await res.json();
  return json.filings ?? [];
}

// ── News ───────────────────────────────────────────────────

export async function getNews(
  ticker: string,
  opts?: { limit?: number },
): Promise<FDNewsArticle[]> {
  const q = qs({ ticker, limit: opts?.limit ?? 20 });
  const res = await rateLimitedFetch(`${BASE}/news?${q}`);
  const json = await res.json();
  return json.news ?? [];
}
