-- Add alpha-based win rate to signal_performance
-- Raw win_rate measures "did the stock go up?" which is misleading in bear markets.
-- alpha_win_rate measures "did the stock beat SPY?" — a much more useful signal quality metric.
ALTER TABLE signal_performance ADD COLUMN alpha_win_rate NUMERIC(5,2);
