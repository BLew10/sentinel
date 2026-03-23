// ============================================
// EQUITY TYPES
// ============================================

export interface Stock {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  exchange: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface DailyPrice {
  id: number;
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Fundamentals {
  symbol: string;
  pe_ratio: number | null;
  forward_pe: number | null;
  peg_ratio: number | null;
  ps_ratio: number | null;
  pb_ratio: number | null;
  revenue_growth_yoy: number | null;
  earnings_growth_yoy: number | null;
  revenue_growth_qoq: number | null;
  earnings_growth_qoq: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  free_cash_flow: number | null;
  dividend_yield: number | null;
  updated_at: string;
}

export interface TechnicalSignals {
  symbol: string;
  sma_20: number | null;
  sma_50: number | null;
  sma_150: number | null;
  sma_200: number | null;
  ema_10: number | null;
  ema_21: number | null;
  price_vs_sma50: number | null;
  price_vs_sma200: number | null;
  pct_from_52w_high: number | null;
  pct_from_52w_low: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  volume_ratio_50d: number | null;
  rs_rank_3m: number | null;
  rs_rank_6m: number | null;
  rs_rank_12m: number | null;
  atr_14: number | null;
  atr_pct: number | null;
  computed_at: string;
}

export interface InsiderTrade {
  id: number;
  symbol: string;
  insider_name: string;
  insider_title: string | null;
  is_board_director: boolean | null;
  transaction_date: string;
  transaction_type: string;
  shares: number;
  price_per_share: number | null;
  transaction_value: number | null;
  shares_owned_after: number | null;
  filing_date: string | null;
  created_at: string;
}

export interface InsiderSignals {
  symbol: string;
  signal_type: string | null;
  num_buyers_30d: number;
  num_sellers_30d: number;
  net_buy_value_30d: number | null;
  largest_transaction_value: number | null;
  largest_transaction_name: string | null;
  conviction_score: number | null;
  ai_summary: string | null;
  updated_at: string;
}

export interface InstitutionalHolding {
  id: number;
  symbol: string;
  institution_name: string;
  shares_held: number | null;
  value: number | null;
  pct_of_portfolio: number | null;
  change_shares: number | null;
  change_pct: number | null;
  filing_quarter: string | null;
  filing_date: string | null;
  created_at: string;
}

export interface InstitutionalSignals {
  symbol: string;
  num_new_positions: number;
  num_increased: number;
  num_decreased: number;
  num_closed: number;
  net_institutional_flow: number | null;
  notable_funds: string[] | null;
  conviction_score: number | null;
  ai_summary: string | null;
  updated_at: string;
}

export interface EarningsAnalysis {
  id: number;
  symbol: string;
  fiscal_quarter: string;
  transcript_date: string | null;
  conviction_score: number | null;
  management_tone: 'bullish' | 'neutral' | 'cautious' | 'bearish' | null;
  guidance_direction: 'raised' | 'maintained' | 'lowered' | 'not_given' | null;
  key_positives: string[] | null;
  key_concerns: string[] | null;
  hedging_language_count: number | null;
  confidence_phrases_count: number | null;
  forward_catalysts: string[] | null;
  competitive_position: 'strengthening' | 'stable' | 'weakening' | null;
  one_line_summary: string | null;
  full_analysis: Record<string, unknown> | null;
  analyzed_at: string;
}

export interface SECFilingAnalysis {
  id: number;
  symbol: string;
  filing_type: string | null;
  filing_date: string | null;
  risks_added: string[] | null;
  risks_removed: string[] | null;
  material_changes: string[] | null;
  overall_direction: 'improving' | 'stable' | 'deteriorating' | null;
  risk_score: number | null;
  ai_summary: string | null;
  analyzed_at: string;
}

export interface NewsSentiment {
  symbol: string;
  sentiment_score: number | null;
  sentiment_label: 'positive' | 'neutral' | 'negative' | null;
  sentiment_velocity: number | null;
  num_articles_7d: number | null;
  top_headline: string | null;
  ai_summary: string | null;
  updated_at: string;
}

export interface OptionsFlowSignals {
  symbol: string;
  net_flow_1d: number | null;
  net_flow_5d: number | null;
  num_sweeps_1d: number | null;
  num_blocks_1d: number | null;
  largest_print_value: number | null;
  largest_print_type: 'call' | 'put' | null;
  largest_print_expiry: string | null;
  flow_sentiment: 'bullish' | 'bearish' | 'neutral' | null;
  conviction_score: number | null;
  updated_at: string;
}

export interface SentinelScore {
  symbol: string;
  technical_score: number | null;
  fundamental_score: number | null;
  earnings_ai_score: number | null;
  insider_score: number | null;
  institutional_score: number | null;
  news_sentiment_score: number | null;
  options_flow_score: number | null;
  sentinel_score: number | null;
  score_change_1d: number | null;
  score_change_7d: number | null;
  rank: number | null;
  percentile: number | null;
  flags: string[];
  score_metadata: ScoreMetadata | null;
  computed_at: string;
}

// ============================================
// COMPOSITE FLAG TYPES
// ============================================

export type ValueReversalConditionKey =
  | 'deep_pullback'
  | 'insider_cluster_buy'
  | 'first_buy_12mo'
  | 'macd_shift'
  | 'fcf_yield'
  | 'pe_compression';

export interface DeepPullbackResult {
  met: boolean;
  pct_from_high: number | null;
}

export interface InsiderClusterBuyResult {
  met: boolean;
  buyers: string[];
  total_value: number;
  window_start: string | null;
  window_end: string | null;
}

export interface FirstBuy12MoResult {
  met: boolean;
  insider: string | null;
}

export interface MACDShiftResult {
  met: boolean;
  current_histogram: number | null;
  prior_negative_date: string | null;
}

export interface FCFYieldResult {
  met: boolean;
  yield_pct: number | null;
}

export interface PECompressionResult {
  met: boolean;
  current_pe: number | null;
  forward_pe: number | null;
}

export interface ValueReversalDetails {
  deep_pullback: DeepPullbackResult;
  insider_cluster_buy: InsiderClusterBuyResult;
  first_buy_12mo: FirstBuy12MoResult;
  macd_shift: MACDShiftResult;
  fcf_yield: FCFYieldResult;
  pe_compression: PECompressionResult;
}

export interface ValueReversalResult {
  fired: boolean;
  conditions_met: number;
  conviction: number;
  details: ValueReversalDetails;
}

export interface ScoreMetadata {
  value_reversal?: ValueReversalResult;
}

export interface CompositeFlags {
  flags: string[];
  metadata: ScoreMetadata;
}

export interface ValueReversalInput {
  technicals: TechnicalSignals | null;
  fundamentals: Fundamentals | null;
  insiderTrades: InsiderTrade[];
  prices: PriceBar[];
  marketCap: number | null;
}

export interface SectorSignals {
  sector: string;
  avg_sentinel_score: number | null;
  avg_technical_score: number | null;
  avg_earnings_ai_score: number | null;
  sector_rs_rank: number | null;
  pct_above_sma50: number | null;
  pct_above_sma200: number | null;
  net_insider_flow_30d: number | null;
  net_institutional_flow: number | null;
  net_options_flow_5d: number | null;
  stocks_above_75_score: number | null;
  total_stocks: number | null;
  rotation_signal: 'money_inflow' | 'money_outflow' | 'neutral' | null;
  sector_narrative: string | null;
  key_drivers: string[] | null;
  top_opportunity: string | null;
  biggest_risk: string | null;
  avg_return_1d: number | null;
  avg_return_5d: number | null;
  avg_return_30d: number | null;
  avg_volume_ratio: number | null;
  updated_at: string;
}

export interface WatchlistItem {
  id: number;
  user_id: string;
  symbol: string;
  added_at: string;
  notes: string | null;
  target_price: number | null;
}

export interface AlertHistory {
  id: number;
  symbol: string;
  alert_type: string;
  message: string | null;
  sentinel_score: number | null;
  discord_message_id: string | null;
  created_at: string;
}

// ============================================
// SIGNAL SNAPSHOT & PERFORMANCE TYPES
// ============================================

export interface SignalSnapshot {
  id: number;
  symbol: string;
  snapshot_date: string;
  price_at_signal: number;
  sentinel_score: number | null;
  technical_score: number | null;
  fundamental_score: number | null;
  earnings_ai_score: number | null;
  insider_score: number | null;
  institutional_score: number | null;
  news_sentiment_score: number | null;
  options_flow_score: number | null;
  insider_flags: string[] | null;
  flow_flags: string[] | null;
  sector: string | null;
  sector_rotation_signal: string | null;
  trigger_type: string;
  trigger_detail: string | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
  return_60d: number | null;
  return_90d: number | null;
  alpha_7d: number | null;
  alpha_30d: number | null;
  alpha_90d: number | null;
  max_drawdown_30d: number | null;
  max_drawdown_90d: number | null;
  created_at: string;
}

export interface SignalPerformance {
  id: number;
  signal_type: string;
  period: string;
  computed_date: string;
  total_signals: number;
  avg_return: number | null;
  median_return: number | null;
  win_rate: number | null;
  avg_alpha: number | null;
  median_alpha: number | null;
  avg_max_drawdown: number | null;
  best_return: number | null;
  worst_return: number | null;
  sharpe_estimate: number | null;
  sample_start: string | null;
  sample_end: string | null;
  symbols_involved: string[] | null;
}

export interface ScoreBucketPerformance {
  id: number;
  bucket: string;
  period: string;
  computed_date: string;
  num_stocks: number;
  avg_return: number | null;
  avg_alpha: number | null;
  win_rate: number | null;
}

// ============================================
// CRYPTO TYPES
// ============================================

export interface CryptoAsset {
  symbol: string;
  name: string;
  coingecko_id: string | null;
  category: string | null;
  market_cap_rank: number | null;
  is_active: boolean;
  updated_at: string;
}

export interface CryptoDailyPrice {
  id: number;
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  market_cap: number | null;
}

export interface CryptoSignals {
  symbol: string;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  volume_ratio_20d: number | null;
  pct_from_ath: number | null;
  computed_at: string;
}

export interface CryptoScore {
  symbol: string;
  technical_score: number | null;
  momentum_score: number | null;
  volume_score: number | null;
  sentiment_score: number | null;
  composite_score: number | null;
  rank: number | null;
  computed_at: string;
}

// ============================================
// FLAG TYPES
// ============================================

export type InsiderFlag =
  | 'CLUSTER_BUY'
  | 'CLUSTER_SELL'
  | 'CEO_BUY'
  | 'CEO_SELL'
  | 'LARGE_BUY'
  | 'MEGA_BUY'
  | 'CONTRARIAN_BUY'
  | 'FIRST_BUY_12MO'
  | 'ACCELERATING_SELLS';

export type FlowFlag =
  | 'MEGA_BLOCK_CALL'
  | 'MEGA_BLOCK_PUT'
  | 'SWEEP_STORM_CALLS'
  | 'SWEEP_STORM_PUTS'
  | 'DARK_POOL_LARGE'
  | 'EARNINGS_POSITIONING'
  | 'UNUSUAL_VOLUME'
  | 'PUT_WALL'
  | 'CALL_WALL';

// ============================================
// CHART EVENT TYPES
// ============================================

export type ChartEventCategory = 'insider_buy' | 'insider_sell' | 'earnings' | 'sec_filing';

export interface ChartEvent {
  date: string;
  category: ChartEventCategory;
  label: string;
  detail: string;
}

// ============================================
// SCORING TYPES
// ============================================

export interface StockSignals {
  technical: TechnicalSignals;
  fundamentals: Fundamentals;
  earnings: EarningsAnalysis | null;
  insider: InsiderSignals | null;
  institutional: InstitutionalSignals | null;
  news: NewsSentiment | null;
  flow: OptionsFlowSignals | null;
}

export interface ComputedSentinelScore {
  sentinel_score: number;
  technical_score: number;
  fundamental_score: number;
  earnings_ai_score: number;
  insider_score: number;
  institutional_score: number;
  news_sentiment_score: number;
  options_flow_score: number;
}

export interface ScoredStock extends SentinelScore {
  name: string;
  sector: string | null;
  one_line_summary: string | null;
}

// ============================================
// API RESPONSE TYPES (Financial Datasets)
// ============================================

export interface FDCryptoPriceBar {
  ticker: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  time: string;
}

export interface FDStockPrice {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  time: string;
  time_milliseconds: number;
}

export interface FDCompanyFacts {
  ticker: string;
  name: string;
  cik: string | null;
  industry: string | null;
  sector: string | null;
  category: string | null;
  exchange: string | null;
  is_active: boolean;
  location: string | null;
  sic_code: string | null;
  sic_industry: string | null;
  sic_sector: string | null;
  sec_filings_url: string | null;
}

export interface FDInsiderTrade {
  ticker: string;
  issuer: string | null;
  name: string;
  title: string | null;
  is_board_director: boolean;
  transaction_date: string;
  transaction_shares: number;
  transaction_price_per_share: number | null;
  transaction_value: number | null;
  shares_owned_before_transaction: number | null;
  shares_owned_after_transaction: number | null;
  security_title: string | null;
  transaction_type: string;
  filing_date: string | null;
}

export interface FDInstitutionalOwnership {
  ticker: string;
  investor: string;
  report_period: string;
  security_type: string | null;
  price: number | null;
  shares: number;
  market_value: number | null;
}

export interface FDIncomeStatement {
  ticker: string;
  report_period: string;
  fiscal_period: string | null;
  period: string;
  currency: string | null;
  revenue: number | null;
  cost_of_revenue: number | null;
  gross_profit: number | null;
  operating_expense: number | null;
  operating_income: number | null;
  interest_expense: number | null;
  ebit: number | null;
  income_tax_expense: number | null;
  net_income: number | null;
  net_income_common_stock: number | null;
  earnings_per_share: number | null;
  earnings_per_share_diluted: number | null;
  weighted_average_shares: number | null;
  weighted_average_shares_diluted: number | null;
}

export interface FDBalanceSheet {
  ticker: string;
  report_period: string;
  fiscal_period: string | null;
  period: string;
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  total_debt: number | null;
  net_debt: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  cash_and_equivalents: number | null;
  inventory: number | null;
  shares_outstanding: number | null;
}

export interface FDCashFlowStatement {
  ticker: string;
  report_period: string;
  fiscal_period: string | null;
  period: string;
  operating_cash_flow: number | null;
  capital_expenditure: number | null;
  free_cash_flow: number | null;
  dividends_paid: number | null;
  share_repurchase: number | null;
}

export interface FDFinancialMetricsSnapshot {
  ticker: string;
  market_cap: number | null;
  enterprise_value: number | null;
  price_to_earnings_ratio: number | null;
  price_to_book_ratio: number | null;
  price_to_sales_ratio: number | null;
  peg_ratio: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  return_on_equity: number | null;
  return_on_assets: number | null;
  return_on_invested_capital: number | null;
  current_ratio: number | null;
  debt_to_equity: number | null;
  debt_to_assets: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  free_cash_flow_per_share: number | null;
  free_cash_flow_yield: number | null;
  earnings_per_share: number | null;
  book_value_per_share: number | null;
  payout_ratio: number | null;
}

export interface FDSECFiling {
  ticker: string;
  filing_type: string;
  filing_date: string;
  report_date: string | null;
  url: string;
}

export interface FDNewsArticle {
  ticker: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  description: string | null;
}

export interface FDAnalystEstimate {
  fiscal_period: string;
  period: 'annual' | 'quarterly';
  revenue: number | null;
  earnings_per_share: number | null;
}

export interface FDEarningsTimeDimension {
  fiscal_period: string | null;
  currency: string | null;
  revenue: number | null;
  estimated_revenue: number | null;
  revenue_surprise: 'BEAT' | 'MISS' | 'MEET' | null;
  earnings_per_share: number | null;
  estimated_earnings_per_share: number | null;
  eps_surprise: 'BEAT' | 'MISS' | 'MEET' | null;
  net_income: number | null;
  free_cash_flow: number | null;
}

export interface FDEarnings {
  ticker: string;
  report_period: string;
  fiscal_period: string | null;
  currency: string | null;
  quarterly: FDEarningsTimeDimension | null;
  annual: FDEarningsTimeDimension | null;
}

// ============================================
// ERROR TYPES
// ============================================

export type ErrorCategory =
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'server_error'
  | 'network'
  | 'circuit_open'
  | 'unknown';

// ============================================
// AI / LLM TYPES
// ============================================

export type LLMProvider = 'anthropic' | 'gemini' | 'openrouter';

export interface AIAnalysisResult {
  sentiment_score: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  narrative: string;
  key_factors: string[];
  risk_factors: string[];
  catalyst_timeline: Array<{
    event: string;
    expected_date: string;
    impact: 'positive' | 'negative' | 'uncertain';
  }>;
  confidence: number;
}

export interface LLMResponse<T = unknown> {
  parsed: T;
  raw: string;
  model: string;
  provider: LLMProvider;
  tokens_used: number | null;
}

// ============================================
// SCREENER TYPES
// ============================================

export interface ScreenerFilters {
  price_above_sma200?: boolean;
  price_above_sma150?: boolean;
  price_above_sma50?: boolean;
  sma50_above_sma150?: boolean;
  sma150_above_sma200?: boolean;
  sma200_trending_up_1mo?: boolean;
  sma_distance_max_pct?: number;
  sma_converging?: boolean;
  within_25pct_of_52w_high?: boolean;
  within_10pct_of_52w_high?: boolean;
  above_30pct_from_52w_low?: boolean;
  rs_rank_3m_min?: number;
  rs_rank_6m_min?: number;
  revenue_growth_qoq_min?: number;
  earnings_growth_qoq_min?: number;
  revenue_growth_yoy_min?: number;
  earnings_growth_yoy_min?: number;
  volume_ratio_50d_min?: number;
  insider_buyers_30d_min?: number;
  insider_net_buy_positive?: boolean;
  insider_score_min?: number;
  institutional_score_min?: number;
  options_flow_score_min?: number;
  sentinel_score_min?: number;
  earnings_ai_conviction_min?: number;
  sectors?: string[];
  market_cap_min?: number;
  market_cap_max?: number;
  has_active_signal?: boolean;
  has_value_reversal_signal?: boolean;
  has_flag?: string;
  min_signal_win_rate?: number;
}

export interface ActiveSignal {
  trigger_type: string;
  snapshot_date: string;
  return_7d: number | null;
  return_30d: number | null;
}

export interface SignalPerformanceStats {
  win_rate: number;
  avg_return: number;
  avg_alpha: number;
  total_signals: number;
}

export interface ScreenerPreset {
  name: string;
  description: string;
  filters: ScreenerFilters;
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
}

// ============================================
// INDICATOR COMPUTATION TYPES
// ============================================

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface FiftyTwoWeekRange {
  high: number;
  low: number;
  pct_from_high: number;
  pct_from_low: number;
}

// ============================================
// SIGNAL DETECTION TYPES
// ============================================

export interface VolumeAnomaly {
  symbol: string;
  date: string;
  volume: number;
  avg_volume_50d: number;
  volume_ratio: number;
  is_anomaly: boolean;
  anomaly_severity: 'extreme' | 'high' | 'moderate' | 'none';
}

export type FilingFlagType = 'DILUTION_FILING' | '13D_AMENDMENT' | 'INSIDER_FORM4';

export interface FilingFlag {
  type: FilingFlagType;
  filing: FDSECFiling;
}

export interface PriceSpikeReversal {
  spike_start_date: string;
  spike_peak_date: string;
  spike_start_price: number;
  spike_peak_price: number;
  current_price: number;
  spike_pct: number;
  reversal_pct: number;
  days_to_peak: number;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  width: number;
  pct_b: number;
  is_squeeze: boolean;
}

export type DivergenceType = 'bullish' | 'bearish';

export interface RSIDivergence {
  type: DivergenceType;
  price_date_1: string;
  price_date_2: string;
  price_1: number;
  price_2: number;
  rsi_1: number;
  rsi_2: number;
}

export interface VolumeDryUp {
  consecutive_low_volume_days: number;
  avg_ratio: number;
  price_range_pct: number;
}

export type SignalSeverity = 'HIGH' | 'WATCH' | 'CAUTION' | 'RISK' | 'INVESTIGATE';
export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

export interface DetectedSignal {
  id: string;
  type: string;
  label: string;
  severity: SignalSeverity;
  direction: SignalDirection;
  description: string;
  date: string;
  icon: string;
}
