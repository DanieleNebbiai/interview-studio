import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { addJobToQueue, ExportJobData } from '@/lib/server-export-queue'

export async function POST(request: NextRequest) {
  try {
    const { roomId, exportSettings } = await request.json()

    if (!roomId) {
      return NextResponse.json(
        { error: 'Room ID is required' },
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

    // Get room data
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('id')
      .eq('daily_room_name', roomId)
      .single()

    if (roomError || !roomData) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      )
    }

    // Fetch all necessary data
    console.log('Fetching export data for room:', roomId)

    // Get recordings
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .eq('room_id', roomData.id)

    if (recordingsError || !recordings || recordings.length === 0) {
      return NextResponse.json(
        { error: 'No recordings found for this room' },
        { status: 404 }
      )
    }

    // Get transcriptions
    const { data: transcriptions } = await supabase
      .from('transcriptions')
      .select('*')
      .in('recording_id', recordings.map(r => r.id))

    // Get video sections (from current editor state - would need to be passed or stored)
    // For now, create default sections based on cut_segments and speed_recommendations
    const { data: cutSegments } = await supabase
      .from('cut_segments')
      .select('*')
      .eq('room_id', roomData.id)
      .eq('ai_generated', true)
      .is('user_approved', null) // Only AI suggestions not rejected

    const { data: speedRecommendations } = await supabase
      .from('speed_recommendations')
      .select('*')
      .eq('room_id', roomData.id)

    // Build video sections from AI recommendations
    const maxDuration = Math.max(...recordings.map(r => r.duration || 0))
    const videoSections = buildVideoSectionsFromAI(cutSegments || [], speedRecommendations || [], maxDuration)

    // Get focus segments
    const { data: focusSegments } = await supabase
      .from('focus_segments')
      .select('*')
      .eq('room_id', roomData.id)

    // Create job ID
    const jobId = `export_${roomId}_${Date.now()}`

    // Prepare job data
    const jobData: ExportJobData = {
      jobId,
      roomId,
      recordings: recordings.map(r => ({
        id: r.id,
        recording_url: r.recording_url,
        duration: r.duration || 0,
        participant_id: r.participant_session_id || 'unknown'
      })),
      videoSections,
      focusSegments: (focusSegments || []).map(fs => ({
        id: fs.id,
        startTime: fs.start_time,
        endTime: fs.end_time,
        focusedParticipantId: fs.focused_participant_id,
        type: fs.segment_type || 'conversation'
      })),
      transcriptions: (transcriptions || []).map(t => ({
        id: t.id,
        transcript_text: t.transcript_text,
        word_timestamps: t.word_timestamps
      })),
      exportSettings: {
        format: 'mp4',
        quality: '720p',
        framerate: 30,
        includeSubtitles: true,
        ...exportSettings
      }
    }

    // Add job to queue
    console.log(`Creating export job: ${jobId}`)
    const job = await addJobToQueue(jobData)

    console.log(`Export job created with ID: ${job.id}`)

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Export job queued successfully'
    })

  } catch (error) {
    console.error('Error starting export:', error)
    return NextResponse.json(
      { error: 'Failed to start export job' },
      { status: 500 }
    )
  }
}

// Helper function to build video sections from AI data
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