import fs from 'fs';
import path from 'path';

export type BinanceInterval = '1m' | '5m' | '15m' | '1h';

export interface BinanceKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBaseVolume: number;
  takerBuyQuoteVolume: number;
}

const BINANCE_API = 'https://api.binance.us/api/v3/klines';
const MAX_LIMIT = 1000;
const RATE_LIMIT_MS = 120;

const CACHE_DIR = path.join(process.cwd(), '.cache', 'binance-klines');

function getCachePath(symbol: string, interval: BinanceInterval, startMs: number, endMs: number): string {
  return path.join(CACHE_DIR, `${symbol}_${interval}_${startMs}_${endMs}.json`);
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadFromCache(filePath: string): BinanceKline[] | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as BinanceKline[];
  } catch {
    return null;
  }
}

function saveToCache(filePath: string, data: BinanceKline[]): void {
  ensureCacheDir();
  fs.writeFileSync(filePath, JSON.stringify(data));
}

function parseKline(raw: unknown[]): BinanceKline {
  return {
    openTime: raw[0] as number,
    open: parseFloat(raw[1] as string),
    high: parseFloat(raw[2] as string),
    low: parseFloat(raw[3] as string),
    close: parseFloat(raw[4] as string),
    volume: parseFloat(raw[5] as string),
    closeTime: raw[6] as number,
    quoteVolume: parseFloat(raw[7] as string),
    trades: raw[8] as number,
    takerBuyBaseVolume: parseFloat(raw[9] as string),
    takerBuyQuoteVolume: parseFloat(raw[10] as string),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch klines from Binance public API with automatic pagination.
 * Results are cached to local JSON files to avoid re-fetching on subsequent runs.
 */
export async function fetchKlines(
  symbol: string,
  interval: BinanceInterval,
  startMs: number,
  endMs: number,
): Promise<BinanceKline[]> {
  const cachePath = getCachePath(symbol, interval, startMs, endMs);
  const cached = loadFromCache(cachePath);
  if (cached) {
    return cached;
  }

  const allKlines: BinanceKline[] = [];
  let currentStart = startMs;

  while (currentStart < endMs) {
    const url = `${BINANCE_API}?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endMs}&limit=${MAX_LIMIT}`;

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Binance API error ${res.status}: ${body}`);
    }

    const rawKlines = (await res.json()) as unknown[][];
    if (rawKlines.length === 0) break;

    for (const raw of rawKlines) {
      allKlines.push(parseKline(raw));
    }

    const lastCloseTime = rawKlines[rawKlines.length - 1][6] as number;
    currentStart = lastCloseTime + 1;

    if (rawKlines.length < MAX_LIMIT) break;

    await sleep(RATE_LIMIT_MS);
  }

  if (allKlines.length > 0) {
    saveToCache(cachePath, allKlines);
  }

  return allKlines;
}

/**
 * Fetch klines for multiple symbols in parallel (rate-limited).
 */
export async function fetchMultiSymbolKlines(
  symbols: string[],
  interval: BinanceInterval,
  startMs: number,
  endMs: number,
): Promise<Map<string, BinanceKline[]>> {
  const result = new Map<string, BinanceKline[]>();
  for (const symbol of symbols) {
    const klines = await fetchKlines(symbol, interval, startMs, endMs);
    result.set(symbol, klines);
  }
  return result;
}

/**
 * Helper: get the interval duration in milliseconds.
 */
export function intervalToMs(interval: BinanceInterval): number {
  switch (interval) {
    case '1m': return 60_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '1h': return 3_600_000;
  }
}

/**
 * Slice klines that fall within a specific time range.
 */
export function sliceKlines(klines: BinanceKline[], startMs: number, endMs: number): BinanceKline[] {
  return klines.filter((k) => k.openTime >= startMs && k.openTime < endMs);
}
