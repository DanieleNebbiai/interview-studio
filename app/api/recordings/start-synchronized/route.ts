import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const { roomName, participantSessionIds, delayMs = 3000 } = await request.json()

    if (!process.env.DAILY_API_KEY) {
      console.error('DAILY_API_KEY not configured')
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      )
    }

    if (!roomName || !participantSessionIds || !Array.isArray(participantSessionIds)) {
      return NextResponse.json(
        { error: 'Room name and participant session IDs are required' },
        { status: 400 }
      )
    }

    console.log(`Starting synchronized recording for room: ${roomName}`)
    console.log(`Participants: ${participantSessionIds.join(', ')}`)
    console.log(`Delay: ${delayMs}ms`)

    // Prepare all recording requests
    const recordingRequests = participantSessionIds.map((sessionId: string) => {
      const instanceId = uuidv4()
      
      const requestBody = {
        type: 'cloud',
        width: 1280,
        height: 720,
        fps: 30,
        maxDuration: 10800, // 3 hours max
        instanceId: instanceId,
        layout: {
          preset: 'single-participant',
          session_id: sessionId
        }
      }

      return {
        sessionId,
        instanceId,
        requestBody
      }
    })

    console.log(`Will start ${recordingRequests.length} recordings with ${delayMs}ms delay`)

    // Wait for the specified delay before starting all recordings
    await new Promise(resolve => setTimeout(resolve, delayMs))

    const syncStartTime = Date.now()
    console.log(`Starting all recordings simultaneously at: ${new Date(syncStartTime).toISOString()}`)

    // Execute all recording requests in parallel - no additional delays
    const recordingPromises = recordingRequests.map(async ({ sessionId, instanceId, requestBody }) => {
      try {
        console.log(`Starting recording for session ${sessionId} with instanceId ${instanceId}`)
        
        const recordingStartTime = Date.now() // Capture exact start time before API call
        
        const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}/recordings/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DAILY_API_KEY}`
          },
          body: JSON.stringify(requestBody)
        })

        const data = await response.json()

        if (response.ok) {
          console.log(`Successfully started recording for session ${sessionId}:`, data)
          return {
            success: true,
            sessionId,
            instanceId,
            recording: data,
            actualStartTime: Date.now() - syncStartTime, // Track actual timing
            recordingStartedAt: new Date(recordingStartTime).toISOString() // ISO timestamp
          }
        } else {
          console.error(`Failed to start recording for session ${sessionId}:`, data)
          return {
            success: false,
            sessionId,
            instanceId,
            error: data.error || 'Unknown error',
            actualStartTime: Date.now() - syncStartTime
          }
        }
      } catch (error) {
        console.error(`Exception starting recording for session ${sessionId}:`, error)
        return {
          success: false,
          sessionId,
          instanceId,
          error: error instanceof Error ? error.message : 'Network error',
          actualStartTime: Date.now() - syncStartTime
        }
      }
    })

    // Wait for all recordings to complete
    const results = await Promise.all(recordingPromises)
    
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    console.log(`Synchronized recording results: ${successful.length} successful, ${failed.length} failed`)
    console.log(`Timing spread: ${Math.max(...results.map(r => r.actualStartTime)) - Math.min(...results.map(r => r.actualStartTime))}ms`)
    
    if (successful.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'All recording attempts failed',
        results,
        syncStartTime: new Date(syncStartTime).toISOString()
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully started ${successful.length} synchronized recordings`,
      results,
      syncStartTime: new Date(syncStartTime).toISOString(),
      delayMs,
      successCount: successful.length,
      failCount: failed.length,
      timingSpreadMs: Math.max(...results.map(r => r.actualStartTime)) - Math.min(...results.map(r => r.actualStartTime))
    })

  } catch (error) {
    console.error('Error in synchronized recording start:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}