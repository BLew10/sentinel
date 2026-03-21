import { COINGECKO_BASE_URL, RATE_LIMIT_DELAY_MS } from './utils/constants';
import type { CryptoAsset, CryptoDailyPrice } from './utils/types';

const BASE = COINGECKO_BASE_URL;

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

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko API error ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res;
}

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
  current_price: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
}

export async function getCryptoList(limit = 100): Promise<CryptoAsset[]> {
  const res = await rateLimitedFetch(
    `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`,
  );
  const data: CoinGeckoMarket[] = await res.json();

  return data.map((coin) => ({
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    coingecko_id: coin.id,
    category: null,
    market_cap_rank: coin.market_cap_rank,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));
}

type CoinGeckoOHLC = [number, number, number, number, number];

export async function getCryptoPrices(
  coingeckoId: string,
  days = 200,
): Promise<CryptoDailyPrice[]> {
  const res = await rateLimitedFetch(
    `${BASE}/coins/${coingeckoId}/ohlc?vs_currency=usd&days=${days}`,
  );
  const data: CoinGeckoOHLC[] = await res.json();

  const dailyMap = new Map<string, CryptoDailyPrice>();
  for (const [ts, open, high, low, close] of data) {
    const date = new Date(ts).toISOString().split('T')[0];
    const existing = dailyMap.get(date);
    if (!existing) {
      dailyMap.set(date, {
        id: 0,
        symbol: '',
        date,
        open,
        high,
        low,
        close,
        volume: 0,
        market_cap: null,
      });
    } else {
      existing.high = Math.max(existing.high, high);
      existing.low = Math.min(existing.low, low);
      existing.close = close;
    }
  }

  return Array.from(dailyMap.values());
}

interface CoinGeckoCoinDetail {
  id: string;
  symbol: string;
  name: string;
  categories: string[];
  market_data: {
    current_price: { usd: number };
    market_cap: { usd: number };
    total_volume: { usd: number };
    market_cap_rank: number | null;
    ath: { usd: number };
    ath_change_percentage: { usd: number };
  };
}

export async function getCryptoMetadata(
  coingeckoId: string,
): Promise<CoinGeckoCoinDetail | null> {
  const res = await rateLimitedFetch(
    `${BASE}/coins/${coingeckoId}?localization=false&tickers=false&community_data=false&developer_data=false`,
  );
  return res.json();
}
