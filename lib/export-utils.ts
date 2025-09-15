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

// Helper to log video properties using ffprobe
async function logVideoProperties(filePath: string, description: string): Promise<void> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error(`❌ FFprobe error for ${description} [${filePath}]:`, err.message)
        resolve()
        return
      }
      const duration = metadata.format.duration
      console.log(`🔍 Properties for ${description} [${path.basename(filePath)}]: Duration: ${duration?.toFixed(2)}s, Size: ${metadata.format.size ? (metadata.format.size / 1024).toFixed(0) : 'N/A'} KB`)
      resolve()
    })
  })
}

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

// Memory-Capped Streaming Processing: Scalable for long-form content (1+ hours)
export async function buildFFmpegCommandMemorySafe(data: {
  inputVideos: string[]
  outputPath: string
  videoSections: ExportJobData['videoSections']
  focusSegments: ExportJobData['focusSegments']
  subtitleFile?: string
  settings: ExportJobData['exportSettings']
  recordings: ExportJobData['recordings']
}): Promise<string> {
  const { inputVideos, outputPath, videoSections, focusSegments, subtitleFile, settings, recordings } = data
  const validSections = videoSections.filter(section => !section.isDeleted)

  // Calculate expected final duration after speed adjustments
  const expectedFinalDuration = validSections.reduce((total, section) => {
    const sectionDuration = section.endTime - section.startTime
    const adjustedDuration = sectionDuration / section.playbackSpeed
    console.log(`📏 Section ${section.startTime.toFixed(1)}s-${section.endTime.toFixed(1)}s: ${sectionDuration.toFixed(1)}s at ${section.playbackSpeed}x = ${adjustedDuration.toFixed(1)}s`)
    return total + adjustedDuration
  }, 0)
  console.log(`📐 Expected final video duration: ${expectedFinalDuration.toFixed(1)}s (original: ${validSections.reduce((t, s) => t + (s.endTime - s.startTime), 0).toFixed(1)}s)`)

  console.log('🧠 Using Memory-Capped Streaming Processing for scalability')
  console.log(`📊 Total content duration: ${validSections.reduce((t, s) => t + (s.endTime - s.startTime), 0).toFixed(1)}s`)

  // Memory-safe configuration
  const CHUNK_MAX_DURATION = 30 // Max 30 seconds per chunk to limit memory
  const GC_DELAY = 2000 // 2s pause between chunks for garbage collection

  // Create recording ID to video index mapping
  const recordingVideoMap: { [key: string]: number } = {}
  recordings.forEach((recording, index) => {
    recordingVideoMap[recording.id] = index
  })

  try {
    const tempDir = path.dirname(outputPath)
    const chunkFiles: string[] = []

    console.log('🔄 Phase 1: Breaking sections into memory-safe chunks')

    // Break large sections into smaller chunks
    const chunks = createMemorySafeChunks(validSections, CHUNK_MAX_DURATION)
    console.log(`📦 Created ${chunks.length} chunks (max ${CHUNK_MAX_DURATION}s each)`)

    // Process each chunk sequentially (never in parallel)
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex]
      const chunkOutputPath = path.join(tempDir, `chunk_${chunkIndex}_${Date.now()}.mp4`)

      console.log(`🔄 Processing chunk ${chunkIndex + 1}/${chunks.length}: ${chunk.startTime.toFixed(1)}s-${chunk.endTime.toFixed(1)}s (${chunk.playbackSpeed}x speed)`)

      // Force garbage collection before processing
      if (global.gc) {
        global.gc()
        console.log('♻️ Garbage collection triggered')
      }

      await processChunkMemorySafe({
        inputVideos,
        outputPath: chunkOutputPath,
        chunk,
        chunkIndex,
        focusSegments,
        settings,
        recordingVideoMap
      })

      chunkFiles.push(chunkOutputPath)

      // Log chunk info and memory usage
      const stats = fs.statSync(chunkOutputPath)
      const memUsage = process.memoryUsage()
      console.log(`✅ Chunk ${chunkIndex + 1} completed: ${Math.round(stats.size / 1024)}KB, Memory: ${Math.round(memUsage.rss / 1024 / 1024)}MB`)

      // Pause for garbage collection (except for last chunk)
      if (chunkIndex < chunks.length - 1) {
        console.log(`⏸️ Pausing ${GC_DELAY}ms for memory cleanup...`)
        await new Promise(resolve => setTimeout(resolve, GC_DELAY))
      }
    }

    console.log('🔄 Phase 2: Ultra-simple sequential re-encoding (no complex filters)')
    const tempConcatenated = outputPath.replace('.mp4', '_temp_concat.mp4')
    await simpleSequentialConcat(chunkFiles, chunks, tempConcatenated)

    // *** DEBUG LOG ***
    await logVideoProperties(tempConcatenated, 'CONCATENATED file (before subtitles)')

    // Immediate cleanup of chunk files
    await cleanupFiles(chunkFiles, 'chunk')

    // Phase 3: Add subtitles in final pass if needed
    if (subtitleFile) {
      console.log('🔄 Phase 3: Adding subtitles in final pass')
      await addSubtitlesToVideo(tempConcatenated, outputPath, subtitleFile)

      // Cleanup temp concatenated file
      try {
        fs.unlinkSync(tempConcatenated)
        console.log('🧹 Cleaned up temporary concatenated file')
      } catch (error) {
        console.warn('⚠️ Failed to cleanup temp file:', error)
      }
    } else {
      // No subtitles needed, just rename temp file
      fs.renameSync(tempConcatenated, outputPath)
    }

    const finalStats = fs.statSync(outputPath)
    console.log(`✅ Memory-Safe Processing completed: ${Math.round(finalStats.size / 1024)}KB final video`)
    await logVideoProperties(outputPath, 'FINAL video')
    return outputPath

  } catch (error) {
    console.error('❌ Memory-Safe Processing failed:', error)
    throw error
  }
}

