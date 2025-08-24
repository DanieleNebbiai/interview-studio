import { NextRequest, NextResponse } from 'next/server'

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
    const { roomId } = await request.json()

    if (!process.env.DAILY_API_KEY) {
      console.error('DAILY_API_KEY not configured')
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      )
    }

    if (!roomId) {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      )
    }

    console.log(`Fetching all recordings for room: ${roomId}`)

    try {
      // Get recordings for this specific room using Daily.co API
      const url = new URL('https://api.daily.co/v1/recordings')
      url.searchParams.append('room_name', roomId)
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
      console.log('Available recordings:', recordingsData.data?.map((r: any) => ({
        id: r.id,
        status: r.status,
        start_ts: r.start_ts,
        duration: r.duration
      })))

      const downloadedRecordings: DailyRecording[] = []
      const errors: string[] = []

      // Process only finished recordings
      const finishedRecordings = recordingsData.data?.filter((r: any) => r.status === 'finished') || []
      
      console.log(`Found ${finishedRecordings.length} finished recordings`)

      for (const recording of finishedRecordings) {
        try {
          console.log(`Getting access link for recording: ${recording.id}`)
          
          const accessResponse = await fetch(`https://api.daily.co/v1/recordings/${recording.id}/access-link`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
            },
          })
          
          if (accessResponse.ok) {
            const accessData = await accessResponse.json()
            console.log(`Got access link for ${recording.id}:`, accessData.download_link ? 'Yes' : 'No')
            
            const recordingInfo: DailyRecording = {
              id: recording.id,
              roomName: roomId,
              status: recording.status,
              startTime: recording.start_ts,
              duration: recording.duration,
              downloadUrl: accessData.download_link,
              fileSize: 0, // Not available in this API response
              filename: `recording-${recording.id}.mp4`
            }

            downloadedRecordings.push(recordingInfo)
            console.log(`Successfully added recording: ${recording.id}`)
          } else {
            console.error(`Failed to get access link for recording ${recording.id}:`, accessResponse.status)
            errors.push(`Failed to get download link for recording ${recording.id}`)
          }
        } catch (accessError) {
          console.error(`Error getting access link for recording ${recording.id}:`, accessError)
          errors.push(`Error getting download link for recording ${recording.id}`)
        }
      }

      // If we have recordings in other statuses, note them
      const processingRecordings = recordingsData.data?.filter((r: any) => r.status !== 'finished') || []
      if (processingRecordings.length > 0) {
        console.log(`Found ${processingRecordings.length} recordings still processing:`, processingRecordings.map(r => ({
          id: r.id,
          status: r.status
        })))
        errors.push(`${processingRecordings.length} recordings still processing`)
      }

      return NextResponse.json({
        success: true,
        downloadedCount: downloadedRecordings.length,
        recordings: downloadedRecordings,
        errors: errors.length > 0 ? errors : undefined,
        message: downloadedRecordings.length > 0 
          ? `${downloadedRecordings.length} finished recordings found`
          : processingRecordings.length > 0
          ? `${processingRecordings.length} recordings still processing`
          : 'No recordings found for this room'
      })

    } catch (error) {
      console.error(`Error fetching recordings for room ${roomId}:`, error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch recordings',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Error in fetch-by-room:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}