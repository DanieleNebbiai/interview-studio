import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const { roomName, layout = 'single-participant', sessionId } = await request.json()

    if (!process.env.DAILY_API_KEY) {
      console.error('DAILY_API_KEY not configured')
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      )
    }

    if (!roomName) {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      )
    }

    console.log('Starting recording for room:', roomName, 'with layout:', layout, 'sessionId:', sessionId)

    // Generate valid GUID for instanceId as required by Daily.co API
    const instanceId = uuidv4()
    
    // Base configuration for cloud recording
    const requestBody = {
      type: 'cloud',
      width: 1280,
      height: 720,
      fps: 30,
      maxDuration: 10800, // 3 hours max
      instanceId: instanceId,
      layout: {}
    }

    // Configure layout based on parameters
    if (layout === 'single-participant' && sessionId) {
      requestBody.layout = {
        preset: 'single-participant',
        session_id: sessionId
      }
    } else {
      // Fallback to default layout (simplified without max_cam_streams)
      requestBody.layout = {
        preset: 'default'
      }
    }

    console.log('Recording request body:', JSON.stringify(requestBody, null, 2))

    const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}/recordings/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    console.log('Daily.co recording response status:', response.status)
    console.log('Daily.co recording response:', responseText)

    if (!response.ok) {
      console.error('Daily.co recording API error:', {
        status: response.status,
        statusText: response.statusText,
        response: responseText,
        requestBody: JSON.stringify(requestBody, null, 2)
      })
      
      let errorMessage = 'Failed to start recording'
      try {
        const errorData = JSON.parse(responseText)
        if (errorData.error) {
          errorMessage = errorData.error
        }
        if (errorData.info) {
          errorMessage += ': ' + errorData.info
        }
      } catch (e) {
        errorMessage += ': ' + responseText
      }
      
      return NextResponse.json(
        { error: errorMessage, details: responseText, requestBody },
        { status: response.status }
      )
    }

    const recordingData = JSON.parse(responseText)

    return NextResponse.json({
      success: true,
      recording: {
        ...recordingData,
        instanceId: recordingData.instanceId || instanceId, // Ensure instanceId is always present
      },
      message: 'Recording started successfully'
    })
  } catch (error) {
    console.error('Error starting recording:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}