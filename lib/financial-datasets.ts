import { FINANCIAL_DATASETS_BASE_URL, RATE_LIMIT_DELAY_MS } from './utils/constants';
import type {
  FDStockPrice,
  FDCompanyFacts,
  FDInsiderTrade,
  FDInstitutionalOwnership,
  FDIncomeStatement,
  FDBalanceSheet,
  FDCashFlowStatement,
  FDFinancialMetricsSnapshot,
  FDSECFiling,
  FDNewsArticle,
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

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await sleep(RATE_LIMIT_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FDApiError(res.status, `Financial Datasets API error ${res.status}: ${body}`, url);
  }
  return res;
}

export class FDApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public url: string,
  ) {
    super(message);
    this.name = 'FDApiError';
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined,
  );
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
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
