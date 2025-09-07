// Clean API interface for export functionality (no Bull dependencies)

export interface ExportJobData {
  jobId: string
  roomId: string
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

export interface ExportProgress {
  percentage: number
  message: string
  stage: 'idle' | 'queued' | 'downloading' | 'processing' | 'uploading' | 'completed' | 'failed'
  downloadUrl?: string
  error?: string
}

// Simple in-memory store for development
class DevExportManager {
  private jobs = new Map<string, ExportJobData>()
  private jobStatus = new Map<string, ExportProgress>()

  async createJob(data: ExportJobData) {
    const jobId = data.jobId
    this.jobs.set(jobId, data)
    this.jobStatus.set(jobId, {
      percentage: 0,
      message: 'Export queued',
      stage: 'queued'
    })

    // Start demo processing
    this.simulateExportProcess(jobId)

    return { id: jobId }
  }

  async getJobStatus(jobId: string): Promise<ExportProgress | null> {
    return this.jobStatus.get(jobId) || null
  }

  private async simulateExportProcess(jobId: string) {
    const stages = [
      { percentage: 5, message: 'Downloading video files...', stage: 'downloading' as const, delay: 2000 },
      { percentage: 25, message: 'Downloaded video 1/2', stage: 'downloading' as const, delay: 1500 },
      { percentage: 30, message: 'Processing video...', stage: 'processing' as const, delay: 2000 },
      { percentage: 50, message: 'Applying cuts and speed changes...', stage: 'processing' as const, delay: 3000 },
      { percentage: 70, message: 'Generating subtitles...', stage: 'processing' as const, delay: 2000 },
      { percentage: 85, message: 'Finalizing video...', stage: 'processing' as const, delay: 2000 },
      { percentage: 90, message: 'Uploading to storage...', stage: 'uploading' as const, delay: 1500 },
      { percentage: 100, message: 'Export completed successfully!', stage: 'completed' as const, delay: 500 }
    ]

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, stage.delay))
      
      const progress: ExportProgress = {
        percentage: stage.percentage,
        message: stage.message,
        stage: stage.stage
      }

      // Add download URL on completion
      if (stage.stage === 'completed') {
        // For testing - this will be replaced with real R2 URL when worker runs
        progress.downloadUrl = `#demo-completed-${jobId}`
      }

      this.jobStatus.set(jobId, progress)
      console.log(`📊 Export ${jobId}: ${stage.percentage}% - ${stage.message}`)
    }
  }
}

const devExportManager = new DevExportManager()

// Export functions
export async function createExportJob(data: ExportJobData) {
  return devExportManager.createJob(data)
}

export async function getJobStatus(jobId: string): Promise<ExportProgress | null> {
  return devExportManager.getJobStatus(jobId)
}