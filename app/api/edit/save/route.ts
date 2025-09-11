import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

interface VideoSection {
  id: string
  startTime: number
  endTime: number
  isDeleted: boolean
  playbackSpeed: number
}

interface ZoomRange {
  id: string
  startTime: number
  endTime: number
  focusOn: string
  participantIndex: number
  aiGenerated?: boolean
  reason?: string
  confidence?: number
  type?: 'monologue' | 'conversation' | 'silence'
}

interface EditState {
  videoSections: VideoSection[]
  zoomRanges: ZoomRange[]
  splitPoints: number[]
}

export async function POST(request: NextRequest) {
  try {
    const { roomId, editState } = await request.json() as {
      roomId: string
      editState: EditState
    }

    if (!roomId || !editState) {
      return NextResponse.json(
        { error: 'Room ID and edit state are required' },
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

    console.log(`Saving user edit state for room: ${roomId}`)

    // Save video sections using UPSERT to avoid duplicate key conflicts
    if (editState.videoSections && editState.videoSections.length > 0) {
      console.log(`Upserting ${editState.videoSections.length} video sections`)
      console.log('📊 Frontend sections data:', editState.videoSections.map(s => ({
        id: s.id,
        speed: s.playbackSpeed,
        deleted: s.isDeleted
      })))
      
      const videoSectionUpserts = editState.videoSections.map(section => ({
        room_id: roomData.id,
        section_id: section.id,
        start_time: section.startTime,
        end_time: section.endTime,
        is_deleted: section.isDeleted,
        playback_speed: section.playbackSpeed,
        created_by: 'user',
        user_modified: true // User has made modifications
      }))

      console.log('💾 Upserting data:', videoSectionUpserts.map(u => ({
        section_id: u.section_id,
        playback_speed: u.playback_speed,
        is_deleted: u.is_deleted
      })))

      const { error: sectionsError, data: upsertResult } = await supabase
        .from('video_sections')
        .upsert(videoSectionUpserts, {
          onConflict: 'room_id,section_id'
        })
        .select()

      if (sectionsError) {
        throw new Error(`Failed to save video sections: ${sectionsError.message}`)
      }
      
      console.log(`Successfully upserted ${editState.videoSections.length} video sections`)
      console.log('🔍 Upsert result from DB:', upsertResult?.map(r => ({
        section_id: r.section_id,
        playback_speed: r.playback_speed,
        is_deleted: r.is_deleted
      })))
      
      // Clean up any user video sections that are no longer in the frontend state
      const currentSectionIds = editState.videoSections.map(s => s.id)
      console.log('🧹 Current frontend sections:', currentSectionIds)
      
      if (currentSectionIds.length > 0) {
        // First get all existing sections for this room to see what needs to be deleted
        const { data: existingSections, error: fetchError } = await supabase
          .from('video_sections')
          .select('section_id')
          .eq('room_id', roomData.id)
          .eq('user_modified', true)

        if (!fetchError && existingSections) {
          const existingSectionIds = existingSections.map(s => s.section_id)
          const sectionsToDelete = existingSectionIds.filter(id => !currentSectionIds.includes(id))
          
          console.log('🗑️ Sections to delete:', sectionsToDelete)
          
          if (sectionsToDelete.length > 0) {
            // Delete each obsolete section individually
            for (const sectionId of sectionsToDelete) {
              const { error: deleteError } = await supabase
                .from('video_sections')
                .delete()
                .eq('room_id', roomData.id)
                .eq('section_id', sectionId)
                .eq('user_modified', true)

              if (deleteError) {
                console.error(`Error deleting section ${sectionId}:`, deleteError)
              } else {
                console.log(`✅ Deleted obsolete section: ${sectionId}`)
              }
            }
          } else {
            console.log('✨ No sections to cleanup')
          }
        }
      }
    }

    // Synchronize focus segments (complete replacement of user-created segments)
    console.log(`Synchronizing ${editState.zoomRanges.length} focus segments`)
    console.log('Focus segments from frontend:', editState.zoomRanges.map(z => ({
      id: z.id,
      aiGenerated: z.aiGenerated,
      startTime: z.startTime,
      endTime: z.endTime
    })))
    
    // First, delete all existing user-created focus segments for this room
    const { error: focusDeleteError } = await supabase
      .from('focus_segments')
      .delete()
      .eq('room_id', roomData.id)
      .eq('ai_generated', false)

    if (focusDeleteError) {
      console.error('Error deleting existing user focus segments:', focusDeleteError)
      // Continue anyway - we'll still insert new ones
    }

    // Then, insert all current user focus segments
    const userFocusSegments = editState.zoomRanges.filter(zoomRange => !zoomRange.aiGenerated)
    
    if (userFocusSegments.length > 0) {
      const focusSegmentInserts = userFocusSegments.map(zoomRange => ({
        room_id: roomData.id,
        start_time: zoomRange.startTime,
        end_time: zoomRange.endTime,
        focused_participant_id: zoomRange.focusOn,
        created_by: 'user',
        segment_type: zoomRange.type || 'conversation',
        ai_generated: false,
        reason: zoomRange.reason || null,
        confidence: zoomRange.confidence || null
      }))

      const { error: insertError } = await supabase
        .from('focus_segments')
        .insert(focusSegmentInserts)

      if (insertError) {
        console.error('Failed to save user focus segments:', insertError)
      } else {
        console.log(`Successfully saved ${userFocusSegments.length} user focus segments`)
      }
    } else {
      console.log('No user focus segments to save')
    }

    console.log(`Successfully saved user edit state for room: ${roomId}`)

    // Calculate summary stats
    const totalOriginalDuration = editState.videoSections.reduce((acc, s) => acc + (s.endTime - s.startTime), 0)
    const finalDuration = editState.videoSections.filter(s => !s.isDeleted).reduce((acc, s) => acc + (s.endTime - s.startTime), 0)
    const deletedSections = editState.videoSections.filter(s => s.isDeleted).length
    const speedModifiedSections = editState.videoSections.filter(s => s.playbackSpeed !== 1.0).length

    return NextResponse.json({
      success: true,
      roomId,
      summary: {
        totalSections: editState.videoSections.length,
        deletedSections,
        speedModifiedSections,
        zoomRanges: editState.zoomRanges.length,
        splitPoints: editState.splitPoints.length,
        originalDuration: Math.round(totalOriginalDuration),
        finalDuration: Math.round(finalDuration),
        compressionRatio: finalDuration / totalOriginalDuration
      },
      message: `Edit state saved: ${editState.videoSections.length} sections, ${userFocusSegments.length} user focus segments`
    })

  } catch (error) {
    console.error('Error saving edit state:', error)
    return NextResponse.json(
      { error: 'Failed to save edit state' },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve user edit state
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('roomId')

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

    // Get user video sections
    console.log(`[GET] Loading video sections for room_id: ${roomData.id}`)
    const { data: videoSections, error: sectionsError } = await supabase
      .from('video_sections')
      .select('*')
      .eq('room_id', roomData.id)
      .order('start_time')
    
    console.log(`[GET] Video sections query result:`, { videoSections: videoSections?.length, sectionsError })

    // Get user focus segments (zoom ranges)
    const { data: focusSegments, error: focusError } = await supabase
      .from('focus_segments')
      .select('*')
      .eq('room_id', roomData.id)
      .eq('ai_generated', false) // Only user-created focus segments

    if (sectionsError) {
      console.error('Error fetching video sections:', sectionsError)
      return NextResponse.json({
        success: true,
        editState: null,
        message: 'No user edit state found'
      })
    }

    // Convert database format to frontend format
    const editState = {
      videoSections: (videoSections || []).map(section => ({
        id: section.section_id,
        startTime: section.start_time,
        endTime: section.end_time,
        isDeleted: section.is_deleted,
        playbackSpeed: section.playback_speed
      })),
      zoomRanges: (focusSegments || []).map(segment => ({
        id: segment.id,
        startTime: segment.start_time,
        endTime: segment.end_time,
        focusOn: segment.focused_participant_id,
        participantIndex: 0, // Will need to calculate this
        aiGenerated: segment.ai_generated,
        type: segment.segment_type
      })),
      splitPoints: [] // Will derive from video sections
    }

    return NextResponse.json({
      success: true,
      editState: editState.videoSections.length > 0 ? editState : null,
      lastUpdated: videoSections?.[0]?.updated_at,
      message: editState.videoSections.length > 0 
        ? 'User edit state retrieved successfully'
        : 'No user edit state found'
    })

  } catch (error) {
    console.error('Error retrieving edit state:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve edit state' },
      { status: 500 }
    )
  }
}