// Build FFmpeg command for multi-video export (Legacy - kept for fallback)
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

    // Calculate expected final duration after speed adjustments
    const expectedFinalDuration = validSections.reduce((total, section) => {
      const sectionDuration = section.endTime - section.startTime
      const adjustedDuration = sectionDuration / section.playbackSpeed
      console.log(`📏 Section ${section.startTime.toFixed(1)}s-${section.endTime.toFixed(1)}s: ${sectionDuration.toFixed(1)}s at ${section.playbackSpeed}x = ${adjustedDuration.toFixed(1)}s`)
      return total + adjustedDuration
    }, 0)
    console.log(`📐 Expected final video duration: ${expectedFinalDuration.toFixed(1)}s (original: ${validSections.reduce((t, s) => t + (s.endTime - s.startTime), 0).toFixed(1)}s)`)
    
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

      // Speed control filters - ALWAYS apply fps normalization for concat compatibility
      const speedFilter = `,fps=${settings.framerate * section.playbackSpeed},setpts=PTS*${1/section.playbackSpeed}`
      const audioSpeedFilter = section.playbackSpeed !== 1 ? `,atempo=${section.playbackSpeed}` : ''

      console.log(`🎬 Speed filter for section ${sectionIndex}: fps=${settings.framerate * section.playbackSpeed}, setpts=PTS*${1/section.playbackSpeed} (speed: ${section.playbackSpeed}x)`)

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
            // When using setpts=PTS/speed, the video timeline is compressed by the speed factor
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
        console.log(`🎯 Expected final duration: ${expectedFinalDuration.toFixed(1)}s`)
      })
      .on('progress', (progress) => {
        // Calculate more accurate percentage based on expected duration
        let adjustedPercent = progress.percent
        if (progress.timemark && progress.timemark !== 'N/A') {
          const currentTime = parseTimemark(progress.timemark)
          if (currentTime && expectedFinalDuration > 0) {
            adjustedPercent = Math.min(99.9, (currentTime / expectedFinalDuration) * 100)
            console.log(`📊 Adjusted progress: ${adjustedPercent.toFixed(1)}% (FFmpeg: ${progress.percent || 'N/A'}%, time: ${progress.timemark})`)
          }
        }

        console.log('🎬 FFmpeg progress:', JSON.stringify(progress, null, 2))
        // Heartbeat to prevent Railway timeout
        if (adjustedPercent) {
          console.log(`💓 Processing heartbeat: ${adjustedPercent}%`)
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

// Create memory-safe chunks from video sections
function createMemorySafeChunks(sections: ExportJobData['videoSections'], maxChunkDuration: number) {
  const chunks: Array<{ 
    startTime: number
    endTime: number
    playbackSpeed: number
    originalSectionId: string
  }> = []

  for (const section of sections) {
    const sectionDuration = section.endTime - section.startTime

    if (sectionDuration <= maxChunkDuration) {
      // Section fits in one chunk
      chunks.push({
        startTime: section.startTime,
        endTime: section.endTime,
        playbackSpeed: section.playbackSpeed,
        originalSectionId: section.id
      })
    } else {
      // Break large section into smaller chunks
      let currentStart = section.startTime
      while (currentStart < section.endTime) {
        const chunkEnd = Math.min(currentStart + maxChunkDuration, section.endTime)
        chunks.push({
          startTime: currentStart,
          endTime: chunkEnd,
          playbackSpeed: section.playbackSpeed,
          originalSectionId: section.id
        })
        currentStart = chunkEnd
      }
      console.log(`📦 Large section (${sectionDuration.toFixed(1)}s) broken into ${Math.ceil(sectionDuration / maxChunkDuration)} chunks`)
    }
  }

  return chunks
}

// Process a single chunk with memory-efficient settings
async function processChunkMemorySafe(params: { 
  inputVideos: string[]
  outputPath: string
  chunk: { startTime: number; endTime: number; playbackSpeed: number; originalSectionId: string }
  chunkIndex: number
  focusSegments: ExportJobData['focusSegments']
  settings: ExportJobData['exportSettings']
  recordingVideoMap: { [key: string]: number }
}): Promise<void> {
  const { inputVideos, outputPath, chunk, chunkIndex, focusSegments, settings, recordingVideoMap } = params

  return new Promise((resolve, reject) => {
    const command = ffmpeg()

    // Memory-efficient settings
    command
      .addOption('-threads', '2')           // Limit to 2 threads
      .addOption('-filter_threads', '1')    // Single thread for filters
      .addOption('-bufsize', '512k')        // Small buffer size

    // Add input videos
    inputVideos.forEach(video => {
      command.addInput(video)
    })

    const filterComplex: string[] = []
    const chunkDuration = chunk.endTime - chunk.startTime

    if (inputVideos.length === 2) {
      // Memory-efficient 50/50 layout for this chunk
      // DON'T apply speed here - just process the raw segment
      console.log(`📱 Processing chunk: ${chunkDuration.toFixed(1)}s (speed will be applied during concatenation)`)

      filterComplex.push(
        `[0:v]trim=${chunk.startTime.toFixed(2)}:${chunk.endTime.toFixed(2)},crop=720:720:280:0,scale=640:720,setsar=1/1[v0_c${chunkIndex}]`,
        `[1:v]trim=${chunk.startTime.toFixed(2)}:${chunk.endTime.toFixed(2)},crop=720:720:280:0,scale=640:720,setsar=1/1[v1_c${chunkIndex}]`,
        `[v0_c${chunkIndex}][v1_c${chunkIndex}]hstack[base_video_c${chunkIndex}]`
      )

      let currentVideoStream = `[base_video_c${chunkIndex}]`

      // Apply focus overlays for this chunk (simplified to reduce memory)
      const chunkFocusSegments = focusSegments.filter(fs => 
        fs.startTime < chunk.endTime && fs.endTime > chunk.startTime // Intersects with chunk
      )

      console.log(`🎯 Chunk ${chunkIndex}: Found ${chunkFocusSegments.length} focus segments`)
      if (chunkFocusSegments.length > 0) {
        console.log(`🎯 Focus segments:`, chunkFocusSegments.map(fs => `${fs.startTime}-${fs.endTime} (participant: ${fs.focusedParticipantId})`))
      }

      // Limit to max 1 focus overlay per chunk to save memory
      if (chunkFocusSegments.length > 0) {
        const fs = chunkFocusSegments[0] // Use only the first one
        if (fs.focusedParticipantId && recordingVideoMap[fs.focusedParticipantId] !== undefined) {
          const videoIndex = recordingVideoMap[fs.focusedParticipantId]
          const overlayName = `overlay_c${chunkIndex}`
          const fullStreamName = `full${videoIndex}_c${chunkIndex}`

          filterComplex.push(
            `[${videoIndex}:v]trim=${chunk.startTime.toFixed(2)}:${chunk.endTime.toFixed(2)},scale=1280:720,setsar=1/1[${fullStreamName}]`
          )

          const relativeStart = Math.max(0, fs.startTime - chunk.startTime)
          const relativeEnd = Math.min(chunk.endTime - chunk.startTime, fs.endTime - chunk.startTime)

          const enableExpr = `'between(t,${relativeStart.toFixed(2)},${relativeEnd.toFixed(2)})'`
          filterComplex.push(
            `${currentVideoStream}[${fullStreamName}]overlay=enable=${enableExpr}[${overlayName}]`
          )

          currentVideoStream = `[${overlayName}]`
        }
      }

      filterComplex.push(`${currentVideoStream}null[finalvideo]`) 

      // Audio without speed adjustment (will be applied during concatenation)
      filterComplex.push(
        `[0:a]atrim=${chunk.startTime.toFixed(2)}:${chunk.endTime.toFixed(2)}[a0_c${chunkIndex}]`,
        `[1:a]atrim=${chunk.startTime.toFixed(2)}:${chunk.endTime.toFixed(2)}[a1_c${chunkIndex}]`,
        `[a0_c${chunkIndex}][a1_c${chunkIndex}]amix=inputs=2[finalaudio]`
      )

    } else {
      // Single video processing (memory-efficient)
      console.log(`📱 Single video chunk: ${chunkDuration.toFixed(1)}s (speed will be applied during concatenation)`)

      filterComplex.push(
        `[0:v]trim=${chunk.startTime.toFixed(2)}:${chunk.endTime.toFixed(2)},scale=1280:720,setsar=1/1[finalvideo]`,
        `[0:a]atrim=${chunk.startTime.toFixed(2)}:${chunk.endTime.toFixed(2)}[finalaudio]`
      )
    }

    command.complexFilter(filterComplex)
    command.map('[finalvideo]').map('[finalaudio]')

    // Memory-efficient output settings
    command
      .format('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .videoBitrate('250k')              // Reduced bitrate
      .audioBitrate('96k')               // Reduced audio bitrate
      .fps(Math.min(settings.framerate, 24)) // Cap at 24fps
      .addOption('-preset', 'superfast') // Faster preset
      .addOption('-profile:v', 'main')   // Main profile (less memory)
      .addOption('-level', '3.1')        // Lower level
      .addOption('-pix_fmt', 'yuv420p')
      .output(outputPath)

    command
      .on('start', () => {
        console.log(`🎬 Chunk ${chunkIndex} processing started (memory-capped)`)
      })
      .on('progress', (progress) => {
        if (progress.percent && progress.percent > 0) {
          console.log(`📊 Chunk ${chunkIndex} progress: ${progress.percent.toFixed(1)}%`)
        }
      })
      .on('end', () => {
        console.log(`✅ Chunk ${chunkIndex} processing completed`)
        resolve()
      })
      .on('error', (err) => {
        console.error(`❌ Chunk ${chunkIndex} processing failed:`, err)
        reject(err)
      })
      .run()
  })
}

// Ultra-simple sequential concatenation - no complex filters, just basic re-encoding
async function simpleSequentialConcat(
  chunkFiles: string[],
  chunks: Array<{ startTime: number; endTime: number; playbackSpeed: number; originalSectionId: string }>, 
  outputPath: string
): Promise<void> {
  console.log('🔗 Ultra-simple sequential concatenation (Railway-safe)')

  // Step 1: Apply speed to each chunk individually (one at a time)
  const speedAdjustedChunks: string[] = []

  for (let i = 0; i < chunkFiles.length; i++) {
    const chunk = chunks[i]
    const inputFile = chunkFiles[i]
    const outputFile = outputPath.replace('.mp4', `_speed_${i}.mp4`)

    console.log(`🎯 Applying ${chunk.playbackSpeed}x speed to chunk ${i + 1}/${chunkFiles.length}`)

    await applySpeedToChunk(inputFile, outputFile, chunk.playbackSpeed)
    speedAdjustedChunks.push(outputFile)

    // Force garbage collection after each speed adjustment
    if (global.gc) {
      global.gc()
      console.log('♻️ GC after speed adjustment')
    }

    // Small pause between operations
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Step 2: Simple file-based concatenation (no filters)
  console.log('🔗 Simple file-based concatenation of speed-adjusted chunks')
  await simpleFileConcatenation(speedAdjustedChunks, outputPath)

  // Cleanup speed-adjusted chunks
  await cleanupFiles(speedAdjustedChunks, 'speed-adjusted chunk')
}

// Apply speed adjustment to a single chunk
async function applySpeedToChunk(inputPath: string, outputPath: string, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg()

    // Ultra memory-efficient settings
    command
      .input(inputPath)
      .addOption('-threads', '1')
      .addOption('-bufsize', '64k')       // Very small buffer
      .addOption('-maxrate', '100k')      // Very low bitrate

    if (speed !== 1) {
      // Apply speed adjustment with basic filters (no complex filter)
      command
        .videoFilters(`setpts=PTS/${speed}`)
        .audioFilters(`atempo=${speed}`)
    }

    command
      .format('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .addOption('-preset', 'ultrafast')
      .addOption('-crf', '30')            // Low quality to save memory
      .videoBitrate('100k')               // Very low bitrate
      .audioBitrate('32k')                // Very low audio bitrate
      .output(outputPath)

    command
      .on('start', () => {
        console.log(`🎬 Speed adjustment ${speed}x started`)
      })
      .on('end', () => {
        console.log(`✅ Speed adjustment ${speed}x completed`)
        resolve()
      })
      .on('error', (err) => {
        console.error(`❌ Speed adjustment failed:`, err)
        reject(err)
      })
      .run()
  })
}

// Simple file-based concatenation using the robust `concat` filter
async function simpleFileConcatenation(chunkFiles: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🔗 Concatenating ${chunkFiles.length} chunks with robust concat filter.`);

    const command = ffmpeg();

    // Add all chunk files as separate inputs
    chunkFiles.forEach(file => {
      command.addInput(file);
    });

    // Create the complex filter string for concatenation
    const inputs = chunkFiles.map((_, index) => `[${index}:v][${index}:a]`).join('');
    const concatFilter = `${inputs}concat=n=${chunkFiles.length}:v=1:a=1[outv][outa]`;

    command
      .complexFilter(concatFilter)
      .map('[outv]')
      .map('[outa]');

    // Output settings - re-encoding is necessary for the concat filter
    command
      .addOption('-threads', '1')
      .addOption('-bufsize', '64k')
      .format('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .addOption('-preset', 'ultrafast')
      .output(outputPath);

    command
      .on('start', (commandLine) => {
        console.log('🎬 Concat filter command:', commandLine);
        console.log('🎬 Simple concatenation started (using filter)');
      })
      .on('end', () => {
        console.log('✅ Simple concatenation completed (using filter)');
        resolve();
      })
      .on('error', (err) => {
        console.error('❌ Simple concatenation failed (using filter):', err);
        reject(err);
      })
      .run();
  });
}

// Memory-efficient concatenation with speed adjustment applied during concat phase
async function concatenateChunksWithSpeed(
  chunkFiles: string[],
  chunks: Array<{ startTime: number; endTime: number; playbackSpeed: number; originalSectionId: string }>, 
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🔗 Speed-adjusted concatenation of ${chunkFiles.length} chunks`)

    const command = ffmpeg()

    // Ultra memory-efficient settings
    command
      .addOption('-threads', '1')
      .addOption('-bufsize', '128k')

    // Add each chunk as input
    chunkFiles.forEach(file => {
      command.addInput(file)
    })

    const filterComplex: string[] = []
    const processedStreams: string[] = []
    const processedAudioStreams: string[] = []

    // Process each chunk with its speed adjustment
    chunks.forEach((chunk, index) => {
      const speedFilter = chunk.playbackSpeed !== 1 ? `,setpts=PTS/${chunk.playbackSpeed}` : ''
      const audioSpeedFilter = chunk.playbackSpeed !== 1 ? `,atempo=${chunk.playbackSpeed}` : ''

      console.log(`🎯 Chunk ${index}: Applying ${chunk.playbackSpeed}x speed during concat`)

      // Apply speed to video and audio streams
      filterComplex.push(
        `[${index}:v]${speedFilter.slice(1) || 'null'}[v${index}_speed]`,
        `[${index}:a]${audioSpeedFilter.slice(1) || 'anull'}[a${index}_speed]`
      )

      processedStreams.push(`[v${index}_speed]`)
      processedAudioStreams.push(`[a${index}_speed]`)
    })

    // Concatenate all speed-adjusted streams
    const videoInputs = processedStreams.join('')
    const audioInputs = processedAudioStreams.join('')
    filterComplex.push(
      `${videoInputs}concat=n=${chunks.length}:v=1:a=0[finalvideo]`,
      `${audioInputs}concat=n=${chunks.length}:v=0:a=1[finalaudio]`
    )

    command.complexFilter(filterComplex)
    command.map('[finalvideo]').map('[finalaudio]')

    // Memory-efficient output settings
    command
      .format('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .addOption('-preset', 'ultrafast')
      .addOption('-crf', '28')
      .videoBitrate('200k')
      .audioBitrate('64k')
      .output(outputPath)

    command
      .on('start', () => {
        console.log('🎬 Speed-adjusted concatenation started')
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`🎯 Speed concat progress: ${progress.percent.toFixed(1)}%`)
        }
      })
      .on('end', () => {
        console.log('✅ Speed-adjusted concatenation completed')
        resolve()
      })
      .on('error', (err) => {
        console.error('❌ Speed-adjusted concatenation failed:', err)
        reject(err)
      })
      .run()
  })
}

