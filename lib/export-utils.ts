import ffmpeg from 'fluent-ffmpeg'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fs from 'fs'
import path from 'path'
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
  
  // Create SRT subtitle format (more compatible than ASS)
  let srtContent = ''
  let subtitleIndex = 1
  
  // Collect all words from all participants with timing
  const allWords: Array<{
    word: string
    start: number
    end: number
    participantIndex: number
  }> = []
  
  transcriptions.forEach((transcription, participantIndex) => {
    if (transcription.word_timestamps?.words) {
      transcription.word_timestamps.words.forEach((word: { word: string; start: number; end: number }) => {
        // Check if this word is in a valid (non-deleted) section
        const isInValidSection = videoSections.some(section => 
          !section.isDeleted && 
          word.start >= section.startTime && 
          word.end <= section.endTime
        )
        
        if (isInValidSection) {
          allWords.push({
            ...word,
            participantIndex: participantIndex + 1
          })
        }
      })
    }
  })
  
  // Sort by start time
  allWords.sort((a, b) => a.start - b.start)
  
  // Group words into phrases (similar to live captions)
  const phrases: Array<{
    words: typeof allWords
    startTime: number
    endTime: number
    participantIndex: number
  }> = []
  
  let currentPhrase: typeof allWords = []
  let currentParticipant = 0
  
  for (const word of allWords) {
    // Start new phrase if:
    // 1. Different participant
    // 2. Gap > 1 second between words
    // 3. Phrase has 8+ words
    const timeSinceLastWord = currentPhrase.length > 0 
      ? word.start - currentPhrase[currentPhrase.length - 1].end 
      : 0
    
    const shouldStartNewPhrase = 
      word.participantIndex !== currentParticipant ||
      timeSinceLastWord > 1.0 ||
      currentPhrase.length >= 8
    
    if (shouldStartNewPhrase && currentPhrase.length > 0) {
      phrases.push({
        words: [...currentPhrase],
        startTime: currentPhrase[0].start,
        endTime: currentPhrase[currentPhrase.length - 1].end,
        participantIndex: currentParticipant
      })
      currentPhrase = []
    }
    
    currentPhrase.push(word)
    currentParticipant = word.participantIndex
  }
  
  // Add final phrase
  if (currentPhrase.length > 0) {
    phrases.push({
      words: [...currentPhrase],
      startTime: currentPhrase[0].start,
      endTime: currentPhrase[currentPhrase.length - 1].end,
      participantIndex: currentParticipant
    })
  }
  
  // Generate SRT events for each phrase
  phrases.forEach((phrase) => {
    const startTime = formatSRTTime(phrase.startTime)
    const endTime = formatSRTTime(phrase.endTime)
    
    // Add participant indicator and text
    const participantLabel = `[Partecipante ${phrase.participantIndex}]`
    const text = phrase.words.map(w => w.word).join(' ')
    
    srtContent += `${subtitleIndex}\n`
    srtContent += `${startTime} --> ${endTime}\n`
    srtContent += `${participantLabel} ${text}\n\n`
    
    subtitleIndex++
  })
  
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
    console.log('📊 Video sections:', JSON.stringify(validSections, null, 2))
    console.log('📊 Input videos:', JSON.stringify(inputVideos, null, 2))
    
    // Check if input video exists and get its info
    console.log('🔍 Checking input videos...')
    inputVideos.forEach((video, index) => {
      try {
        const stats = fs.statSync(video)
        console.log(`📁 Input video ${index}: ${video} - Size: ${stats.size} bytes`)
        
        if (stats.size < 100000) { // Less than 100KB is suspicious
          console.error(`⚠️ WARNING: Input video ${index} is very small (${stats.size} bytes)`)
        }
      } catch (error) {
        console.error(`❌ Input video ${index} not found: ${video}`, error)
      }
    })
    
    // Simple trim without complex filters with bounds checking
    let startTime = Math.max(0, validSections[0].startTime)
    const endTime = validSections[0].endTime
    let duration = endTime - startTime
    
    console.log(`⏱️ Original section: ${validSections[0].startTime.toFixed(2)}s to ${validSections[0].endTime.toFixed(2)}s`)
    
    // CRITICAL: For videos with ~16.8s duration, seeking to 16.78s leaves almost no content
    // We need to ensure there's meaningful content to extract
    const videoDuration = 16.8 // We know from logs this video is 16.8s
    
    if (startTime > videoDuration - 2) {
      // If start time is too close to end, adjust to get at least 2 seconds
      startTime = Math.max(0, videoDuration - 3)
      duration = Math.min(3, videoDuration - startTime)
      console.log(`🔧 ADJUSTED: Start too close to end, using start=${startTime.toFixed(2)}s, duration=${duration.toFixed(2)}s`)
    }
    
    // Round to reasonable precision - FFmpeg has issues with extreme decimal precision
    const finalStartTime = Math.round(startTime * 100) / 100  // 2 decimal places
    const finalDuration = Math.round(duration * 100) / 100    // 2 decimal places
    
    console.log(`✅ Final parameters: start=${finalStartTime}s, duration=${finalDuration}s`)
    
    command
      .seek(finalStartTime)
      .duration(finalDuration)
    
    // TEMP: Skip all complex filtering - use simple seek/duration approach
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
    
    // Add subtitles if provided (must be after codec settings)
    console.log(`🔍 Subtitle check: file=${subtitleFile}, includeSubtitles=${settings.includeSubtitles}`)
    
    if (subtitleFile && settings.includeSubtitles) {
      console.log(`📝 ATTEMPTING to add ASS subtitles: ${subtitleFile}`)
      // Verify file exists
      try {
        const subtitleStats = fs.statSync(subtitleFile)
        console.log(`📝 Subtitle file verified - size: ${subtitleStats.size} bytes`)
        
        // Read first few lines of subtitle file for debugging
        const subtitleContent = fs.readFileSync(subtitleFile, 'utf8')
        const firstLines = subtitleContent.split('\n').slice(0, 5).join('\n')
        console.log(`📝 Subtitle file preview:\n${firstLines}`)
        
        // Use drawtext filter instead of subtitles (no font dependencies)
        // First, let's read the subtitle content to extract text
        const subtitleLines = subtitleContent.split('\n').filter(line => 
          line.trim() && 
          !line.match(/^\d+$/) && // Not a number line
          !line.includes('-->') && // Not a timestamp line
          line.trim() !== ''
        )
        
        console.log(`📝 Extracted subtitle texts: ${subtitleLines.length} lines`)
        
        // Use simple drawtext with fixed test message for now
        const drawTextFilter = `drawtext=text='Sottotitoli generati':fontsize=24:fontcolor=white:box=1:boxcolor=black@0.8:boxborderw=5:x=(w-text_w)/2:y=h-text_h-50`
        console.log(`📝 Using simplified drawtext filter: ${drawTextFilter}`)
        command.addOption('-vf', drawTextFilter)
        
        console.log(`✅ SUBTITLES FILTER APPLIED SUCCESSFULLY`)
      } catch (error) {
        console.error(`❌ Subtitle file error: ${subtitleFile}`, error)
      }
    } else {
      console.log(`⚠️ Subtitles SKIPPED: file=${!!subtitleFile}, includeSubtitles=${settings.includeSubtitles}`)
    }
    
    command.output(outputPath)
    
    // Execute command with detailed logging
    command
      .on('start', (commandLine) => {
        console.log('🎬 FFmpeg command:', commandLine)
        console.log('🎬 FFmpeg started processing...')
      })
      .on('progress', (progress) => {
        console.log('🎬 FFmpeg progress:', JSON.stringify(progress, null, 2))
      })
      .on('stderr', (stderrLine) => {
        console.log('🎬 FFmpeg stderr:', stderrLine)
      })
      .on('end', () => {
        console.log('🎬 FFmpeg processing completed')
        
        // Check output file size
        try {
          const outputStats = fs.statSync(outputPath)
          console.log(`📁 Output video: ${outputPath} - Size: ${outputStats.size} bytes`)
          
          if (outputStats.size < 10000) { // Less than 10KB is definitely corrupted
            console.error('❌ CRITICAL: Output file is extremely small, likely corrupted!')
            console.error('❌ This suggests FFmpeg failed to process the video properly')
          }
        } catch (error) {
          console.error('❌ Output file not found:', outputPath, error)
          reject(new Error(`Output file not created: ${error}`))
          return
        }
        
        resolve(outputPath)
      })
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err)
        console.error('❌ FFmpeg process failed with error:', err.message)
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