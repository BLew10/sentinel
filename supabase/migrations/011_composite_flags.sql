-- ============================================
-- COMPOSITE FLAGS ON SENTINEL SCORES
-- ============================================

ALTER TABLE sentinel_scores
  ADD COLUMN flags JSONB DEFAULT '[]',
  ADD COLUMN score_metadata JSONB;
