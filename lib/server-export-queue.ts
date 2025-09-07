// Server-only wrapper for export queue functionality
// This prevents Bull from being imported in the browser

import 'server-only'

export interface ExportJobData {
  jobId: string
  roomId: string
  userId?: string
  recordings: Array<{
    id: string
    recording_url: string
    duration: number
    participant_id: string
  }>
  videoSections: Array<{
    id: string
    startTime: number
    endTime: number
    isDeleted: boolean
    playbackSpeed: number
  }>
  focusSegments: Array<{
    id: string
    startTime: number
    endTime: number
    focusedParticipantId: string
    type: string
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
  stage: 'queued' | 'downloading' | 'processing' | 'uploading' | 'completed' | 'failed'
  downloadUrl?: string
  error?: string
}

// Server-only functions
export async function addJobToQueue(jobData: ExportJobData) {
  // Use Supabase queue system
  const { addJobToQueue: addSupabaseJob } = await import('../lib/supabase-queue')
  return addSupabaseJob(jobData)
}

export async function getJobStatus(jobId: string): Promise<ExportJobProgress | null> {
  // Use Supabase queue system
  const { getJobStatus: getSupabaseStatus } = await import('../lib/supabase-queue')
  return getSupabaseStatus(jobId)
}