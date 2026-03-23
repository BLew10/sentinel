import type { ScreenerPreset } from './types';

export const GICS_SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Communication Services',
  'Industrials',
  'Consumer Staples',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials',
] as const;

export type GICSSector = (typeof GICS_SECTORS)[number];

export const NOTABLE_FUNDS = [
  'Tiger Global',
  'Coatue Management',
  'D1 Capital',
  'Lone Pine Capital',
  'Dragoneer Investment',
  'Viking Global',
  'Whale Rock Capital',
  'Altimeter Capital',
  'Maverick Capital',
  'Durable Capital',
  'Renaissance Technologies',
  'Citadel Advisors',
  'Millennium Management',
  'Point72 Asset Management',
  'Two Sigma',
  'Bridgewater Associates',
  'Berkshire Hathaway',
  'Soros Fund Management',
  'Appaloosa Management',
  'Greenlight Capital',
  'Pershing Square',
  'Third Point',
] as const;

export const SCORE_WEIGHTS = {
  technical: 28,
  fundamental: 15,
  earnings_ai: 22,
  insider: 15,
  institutional: 10,
  news_sentiment: 5,
  options_flow: 5, // stubbed at neutral 50 until a data source is added
} as const;

export const SCREENER_PRESETS: Record<string, ScreenerPreset> = {
  minervini_trend_template: {
    name: 'Minervini Trend Template',
    description: "Mark Minervini's stage 2 uptrend criteria",
    filters: {
      price_above_sma200: true,
      price_above_sma150: true,
      price_above_sma50: true,
      sma50_above_sma150: true,
      sma150_above_sma200: true,
      sma200_trending_up_1mo: true,
      within_25pct_of_52w_high: true,
      above_30pct_from_52w_low: true,
      rs_rank_6m_min: 70,
    },
  },

  earnings_acceleration: {
    name: 'Earnings Acceleration',
    description: 'Revenue and earnings growth accelerating QoQ',
    filters: {
      revenue_growth_qoq_min: 0.1,
      earnings_growth_qoq_min: 0.15,
      revenue_growth_yoy_min: 0.1,
      earnings_growth_yoy_min: 0.1,
    },
  },

  volume_breakout: {
    name: 'Volume Breakout',
    description: 'Price near highs with unusual volume',
    filters: {
      within_10pct_of_52w_high: true,
      volume_ratio_50d_min: 2.0,
      price_above_sma50: true,
    },
  },

  insider_buying: {
    name: 'Insider Buying Clusters',
    description: 'Multiple insiders buying within 30 days',
    filters: {
      insider_buyers_30d_min: 2,
      insider_net_buy_positive: true,
    },
  },

  smart_money_accumulation: {
    name: 'Smart Money Accumulation',
    description: 'Institutional + insider conviction both bullish (60+)',
    filters: {
      insider_score_min: 60,
      institutional_score_min: 60,
    },
  },

  sentinel_top_picks: {
    name: 'Sentinel Top Picks',
    description: 'Highest composite Sentinel Score (top 20)',
    filters: {
      sentinel_score_min: 60,
    },
    sort: { field: 'sentinel_score', direction: 'desc' },
    limit: 20,
  },

  ai_high_conviction: {
    name: 'AI High Conviction',
    description: 'Earnings AI score 8+ with technical confirmation',
    filters: {
      earnings_ai_conviction_min: 8,
      price_above_sma50: true,
      rs_rank_3m_min: 60,
    },
  },

  insider_contrarian: {
    name: 'Insider Buying + Weak Price',
    description: 'Insiders accumulating while price is technically weak — the real edge',
    filters: {
      insider_score_min: 65,
    },
    sort: { field: 'insider_score', direction: 'desc' },
  },

  fundamentals_lead_price: {
    name: 'Fundamentals > Price',
    description: 'Strong business metrics but price hasn\'t caught up yet',
    filters: {
      revenue_growth_yoy_min: 0.15,
      earnings_growth_yoy_min: 0.1,
    },
    sort: { field: 'fundamental_score', direction: 'desc' },
  },

  oversold_quality: {
    name: 'Oversold Quality',
    description: 'Quality companies at oversold RSI levels — potential bounce setups',
    filters: {
      sentinel_score_min: 45,
    },
    sort: { field: 'sentinel_score', direction: 'desc' },
  },

  value_reversal_candidates: {
    name: 'Value Reversal Candidates',
    description: 'Quality companies deeply oversold with fresh insider conviction buying',
    filters: {
      has_value_reversal_signal: true,
    },
    sort: { field: 'insider_score', direction: 'desc' },
  },
};

export const ALERT_TRIGGERS = {
  daily_briefing: {
    channel: 'DISCORD_CHANNEL_DAILY',
    schedule: '30 7 * * 1-5',
  },
  score_threshold: {
    channel: 'DISCORD_CHANNEL_ALERTS',
    cooldown_hours: 24,
    threshold: 75,
  },
  score_drop: {
    channel: 'DISCORD_CHANNEL_ALERTS',
    min_drop: 10,
    min_previous_score: 70,
  },
  insider_cluster_buy: {
    channel: 'DISCORD_CHANNEL_INSIDERS',
  },
  insider_ceo_buy: {
    channel: 'DISCORD_CHANNEL_INSIDERS',
  },
  // Disabled: options flow data source deferred. Re-enable when flow data is available.
  // mega_block: {
  //   channel: 'DISCORD_CHANNEL_FLOW',
  //   min_value: 5_000_000,
  // },
  // sweep_storm: {
  //   channel: 'DISCORD_CHANNEL_FLOW',
  //   min_sweeps: 5,
  // },
  triple_confirmation: {
    channel: 'DISCORD_CHANNEL_ALERTS',
    min_score: 70,
  },
  sector_rotation: {
    channel: 'DISCORD_CHANNEL_ALERTS',
  },
  value_reversal: {
    channel: 'DISCORD_CHANNEL_ALERTS',
    cooldown_hours: 24,
  },
} as const;

/** Maps screener preset keys to their closest signal_snapshots trigger_type */
export const PRESET_TO_SIGNAL_TYPE: Record<string, string> = {
  minervini_trend_template: 'stage2_breakout',
  volume_breakout: 'volume_breakout',
  insider_buying: 'insider_cluster_buy',
  smart_money_accumulation: 'triple_confirmation',
  sentinel_top_picks: 'score_threshold',
  ai_high_conviction: 'score_threshold',
  insider_contrarian: 'insider_cluster_buy',
  oversold_quality: 'rsi_oversold_bounce',
  value_reversal_candidates: 'value_reversal',
};

export const SIGNAL_TYPE_LABELS: Record<string, string> = {
  score_threshold: 'Score Spike',
  score_drop: 'Score Drop',
  insider_cluster_buy: 'Insider Cluster',
  insider_ceo_buy: 'CEO Buy',
  triple_confirmation: 'Triple Confirm',
  golden_cross: 'Golden Cross',
  death_cross: 'Death Cross',
  stage2_breakout: 'Stage 2 Breakout',
  rsi_oversold_bounce: 'RSI Bounce',
  volume_breakout: 'Vol Breakout',
  macd_bullish_cross: 'MACD Cross',
  sector_rotation: 'Sector Rotation',
  value_reversal: 'Value Reversal',
};

export const FINANCIAL_DATASETS_BASE_URL = 'https://api.financialdatasets.ai';

export const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

export const RATE_LIMIT_DELAY_MS = 250;
export const BATCH_SIZE = 50;
