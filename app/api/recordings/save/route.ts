import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

interface DailyRecording {
  id: string
  roomName: string
  status: string
  startTime: number // Unix timestamp (seconds) from Daily.co start_ts
  recordingStartedAt?: string // ISO timestamp of when recording actually started
  duration?: number
  downloadUrl?: string
  fileSize?: number
  filename?: string
}

interface WordTimestamp {
  word: string
  start: number
  end: number
  confidence?: number
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
  text: string
  wordTimestamps: WordTimestamp[]
  liveCaptionSegments: LiveCaptionSegment[]
  language: string
  duration: number
  confidence?: number
  wordCount: number
}

export async function POST(request: NextRequest) {
  try {
    const { roomId, recordings, transcriptions, aiEditingResult } = await request.json()

    if (!recordings || !transcriptions) {
      return NextResponse.json(
        { error: 'Recordings and transcriptions are required' },
        { status: 400 }
      )
    }

    // Create Supabase client
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.delete(name)
          },
        },
      }
    )

    console.log('Saving recordings and transcriptions to Supabase...')

    // Get room data to establish the relationship
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('id')
      .eq('daily_room_name', roomId)
      .single()

    if (roomError || !roomData) {
      console.error('Room not found:', roomId, roomError)
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      )
    }

    const savedRecordings = []
    const savedTranscriptions = []
    const errors = []

    // Save each recording and its transcription
    for (const recording of recordings as DailyRecording[]) {
      try {
        // Find matching transcription
        const transcription = (transcriptions as Transcription[]).find(
          t => t.recordingId === recording.id
        )

        if (!transcription) {
          errors.push(`No transcription found for recording ${recording.id}`)
          continue
        }

        // Convert Daily.co start_ts (Unix timestamp in seconds) to ISO timestamp
        let recordingStartedAt = null;
        if (recording.startTime) {
          // Convert Unix timestamp (seconds) to milliseconds and create Date
          recordingStartedAt = new Date(recording.startTime * 1000);
          console.log(`Recording ${recording.id} start_ts: ${recording.startTime} -> ${recordingStartedAt.toISOString()}`);
        }
        
        if (!recordingStartedAt) {
          console.log(`Recording ${recording.id} has no start_ts - will use null for recording_started_at`);
        }

        // Save recording to database
        const { data: recordingData, error: recordingError } = await supabase
          .from('recordings')
          .insert({
            room_id: roomData.id,
            participant_session_id: 'unknown', // We don't have this from Daily.co response
            daily_recording_id: recording.id,
            daily_instance_id: recording.id, // Using recording id as instance id
            recording_url: recording.downloadUrl,
            duration: recording.duration,
            file_size: recording.fileSize,
            recording_started_at: recordingStartedAt,
            status: 'transcribed'
          })
          .select()
          .single()

        if (recordingError) {
          throw new Error(`Failed to save recording: ${recordingError.message}`)
        }

        // Save transcription to database with live caption segments
        const { data: transcriptionData, error: transcriptionError } = await supabase
          .from('transcriptions')
          .insert({
            recording_id: recordingData.id,
            transcript_text: transcription.text,
            word_timestamps: {
              words: transcription.wordTimestamps,
              segments: transcription.liveCaptionSegments,
              wordCount: transcription.wordCount,
              totalDuration: transcription.duration
            },
            language: transcription.language,
            confidence: transcription.confidence,
            processing_time: Math.round(transcription.duration * 1000) // Convert to milliseconds
          })
          .select()
          .single()

        if (transcriptionError) {
          throw new Error(`Failed to save transcription: ${transcriptionError.message}`)
        }

        savedRecordings.push(recordingData)
        savedTranscriptions.push(transcriptionData)

        console.log(`Successfully saved recording and transcription: ${recording.id}`)

      } catch (error) {
        console.error(`Error saving recording ${recording.id}:`, error)
        errors.push(`Error saving recording ${recording.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    if (savedRecordings.length === 0) {
      return NextResponse.json(
        { 
          error: 'No recordings could be saved', 
          details: errors,
          message: 'Errore durante il salvataggio su database' 
        },
        { status: 400 }
      )
    }

    // Save AI-generated focus segments if available
    let savedFocusSegments = 0
    if (aiEditingResult && aiEditingResult.focusSegments && aiEditingResult.focusSegments.length > 0) {
      console.log(`Saving ${aiEditingResult.focusSegments.length} AI-generated focus segments`)
      
      for (const focusSegment of aiEditingResult.focusSegments) {
        try {
          // Find the participant recording ID to link focus segments
          const participantIndex = parseInt(focusSegment.focusedParticipantId.replace('participant_', '')) - 1
          const targetRecording = savedRecordings[participantIndex]
          
          if (targetRecording) {
            const { error: focusError } = await supabase
              .from('focus_segments')
              .insert({
                room_id: roomData.id,
                start_time: focusSegment.startTime,
                end_time: focusSegment.endTime,
                focused_participant_id: targetRecording.id,
                created_by: 'ai_system', // Indicate this was created by AI
                reason: focusSegment.reason,
                confidence: focusSegment.confidence,
                segment_type: focusSegment.type,
                ai_generated: true
              })

            if (focusError) {
              console.error(`Failed to save focus segment:`, focusError)
              errors.push(`Failed to save focus segment: ${focusError.message}`)
            } else {
              savedFocusSegments++
            }
          }
        } catch (error) {
          console.error(`Error saving focus segment:`, error)
          errors.push(`Error saving focus segment: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      // Also save the AI editing metadata
      try {
        const { error: aiEditError } = await supabase
          .from('ai_editing_sessions')
          .insert({
            room_id: roomData.id,
            total_duration: aiEditingResult.totalDuration,
            focus_segments_count: aiEditingResult.focusSegments.length,
            analysis_confidence: aiEditingResult.analysisConfidence,
            ai_recommendations: aiEditingResult.aiRecommendations,
            processing_time: aiEditingResult.processingTime,
            created_at: new Date().toISOString()
          })

        if (aiEditError) {
          console.error('Failed to save AI editing session:', aiEditError)
          errors.push(`Failed to save AI editing session: ${aiEditError.message}`)
        }
      } catch (error) {
        console.error('Error saving AI editing session:', error)
        errors.push(`Error saving AI editing session: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      savedRecordings: savedRecordings.length,
      savedTranscriptions: savedTranscriptions.length,
      savedFocusSegments: savedFocusSegments,
      recordings: savedRecordings,
      transcriptions: savedTranscriptions,
      errors: errors.length > 0 ? errors : undefined,
      message: `${savedRecordings.length} registrazioni, ${savedTranscriptions.length} trascrizioni${savedFocusSegments > 0 ? ` e ${savedFocusSegments} focus segments AI` : ''} salvate con successo`
    })

  } catch (error) {
    console.error('Error saving to database:', error)
    return NextResponse.json(
      { error: 'Internal server error during save' },
      { status: 500 }
    )
  }
}