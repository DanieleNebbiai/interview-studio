import ffmpeg from 'fluent-ffmpeg'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fs from 'fs'
import path from 'path'
import { ExportJobData } from './supabase-queue'

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
  
  // CHUNKING: Group words into phrases based on natural pauses
  const gapThreshold = 1.0 // 1 second gap = new phrase
  const showWindow = 3.0 // Same 3-second window as in the editor
  
  console.log(`Creating phrase chunks from ${allWords.length} words with ${gapThreshold}s gap threshold`)
  
  // Group words into phrase chunks
  const phraseChunks: Array<{
    words: typeof allWords
    startTime: number
    endTime: number
    participantIndex: number
  }> = []
  
  let currentChunk: typeof allWords = []
  
  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i]
    const nextWord = allWords[i + 1]
    
    currentChunk.push(word)
    
    // Check if we should end this chunk
    const shouldEndChunk = !nextWord || // Last word
      (nextWord.start - word.end > gapThreshold) || // Gap too large
      (nextWord.participantIndex !== word.participantIndex) // Different speaker
    
    if (shouldEndChunk && currentChunk.length > 0) {
      const chunkStart = currentChunk[0].start
      const chunkEnd = currentChunk[currentChunk.length - 1].end
      
      phraseChunks.push({
        words: [...currentChunk],
        startTime: chunkStart,
        endTime: chunkEnd,
        participantIndex: currentChunk[0].participantIndex
      })
      
      currentChunk = []
    }
  }
  
  console.log(`Created ${phraseChunks.length} phrase chunks`)
  
  // Generate subtitles for each phrase chunk
  phraseChunks.forEach(chunk => {
    console.log(`Chunk: "${chunk.words.map(w => w.word).join(' ')}" (${chunk.startTime.toFixed(2)}s-${chunk.endTime.toFixed(2)}s)`)
  })
  
  // Generate subtitles using phrase chunks for smoother live-caption experience
  phraseChunks.forEach(chunk => {
    // Each chunk gets multiple subtitle segments for karaoke effect
    const chunkStart = Math.max(0, chunk.startTime - showWindow)
    const chunkEnd = chunk.endTime + showWindow
    
    // Create time intervals within the chunk for karaoke effect
    const chunkTimePoints = new Set<number>()
    chunkTimePoints.add(chunkStart)
    chunkTimePoints.add(chunkEnd)
    
    // Add word boundaries for karaoke highlighting
    chunk.words.forEach(word => {
      chunkTimePoints.add(word.start)
      chunkTimePoints.add(word.end)
    })
    
    const sortedChunkTimes = Array.from(chunkTimePoints).sort((a, b) => a - b)
    
    // Create subtitle intervals within this chunk
    for (let i = 0; i < sortedChunkTimes.length - 1; i++) {
      const intervalStart = sortedChunkTimes[i]
      const intervalEnd = sortedChunkTimes[i + 1]
      const intervalMid = (intervalStart + intervalEnd) / 2
      
      // Skip intervals outside the chunk visibility window
      if (intervalMid < chunkStart || intervalMid > chunkEnd) continue
      
      const startTime = formatSRTTime(intervalStart)
      const endTime = formatSRTTime(intervalEnd)
      
      // Determine participant color
      const color = chunk.participantIndex === 1 ? '#3b82f6' : '#f59e0b' // Blue or Orange
      
      // Build karaoke-style subtitle text
      let subtitleText = ''
      
      chunk.words.forEach(word => {
        const isActive = intervalMid >= word.start && intervalMid <= word.end
        const style = isActive ? `<b>${word.word}</b>` : word.word
        subtitleText += `<font color="${color}">${style}</font> `
      })
      
      subtitleText = subtitleText.trim()
      
      if (subtitleText) {
        srtContent += `${subtitleIndex}\n`
        srtContent += `${startTime} --> ${endTime}\n`
        srtContent += `${subtitleText}\n\n`
        
        subtitleIndex++
      }
    }
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
  recordings: ExportJobData['recordings']
}): Promise<string> {
  
  return new Promise((resolve, reject) => {
    const { inputVideos, outputPath, videoSections, focusSegments, subtitleFile, settings, recordings } = data
    
    const command = ffmpeg()
    
    // Add input videos
    inputVideos.forEach(video => {
      command.addInput(video)
    })
    
    // Build complex filter for multi-video layout
    const validSections = videoSections.filter(section => !section.isDeleted)
    const filterComplex: string[] = []
    
    // Create recording ID to video index mapping (focus segments use recording_id)
    const recordingVideoMap: { [key: string]: number } = {}
    recordings.forEach((recording, index) => {
      recordingVideoMap[recording.id] = index
    })
    console.log('👥 Recording to video mapping:', recordingVideoMap)
    
    // OVERLAY-BASED FOCUS: Base 50/50 with dynamic full-screen overlays - MULTI-SECTION SUPPORT
    console.log(`📹 Processing ${validSections.length} sections with OVERLAY-BASED FOCUS`)
    console.log(`🎯 Focus segments:`, focusSegments)

    // Process each section with speed control and overlay focus
    const sectionVideoStreams: string[] = []
    const sectionAudioStreams: string[] = []

    validSections.forEach((section, sectionIndex) => {
      console.log(`📹 Section ${sectionIndex}: ${section.startTime.toFixed(2)}s-${section.endTime.toFixed(2)}s (speed: x${section.playbackSpeed})`)

      // Speed control filters
      const speedFilter = section.playbackSpeed !== 1 ? `,setpts=PTS/${section.playbackSpeed}` : ''
      const audioSpeedFilter = section.playbackSpeed !== 1 ? `,atempo=${section.playbackSpeed}` : ''

      if (inputVideos.length === 2) {
        // Create base 50/50 layout with center crop + speed control
        console.log(`📱 Section ${sectionIndex}: Creating base 50/50 grid with speed x${section.playbackSpeed}`)
        filterComplex.push(
          `[0:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},crop=720:720:280:0,scale=640:720,setsar=1/1${speedFilter}[v0_s${sectionIndex}]`,
          `[1:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},crop=720:720:280:0,scale=640:720,setsar=1/1${speedFilter}[v1_s${sectionIndex}]`,
          `[v0_s${sectionIndex}][v1_s${sectionIndex}]hstack[base_video_s${sectionIndex}]`
        )

        let currentVideoStream = `[base_video_s${sectionIndex}]`

        // Apply focus overlays for this section (filter focus segments by section timing)
        const sectionFocusSegments = focusSegments.filter(fs =>
          fs.startTime >= section.startTime && fs.endTime <= section.endTime
        )

        sectionFocusSegments.forEach((fs, fsIndex) => {
          if (fs.focusedParticipantId && recordingVideoMap[fs.focusedParticipantId] !== undefined) {
            const videoIndex = recordingVideoMap[fs.focusedParticipantId]
            const overlayName = `overlay_s${sectionIndex}_${fsIndex}`
            const fullStreamName = `full${videoIndex}_s${sectionIndex}_${fsIndex}`

            console.log(`🎯 Section ${sectionIndex} focus overlay ${fsIndex}: participant ${fs.focusedParticipantId} (video ${videoIndex}) from ${fs.startTime.toFixed(2)}s to ${fs.endTime.toFixed(2)}s`)

            // Create individual full-screen stream with speed control
            filterComplex.push(
              `[${videoIndex}:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},scale=1280:720,setsar=1/1${speedFilter}[${fullStreamName}]`
            )

            // Adjust timing relative to section start and account for speed
            const relativeStart = Math.max(0, fs.startTime - section.startTime) / section.playbackSpeed
            const relativeEnd = Math.min(section.endTime - section.startTime, fs.endTime - section.startTime) / section.playbackSpeed

            const enableExpr = `'between(t,${relativeStart.toFixed(2)},${relativeEnd.toFixed(2)})'`
            filterComplex.push(
              `${currentVideoStream}[${fullStreamName}]overlay=enable=${enableExpr}[${overlayName}]`
            )

            currentVideoStream = `[${overlayName}]`
          }
        })

        // Set final video stream for this section
        const sectionFinalVideo = `section${sectionIndex}_video`
        filterComplex.push(`${currentVideoStream}null[${sectionFinalVideo}]`)
        sectionVideoStreams.push(`[${sectionFinalVideo}]`)

        // Audio mixing for this section with speed control
        const sectionFinalAudio = `section${sectionIndex}_audio`
        filterComplex.push(
          `[0:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)}${audioSpeedFilter}[a0_s${sectionIndex}]`,
          `[1:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)}${audioSpeedFilter}[a1_s${sectionIndex}]`,
          `[a0_s${sectionIndex}][a1_s${sectionIndex}]amix=inputs=2[${sectionFinalAudio}]`
        )
        sectionAudioStreams.push(`[${sectionFinalAudio}]`)

      } else {
        // Single video with speed control
        const sectionFinalVideo = `section${sectionIndex}_video`
        const sectionFinalAudio = `section${sectionIndex}_audio`
        filterComplex.push(
          `[0:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},scale=1280:720,setsar=1/1${speedFilter}[${sectionFinalVideo}]`,
          `[0:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)}${audioSpeedFilter}[${sectionFinalAudio}]`
        )
        sectionVideoStreams.push(`[${sectionFinalVideo}]`)
        sectionAudioStreams.push(`[${sectionFinalAudio}]`)
      }
    })

    // Concatenate all sections into final streams
    if (sectionVideoStreams.length > 1) {
      console.log(`🔗 Concatenating ${sectionVideoStreams.length} sections`)
      filterComplex.push(
        `${sectionVideoStreams.join('')}concat=n=${sectionVideoStreams.length}:v=1:a=0[finalvideo]`,
        `${sectionAudioStreams.join('')}concat=n=${sectionAudioStreams.length}:v=0:a=1[finalaudio]`
      )
    } else {
      // Single section, no concatenation needed
      filterComplex.push(
        `${sectionVideoStreams[0]}null[finalvideo]`,
        `${sectionAudioStreams[0]}null[finalaudio]`
      )
    }
    
    console.log('📊 Using [finalvideo] and [finalaudio] streams from dynamic focus filter')
    
    // Add subtitles to complex filter BEFORE applying it
    let finalVideoStreamName = '[finalvideo]'
    const finalAudioStreamName = '[finalaudio]'
    
    if (subtitleFile && settings.includeSubtitles && filterComplex.length > 0) {
      console.log(`📝 Adding subtitles to complex filter BEFORE applying: ${subtitleFile}`)
      const subtitlesFilter = `subtitles=${subtitleFile}:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=1,Shadow=1'`
      
      // Always apply subtitles to [finalvideo] in simplified approach
      filterComplex.push(`[finalvideo]${subtitlesFilter}[finalvideo_sub]`)
      finalVideoStreamName = '[finalvideo_sub]'
      console.log(`✅ Subtitles added to filterComplex, final video stream: ${finalVideoStreamName}`)
    }
    
    // Use proper complex filters for multi-video layout
    console.log('🎬 Using complex FFmpeg filters for multi-video layout')
    console.log('📊 Video sections:', JSON.stringify(validSections, null, 2))
    console.log('📊 Input videos:', JSON.stringify(inputVideos, null, 2))
    
    // Check if input videos exist
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
    
    // Apply complex filters for proper multi-video layout
    if (filterComplex.length > 0) {
      console.log('🎨 Applying complex filter graph:', filterComplex.join('; '))
      command.complexFilter(filterComplex)
      
      console.log(`🎯 Using final streams: video=${finalVideoStreamName}, audio=${finalAudioStreamName}`)
      command.map(finalVideoStreamName).map(finalAudioStreamName)
    } else {
      console.log('⚠️ No complex filters generated - using simple approach for single video')
      // Fallback for single video without sections
      const startTime = 0
      const duration = Math.min(60, 300) // Max 5 minutes for safety
      command.seek(startTime).duration(duration)
    }
    
    // Output settings with explicit codecs for compatibility
    command
      .format(settings.format)
      .videoCodec('libx264') // H.264 for broad compatibility
      .audioCodec('aac')     // AAC for broad compatibility
      .videoBitrate(getVideoBitrate(settings.quality))
      .audioBitrate('128k')
      .fps(settings.framerate)
      .addOption('-preset', 'ultrafast') // Much faster encoding for Railway
      .addOption('-profile:v', 'high') // High profile for better compatibility
      .addOption('-level', '4.0') // Level 4.0 for compatibility
      .addOption('-pix_fmt', 'yuv420p') // Pixel format for compatibility
    
    // Subtitle handling for simple cases (no complex filters)
    if (subtitleFile && settings.includeSubtitles && filterComplex.length === 0) {
      console.log(`📝 Using simple -vf subtitles filter: ${subtitleFile}`)
      const subtitlesFilter = `subtitles=${subtitleFile}:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=1,Shadow=1'`
      command.addOption('-vf', subtitlesFilter)
      console.log(`✅ SIMPLE SUBTITLES FILTER APPLIED`)
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
        // Heartbeat to prevent Railway timeout
        if (progress.percent) {
          console.log(`💓 Processing heartbeat: ${progress.percent}%`)
        }
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
    case '4k': return '4000k'      // Reduced for Railway
    case '1080p': return '1000k'   // Reduced for Railway  
    case '720p': return '500k'     // Reduced for Railway
    default: return '500k'         // Default reduced for Railway
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