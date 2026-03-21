-- Add unique constraint needed for backtest upserts
ALTER TABLE signal_snapshots
  ADD CONSTRAINT signal_snapshots_symbol_date_type_key
  UNIQUE (symbol, snapshot_date, trigger_type);
