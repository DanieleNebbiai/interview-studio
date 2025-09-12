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

    // Get video sections (either AI-generated during processing or user-modified)
    const { data: videoSectionsData, error: sectionsError } = await supabase
      .from('video_sections')
      .select('*')
      .eq('room_id', roomData.id)
      .order('start_time')

    if (sectionsError) {
      return NextResponse.json(
        { error: 'Failed to load video sections' },
        { status: 500 }
      )
    }

    let videoSections
    if (videoSectionsData && videoSectionsData.length > 0) {
      console.log(`Using video sections: ${videoSectionsData.length} sections`)
      videoSections = videoSectionsData.map(section => ({
        id: section.section_id,
        startTime: section.start_time,
        endTime: section.end_time,
        isDeleted: section.is_deleted,
        playbackSpeed: section.playback_speed
      }))
    } else {
      // Create default single section if none exist
      const maxDuration = Math.max(...recordings.map(r => r.duration || 0))
      console.log('No video sections found, creating default single section')
      videoSections = [{
        id: `section-0-${maxDuration}`,
        startTime: 0,
        endTime: maxDuration,
        isDeleted: false,
        playbackSpeed: 1.0
      }]
    }

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

    // Notify worker to process the new job
    try {
      const workerUrl = process.env.WORKER_URL || 'http://localhost:3001'
      console.log(`📬 Notifying worker at ${workerUrl}/process-jobs`)
      
      const notifyResponse = await fetch(`${workerUrl}/process-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
        // Don't wait too long for worker response
        signal: AbortSignal.timeout(5000)
      })
      
      if (notifyResponse.ok) {
        console.log('✅ Worker notified successfully')
      } else {
        console.warn('⚠️ Worker notification failed:', notifyResponse.status)
      }
    } catch (error) {
      console.warn('⚠️ Failed to notify worker (job will still be processed eventually):', error)
      // Don't fail the request if worker notification fails
    }

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

