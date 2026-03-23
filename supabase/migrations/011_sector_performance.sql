-- ============================================
-- SECTOR PERFORMANCE COLUMNS
-- Adds price return and volume metrics to
-- sector_signals for "hottest sectors" tracking
-- ============================================

ALTER TABLE sector_signals
  ADD COLUMN IF NOT EXISTS avg_return_1d NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS avg_return_5d NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS avg_return_30d NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS avg_volume_ratio NUMERIC(8,2);