// Memory-efficient concatenation using file-based approach with re-encoding
async function concatenateChunksMemorySafe(chunkFiles: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🔗 Memory-safe file-based concatenation of ${chunkFiles.length} chunks (with re-encoding)`)

    const concatListPath = outputPath.replace('.mp4', '_concat.txt')
    const concatContent = chunkFiles.map(file => `file '${file}'`).join('\n')

    try {
      fs.writeFileSync(concatListPath, concatContent, 'utf8')
      console.log(`📝 Created concat list: ${concatListPath}`)
    } catch (error) {
      reject(new Error(`Failed to create concat list: ${error}`))
      return
    }

    const command = ffmpeg()

    // Ultra memory-efficient settings for concatenation
    command
      .addOption('-threads', '1')           // Single thread
      .addOption('-bufsize', '128k')        // Very small buffer
      .addOption('-maxrate', '500k')        // Limit bitrate to reduce memory

    // Use concat demuxer but with RE-ENCODING to preserve speed adjustments
    command
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])

    // Force re-encoding with minimal settings to preserve duration
    command
      .format('mp4')
      .videoCodec('libx264')                // Re-encode (not copy)
      .audioCodec('aac')                    // Re-encode audio
      .addOption('-preset', 'ultrafast')    // Fastest encoding
      .addOption('-crf', '28')              // Lower quality to save memory
      .videoBitrate('200k')                 // Very low bitrate
      .audioBitrate('64k')                  // Low audio bitrate
      .output(outputPath)

    command
      .on('start', () => {
        console.log('🎬 Memory-safe concatenation started')
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`🔗 Concatenation progress: ${progress.percent.toFixed(1)}%`)
        }
      })
      .on('end', () => {
        console.log('✅ Memory-safe file-based concatenation completed')

        // Cleanup concat list
        try {
          if (fs.existsSync(concatListPath)) {
            fs.unlinkSync(concatListPath)
            console.log(`🧹 Cleaned up concat list`)
          }
        } catch (error) {
          console.warn(`⚠️ Failed to cleanup concat list: ${error}`)
        }

        resolve()
      })
      .on('error', (err) => {
        console.error('❌ Memory-safe concatenation failed:', err)

        // Cleanup on error
        try {
          if (fs.existsSync(concatListPath)) {
            fs.unlinkSync(concatListPath)
          }
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup on error: ${cleanupError}`)
        }

        reject(err)
      })
      .run()
  })
}

