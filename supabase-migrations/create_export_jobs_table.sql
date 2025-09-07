-- Create export_jobs table for Supabase-based queue system
CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress JSONB NOT NULL DEFAULT '{"percentage": 0, "message": "Queued", "stage": "queued"}',
  job_data JSONB NOT NULL,
  download_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_room_id ON export_jobs(room_id);

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_export_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_export_jobs_updated_at ON export_jobs;
CREATE TRIGGER trigger_export_jobs_updated_at
  BEFORE UPDATE ON export_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_export_jobs_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own jobs
CREATE POLICY "Users can view own export jobs" ON export_jobs
  FOR SELECT USING (auth.uid()::text = user_id);

-- Policy: Users can insert their own jobs  
CREATE POLICY "Users can create own export jobs" ON export_jobs
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Policy: Service role can do everything (for worker)
CREATE POLICY "Service role full access" ON export_jobs
  FOR ALL USING (auth.role() = 'service_role');