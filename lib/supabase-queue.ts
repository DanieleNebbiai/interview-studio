// Supabase-based queue system for export jobs
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables from .env.local for standalone scripts
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  config({ path: '.env.local' })
}

// Job data interfaces
export interface ExportJobData {
  jobId: string
  roomId: string
  userId?: string
  recordings: Array<{
    id: string
    recording_url: string
    duration: number
    participant_id: string
    recording_started_at?: string
  }>
  videoSections: Array<{
    id: string
    startTime: number
    endTime: number
    isDeleted: boolean
    playbackSpeed: number
    focusedParticipantId?: string
  }>
  transcriptions: Array<{
    id: string
    transcript_text: string
    word_timestamps: any
  }>
  exportSettings: {
    format: 'mp4' | 'webm'
    quality: '720p' | '1080p' | '4k'
    framerate: 25 | 30 | 60
    includeSubtitles: boolean
  }
}

export interface ExportJobProgress {
  percentage: number
  message: string
  stage: 'queued' | 'processing' | 'downloading' | 'uploading' | 'completed' | 'failed'
  downloadUrl?: string
  error?: string
}

// Initialize Supabase client for server operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export class SupabaseExportQueue {
  
  // Add a job to the queue
  async addJob(jobData: ExportJobData): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from('export_jobs')
      .insert({
        id: jobData.jobId,
        room_id: jobData.roomId,
        user_id: jobData.userId,
        status: 'queued',
        job_data: jobData,
        progress: {
          percentage: 0,
          message: 'Job queued',
          stage: 'queued'
        }
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to add job to queue:', error)
      throw new Error(`Failed to add job: ${error.message}`)
    }

    console.log(`✅ Job ${jobData.jobId} added to Supabase queue`)
    return { id: data.id }
  }

  // Get job status
  async getJobStatus(jobId: string): Promise<ExportJobProgress | null> {
    const { data, error } = await supabase
      .from('export_jobs')
      .select('status, progress, download_url, error_message')
      .eq('id', jobId)
      .single()

    if (error || !data) {
      console.error('Failed to get job status:', error)
      return null
    }

    const progress = data.progress as ExportJobProgress
    return {
      ...progress,
      downloadUrl: data.download_url || progress.downloadUrl,
      error: data.error_message || progress.error
    }
  }

  // Update job progress (used by worker)
  async updateJobProgress(jobId: string, progress: Partial<ExportJobProgress>, status?: string) {
    const updateData: any = {
      progress,
      updated_at: new Date().toISOString()
    }

    if (status) {
      updateData.status = status
      
      if (status === 'processing' && !updateData.started_at) {
        updateData.started_at = new Date().toISOString()
      }
      
      if (status === 'completed' || status === 'failed') {
        updateData.completed_at = new Date().toISOString()
      }

      if (status === 'completed' && progress.downloadUrl) {
        updateData.download_url = progress.downloadUrl
      }

      if (status === 'failed' && progress.error) {
        updateData.error_message = progress.error
      }
    }

    const { error } = await supabase
      .from('export_jobs')
      .update(updateData)
      .eq('id', jobId)

    if (error) {
      console.error('Failed to update job progress:', error)
      throw new Error(`Failed to update job: ${error.message}`)
    }

    console.log(`📊 Job ${jobId}: ${progress.percentage}% - ${progress.message}`)
  }

  // Get next queued job (used by worker)
  async getNextJob(): Promise<{ id: string; job_data: ExportJobData } | null> {
    // Get oldest queued job and mark as processing
    const { data, error } = await supabase.rpc('get_and_claim_next_job')

    if (error) {
      console.error('Failed to get next job:', error)
      return null
    }

    console.log('🔍 Raw RPC response:', { data, error })

    // The function returns an array, get the first element
    if (data && Array.isArray(data) && data.length > 0) {
      return data[0]
    }

    return null
  }

  // Get all jobs (for admin/debugging)
  async getAllJobs(limit = 50) {
    const { data, error } = await supabase
      .from('export_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Failed to get jobs:', error)
      return []
    }

    return data
  }
}

// Singleton instance
export const exportQueue = new SupabaseExportQueue()

// Helper functions for compatibility
export async function addJobToQueue(jobData: ExportJobData) {
  return exportQueue.addJob(jobData)
}

export async function getJobStatus(jobId: string) {
  return exportQueue.getJobStatus(jobId)
}

export async function updateJobProgress(jobId: string, progress: Partial<ExportJobProgress>) {
  const status = progress.stage === 'completed' ? 'completed' : 
                 progress.stage === 'failed' ? 'failed' :
                 progress.stage === 'queued' ? 'queued' : 'processing'
  
  return exportQueue.updateJobProgress(jobId, progress, status)
}

console.log('🚀 Supabase export queue initialized')