// Add subtitles to video in separate pass (memory-efficient)
async function addSubtitlesToVideo(inputPath: string, outputPath: string, subtitleFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg()

    command
      .input(inputPath)
      .addOption('-threads', '1')           // Single thread
      .addOption('-bufsize', '256k')        // Small buffer

    // Add subtitles with styling
    const subtitlesFilter = `subtitles=${subtitleFile}:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=1,Shadow=1'`

    command
      .videoFilters(subtitlesFilter)
      .format('mp4')
      .videoCodec('libx264')
      .audioCodec('copy')                   // Copy audio (no re-encoding)
      .addOption('-preset', 'ultrafast')    // Fast encoding
      .output(outputPath)

    command
      .on('start', () => {
        console.log('📝 Adding subtitles to final video')
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`📝 Subtitle progress: ${progress.percent.toFixed(1)}%`)
        }
      })
      .on('end', () => {
        console.log('✅ Subtitles added successfully')
        resolve()
      })
      .on('error', (err) => {
        console.error('❌ Failed to add subtitles:', err)
        reject(err)
      })
      .run()
  })
}

// Efficient file cleanup
async function cleanupFiles(files: string[], type: string): Promise<void> {
  console.log(`🧹 Cleaning up ${files.length} ${type} files`)

  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file)
        fs.unlinkSync(file)
        console.log(`🧹 Cleaned up ${type}: ${Math.round(stats.size / 1024)}KB freed`)
      }
    } catch (error) {
      console.error(`⚠️ Failed to cleanup ${type} file ${file}:`, error)
    }
  }

  // Force garbage collection after cleanup
  if (global.gc) {
    global.gc()
    console.log('♻️ Post-cleanup garbage collection')
  }
}

