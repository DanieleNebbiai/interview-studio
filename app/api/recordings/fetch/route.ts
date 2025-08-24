import { NextRequest, NextResponse } from 'next/server'

interface RecordingInstance {
  instanceId: string
  roomName: string
  sessionId: string
  startTime: string
  status: string
}

interface DailyRecording {
  id: string
  roomName: string
  status: string
  startTime: number
  duration?: number
  downloadUrl?: string
  fileSize?: number
  filename?: string
}

export async function POST(request: NextRequest) {
  try {
    const { roomId, recordings } = await request.json()

    if (!process.env.DAILY_API_KEY) {
      console.error('DAILY_API_KEY not configured')
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      )
    }

    if (!recordings || !Array.isArray(recordings)) {
      return NextResponse.json(
        { error: 'Recordings array is required' },
        { status: 400 }
      )
    }

    console.log('Fetching recordings from Daily.co:', recordings.length)

    const downloadedRecordings: DailyRecording[] = []
    const errors: string[] = []

    // Get the room name from the first recording (they should all be from the same room)
    const roomName = recordings[0]?.roomName
    if (!roomName) {
      return NextResponse.json(
        { error: 'Room name not found in recording data' },
        { status: 400 }
      )
    }

    console.log(`Fetching recordings for room: ${roomName}`)
    console.log('We are looking for these instanceIds:', recordings.map(r => r.instanceId))

    try {
      // Get recordings for this specific room using Daily.co API
      const url = new URL('https://api.daily.co/v1/recordings')
      url.searchParams.append('room_name', roomName)
      url.searchParams.append('limit', '10') // Get recent recordings
      
      console.log('Daily.co API URL:', url.toString())
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Daily.co API error: ${response.status} ${response.statusText}`)
      }

      const recordingsData = await response.json()
      console.log('Daily.co recordings response:', recordingsData)
      console.log('Looking for instanceIds:', recordings.map(r => r.instanceId))
      console.log('Available recordings:', recordingsData.data?.map((r: any) => ({
        id: r.id,
        instanceId: r.instanceId,
        status: r.status,
        roomName: r.roomName,
        createdAt: r.created_at
      })))

      // Since Daily.co doesn't return instanceId in the response, we'll use the most recent finished recording
      // for this room as a fallback, or try to match by room and timing
      const finishedRecordings = recordingsData.data?.filter((r: any) => r.status === 'finished') || []
      
      console.log('Found finished recordings:', finishedRecordings.map(r => ({
        id: r.id,
        status: r.status,
        start_ts: r.start_ts
      })))
      
      // For each recording we're looking for, try to find a match
      for (const recording of recordings as RecordingInstance[]) {
        // First try exact match by instanceId if available
        let matchingRecording = recordingsData.data?.find(
          (r: any) => r.instanceId === recording.instanceId || r.id === recording.instanceId
        )
        
        // If no exact match and we have finished recordings, use the most recent one
        if (!matchingRecording && finishedRecordings.length > 0) {
          console.log(`No exact match for instanceId ${recording.instanceId}, using most recent finished recording`)
          matchingRecording = finishedRecordings[0] // Most recent (they're sorted by created_at desc)
        }
        
        if (matchingRecording) {
          console.log(`Found recording ${matchingRecording.id} with status: ${matchingRecording.status}`)
          
          if (matchingRecording.status === 'finished') {
            // Get the download access link for this recording
            console.log(`Getting access link for recording: ${matchingRecording.id}`)
            
            try {
              const accessResponse = await fetch(`https://api.daily.co/v1/recordings/${matchingRecording.id}/access-link`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
                },
              })
              
              if (accessResponse.ok) {
                const accessData = await accessResponse.json()
                console.log('Got access link:', accessData.download_link ? 'Yes' : 'No')
                
                const recordingInfo: DailyRecording = {
                  id: matchingRecording.id,
                  roomName: recording.roomName,
                  status: matchingRecording.status,
                  startTime: matchingRecording.start_ts, // Use start_ts from Daily.co
                  duration: matchingRecording.duration,
                  downloadUrl: accessData.download_link,
                  fileSize: 0, // Not available in this API response
                  filename: `recording-${matchingRecording.id}.mp4`
                }

                downloadedRecordings.push(recordingInfo)
                console.log(`Successfully fetched finished recording with access link: ${matchingRecording.id}`)
              } else {
                console.error(`Failed to get access link for recording ${matchingRecording.id}:`, accessResponse.status)
                errors.push(`Failed to get download link for recording ${matchingRecording.id}`)
              }
            } catch (accessError) {
              console.error(`Error getting access link for recording ${matchingRecording.id}:`, accessError)
              errors.push(`Error getting download link for recording ${matchingRecording.id}`)
            }
          } else {
            console.log(`Recording ${recording.instanceId} status: ${matchingRecording.status} (not finished yet)`)
            errors.push(`Recording ${recording.instanceId} is not ready (status: ${matchingRecording.status}). Will retry in 30 seconds.`)
          }
        } else {
          console.log(`Recording not found for instanceId: ${recording.instanceId}`)
          errors.push(`Recording not found for instanceId: ${recording.instanceId}`)
        }
      }

    } catch (error) {
      console.error(`Error fetching recordings for room ${roomName}:`, error)
      errors.push(`Error fetching recordings: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // If no recordings are ready, return an error
    if (downloadedRecordings.length === 0) {
      return NextResponse.json(
        { 
          error: 'No recordings are ready for processing', 
          details: errors,
          message: 'Le registrazioni potrebbero non essere ancora pronte. Riprova tra qualche minuto.' 
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      downloadedCount: downloadedRecordings.length,
      recordings: downloadedRecordings,
      errors: errors.length > 0 ? errors : undefined,
      message: `${downloadedRecordings.length} registrazioni pronte per la trascrizione`
    })

  } catch (error) {
    console.error('Error fetching recordings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}