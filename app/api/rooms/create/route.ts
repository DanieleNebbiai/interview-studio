import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { roomName } = await request.json()

    if (!roomName) {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      )
    }

    // Get authenticated user
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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log('Creating room with name:', roomName, 'for user:', user.id)

    // Clean room name for Daily.co
    const cleanRoomName = roomName.replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase()

    // Check if Daily.co room exists
    const checkResponse = await fetch(`https://api.daily.co/v1/rooms/${cleanRoomName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      },
    })

    let dailyRoomUrl = ''
    
    if (checkResponse.ok) {
      // Room exists
      const existingRoom = await checkResponse.json()
      dailyRoomUrl = existingRoom.url
      console.log('Daily.co room already exists:', existingRoom.name)
    } else {
      // Create new Daily.co room
      const requestBody = {
        name: cleanRoomName,
        properties: {
          enable_recording: 'raw-tracks',
          max_participants: 8,
          exp: Math.round(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
          enable_chat: true,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }

      const response = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Daily.co API error:', errorText)
        return NextResponse.json(
          { error: 'Failed to create room', details: errorText },
          { status: response.status }
        )
      }

      const room = await response.json()
      dailyRoomUrl = room.url
    }

    // Store room in database
    const { data: roomData, error: dbError } = await supabase
      .from('rooms')
      .insert({
        name: roomName,
        host_id: user.id,
        daily_room_name: cleanRoomName,
        is_active: true
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save room to database' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      room: {
        id: roomData.id,
        name: roomData.name,
        dailyRoomName: roomData.daily_room_name,
        roomUrl: dailyRoomUrl,
        hostId: user.id,
        isHost: true
      }
    })

  } catch (error) {
    console.error('Error creating room:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}