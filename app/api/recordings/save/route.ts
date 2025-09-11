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

// Helper function to build video sections from AI data (copied from export/start)
function buildVideoSectionsFromAI(
  cutSegments: any[],
  speedRecommendations: any[],
  maxDuration: number
) {
  // Start with full video
  let sections = [{
    id: `section-0-${maxDuration}`,
    startTime: 0,
    endTime: maxDuration,
    isDeleted: false,
    playbackSpeed: 1.0
  }]

  // Apply cuts - mark segments as deleted
  for (const cut of cutSegments) {
    const newSections = []
    
    for (const section of sections) {
      if (section.isDeleted) {
        newSections.push(section)
        continue
      }

      // Check if cut overlaps with this section
      if (cut.end_time <= section.startTime || cut.start_time >= section.endTime) {
        // No overlap
        newSections.push(section)
      } else {
        // Split section around the cut
        if (cut.start_time > section.startTime) {
          // Add section before cut
          newSections.push({
            id: `section-${section.startTime}-${cut.start_time}`,
            startTime: section.startTime,
            endTime: cut.start_time,
            isDeleted: false,
            playbackSpeed: section.playbackSpeed
          })
        }
        
        // Add cut section (deleted)
        newSections.push({
          id: `section-${cut.start_time}-${cut.end_time}`,
          startTime: Math.max(cut.start_time, section.startTime),
          endTime: Math.min(cut.end_time, section.endTime),
          isDeleted: true,
          playbackSpeed: 1.0
        })
        
        if (cut.end_time < section.endTime) {
          // Add section after cut
          newSections.push({
            id: `section-${cut.end_time}-${section.endTime}`,
            startTime: cut.end_time,
            endTime: section.endTime,
            isDeleted: false,
            playbackSpeed: section.playbackSpeed
          })
        }
      }
    }
    
    sections = newSections
  }

  // Apply speed recommendations
  for (const speedRec of speedRecommendations) {
    sections = sections.map(section => {
      if (!section.isDeleted &&
          section.startTime >= speedRec.start_time &&
          section.endTime <= speedRec.end_time) {
        return {
          ...section,
          playbackSpeed: speedRec.speed
        }
      }
      return section
    })
  }

  return sections.sort((a, b) => a.startTime - b.startTime)
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

    // Save AI-generated video sections, focus segments and cut segments if available
    let savedVideoSections = 0
    let savedFocusSegments = 0
    let savedCutSegments = 0
    let savedSpeedRecommendations = 0
    
    if (aiEditingResult && aiEditingResult.focusSegments && aiEditingResult.focusSegments.length > 0) {
      console.log(`Saving ${aiEditingResult.focusSegments.length} AI-generated focus segments`)
      
      // First, create video sections from AI recommendations
      const maxDuration = Math.max(...savedRecordings.map(r => r.duration || 0))
      const videoSections = buildVideoSectionsFromAI(
        aiEditingResult.cutSegments || [], 
        aiEditingResult.speedRecommendations || [], 
        maxDuration
      )
      
      // Save video sections to database
      if (videoSections.length > 0) {
        console.log(`Saving ${videoSections.length} AI-generated video sections`)
        
        const videoSectionInserts = videoSections.map(section => ({
          room_id: roomData.id,
          section_id: section.id,
          start_time: section.startTime,
          end_time: section.endTime,
          is_deleted: section.isDeleted,
          playback_speed: section.playbackSpeed,
          created_by: 'ai_system',
          ai_generated: true,
          user_modified: false
        }))

        const { error: sectionsError } = await supabase
          .from('video_sections')
          .insert(videoSectionInserts)

        if (sectionsError) {
          console.error('Failed to save video sections:', sectionsError)
        } else {
          savedVideoSections = videoSections.length
        }
      }
      
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
      
      // Save AI-generated cut segments if available
      if (aiEditingResult.cutSegments && aiEditingResult.cutSegments.length > 0) {
        console.log(`Saving ${aiEditingResult.cutSegments.length} AI-generated cut segments...`)
        
        for (const cutSegment of aiEditingResult.cutSegments) {
          try {
            const { error: cutError } = await supabase
              .from('cut_segments')
              .insert({
                room_id: roomData.id,
                start_time: cutSegment.startTime,
                end_time: cutSegment.endTime,
                reason: cutSegment.reason,
                confidence: cutSegment.confidence,
                ai_generated: true,
                user_approved: null, // AI suggestion, not yet approved by user
                segment_type: cutSegment.segmentType,
                created_by: 'ai_system',
                applied: false // Start as not applied, user can approve/apply
              })

            if (cutError) {
              console.error(`Failed to save cut segment:`, cutError)
              errors.push(`Failed to save cut segment: ${cutError.message}`)
            } else {
              savedCutSegments++
            }
          } catch (error) {
            console.error(`Error saving cut segment:`, error)
            errors.push(`Error saving cut segment: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
        
        console.log(`Saved ${savedCutSegments}/${aiEditingResult.cutSegments.length} cut segments`)
      }
      
      // Save speed recommendations if available
      if (aiEditingResult.speedRecommendations && aiEditingResult.speedRecommendations.length > 0) {
        console.log(`Saving ${aiEditingResult.speedRecommendations.length} speed recommendations...`)
        
        for (const speedRec of aiEditingResult.speedRecommendations) {
          try {
            const { error: speedError } = await supabase
              .from('speed_recommendations')
              .insert({
                room_id: roomData.id,
                start_time: speedRec.startTime,
                end_time: speedRec.endTime,
                speed: speedRec.speed,
                reason: speedRec.reason,
                confidence: speedRec.confidence,
                recommendation_type: speedRec.type,
                ai_generated: true
              })

            if (speedError) {
              console.error(`Failed to save speed recommendation:`, speedError)
              errors.push(`Failed to save speed recommendation: ${speedError.message}`)
            } else {
              savedSpeedRecommendations++
            }
          } catch (error) {
            console.error(`Error saving speed recommendation:`, error)
            errors.push(`Error saving speed recommendation: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
        
        console.log(`Saved ${savedSpeedRecommendations}/${aiEditingResult.speedRecommendations.length} speed recommendations`)
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
      savedVideoSections: savedVideoSections || 0,
      savedFocusSegments: savedFocusSegments,
      savedCutSegments: savedCutSegments || 0,
      savedSpeedRecommendations: savedSpeedRecommendations || 0,
      recordings: savedRecordings,
      transcriptions: savedTranscriptions,
      errors: errors.length > 0 ? errors : undefined,
      message: `${savedRecordings.length} registrazioni, ${savedTranscriptions.length} trascrizioni${savedVideoSections > 0 ? `, ${savedVideoSections} sezioni video AI` : ''}${savedFocusSegments > 0 ? `, ${savedFocusSegments} focus segments AI` : ''}${savedCutSegments > 0 ? `, ${savedCutSegments} cut segments AI` : ''}${savedSpeedRecommendations > 0 ? ` e ${savedSpeedRecommendations} raccomandazioni velocità AI` : ''} salvate con successo`
    })

  } catch (error) {
    console.error('Error saving to database:', error)
    return NextResponse.json(
      { error: 'Internal server error during save' },
      { status: 500 }
    )
  }
}