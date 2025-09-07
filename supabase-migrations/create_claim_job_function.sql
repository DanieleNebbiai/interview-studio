-- Function to atomically get and claim the next queued job
CREATE OR REPLACE FUNCTION get_and_claim_next_job()
RETURNS TABLE(id TEXT, job_data JSONB) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Find the oldest queued job and lock it
  SELECT ej.id, ej.job_data
  INTO job_record
  FROM export_jobs ej
  WHERE ej.status = 'queued'
  ORDER BY ej.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no job found, return null
  IF job_record.id IS NULL THEN
    RETURN;
  END IF;

  -- Update the job status to processing
  UPDATE export_jobs
  SET 
    status = 'processing',
    started_at = NOW(),
    updated_at = NOW(),
    attempts = attempts + 1
  WHERE export_jobs.id = job_record.id;

  -- Return the job data
  id := job_record.id;
  job_data := job_record.job_data;
  
  RETURN NEXT;
END;
$$;