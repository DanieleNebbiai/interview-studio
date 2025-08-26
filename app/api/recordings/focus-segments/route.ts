import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

    // Get room data first
    console.log(`Looking for room with daily_room_name: ${roomId}`)
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('id')
      .eq('daily_room_name', roomId)
      .single()

    console.log(`Room query result:`, { roomData, roomError })

    if (roomError || !roomData) {
      console.error('Room not found:', roomId, roomError)
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      )
    }

    // Get all focus segments for this room
    const { data: focusSegments, error: focusError } = await supabase
      .from('focus_segments')
      .select(`
        *,
        recordings!focused_participant_id (
          id,
          daily_recording_id,
          participant_session_id
        )
      `)
      .eq('room_id', roomData.id)
      .order('start_time', { ascending: true })

    if (focusError) {
      console.error('Error fetching focus segments:', focusError)
      return NextResponse.json(
        { error: 'Failed to fetch focus segments' },
        { status: 500 }
      )
    }

    // Get speed recommendations for this room
    const { data: speedRecommendations, error: speedError } = await supabase
      .from('speed_recommendations')
      .select('*')
      .eq('room_id', roomData.id)
      .order('start_time', { ascending: true })

    if (speedError) {
      console.error('Error fetching speed recommendations:', speedError)
      return NextResponse.json(
        { error: 'Failed to fetch speed recommendations' },
        { status: 500 }
      )
    }

    // Get cut segments for this room
    console.log(`Fetching cut segments for room_id: ${roomData.id}`)
    const { data: cutSegments, error: cutError } = await supabase
      .from('cut_segments')
      .select('*')
      .eq('room_id', roomData.id)
      .order('start_time', { ascending: true })

    console.log(`Cut segments query result:`, { cutSegments, cutError })

    if (cutError) {
      console.error('Error fetching cut segments:', cutError)
      return NextResponse.json(
        { error: 'Failed to fetch cut segments' },
        { status: 500 }
      )
    }

    // Get AI editing session data for recommendations
    const { data: aiSession, error: aiSessionError } = await supabase
      .from('ai_editing_sessions')
      .select('*')
      .eq('room_id', roomData.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (aiSessionError && aiSessionError.code !== 'PGRST116') {
      console.error('Error fetching AI editing session:', aiSessionError)
    }

    const response = {
      success: true,
      focusSegments: focusSegments || [],
      speedRecommendations: speedRecommendations || [],
      cutSegments: cutSegments || [],
      aiEditingSession: aiSession,
      message: `${focusSegments?.length || 0} focus segments, ${speedRecommendations?.length || 0} raccomandazioni velocità e ${cutSegments?.length || 0} segmenti da tagliare trovati`
    }
    
    console.log(`API Response:`, response)
    return NextResponse.json(response)

  } catch (error) {
    console.error('Error fetching focus segments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}