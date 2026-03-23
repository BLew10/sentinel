import { SETUP_DEFINITIONS, type SetupType } from './utils/constants';

export interface Setup {
  type: SetupType;
  name: string;
  conviction: number; // 1-5
  thesis: string;
  watchFor: string[];
  timeframe: string;
}

interface ClassifyInput {
  flags: string[];
  alertTypes?: string[];
  sentinelScore?: number | null;
  technicalScore?: number | null;
  fundamentalScore?: number | null;
  insiderScore?: number | null;
  earningsAiScore?: number | null;
  rsi14?: number | null;
  priceVsSma50?: number | null;
  pctFrom52wHigh?: number | null;
  volumeRatio50d?: number | null;
}

function hasAny(haystack: string[], needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function countMatches(haystack: string[], needles: string[]): number {
  return needles.filter((n) => haystack.includes(n)).length;
}

function buildThesis(type: SetupType, input: ClassifyInput): string {
  const def = SETUP_DEFINITIONS[type];
  const parts: string[] = [def.description];

  switch (type) {
    case 'volatility_squeeze': {
      const hasDryUp = input.flags.includes('VOLUME_DRY_UP');
      const hasAtr = input.flags.includes('ATR_SQUEEZE');
      if (hasDryUp && hasAtr)
        parts.push('Both ATR and volume contracting — high-probability squeeze.');
      else if (hasDryUp) parts.push('Volume drying up into the squeeze — breakout imminent.');
      else if (hasAtr) parts.push('ATR at historical lows — expansion coming.');
      break;
    }
    case 'accumulation_detected': {
      if (input.flags.includes('RS_ACCELERATING'))
        parts.push('Relative strength improving — institutions likely building.');
      if (input.flags.includes('VOLUME_DRY_UP'))
        parts.push('Sellers exhausted, volume contracting before the move.');
      break;
    }
    case 'pre_earnings_catalyst': {
      if (input.flags.includes('EPS_REVISION_UP'))
        parts.push('Analyst EPS estimates trending higher — positive surprise likely.');
      if (input.flags.includes('ESTIMATE_BEAT_STREAK'))
        parts.push('History of beating estimates adds conviction.');
      if ((input.insiderScore ?? 0) >= 65)
        parts.push('Insider buying ahead of the report signals management confidence.');
      break;
    }
    case 'reversal_forming': {
      if (input.flags.includes('RSI_OVERSOLD'))
        parts.push('RSI in oversold territory confirms exhaustion.');
      if (input.flags.includes('OBV_ACCUMULATION'))
        parts.push('Volume accumulation despite price weakness — smart money positioning.');
      if ((input.insiderScore ?? 0) >= 60)
        parts.push('Insiders buying into the weakness — they see value.');
      break;
    }
    case 'momentum_continuation': {
      if (input.flags.includes('STAGE2_UPTREND'))
        parts.push('All moving averages aligned — confirmed Stage 2 uptrend.');
      if (input.flags.includes('NEAR_52W_HIGH') || input.flags.includes('BREAKING_OUT'))
        parts.push('Price near highs with improving relative strength.');
      break;
    }
    case 'value_reversal': {
      if (input.flags.includes('RSI_BULLISH_DIVERGENCE'))
        parts.push('RSI divergence supports the reversal thesis.');
      if (input.flags.includes('MACD_BULLISH_CROSS'))
        parts.push('MACD momentum shifting positive from deeply negative.');
      break;
    }
  }

  return parts.join(' ');
}

function computeConviction(type: SetupType, input: ClassifyInput): number {
  const def = SETUP_DEFINITIONS[type];
  const allFlags = [...input.flags, ...(input.alertTypes ?? [])];

  let conviction = 2; // base

  const boostCount = countMatches(allFlags, def.convictionBoosts);
  conviction += Math.min(boostCount, 2);

  const optionalCount = countMatches(allFlags, def.optionalFlags);
  if (optionalCount >= 2) conviction += 1;

  if ((input.sentinelScore ?? 0) >= 70) conviction += 1;
  if ((input.earningsAiScore ?? 0) >= 70) conviction += 1;

  return Math.max(1, Math.min(5, conviction));
}

export function classifySetups(input: ClassifyInput): Setup[] {
  const setups: Setup[] = [];
  const allSignals = [...input.flags, ...(input.alertTypes ?? [])];

  for (const [type, def] of Object.entries(SETUP_DEFINITIONS)) {
    const setupType = type as SetupType;

    const hasRequired = hasAny(allSignals, def.requiredFlags);
    const hasAlert = hasAny(input.alertTypes ?? [], def.alertTypes);

    if (!hasRequired && !hasAlert) continue;

    const conviction = computeConviction(setupType, input);
    const thesis = buildThesis(setupType, input);

    setups.push({
      type: setupType,
      name: def.name,
      conviction,
      thesis,
      watchFor: def.watchFor,
      timeframe: def.timeframe,
    });
  }

  setups.sort((a, b) => b.conviction - a.conviction);
  return setups;
}
