// Worker process for video export processing
import { exportQueue, ExportJobData, updateJobProgress } from './worker-lib/export-queue'
import { 
  downloadVideo, 
  generateSubtitleFile, 
  buildFFmpegCommand, 
  uploadToS3, 
  cleanupTempFiles 
} from './lib/export-utils'
import path from 'path'

console.log('🚀 Starting video export worker...')

// Health check server disabled for now
// require('./health-check')

// Process export jobs
exportQueue.process('process-export', 3, async (job) => {
  const jobData: ExportJobData = job.data
  const { jobId, recordings, videoSections, transcriptions, focusSegments, exportSettings } = jobData
  
  console.log(`📹 Processing export job: ${jobId}`)
  
  try {
    // Step 1: Download videos
    await updateJobProgress(jobId, {
      percentage: 5,
      message: 'Downloading video files...',
      stage: 'downloading'
    })
    
    console.log(`⬇️ Downloading ${recordings.length} video files...`)
    const localVideos: string[] = []
    
    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i]
      const filename = `${jobId}_video_${i}.mp4`
      
      try {
        const localPath = await downloadVideo(recording.recording_url, filename)
        localVideos.push(localPath)
        
        const progress = 5 + ((i + 1) / recordings.length) * 15 // 5-20%
        await updateJobProgress(jobId, {
          percentage: Math.round(progress),
          message: `Downloaded video ${i + 1}/${recordings.length}`,
          stage: 'downloading'
        })
      } catch (error) {
        console.error(`Failed to download video ${recording.id}:`, error)
        throw new Error(`Failed to download video: ${error}`)
      }
    }
    
    console.log(`✅ Downloaded ${localVideos.length} videos`)
    
    // Step 2: Generate subtitles if requested
    let subtitleFile: string | undefined
    if (exportSettings.includeSubtitles && transcriptions.length > 0) {
      await updateJobProgress(jobId, {
        percentage: 25,
        message: 'Generating subtitles...',
        stage: 'processing'
      })
      
      console.log('📝 Generating subtitle file...')
      subtitleFile = await generateSubtitleFile(transcriptions, videoSections, jobId)
      console.log(`✅ Generated subtitles: ${subtitleFile}`)
    }
    
    // Step 3: Process video with FFmpeg
    await updateJobProgress(jobId, {
      percentage: 30,
      message: 'Processing video...',
      stage: 'processing'
    })
    
    const outputPath = path.join('/tmp', `${jobId}_final.${exportSettings.format}`)
    
    console.log('🎬 Starting FFmpeg processing...')
    await buildFFmpegCommand({
      inputVideos: localVideos,
      outputPath,
      videoSections,
      focusSegments,
      subtitleFile,
      settings: exportSettings
    })
    
    await updateJobProgress(jobId, {
      percentage: 85,
      message: 'Video processing completed',
      stage: 'processing'
    })
    
    console.log('✅ FFmpeg processing completed')
    
    // Step 4: Upload to S3/R2
    await updateJobProgress(jobId, {
      percentage: 90,
      message: 'Uploading final video...',
      stage: 'uploading'
    })
    
    const s3Key = `exports/${jobId}_final.${exportSettings.format}`
    console.log(`☁️ Uploading to S3: ${s3Key}`)
    
    const downloadUrl = await uploadToS3(outputPath, s3Key)
    
    console.log(`✅ Upload completed: ${downloadUrl}`)
    
    // Step 5: Cleanup temporary files
    const tempFiles = [...localVideos, outputPath]
    if (subtitleFile) tempFiles.push(subtitleFile)
    
    await cleanupTempFiles(tempFiles)
    
    // Complete job
    await updateJobProgress(jobId, {
      percentage: 100,
      message: 'Export completed successfully!',
      stage: 'completed',
      downloadUrl
    })
    
    console.log(`🎉 Export job ${jobId} completed successfully!`)
    
    return {
      success: true,
      downloadUrl,
      jobId
    }
    
  } catch (error) {
    console.error(`❌ Export job ${jobId} failed:`, error)
    
    await updateJobProgress(jobId, {
      percentage: 0,
      message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      stage: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    throw error
  }
})

// Handle job events
exportQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result)
})

exportQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message)
})

exportQueue.on('stalled', (job) => {
  console.warn(`⚠️ Job ${job.id} stalled`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down worker...')
  await exportQueue.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down worker...')
  await exportQueue.close()
  process.exit(0)
})

console.log('✅ Video export worker started and waiting for jobs...')