// Process a single section with proper speed control (Legacy)
async function processSectionSeparately(params: { 
  inputVideos: string[]
  outputPath: string
  section: ExportJobData['videoSections'][0]
  sectionIndex: number
  focusSegments: ExportJobData['focusSegments']
  settings: ExportJobData['exportSettings']
  recordings: ExportJobData['recordings']
  recordingVideoMap: { [key: string]: number }
}): Promise<void> {
  const { inputVideos, outputPath, section, sectionIndex, focusSegments, settings, recordings, recordingVideoMap } = params

  return new Promise((resolve, reject) => {
    const command = ffmpeg()

    // Add input videos
    inputVideos.forEach(video => {
      command.addInput(video)
    })

    const filterComplex: string[] = []

    if (inputVideos.length === 2) {
      // Create base 50/50 layout for this section
      const sectionDuration = section.endTime - section.startTime
      const speedFilter = section.playbackSpeed !== 1 ? `,setpts=PTS/${section.playbackSpeed}` : ''

      console.log(`📱 Processing section ${sectionIndex}: ${sectionDuration.toFixed(1)}s at ${section.playbackSpeed}x speed`)

      filterComplex.push(
        `[0:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},crop=720:720:280:0,scale=640:720,setsar=1/1${speedFilter}[v0_s${sectionIndex}]`,
        `[1:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},crop=720:720:280:0,scale=640:720,setsar=1/1${speedFilter}[v1_s${sectionIndex}]`,
        `[v0_s${sectionIndex}][v1_s${sectionIndex}]hstack[base_video_s${sectionIndex}]`
      )

      let currentVideoStream = `[base_video_s${sectionIndex}]`

      // Apply focus overlays for this section
      const sectionFocusSegments = focusSegments.filter(fs => 
        fs.startTime >= section.startTime && fs.endTime <= section.endTime
      )

      sectionFocusSegments.forEach((fs, fsIndex) => {
        if (fs.focusedParticipantId && recordingVideoMap[fs.focusedParticipantId] !== undefined) {
          const videoIndex = recordingVideoMap[fs.focusedParticipantId]
          const overlayName = `overlay_s${sectionIndex}_${fsIndex}`
          const fullStreamName = `full${videoIndex}_s${sectionIndex}_${fsIndex}`

          // Create individual full-screen stream
          filterComplex.push(
            `[${videoIndex}:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},scale=1280:720,setsar=1/1${speedFilter}[${fullStreamName}]`
          )

          // Adjust timing relative to section start
          const relativeStart = Math.max(0, fs.startTime - section.startTime) / section.playbackSpeed
          const relativeEnd = Math.min(section.endTime - section.startTime, fs.endTime - section.startTime) / section.playbackSpeed

          const enableExpr = `'between(t,${relativeStart.toFixed(2)},${relativeEnd.toFixed(2)})'`
          filterComplex.push(
            `${currentVideoStream}[${fullStreamName}]overlay=enable=${enableExpr}[${overlayName}]`
          )

          currentVideoStream = `[${overlayName}]`
        }
      })

      // Final video stream for this section
      filterComplex.push(`${currentVideoStream}null[finalvideo]`)

      // Audio mixing with speed control
      const audioSpeedFilter = section.playbackSpeed !== 1 ? `,atempo=${section.playbackSpeed}` : ''
      filterComplex.push(
        `[0:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)}${audioSpeedFilter}[a0_s${sectionIndex}]`,
        `[1:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)}${audioSpeedFilter}[a1_s${sectionIndex}]`,
        `[a0_s${sectionIndex}][a1_s${sectionIndex}]amix=inputs=2[finalaudio]`
      )

    } else {
      // Single video processing
      const speedFilter = section.playbackSpeed !== 1 ? `,setpts=PTS/${section.playbackSpeed}` : ''
      const audioSpeedFilter = section.playbackSpeed !== 1 ? `,atempo=${section.playbackSpeed}` : ''

      filterComplex.push(
        `[0:v]trim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)},scale=1280:720,setsar=1/1${speedFilter}[finalvideo]`,
        `[0:a]atrim=${section.startTime.toFixed(2)}:${section.endTime.toFixed(2)}${audioSpeedFilter}[finalaudio]`
      )
    }

    // Apply filters
    command.complexFilter(filterComplex)
    command.map('[finalvideo]').map('[finalaudio]')

    // Output settings
    command
      .format('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .videoBitrate(getVideoBitrate(settings.quality))
      .audioBitrate('128k')
      .fps(settings.framerate)
      .addOption('-preset', 'ultrafast')
      .addOption('-profile:v', 'high')
      .addOption('-level', '4.0')
      .addOption('-pix_fmt', 'yuv420p')
      .output(outputPath)

    command
      .on('start', (commandLine) => {
        console.log(`🎬 Section ${sectionIndex} FFmpeg command:`, commandLine.substring(0, 200) + '...')
      })
      .on('end', () => {
        console.log(`✅ Section ${sectionIndex} processing completed`)
        resolve()
      })
      .on('error', (err) => {
        console.error(`❌ Section ${sectionIndex} processing failed:`, err)
        reject(err)
      })
      .run()
  })
}

// Concatenate processed sections
async function concatenateSections(sectionFiles: string[], outputPath: string, subtitleFile?: string, settings?: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg()

    // Add all section files as inputs
    sectionFiles.forEach(file => {
      command.addInput(file)
    })

    // Create concat filter
    const inputs = sectionFiles.map((_, index) => `[${index}:v][${index}:a]`).join('')
    const concatFilter = `${inputs}concat=n=${sectionFiles.length}:v=1:a=1[outv][outa]`

    let finalVideoStream = '[outv]'
    const finalAudioStream = '[outa]'

    const filterComplex = [concatFilter]

    // Add subtitles if provided
    if (subtitleFile) {
      console.log(`📝 Adding subtitles to final concatenated video: ${subtitleFile}`)
      const subtitlesFilter = `subtitles=${subtitleFile}:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=1,Shadow=1'`
      filterComplex.push(`[outv]${subtitlesFilter}[outv_sub]`)
      finalVideoStream = '[outv_sub]'
    }

    command.complexFilter(filterComplex)
    command.map(finalVideoStream).map(finalAudioStream)

    command
      .format('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .addOption('-preset', 'ultrafast')
      .addOption('-profile:v', 'high')
      .addOption('-level', '4.0')
      .addOption('-pix_fmt', 'yuv420p')
      .output(outputPath)

    command
      .on('start', (commandLine) => {
        console.log('🎬 Concatenation FFmpeg command:', commandLine.substring(0, 200) + '...')
      })
      .on('end', () => {
        console.log('✅ Section concatenation completed')
        resolve()
      })
      .on('error', (err) => {
        console.error('❌ Section concatenation failed:', err)
        reject(err)
      })
      .run()
  })
}

// Parse FFmpeg timemark (HH:MM:SS.SS) to seconds
function parseTimemark(timemark: string): number | null {
  const match = timemark.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null

  const hours = parseInt(match[1])
  const minutes = parseInt(match[2])
  const seconds = parseFloat(match[3])

  return hours * 3600 + minutes * 60 + seconds
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
