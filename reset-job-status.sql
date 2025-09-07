-- Reset job status from processing to queued
UPDATE export_jobs 
SET 
  status = 'queued',
  started_at = NULL,
  attempts = 0,
  updated_at = NOW()
WHERE id = 'export_room-018272-0a2_1757256310152';