import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { roomName, instanceId } = await request.json()

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

    console.log('Stopping recording for room:', roomName, 'instanceId:', instanceId)

    const url = `https://api.daily.co/v1/rooms/${roomName}/recordings/stop`
    
    // Prepare request body - include instanceId and type if provided
    const requestBody: any = {
      type: 'cloud'
    }
    
    if (instanceId) {
      requestBody.instanceId = instanceId
    }

    console.log('Stop recording request body:', JSON.stringify(requestBody, null, 2))

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    console.log('Daily.co stop recording response status:', response.status)
    console.log('Daily.co stop recording response:', responseText)

    if (!response.ok) {
      console.error('Daily.co stop recording API error:', {
        status: response.status,
        statusText: response.statusText,
        url: url,
        requestBody: requestBody,
        response: responseText
      })
      
      let errorMessage = 'Failed to stop recording'
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

    const recordingData = response.status === 200 ? JSON.parse(responseText) : null

    return NextResponse.json({
      success: true,
      recording: recordingData,
      message: 'Recording stopped successfully'
    })
  } catch (error) {
    console.error('Error stopping recording:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}