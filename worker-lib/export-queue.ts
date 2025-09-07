import Queue from 'bull'
import { createClient } from 'redis'

// Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

// Export Queue
export const exportQueue = new Queue('video-export', redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 5,
    removeOnFail: 10,
  },
})

// Job data types
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

// Helper to update job progress
export async function updateJobProgress(
  jobId: string, 
  progress: Partial<ExportJobProgress>
) {
  const job = await exportQueue.getJob(jobId)
  if (job) {
    await job.progress({
      ...progress,
      updatedAt: new Date().toISOString()
    })
  }
}

// Helper to get job status
export async function getJobStatus(jobId: string): Promise<ExportJobProgress | null> {
  try {
    const job = await exportQueue.getJob(jobId)
    if (!job) return null

    const state = await job.getState()
    const progress = job.progress()

    return {
      percentage: typeof progress === 'object' ? progress.percentage : 0,
      message: typeof progress === 'object' ? progress.message : 'Processing...',
      stage: state as ExportJobProgress['stage'],
      downloadUrl: typeof progress === 'object' ? progress.downloadUrl : undefined,
      error: typeof progress === 'object' ? progress.error : undefined
    }
  } catch (error) {
    console.error('Error getting job status:', error)
    return null
  }
}

console.log('Export queue initialized with Redis:', redisUrl)