import ffmpeg from 'fluent-ffmpeg'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { exec } from 'child_process'
// Remove unused imports to fix build
// const execAsync = promisify(exec)

// Type definitions for export functionality
interface ExportJobData {
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

// S3 Client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://55c955ba9bb570ed273d9d7ff49ee37e.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true, // Required for R2
})

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'interview-studio-exports'
const TEMP_DIR = '/tmp'

// Download video from URL to local file
export async function downloadVideo(url: string, filename: string): Promise<string> {
  const localPath = path.join(TEMP_DIR, filename)
  
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`)
    }
    
    const buffer = await response.arrayBuffer()
    fs.writeFileSync(localPath, Buffer.from(buffer))
    
    return localPath
  } catch (error) {
    throw new Error(`Error downloading video ${url}: ${error}`)
  }
}

// Generate subtitle file from transcriptions
export async function generateSubtitleFile(
  transcriptions: ExportJobData['transcriptions'],
  videoSections: ExportJobData['videoSections'],
  jobId: string
): Promise<string> {
  const subtitlePath = path.join(TEMP_DIR, `${jobId}_subtitles.srt`)
  
  let srtContent = ''
  let subtitleIndex = 1
  
  // Generate SRT format subtitles
  for (const transcription of transcriptions) {
    if (transcription.word_timestamps?.words) {
      for (const word of transcription.word_timestamps.words) {
        // Check if this word is in a valid (non-deleted) section
        const isInValidSection = videoSections.some(section => 
          !section.isDeleted && 
          word.start >= section.startTime && 
          word.end <= section.endTime
        )
        
        if (isInValidSection) {
          const startTime = formatSRTTime(word.start)
          const endTime = formatSRTTime(word.end)
          
          srtContent += `${subtitleIndex}\n`
          srtContent += `${startTime} --> ${endTime}\n`
          srtContent += `${word.word}\n\n`
          
          subtitleIndex++
        }
      }
    }
  }
  
  fs.writeFileSync(subtitlePath, srtContent, 'utf8')
  return subtitlePath
}

// Format time for SRT (HH:MM:SS,mmm)
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
}

// Build FFmpeg command for multi-video export
export function buildFFmpegCommand(data: {
  inputVideos: string[]
  outputPath: string
  videoSections: ExportJobData['videoSections']
  focusSegments: ExportJobData['focusSegments']
  subtitleFile?: string
  settings: ExportJobData['exportSettings']
}): Promise<string> {
  
  return new Promise((resolve, reject) => {
    const { inputVideos, outputPath, videoSections, focusSegments, subtitleFile, settings } = data
    
    const command = ffmpeg()
    
    // Add input videos
    inputVideos.forEach(video => {
      command.addInput(video)
    })
    
    // Build complex filter for multi-video layout
    const validSections = videoSections.filter(section => !section.isDeleted)
    const filterComplex: string[] = []
    const segmentOutputs: string[] = []
    
    // Process each valid section
    validSections.forEach((section, index) => {
      // const duration = section.endTime - section.startTime
      const speed = section.playbackSpeed
      
      // Check if this section has focus
      const activeFocus = focusSegments.find(focus =>
        section.startTime >= focus.startTime && section.endTime <= focus.endTime
      )
      
      if (activeFocus && inputVideos.length > 1) {
        // Focus mode - show only focused video
        const focusIndex = 0 // For now, focus on first video (can be improved)
        filterComplex.push(
          `[${focusIndex}:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},setpts=PTS/${speed}[v${index}]`,
          `[${focusIndex}:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},asetpts=PTS/${speed}[a${index}]`
        )
      } else {
        // Grid mode - show all videos
        if (inputVideos.length === 1) {
          filterComplex.push(
            `[0:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},setpts=PTS/${speed}[v${index}]`,
            `[0:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},asetpts=PTS/${speed}[a${index}]`
          )
        } else if (inputVideos.length === 2) {
          // 2-video grid
          filterComplex.push(
            `[0:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},setpts=PTS/${speed},scale=960:540[v0_${index}]`,
            `[1:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},setpts=PTS/${speed},scale=960:540[v1_${index}]`,
            `[v0_${index}][v1_${index}]hstack[v${index}]`,
            `[0:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},asetpts=PTS/${speed}[a0_${index}]`,
            `[1:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},asetpts=PTS/${speed}[a1_${index}]`,
            `[a0_${index}][a1_${index}]amix=inputs=2[a${index}]`
          )
        }
        // Can add more layouts for 3, 4+ videos
      }
      
      segmentOutputs.push(`[v${index}][a${index}]`)
    })
    
    // Concatenate all segments
    if (segmentOutputs.length > 1) {
      filterComplex.push(
        `${segmentOutputs.join('')}concat=n=${segmentOutputs.length}:v=1:a=1[finalvideo][finalaudio]`
      )
    } else {
      // Single segment - use the outputs directly
      // No additional filter needed, [v0] becomes [finalvideo], [a0] becomes [finalaudio]
    }
    
    // TEMP: Simplified approach without complex filters
    console.log('🎬 Using simplified FFmpeg approach for debugging')
    
    // Simple trim without complex filters
    command
      .seekInput(validSections[0].startTime.toFixed(2))
      .duration((validSections[0].endTime - validSections[0].startTime).toFixed(2))
    
    // TEMP: Skip all complex filtering - use simple seek/duration
    console.log('⚠️ Skipping complex filters - using simple seek/duration approach')
    
    // Output settings with explicit codecs for compatibility
    command
      .format(settings.format)
      .videoCodec('libx264') // H.264 for broad compatibility
      .audioCodec('aac')     // AAC for broad compatibility
      .videoBitrate(getVideoBitrate(settings.quality))
      .audioBitrate('128k')
      .fps(settings.framerate)
      .addOption('-preset', 'fast') // Faster encoding
      .addOption('-profile:v', 'high') // High profile for better compatibility
      .addOption('-level', '4.0') // Level 4.0 for compatibility
      .addOption('-pix_fmt', 'yuv420p') // Pixel format for compatibility
      .output(outputPath)
    
    // Execute command
    command
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine)
      })
      .on('end', () => {
        console.log('FFmpeg processing completed')
        resolve(outputPath)
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err)
        reject(err)
      })
      .run()
  })
}

function getVideoBitrate(quality: string): string {
  switch (quality) {
    case '4k': return '8000k'
    case '1080p': return '2000k'
    case '720p': return '1000k'
    default: return '1000k'
  }
}

// Upload file to S3/R2
export async function uploadToS3(filePath: string, key: string): Promise<string> {
  console.log('🔍 R2 Configuration:', {
    endpoint: process.env.R2_ENDPOINT,
    bucket: BUCKET_NAME,
    hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
  })
  
  try {
    const fileContent = fs.readFileSync(filePath)
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: 'video/mp4',
    })
    
    await s3Client.send(command)
    
    // Generate presigned URL for download (expires in 24 hours)
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
    
    const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 })
    
    return downloadUrl
  } catch (error) {
    throw new Error(`Failed to upload to S3: ${error}`)
  }
}

// Clean up temporary files
export async function cleanupTempFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        console.log(`Cleaned up temp file: ${filePath}`)
      }
    } catch (error) {
      console.error(`Error cleaning up ${filePath}:`, error)
    }
  }
}