import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { unlinkSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'

interface DailyRecording {
  id: string
  roomName: string
  status: string
  startTime: number
  duration?: number
  downloadUrl?: string
  fileSize?: number
  filename?: string
}

interface WordTimestamp {
  word: string
  start: number // Start time in seconds
  end: number   // End time in seconds
  confidence?: number // Word-level confidence if available
}

interface LiveCaptionSegment {
  id: number
  start: number
  end: number
  text: string
  words: WordTimestamp[]
}

interface Transcription {
  recordingId: string
  text: string // Full transcript text
  wordTimestamps: WordTimestamp[] // Individual words with timing
  liveCaptionSegments: LiveCaptionSegment[] // Grouped segments for captions
  language: string
  duration: number
  confidence?: number
  wordCount: number
}

// Get FFmpeg path dynamically - ignore the import, build our own path
const getFfmpegPath = () => {
  console.log('DEBUG: Getting FFmpeg path...')
  console.log('DEBUG: process.cwd():', process.cwd())
  
  // Skip the import completely and build path dynamically
  const path = require('path');
  const possiblePaths = [
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    path.join(__dirname, '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    path.join(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ];
  
  console.log('DEBUG: Trying paths:', possiblePaths)
  
  for (const possiblePath of possiblePaths) {
    console.log(`DEBUG: Checking path: ${possiblePath}, exists: ${existsSync(possiblePath)}`)
    if (existsSync(possiblePath)) {
      console.log('DEBUG: Found FFmpeg at:', possiblePath)
      return possiblePath;
    }
  }
  
  console.log('DEBUG: No FFmpeg found in any path')
  return null;
};

const ffmpegPath = getFfmpegPath();

// Configure ffmpeg to use the static binary
if (ffmpegPath) {
  console.log('Setting FFmpeg path:', ffmpegPath)
  ffmpeg.setFfmpegPath(ffmpegPath)
} else {
  console.error('FFmpeg path not found!')
}

// Alternative conversion function using direct child_process
async function convertVideoToAudioDirect(videoBuffer: Buffer, recordingId: string): Promise<Buffer> {
  const tempVideoPath = join(tmpdir(), `video-${recordingId}-${Date.now()}.mp4`)
  const tempAudioPath = join(tmpdir(), `audio-${recordingId}-${Date.now()}.mp3`)
  
  try {
    // Write video buffer to temp file
    writeFileSync(tempVideoPath, videoBuffer)
    
    console.log(`Direct conversion: ${tempVideoPath} -> ${tempAudioPath}`)
    
    // Get fresh ffmpeg path each time
    const currentFfmpegPath = getFfmpegPath();
    console.log('FFmpeg binary path:', currentFfmpegPath)
    console.log('FFmpeg binary exists:', existsSync(currentFfmpegPath || ''))
    
    if (!currentFfmpegPath || !existsSync(currentFfmpegPath)) {
      throw new Error('FFmpeg binary not found')
    }
    
    // Use child_process to call ffmpeg directly
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-i', tempVideoPath,
        '-vn', // No video
        '-acodec', 'mp3',
        '-ar', '16000', // 16kHz
        '-ac', '1', // Mono
        '-ab', '64k', // 64k bitrate
        '-f', 'mp3',
        '-y', // Overwrite output file
        tempAudioPath
      ]
      
      console.log('Spawning FFmpeg with args:', args)
      const process = spawn(currentFfmpegPath, args)
      
      process.on('close', (code) => {
        if (code === 0) {
          console.log('Direct FFmpeg conversion completed successfully')
          resolve()
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`))
        }
      })
      
      process.on('error', (error) => {
        console.error('Direct FFmpeg process error:', error)
        reject(error)
      })
      
      process.stderr.on('data', (data) => {
        console.log('FFmpeg stderr:', data.toString())
      })
    })
    
    // Read the converted audio file
    const audioBuffer = readFileSync(tempAudioPath)
    console.log(`Direct conversion successful. Original: ${videoBuffer.length} bytes, Audio: ${audioBuffer.length} bytes`)
    return audioBuffer
    
  } finally {
    // Clean up temp files
    try {
      if (existsSync(tempVideoPath)) unlinkSync(tempVideoPath)
      if (existsSync(tempAudioPath)) unlinkSync(tempAudioPath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temp files:', cleanupError)
    }
  }
}

// Helper function to convert video to audio
async function convertVideoToAudio(videoBuffer: Buffer, recordingId: string): Promise<Buffer> {
  const tempVideoPath = join(tmpdir(), `video-${recordingId}-${Date.now()}.mp4`)
  const tempAudioPath = join(tmpdir(), `audio-${recordingId}-${Date.now()}.mp3`)
  
  try {
    // Write video buffer to temp file
    writeFileSync(tempVideoPath, videoBuffer)
    
    console.log(`Converting video to audio: ${tempVideoPath} -> ${tempAudioPath}`)
    console.log('Current FFmpeg path:', ffmpeg().options.ffmpegPath || 'not set')
    
    // Convert video to audio using ffmpeg
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(tempVideoPath)
      
      // Make sure the path is set for this command
      if (ffmpegPath) {
        command.setFfmpegPath(ffmpegPath)
      }
      
      command
        .audioCodec('mp3')
        .audioFrequency(16000) // 16kHz is optimal for speech recognition
        .audioChannels(1) // Mono for speech
        .audioBitrate('64k') // Lower bitrate for smaller files
        .format('mp3')
        .on('end', () => {
          console.log('Audio conversion completed')
          resolve()
        })
        .on('error', (err) => {
          console.error('FFmpeg conversion error:', err)
          reject(new Error(`Audio conversion failed: ${err.message}`))
        })
        .save(tempAudioPath)
    })
    
    // Read the converted audio file
    const audioBuffer = readFileSync(tempAudioPath)
    
    console.log(`Audio conversion successful. Original: ${videoBuffer.length} bytes, Audio: ${audioBuffer.length} bytes`)
    return audioBuffer
    
  } finally {
    // Clean up temp files
    try {
      unlinkSync(tempVideoPath)
      unlinkSync(tempAudioPath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temp files:', cleanupError)
    }
  }
}

// Helper function to create live caption segments from word timestamps
function createLiveCaptionSegments(words: WordTimestamp[]): LiveCaptionSegment[] {
  if (words.length === 0) return []

  const segments: LiveCaptionSegment[] = []
  const maxSegmentDuration = 4 // Max 4 seconds per segment
  const maxWordsPerSegment = 8 // Max 8 words per segment

  let currentSegment: WordTimestamp[] = []
  let segmentStartTime = words[0].start
  let segmentId = 0

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    currentSegment.push(word)

    // Check if we should end the current segment
    const segmentDuration = word.end - segmentStartTime
    const shouldEndSegment = 
      segmentDuration >= maxSegmentDuration || 
      currentSegment.length >= maxWordsPerSegment ||
      i === words.length - 1 // Last word

    if (shouldEndSegment && currentSegment.length > 0) {
      segments.push({
        id: segmentId++,
        start: segmentStartTime,
        end: word.end,
        text: currentSegment.map(w => w.word).join(''),
        words: [...currentSegment]
      })

      // Start new segment
      currentSegment = []
      if (i < words.length - 1) {
        segmentStartTime = words[i + 1].start
      }
    }
  }

  return segments
}

// Increase timeout for large file processing
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const { roomId, recordings } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured')
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    console.log('OpenAI API key configured, length:', process.env.OPENAI_API_KEY.length)

    if (!recordings || !Array.isArray(recordings)) {
      return NextResponse.json(
        { error: 'Recordings array is required' },
        { status: 400 }
      )
    }

    console.log('Starting PARALLEL transcription for', recordings.length, 'recordings')

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 300000, // 5 minutes timeout for large files
      maxRetries: 0, // We handle retries manually
    })

    const transcriptions: Transcription[] = []
    const errors: string[] = []

    // Process all recordings in parallel for faster processing
    const recordingPromises = (recordings as DailyRecording[]).map(async (recording) => {
      try {
        if (!recording.downloadUrl) {
          return { error: `No download URL for recording ${recording.id}` }
        }

        console.log(`Downloading and transcribing recording: ${recording.id}`)
        console.log(`Download URL: ${recording.downloadUrl}`)

        // Download the recording file
        console.log(`Starting download...`)
        const downloadStartTime = Date.now()
        const audioResponse = await fetch(recording.downloadUrl)
        if (!audioResponse.ok) {
          throw new Error(`Failed to download recording: ${audioResponse.statusText}`)
        }

        const videoArrayBuffer = await audioResponse.arrayBuffer()
        const videoBuffer = Buffer.from(videoArrayBuffer)
        const downloadTime = Date.now() - downloadStartTime
        console.log(`Download completed in ${downloadTime}ms, size: ${videoBuffer.length} bytes`)

        // Convert video to audio for better Whisper compatibility
        console.log(`Converting video to audio for recording: ${recording.id}`)
        const conversionStartTime = Date.now()
        let audioBuffer: Buffer
        let audioFile: File
        
        try {
          audioBuffer = await convertVideoToAudioDirect(videoBuffer, recording.id)
          const conversionTime = Date.now() - conversionStartTime
          console.log(`Audio conversion completed in ${conversionTime}ms, size reduced from ${videoBuffer.length} to ${audioBuffer.length} bytes`)
          
          // Create audio File object
          audioFile = new File([audioBuffer], `recording-${recording.id}.mp3`, {
            type: 'audio/mp3'
          })
        } catch (conversionError) {
          console.warn(`Audio conversion failed for ${recording.id}, falling back to original video:`, conversionError)
          // Fallback to original video if conversion fails
          audioBuffer = videoBuffer
          audioFile = new File([audioBuffer], recording.filename || `recording-${recording.id}.mp4`, {
            type: 'video/mp4'
          })
        }

        console.log(`Transcribing audio file: ${audioFile.name}, size: ${audioFile.size} bytes`)

        // Check file size limit (OpenAI Whisper limit is 25MB)
        const maxFileSize = 25 * 1024 * 1024 // 25MB
        if (audioFile.size > maxFileSize) {
          throw new Error(`File too large: ${(audioFile.size / (1024 * 1024)).toFixed(1)}MB. OpenAI Whisper limit is 25MB`)
        }

        // Call OpenAI Whisper API with word timestamps for live captions
        console.log(`Calling OpenAI Whisper for word-level timestamps...`)
        
        // Retry logic for OpenAI API calls
        let transcriptionResponse
        let retryCount = 0
        const maxRetries = 3
        
        while (retryCount < maxRetries) {
          try {
            const whisperStartTime = Date.now()
            transcriptionResponse = await openai.audio.transcriptions.create({
              file: audioFile,
              model: 'whisper-1',
              language: 'it', // Italian
              response_format: 'verbose_json',
              timestamp_granularities: ['word'], // This gives us word-level timing
            })
            const whisperTime = Date.now() - whisperStartTime
            console.log(`OpenAI Whisper completed in ${whisperTime}ms`)
            break // Success, exit retry loop
          } catch (apiError) {
            retryCount++
            console.error(`OpenAI API attempt ${retryCount} failed:`, apiError)
            
            // Check if it's a retryable error
            const isRetryableError = apiError instanceof Error && (
              apiError.message.includes('Connection error') ||
              apiError.message.includes('EPIPE') ||
              apiError.message.includes('timeout') ||
              apiError.message.includes('ECONNRESET')
            )
            
            if (retryCount >= maxRetries || !isRetryableError) {
              const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error'
              
              if (!isRetryableError) {
                console.log('Non-retryable error, stopping retries')
                throw new Error(`OpenAI API error: ${errorMessage}`)
              } else {
                throw new Error(`OpenAI API failed after ${maxRetries} attempts: ${errorMessage}`)
              }
            }
            
            // Wait before retrying (exponential backoff with jitter)
            const baseDelay = Math.pow(2, retryCount) * 1000
            const jitter = Math.random() * 1000 // Add randomness to avoid thundering herd
            const delayMs = baseDelay + jitter
            console.log(`Retrying in ${Math.round(delayMs)}ms... (attempt ${retryCount}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, delayMs))
          }
        }

        console.log(`Transcription completed. Duration: ${transcriptionResponse.duration}s`)
        console.log(`Word count: ${transcriptionResponse.words?.length || 0}`)
        
        // Log first few words for debugging
        if (transcriptionResponse.words && transcriptionResponse.words.length > 0) {
          console.log('First 5 words with timestamps:', transcriptionResponse.words.slice(0, 5).map(w => ({
            word: w.word,
            start: w.start,
            end: w.end
          })))
        }

        console.log(`Transcription completed for recording: ${recording.id}`)

        // Extract word timestamps with detailed timing
        const wordTimestamps: WordTimestamp[] = transcriptionResponse.words?.map((word, index) => ({
          word: word.word,
          start: word.start,
          end: word.end,
          confidence: 0.9 // Default confidence for Whisper
        })) || []

        // Create live caption segments (group words into 3-5 second segments)
        const liveCaptionSegments: LiveCaptionSegment[] = createLiveCaptionSegments(wordTimestamps)

        console.log(`Created ${liveCaptionSegments.length} live caption segments`)

        const transcription: Transcription = {
          recordingId: recording.id,
          text: transcriptionResponse.text,
          wordTimestamps,
          liveCaptionSegments,
          language: transcriptionResponse.language || 'it',
          duration: transcriptionResponse.duration,
          confidence: 0.9,
          wordCount: wordTimestamps.length
        }

        console.log(`Successfully transcribed recording ${recording.id}: ${transcription.text.length} characters`)
        return { success: true, transcription }

      } catch (error) {
        console.error(`Error transcribing recording ${recording.id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Create a fallback "empty" transcription so processing can continue
        console.log(`Creating fallback transcription for ${recording.id}`)
        const fallbackTranscription: Transcription = {
          recordingId: recording.id,
          text: `[Trascrizione non disponibile - Errore: ${errorMessage}]`,
          wordTimestamps: [],
          liveCaptionSegments: [],
          language: 'it',
          duration: recording.duration || 0,
          confidence: 0,
          wordCount: 0
        }
        
        console.log(`Added fallback transcription for ${recording.id}`)
        return { success: false, transcription: fallbackTranscription, error: errorMessage }
      }
    })

    // Wait for all recordings to be processed in parallel
    console.log(`Processing ${recordingPromises.length} recordings in parallel...`)
    const results = await Promise.allSettled(recordingPromises)
    
    // Collect results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { success, transcription, error } = result.value
        if (transcription) {
          transcriptions.push(transcription)
        }
        if (error) {
          errors.push(error)
        }
      } else {
        const recordingId = (recordings as DailyRecording[])[index]?.id || `recording-${index}`
        errors.push(`Processing failed for ${recordingId}: ${result.reason}`)
        console.error(`Promise rejected for recording ${recordingId}:`, result.reason)
      }
    })

    if (transcriptions.length === 0) {
      return NextResponse.json(
        { 
          error: 'No recordings could be transcribed', 
          details: errors,
          message: 'Errore durante la trascrizione. Controlla i log per dettagli.' 
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      transcriptionsCount: transcriptions.length,
      transcriptions,
      recordings, // Pass through the original recordings data
      errors: errors.length > 0 ? errors : undefined,
      message: `${transcriptions.length} trascrizioni completate con successo`
    })

  } catch (error) {
    console.error('Error in transcription process:', error)
    return NextResponse.json(
      { error: 'Internal server error during transcription' },
      { status: 500 }
    )
  }
}