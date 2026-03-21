'use client';

const FLAG_META: Record<string, { label: string; color: 'green' | 'red' | 'amber' | 'cyan' | 'purple'; tooltip: string }> = {
  // Technical - bullish
  GOLDEN_CROSS: { label: 'Golden Cross', color: 'green', tooltip: 'SMA 50 crossed above SMA 200 — historically a strong long-term buy signal' },
  MACD_BULLISH_CROSS: { label: 'MACD Bull Cross', color: 'green', tooltip: 'Momentum turning bullish — often precedes a sustained move up' },
  VOLUME_SURGE: { label: 'Volume Surge', color: 'cyan', tooltip: '2x+ normal volume — big players are likely accumulating' },
  NEW_52W_HIGH: { label: 'New 52W High', color: 'green', tooltip: 'Making new highs — strongest stocks keep making new highs' },
  NEAR_52W_HIGH: { label: 'Near 52W High', color: 'green', tooltip: 'Within 5% of highs — poised for potential breakout' },
  BREAKING_OUT: { label: 'Breakout', color: 'green', tooltip: 'Stage 2 uptrend + near highs + elevated volume — textbook breakout setup' },
  STAGE2_UPTREND: { label: 'Stage 2', color: 'green', tooltip: 'All major moving averages aligned bullishly — the best stage to be long' },
  RSI_OVERSOLD: { label: 'RSI Oversold', color: 'amber', tooltip: 'RSI below 30 — selling may be exhausted, watch for bounce confirmation' },

  // Technical - bearish
  DEATH_CROSS: { label: 'Death Cross', color: 'red', tooltip: 'SMA 50 crossed below SMA 200 — long-term trend is turning negative' },
  RSI_OVERBOUGHT: { label: 'RSI Overbought', color: 'red', tooltip: 'RSI above 70 — momentum stretched, consider trimming or waiting' },
  MACD_BEARISH_CROSS: { label: 'MACD Bear Cross', color: 'red', tooltip: 'Momentum shifting bearish — risk of further downside' },
  BELOW_SMA200: { label: 'Below SMA200', color: 'red', tooltip: 'Below the 200-day average — institutional buyers typically wait for this to recover' },

  // Fundamental - bullish
  DEEP_VALUE: { label: 'Deep Value', color: 'green', tooltip: 'PE < 12 and P/B < 2 — priced cheaply, but verify the business isn\'t declining' },
  HIGH_GROWTH: { label: 'High Growth', color: 'green', tooltip: 'Revenue and earnings both growing 25%+ — rare combination worth paying up for' },
  ACCELERATING_REVENUE: { label: 'Rev Accel', color: 'green', tooltip: 'Revenue growth is accelerating quarter over quarter — business gaining momentum' },
  ACCELERATING_EARNINGS: { label: 'Earn Accel', color: 'green', tooltip: 'Earnings growth accelerating — operating leverage kicking in' },
  MARGIN_EXPANSION: { label: 'Margin Exp', color: 'green', tooltip: 'Margins expanding — the company is becoming more profitable per dollar of revenue' },
  HIGH_ROE: { label: 'High ROE', color: 'green', tooltip: 'ROE above 25% — the company generates exceptional returns on shareholder capital' },
  CASH_MACHINE: { label: 'Cash Machine', color: 'purple', tooltip: 'High margins + high ROE + low debt — a capital compounder, the ideal business profile' },

  // Fundamental - bearish
  OVER_LEVERAGED: { label: 'High Debt', color: 'red', tooltip: 'Debt-to-equity above 2.5x — vulnerable to rate hikes and revenue slowdowns' },
  NEGATIVE_EARNINGS: { label: 'Neg Earnings', color: 'red', tooltip: 'Losing money — needs a path to profitability or it\'s burning through cash' },

  // Insider
  CLUSTER_BUY: { label: 'Cluster Buy', color: 'green', tooltip: 'Multiple insiders buying at once — they see value the market hasn\'t priced in' },
  CLUSTER_SELL: { label: 'Cluster Sell', color: 'red', tooltip: 'Multiple insiders selling simultaneously — they may know something' },
  CEO_BUY: { label: 'CEO Buy', color: 'green', tooltip: 'CEO buying shares on the open market — strongest insider signal' },
  CEO_SELL: { label: 'CEO Sell', color: 'amber', tooltip: 'CEO selling shares — may be planned (10b5-1), but worth monitoring' },
  LARGE_BUY: { label: 'Large Buy', color: 'green', tooltip: 'Insider purchase over $500K — significant commitment of personal capital' },
  MEGA_BUY: { label: 'Mega Buy', color: 'green', tooltip: 'Insider purchase over $1M — extremely high conviction from management' },
  CONTRARIAN_BUY: { label: 'Contrarian', color: 'purple', tooltip: 'Insider buying while the stock is falling — they\'re betting the decline is overdone' },
  FIRST_BUY_12MO: { label: 'First Buy', color: 'cyan', tooltip: 'First insider buy in 12+ months — something changed to motivate buying' },
  ACCELERATING_SELLS: { label: 'Accel Sells', color: 'red', tooltip: 'Insider selling pace increasing — growing urgency to exit' },

  // Signal detection
  VOLUME_SPIKE: { label: 'Vol Spike', color: 'cyan', tooltip: '10x+ normal volume — extreme unusual activity detected' },
  EXTREME_VOLUME_SPIKE: { label: 'Extreme Vol', color: 'red', tooltip: '50x+ normal volume — something major is happening with this stock' },
  DILUTION_FILING: { label: 'Dilution', color: 'red', tooltip: 'SEC filing indicates a stock offering — typically dilutive to shareholders' },
  '13D_AMENDMENT': { label: '13D Filing', color: 'amber', tooltip: 'Major shareholder (5%+) changing position — watch for activist activity' },
  INSIDER_FORM4: { label: 'Form 4', color: 'cyan', tooltip: 'Insider ownership change reported to the SEC' },
  INSIDER_FILING_NEAR_SPIKE: { label: 'Insider+Spike', color: 'purple', tooltip: 'Insider filing within 2 days of a volume anomaly — warrants investigation' },
  PRICE_SPIKE_REVERSAL: { label: 'Spike Reversal', color: 'red', tooltip: 'Stock spiked 100%+ then reversed 20%+ — potential blow-off top pattern' },
  PENNY_STOCK_WARNING: { label: 'Penny Stock', color: 'red', tooltip: 'Price under $5 with small market cap — higher volatility and risk' },
};

const COLOR_CLASSES: Record<string, string> = {
  green: 'text-green bg-green-bg border-green/20',
  red: 'text-red bg-red-bg border-red/20',
  amber: 'text-amber bg-amber-bg border-amber/20',
  cyan: 'text-cyan bg-cyan/10 border-cyan/20',
  purple: 'text-purple bg-purple-bg border-purple/20',
};

export function FlagChip({ flag }: { flag: string }) {
  const meta = FLAG_META[flag];
  if (!meta) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border bg-bg-tertiary text-text-secondary border-border">
        {flag}
      </span>
    );
  }

  return (
    <span
      className={`group relative inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border cursor-help ${COLOR_CLASSES[meta.color]}`}
    >
      {meta.label}
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-2 text-[11px] font-normal text-text-primary bg-bg-primary border border-border rounded-lg shadow-lg whitespace-normal w-56 z-50 leading-relaxed">
        {meta.tooltip}
      </span>
    </span>
  );
}
