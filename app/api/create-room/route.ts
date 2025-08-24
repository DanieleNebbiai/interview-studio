import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { roomName } = await request.json()

    console.log('Environment check:', {
      hasApiKey: !!process.env.DAILY_API_KEY,
      keyLength: process.env.DAILY_API_KEY?.length || 0,
      keyStart: process.env.DAILY_API_KEY?.substring(0, 10) || 'none'
    })

    if (!process.env.DAILY_API_KEY) {
      console.error('DAILY_API_KEY not configured')
      return NextResponse.json(
        { error: 'Daily.co API key not configured. Please add DAILY_API_KEY to your environment variables.' },
        { status: 500 }
      )
    }

    console.log('Creating room with name:', roomName)

    // Puliamo il nome della room (solo lettere, numeri, dash e underscore)
    const cleanRoomName = roomName.replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase()
    console.log('Original room name:', roomName)
    console.log('Clean room name:', cleanRoomName)

    // Prima controlliamo se la room esiste già
    const checkResponse = await fetch(`https://api.daily.co/v1/rooms/${cleanRoomName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      },
    })

    if (checkResponse.ok) {
      // La room esiste già, restituiamo i suoi dettagli
      const existingRoom = await checkResponse.json()
      console.log('Room already exists:', existingRoom.name)
      return NextResponse.json({
        roomName: existingRoom.name,
        roomUrl: existingRoom.url,
        success: true,
        existed: true
      })
    }

    // La room non esiste, la creiamo
    const requestBody = {
      name: cleanRoomName,
      properties: {
        enable_recording: 'raw-tracks', // Registrazione separata per ogni partecipante
        max_participants: 8,
        exp: Math.round(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
      },
    }

    console.log('Request body:', JSON.stringify(requestBody, null, 2))
    console.log('Headers:', {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DAILY_API_KEY?.substring(0, 10)}...`,
    })

    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    console.log('Daily.co response status:', response.status)
    console.log('Daily.co response:', responseText)

    if (!response.ok) {
      console.error('Daily.co API error:', responseText)
      return NextResponse.json(
        { error: 'Failed to create room', details: responseText },
        { status: response.status }
      )
    }

    const room = JSON.parse(responseText)

    return NextResponse.json({
      roomName: room.name,
      roomUrl: room.url,
      success: true,
      created: true
    })
  } catch (error) {
    console.error('Error creating room:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}