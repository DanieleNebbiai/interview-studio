-- Fix database inconsistencies

-- 1. Fix recordings.duration type (from integer to double precision)
ALTER TABLE recordings ALTER COLUMN duration TYPE double precision;

-- 2. Fix export_jobs.room_id type and add foreign key
ALTER TABLE export_jobs ALTER COLUMN room_id TYPE uuid USING room_id::uuid;
-- Note: This might fail if there are invalid UUIDs, check data first

-- 3. Add missing performance indexes
CREATE INDEX IF NOT EXISTS idx_video_sections_room_user 
  ON video_sections(room_id, user_modified);

CREATE INDEX IF NOT EXISTS idx_cut_segments_room_applied 
  ON cut_segments(room_id, applied, ai_generated);

CREATE INDEX IF NOT EXISTS idx_export_jobs_status 
  ON export_jobs(status, created_at);

-- 4. Add better indexing for time-based queries
CREATE INDEX IF NOT EXISTS idx_video_sections_time_range 
  ON video_sections(room_id, start_time, end_time) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_focus_segments_time_range 
  ON focus_segments(room_id, start_time, end_time);

-- 5. Add export metadata column (optional)
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS export_metadata jsonb;

-- 6. Add version tracking for video sections (optional)
ALTER TABLE video_sections ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Comments
COMMENT ON COLUMN recordings.duration IS 'Duration in seconds (double precision for fractional seconds)';
COMMENT ON COLUMN video_sections.version IS 'Version number for tracking user edit history';
COMMENT ON COLUMN export_jobs.export_metadata IS 'Export settings and metadata (quality, format, etc.)';